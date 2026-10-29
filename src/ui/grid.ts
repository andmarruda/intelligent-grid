/**
 * Intelligent Grid: an Excel-like data grid backed by SorlaDB.
 *
 *   const grid = new IntelligentGrid('#orders', { columns, data, editable: true });
 *   grid.on('cellChange', e => save(e.detail.row));
 */
import { SorlaStore, compareCells } from '../core/store.ts';
import { Emitter } from '../core/events.ts';
import { ChangeTracker } from '../core/changes.ts';
import { UndoStack } from '../core/undo.ts';
import { fillSeries, fillSeriesBackward } from '../core/fill.ts';
import { parseDelimited } from '../import/delimited.ts';
import { readXlsx } from '../import/xlsx-read.ts';
import { colorScaleColors, columnStats, iconFor, isPreset, ratio, scaleColor } from '../core/presets.ts';
import type { ColumnStats } from '../core/presets.ts';
import type { CellState, UndoChange, UndoStep } from '../core/undo.ts';
import type { ChangeReaders, ChangeSet, ChangeSummary, FieldChange, HistoryEntry } from '../core/changes.ts';
import { andQuery, compileFilters, escapeRegex, isFilterActive } from '../core/filters.ts';
import { compileQuery, describeQuery, fromSorlaQuery as parseSorlaQuery, isQueryActive, normalizeQuery, toSorlaQuery as writeSorlaQuery } from '../core/query.ts';
import type { CompiledFilters } from '../core/filters.ts';
import { NUMERIC_TYPES, editorText, excelFormatCode, formatCell, normalizeColumn, parseInput, validateValue } from '../core/columns.ts';
import { CalcEngine } from '../formula/engine.ts';
import { isError, isErrorCode } from '../formula/errors.ts';
import { isFormula } from '../formula/evaluator.ts';
import { defineFunction, defineLazyFunction } from '../formula/functions.ts';
import type { FormulaFunction, FunctionDefinition, FunctionOptions, LazyFormulaFunction } from '../formula/functions.ts';
import { localeSeparators } from '../formula/numfmt.ts';
import { toCSV } from '../export/csv.ts';
import { download, toXLSX } from '../export/xlsx.ts';
import type { XlsxFooterCell } from '../export/xlsx.ts';
import { createTranslator } from '../i18n/labels.ts';
import { resolveEditor } from './editors.ts';
import { openFilterMenu } from './filter-menu.ts';
import { openConfirm } from './modal.ts';
import { QueryBuilder } from './query-builder.ts';
import { FindBar } from './find-bar.ts';
import type { FindMode } from './find-bar.ts';
import { clear, h } from './dom.ts';
import { RowLayout, columnWindow } from './virtual.ts';
import { sparkline, sparklineValues } from './sparkline.ts';
import type {
    AppendOptions, CellChangeDetail, ChangeSource, Column, ConfirmRequest, ColumnDefinition, CellRef, ConditionalFormat, CsvExportOptions, PresetFormat, EditorInstance, FillDirection, FindOptions,
    ChangeTrackingOptions, Filter, FilterModel, GridEvent, QueryNode, GridEventHandler, GridOptions, NavbarItem, NavbarOptions, Row, RowData, SelectionMode,
    CellComment, DuplicateOptions, GroupInfo, ImportOptions, ImportResult, ReplaceOptions, SelectionOptions, SortEntry, Translator, XlsxExportOptions
} from '../types.ts';

type ResolvedOptions = Required<Omit<GridOptions, 'selection' | 'navbar' | 'sort' | 'sorla' | 'database' | 'currency' | 'locale' | 'changeTracking' | 'confirm'>> & {
    confirm?: GridOptions['confirm'];
    changeTracking: ChangeTrackingOptions | false;
    selection: SelectionOptions;
    navbar: NavbarOptions | false;
    sort: { mode: 'modifier' | 'toggle' };
    locale: string | null;
    currency?: string;
};

interface AppendState extends Required<AppendOptions> {
    loaded: number;
    hasMore: boolean;
    loading: boolean;
    request: number;
    total?: number | null;
}

/** Columns as rendered: pinned ones always, the scrollable ones windowed when there are many. */
/** A group row: the rows of the group are view[start, end). */
interface GroupItem {
    key: string;
    level: number;
    field: string;
    value: unknown;
    start: number;
    end: number;
}

/** What one rendered line of the body is: a group row or a view index. */
type DisplayItem = GroupItem | number;

interface ColumnPlan {
    left: Column[];
    center: Column[];
    right: Column[];
    /** Widths of the scrollable columns that are not rendered, before and after the window. */
    before: number;
    after: number;
    selection: boolean;
    /** Sticky offsets of pinned cells. */
    sticky: Map<string, { side: 'left' | 'right'; offset: number; edge: boolean }>;
    key: string;
}

const DEFAULT_COLUMN_WIDTH = 120;
const SELECTION_WIDTH = 40;
const widthOf = (column: Column) => column.width ?? DEFAULT_COLUMN_WIDTH;

interface EditingState {
    id: string;
    field: string;
    td: HTMLTableCellElement;
    editor: EditorInstance;
    column: Column;
}

export interface SetCellResult {
    ok: boolean;
    error?: string;
}

export interface DistinctValue {
    value: unknown;
    count: number;
    label: string;
}

interface SelectEventLike {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    target?: EventTarget | null;
}

const isRow = (row: Row | null): row is Row => row !== null;

/** Element that received a DOM event (null for text nodes and the window). */
const targetOf = (event: Event): Element | null => event.target instanceof Element ? event.target : null;

const FOOTER_SHORTCUTS: Record<string, string> = { sum: 'SUM', avg: 'AVERAGE', average: 'AVERAGE', count: 'COUNT', counta: 'COUNTA', min: 'MIN', max: 'MAX', median: 'MEDIAN' };

const DEFAULTS: ResolvedOptions = {
    columns: [],
    data: [],
    idField: null,
    locale: null,
    labels: {},
    height: 480,
    editable: false,
    cellFormulas: true,
    names: {},
    functions: {},
    sort: { mode: 'modifier' },
    initialSort: [],
    initialFilters: {},
    initialQuery: null,
    selection: { mode: 'multiple', checkbox: true, selectOnClick: false },
    navbar: { search: true, filters: true, columns: true, export: ['csv', 'xlsx'], add: false, delete: false, changes: true, query: true, undo: true, items: [] },
    changeTracking: { inputName: 'changes', historyLimit: 5000 },
    statusBar: true,
    find: true,
    groupBy: [],
    groupsCollapsed: false,
    comments: [],
    renderChunk: 100,
    rowHeight: null,
    undoLimit: 100,
    overscan: 8,
    virtualColumns: 40,
    append: null,
    rowClass: null,
    rowFormats: [],
    exportOptions: { filename: 'export', sheetName: 'Sheet1' },
    confirmDelete: true,
    on: {}
};

/** Blob contents; FileReader where Blob.arrayBuffer() is missing (Safari before 14). */
function readBlob(blob: Blob): Promise<ArrayBuffer> {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

/** Column type for imported values: numbers, ISO dates, booleans, or text. */
function inferType(values: unknown[]): ColumnDefinition['type'] {
    const present = values.filter(v => v !== null && v !== undefined && v !== '');
    if (!present.length) return 'text';
    if (present.every(v => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())))) {
        return present.every(v => Number.isInteger(Number(v))) ? 'integer' : 'number';
    }
    if (present.every(v => typeof v === 'boolean')) return 'boolean';
    if (present.every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v))) {
        return present.some(v => (v as string).includes('T')) ? 'datetime' : 'date';
    }
    return 'text';
}

export class IntelligentGrid {
    element: HTMLElement;
    options: ResolvedOptions;
    locale: string;
    t: Translator;
    events: Emitter;
    functions = new Map<string, FunctionDefinition>();
    store: SorlaStore;
    calc: CalcEngine;
    columns: Column[] = [];
    root!: HTMLDivElement;

    private _columnMap = new Map<string, Column>();
    private _sort: SortEntry[];
    private _filters: FilterModel;
    private _queryModel: QueryNode | null = null;
    private _queryBuilder: QueryBuilder | null = null;
    private _findBar: FindBar | null = null;
    // cells marked by find ("id\u0000field")
    private _highlighted = new Set<string>();
    private _search = '';
    private _selected = new Set<string>();
    private _anchorId: string | null = null;
    private _active: { id: string; field: string } | null = null;
    // the other corner of the selected range; the active cell is the anchor (like Excel)
    private _focus: { id: string; field: string } | null = null;
    private _dragging = false;
    // fill handle drag: the source block and how far it is being extended
    private _filling: { direction: FillDirection; count: number } | null = null;
    private _pointer: { x: number; y: number } | null = null;
    private _autoScroll = 0;
    private _editing: EditingState | null = null;
    private _view: RowData[] = [];
    // grouping: the view is sorted by the group fields and shown as group rows plus the rows of open groups
    private _groupBy: string[] = [];
    private _collapsed = new Set<string>();
    private _collapseNew = false;
    private _display: DisplayItem[] | null = null;
    private _displayIndex = new Map<string, number>();
    private _groupOf = new Map<string, string>();
    private _groupEls = new Map<string, HTMLTableRowElement>();
    private _knownGroups = new Set<string>();
    // min / max of columns with data bars, color scales or icon sets, over the view
    private _stats = new Map<string, ColumnStats | null>();
    // short message in the status bar (after an import)
    private _notice: string | null = null;
    // cell comments: row id → field → text
    private _comments = new Map<string, Map<string, string>>();
    private _commentTip: HTMLElement | null = null;
    private _noticeTimer: ReturnType<typeof setTimeout> | undefined;
    private _layout = new RowLayout(34);
    private _viewIndex = new Map<string, number>();
    private _rowWindow: [number, number] = [0, 0];
    private _rowEls = new Map<string, HTMLTableRowElement>();
    private _plan: ColumnPlan | null = null;
    private _topSpacer!: HTMLTableRowElement;
    private _bottomSpacer!: HTMLTableRowElement;
    private _scrollFrame = 0;
    private _calibrated = false;
    private _invalid = new Map<string, string>();
    private _append: AppendState | null;
    private _navbar!: HTMLDivElement;
    private _colgroup!: HTMLTableColElement;
    private _thead!: HTMLTableSectionElement;
    private _tbody!: HTMLTableSectionElement;
    private _tfoot!: HTMLTableSectionElement;
    private _table!: HTMLTableElement;
    private _message!: HTMLDivElement;
    private _loading!: HTMLDivElement;
    private _scroller!: HTMLDivElement;
    private _status!: HTMLDivElement;
    private _searchInput: HTMLInputElement | null = null;
    private _selectAllBox: HTMLInputElement | null = null;
    private _popover: HTMLElement | null = null;
    private _onScroll: (() => void) | null = null;
    private _onDocumentPointer: ((e: PointerEvent) => void) | null = null;
    private _tracker: ChangeTracker | null = null;
    private _undo = new UndoStack(100);
    private _replaying = false;
    private _formInputs: HTMLInputElement[] = [];

    /**
     * @param string|HTMLElement target
     * @param object options see README
     */
    constructor(target: string | HTMLElement, options: GridOptions) {
        const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
        if (!element) throw new Error('Intelligent Grid: target element not found');
        this.element = element;

        this.options = {
            ...DEFAULTS,
            ...options,
            sort: { ...DEFAULTS.sort, ...options.sort },
            selection: options.selection === false ? { mode: 'none' } : { ...DEFAULTS.selection, ...options.selection } as SelectionOptions,
            navbar: options.navbar === false ? false : { ...DEFAULTS.navbar, ...options.navbar },
            exportOptions: { ...DEFAULTS.exportOptions, ...options.exportOptions },
            changeTracking: options.changeTracking === false ? false : { ...(DEFAULTS.changeTracking as ChangeTrackingOptions), ...(options.changeTracking === true ? {} : options.changeTracking) }
        };
        this.locale = this.options.locale ?? globalThis.navigator?.language ?? 'en-US';
        this.t = createTranslator(this.locale, this.options.labels);
        this.events = new Emitter(this);
        for (const [type, handler] of Object.entries(this.options.on)) this.on(type, handler);

        for (const [name, fn] of Object.entries(this.options.functions)) this.registerFunction(name, fn);

        this.store = new SorlaStore({ sorla: options.sorla, idField: this.options.idField, database: options.database });
        this.calc = new CalcEngine({ store: this.store, locale: this.locale, names: this.options.names, functions: this.functions });
        const tracking = this.options.changeTracking;
        if (tracking) this._tracker = new ChangeTracker(tracking.historyLimit);
        this._undo.limit = this.options.undoLimit;

        this._sort = [...this.options.initialSort];
        this._groupBy = [...this.options.groupBy];
        for (const comment of this.options.comments) this._writeComment(String(comment.id), comment.field, comment.text);
        this._collapseNew = this.options.groupsCollapsed;
        this._filters = { ...this.options.initialFilters };
        this._queryModel = normalizeQuery(this.options.initialQuery);
        this._append = this.options.append
            ? { pageSize: 100, serverSide: true, threshold: 200, ...this.options.append, loaded: 0, hasMore: true, loading: false, request: 0 }
            : null;

        this._setColumns(this.options.columns);
        this._build();
        if (tracking && tracking.form) this.bindForm(tracking.form, tracking.inputName);

        if (this._append) {
            this.refresh();
            this.loadMore();
        } else {
            this._insert(this.options.data);
            this.refresh();
        }
        this.emit('ready', {});
    }

    /* ---------------------------------------------------------------- events */

    on(type: string, handler: GridEventHandler): () => void {
        return this.events.on(type, handler);
    }

    once(type: string, handler: GridEventHandler): () => void {
        return this.events.once(type, handler);
    }

    off(type: string, handler?: GridEventHandler): void {
        this.events.off(type, handler);
    }

    emit<T>(type: string, detail: T): GridEvent<T> {
        return this.events.emit(type, detail);
    }

    /* ---------------------------------------------------------------- columns */

    private _setColumns(definitions: ColumnDefinition[]): void {
        const gridDefaults = { locale: this.locale, editable: this.options.editable, cellFormulas: this.options.cellFormulas, currency: this.options.currency };
        this.columns = definitions.map(definition => normalizeColumn(definition, gridDefaults));
        this._columnMap = new Map(this.columns.map(c => [c.field, c]));
        if (this._columnMap.size !== this.columns.length) throw new Error('Intelligent Grid: duplicated column field');
        this.store.setFields(this.columns.map(c => c.field));
        this.calc.setColumns(this.columns);
    }

    getColumn(field: string): Column | undefined {
        return this._columnMap.get(field);
    }

    /** Visible columns in display order: pinned left, scrollable, pinned right. */
    get visibleColumns(): Column[] {
        const visible = this.columns.filter(c => c.visible);
        return [...visible.filter(c => c.pinned === 'left'), ...visible.filter(c => c.pinned !== 'left' && c.pinned !== 'right'), ...visible.filter(c => c.pinned === 'right')];
    }

    /**
     * Freezes a column on the left or right edge while scrolling horizontally (Excel's freeze panes).
     * @param side 'left' | 'right' | null to unfreeze
     */
    pinColumn(field: string, side: 'left' | 'right' | null): void {
        const column = this.getColumn(field);
        if (!column) throw new Error(`Unknown column ${field}`);
        column.pinned = side;
        this._plan = null;
        this._renderHeader();
        this._renderWindow(true);
        this._renderFooter();
        this.emit('columnPin', { field, side });
    }

    setColumns(definitions: ColumnDefinition[]): void {
        this._setColumns(definitions);
        this.calc.recalculateAll();
        this._renderHeader();
        this.refresh();
    }

    addColumn(definition: ColumnDefinition, index = this.columns.length): void {
        const definitions: ColumnDefinition[] = this.columns.map(c => ({ ...c }));
        definitions.splice(index, 0, definition);
        this.setColumns(definitions);
    }

    removeColumn(field: string): void {
        this.setColumns(this.columns.filter(c => c.field !== field).map(c => ({ ...c })));
    }

    setColumnVisible(field: string, visible: boolean): void {
        const column = this.getColumn(field);
        if (!column || column.visible === visible) return;
        column.visible = visible;
        this._renderHeader();
        this._renderBody();
        this.emit('columnVisibilityChange', { field, visible });
    }

    setColumnFormula(field: string, formula: string | null): void {
        const column = this.getColumn(field);
        if (!column) throw new Error(`Unknown column ${field}`);
        column.formula = formula || undefined;
        this.calc.setColumns(this.columns);
        this.calc.recalculateAll();
        this.refresh();
    }

    /** Registers a formula function for this grid only (takes precedence over global functions). */
    registerFunction(name: string, fn: FormulaFunction, options?: { errors?: boolean }): void;
    registerFunction(name: string, fn: LazyFormulaFunction, options: { lazy: true }): void;
    registerFunction(name: string, fn: FormulaFunction | LazyFormulaFunction, options: FunctionOptions = {}): void {
        this.functions.set(name.toUpperCase(), { fn, lazy: !!options.lazy, errors: !!options.errors });
    }

    /** Registers a formula function for every grid. */
    static defineFunction(name: string, fn: FormulaFunction, options?: { errors?: boolean }): void;
    static defineFunction(name: string, fn: LazyFormulaFunction, options: { lazy: true }): void;
    static defineFunction(name: string, fn: FormulaFunction | LazyFormulaFunction, options: FunctionOptions = {}): void {
        if (options.lazy) defineLazyFunction(name, fn as LazyFormulaFunction);
        else defineFunction(name, fn as FormulaFunction, options);
    }

    /* ---------------------------------------------------------------- data */

    private _insert(rows: Record<string, unknown>[]): string[] {
        const ids = this.store.insert(rows);
        if (ids.length) this.calc.recalculate(ids, this.columns.map(c => c.field));
        return ids;
    }

    /**
     * Row as handed to developers: a copy, blanks of non text columns as null.
     */
    private _publicRow(data: RowData | null | undefined): Row | null {
        if (!data) return null;
        const row = { ...data };
        for (const column of this.columns) {
            if (row[column.field] === '' && column.type !== 'text' && column.type !== 'select') row[column.field] = null;
        }
        return row;
    }

    setData(rows: Record<string, unknown>[]): void {
        this._closeEditor(false);
        this.store.clear();
        this.calc.cellFormulas.clear();
        this.calc.setColumns(this.columns);
        this._selected.clear();
        this._tracker?.reset();
        this._undo.clear();
        this._insert(rows);
        this.refresh();
        this._afterTrackedChange();
        this.emit('dataChange', { reason: 'setData' });
    }

    /**
     * @param string scope 'all' | 'filtered' (sorted as shown) | 'selected'
     */
    getRows(scope: 'all' | 'filtered' | 'selected' = 'all'): Row[] {
        if (scope === 'filtered') return this._view.map(row => this._publicRow(this.store.get(row._id))).filter(isRow);
        if (scope === 'selected') return this.getSelected();
        return this.store.ids().map(id => this._publicRow(this.store.get(id))).filter(isRow);
    }

    getRow(id: string): Row | null {
        return this._publicRow(this.store.get(id));
    }

    addRow(row: Record<string, unknown> = {}, { position = 'end' }: { position?: 'start' | 'end' } = {}): string | null {
        return this.batch(() => this._addRow(row, { position }), 'insert');
    }

    private _addRow(row: Record<string, unknown> = {}, { position = 'end' }: { position?: 'start' | 'end' } = {}): string | null {
        const event = this.emit('beforeRowAdd', { row: { ...row } });
        if (event.defaultPrevented) return null;
        const id = this._insert([event.detail.row])[0]!;
        this._tracker?.recordInsert(id);
        const data = { ...this.store.get(id)! };
        if (position === 'start') this._view.unshift(data);
        else this._view.push(data);
        if (!this._replaying) this._undo.record({ kind: 'insert', id, data: { ...data }, index: position === 'start' ? 0 : this._view.length - 1 });
        this._renderBody();
        this._renderFooter();
        this._afterTrackedChange();
        this.emit('rowAdd', { id, row: this.getRow(id) });
        return id;
    }

    /**
     * Adds many rows at the end with one render and one undo step (no beforeRowAdd per row).
     * @return the new ids
     */
    addRows(rows: Record<string, unknown>[]): string[] {
        if (!rows.length) return [];
        return this.batch(() => {
            const ids = this._insert(rows);
            for (const id of ids) {
                this._tracker?.recordInsert(id);
                const data = { ...this.store.get(id)! };
                this._view.push(data);
                if (!this._replaying) this._undo.record({ kind: 'insert', id, data: { ...data }, index: this._view.length - 1 });
            }
            this._renderBody();
            this._renderFooter();
            this._renderNavbar();
            this._afterTrackedChange();
            this.emit('rowsAdd', { ids });
            return ids;
        }, 'insert');
    }

    updateRow(id: string, patch: Record<string, unknown>): boolean {
        return this.batch(() => this._updateRow(id, patch), 'update');
    }

    private _updateRow(id: string, patch: Record<string, unknown>): boolean {
        if (!this.store.has(id)) return false;
        this._touch(id);
        const before = this.getRow(id)!;
        const states = Object.keys(patch).filter(field => field !== '_id').map(field => [field, this._cellState(id, field)] as const);
        const previous = this.store.update(id, patch);
        const scope = this.calc.recalculate([id], Object.keys(patch));
        for (const [field, state] of states) this._recordCell(id, field, state);
        const after = this.getRow(id)!;
        for (const field of Object.keys(patch)) {
            if (field !== '_id') this._tracker?.recordUpdate(id, field, before[field] ?? null, after[field] ?? null, 'api');
        }
        this._syncRows(scope === 'all' ? null : [id]);
        this._afterTrackedChange();
        this.emit('rowChange', { id, row: this.getRow(id), previous });
        return true;
    }

    deleteRows(ids: string[]): string[] {
        return this.batch(() => this._deleteRows(ids), 'delete');
    }

    private _deleteRows(ids: string[]): string[] {
        const event = this.emit('beforeRowDelete', { ids: [...ids], rows: ids.map(id => this.getRow(id)) });
        if (event.defaultPrevented) return [];
        for (const id of event.detail.ids) {
            const data = this.store.get(id);
            if (!data) continue;
            const formulas = this.calc.cellFormulas.get(id);
            const wasInserted = this._tracker?.recordDelete(id, data, formulas) ?? false;
            if (!this._replaying) {
                this._undo.record({ kind: 'delete', id, data: { ...data }, formulas: formulas ? { ...formulas } : undefined, index: this._viewIndex.get(id) ?? this._view.length, wasInserted });
            }
        }
        const removed = this.store.remove(event.detail.ids);
        const removedIds = removed.map(r => r._id);
        this.calc.forgetRows(removedIds);
        this.calc.recalculate([], this.columns.map(c => c.field));
        removedIds.forEach(id => this._selected.delete(id));
        const gone = new Set(removedIds);
        this._view = this._view.filter(r => !gone.has(r._id));
        this._renderBody();
        this._syncRows(null);
        if (removedIds.length) this.emit('selectionChange', this._selectionDetail());
        this._afterTrackedChange();
        this.emit('rowDelete', { ids: removedIds, rows: removed.map(r => this._publicRow(r)) });
        return removedIds;
    }

    /**
     * Same pipeline as a user edit: parsing (strings), formulas, validation and events.
     * @return object {ok, error?}
     */
    setCellValue(id: string, field: string, value: unknown, { source = 'api' }: { source?: ChangeSource } = {}): SetCellResult {
        return this.batch(() => this._setCellValue(id, field, value, { source }), 'edit');
    }

    private _setCellValue(id: string, field: string, value: unknown, { source = 'api' }: { source?: ChangeSource } = {}): SetCellResult {
        const column = this.getColumn(field);
        const data = this.store.get(id);
        if (!column || !data) return { ok: false, error: 'notFound' };

        if (isFormula(value) && column.allowFormulas) return this.setCellFormula(id, field, value as string, { source });

        if (typeof value === 'string' && source !== 'api' && source !== 'fill') {
            const parsed = parseInput(value, column, this.locale);
            if (parsed.error) return this._invalidCell(id, field, value, parsed.error);
            value = parsed.value;
        }

        const row = this._publicRow(data)!;
        const error = validateValue(value, column, row);
        if (error) return this._invalidCell(id, field, value, error);

        const oldValue = row[field];
        const detail: CellChangeDetail = { id, field, value, oldValue, row, column, source };
        if (typeof column.beforeChange === 'function') {
            const result = column.beforeChange(detail);
            if (result === false) return { ok: false, error: 'cancelled' };
            if (result !== undefined && result !== true) detail.value = result;
        }
        const event = this.emit('beforeCellChange', detail);
        if (event.defaultPrevented) return { ok: false, error: 'cancelled' };

        this._touch(id);
        const beforeState = this._cellState(id, field);
        const hadFormula = !!this.calc.cellFormulas.get(id)?.[field];
        if (this.calc.columnFormulas.has(field)) this.calc.setCellOverride(id, field);
        else if (hadFormula) this.calc.setCellFormula(id, field, null);
        this.store.update(id, { [field]: event.detail.value });
        this._invalid.delete(`${id}\u0000${field}`);
        const scope = this.calc.recalculate([id], [field]);
        this._syncRows(scope === 'all' || hadFormula ? null : [id]);

        this._recordCell(id, field, beforeState);
        const updated = this.getRow(id)!;
        this._tracker?.recordUpdate(id, field, oldValue ?? null, updated[field] ?? null, source);
        this._afterTrackedChange();
        const change: CellChangeDetail = { id, field, value: updated[field], oldValue, row: updated, source };
        column.onChange?.(change);
        this.emit('cellChange', change);
        return { ok: true };
    }

    setCellFormula(id: string, field: string, formula: string | null, { source = 'api' }: { source?: ChangeSource } = {}): SetCellResult {
        return this.batch(() => this._setCellFormula(id, field, formula, { source }), 'formula');
    }

    private _setCellFormula(id: string, field: string, formula: string | null, { source = 'api' }: { source?: ChangeSource } = {}): SetCellResult {
        const column = this.getColumn(field);
        if (!column || !this.store.has(id)) return { ok: false, error: 'notFound' };
        const oldValue = this.getRow(id)![field];
        const event = this.emit<CellChangeDetail>('beforeCellChange', { id, field, value: formula, oldValue, row: this.getRow(id), column, source, formula: true });
        if (event.defaultPrevented) return { ok: false, error: 'cancelled' };

        this._touch(id);
        const beforeState = this._cellState(id, field);
        this.calc.setCellFormula(id, field, formula);
        this.calc.recalculate([id], [field]);
        this._recordCell(id, field, beforeState);
        this._syncRows(null);
        const value = this.getRow(id)![field];
        if (isErrorCode(value)) this.emit('formulaError', { id, field, formula, error: value });
        this._tracker?.recordUpdate(id, field, oldValue ?? null, value ?? null, source, formula);
        this._afterTrackedChange();
        const change: CellChangeDetail = { id, field, value, oldValue, formula: formula ?? undefined, row: this.getRow(id), source };
        column.onChange?.(change);
        this.emit('cellChange', change);
        return { ok: true };
    }

    /** Formula of a cell: its own, or the column formula; null for plain values. */
    getCellFormula(id: string, field: string): string | null {
        return this.calc.formulaFor(id, field);
    }

    private _invalidCell(id: string, field: string, value: unknown, error: string): SetCellResult {
        const message = this.t(error);
        this._invalid.set(`${id}\u0000${field}`, message);
        this.emit('validationError', { id, field, value, error, message });
        return { ok: false, error: message };
    }

    /**
     * Evaluates a formula: grid.evaluate('=SUM([total])') over the filtered rows, or for one row.
     */
    evaluate(formula: string, id: string | null = null): unknown {
        const row = id === null ? null : this.store.get(id);
        const value = this.calc.evaluate(formula, row, row ? null : this._view);
        return isError(value) ? value.code : value;
    }

    /* ---------------------------------------------------------------- undo / redo */

    /**
     * Groups every change made inside fn into one undo step: grid.batch(() => { ... }, 'import').
     * @return what fn returns
     */
    batch<T>(fn: () => T, label = 'batch'): T {
        this._undo.begin(label);
        try {
            return fn();
        } finally {
            this._undo.end();
            this._renderNavbar();
        }
    }

    canUndo(): boolean {
        return this._undo.canUndo;
    }

    canRedo(): boolean {
        return this._undo.canRedo;
    }

    /** Undoes the last step (Ctrl+Z). @return whether something was undone */
    undo(): boolean {
        this._closeEditor(false);
        const step = this._undo.takeUndo();
        if (!step) return false;
        this._applyStep(step, 'undo');
        return true;
    }

    /** Redoes the last undone step (Ctrl+Y). @return whether something was redone */
    redo(): boolean {
        this._closeEditor(false);
        const step = this._undo.takeRedo();
        if (!step) return false;
        this._applyStep(step, 'redo');
        return true;
    }

    clearUndo(): void {
        this._undo.clear();
        this._renderNavbar();
    }

    private _cellState(id: string, field: string): CellState {
        return { value: this.store.get(id)?.[field], formula: this.calc.cellFormulas.get(id)?.[field] };
    }

    private _recordCell(id: string, field: string, before: CellState): void {
        if (this._replaying) return;
        const after = this._cellState(id, field);
        if (before.value === after.value && before.formula === after.formula) return;
        this._undo.record({ kind: 'cell', id, field, before, after });
    }

    private _writeCell(id: string, field: string, state: CellState, source: string): void {
        if (!this.store.has(id)) return;
        this._touch(id);
        const from = this.getRow(id)![field];
        if (state.formula === undefined) {
            if (this.calc.cellFormulas.get(id)?.[field] !== undefined) this.calc.setCellFormula(id, field, null);
        } else {
            this.calc.setCellFormula(id, field, state.formula);
        }
        this.store.update(id, { [field]: state.value });
        this._invalid.delete(`${id}\u0000${field}`);
        this._tracker?.recordUpdate(id, field, from ?? null, this.getRow(id)![field] ?? null, source);
    }

    private _removeRow(change: Extract<UndoChange, { kind: 'insert' | 'delete' }>, source: string): void {
        const data = this.store.get(change.id);
        if (!data) return;
        this._tracker?.recordDelete(change.id, data, this.calc.cellFormulas.get(change.id), source);
        this.store.remove([change.id]);
        this.calc.cellFormulas.delete(change.id);
        this._selected.delete(change.id);
        this._view = this._view.filter(row => row._id !== change.id);
    }

    private _restoreRow(change: Extract<UndoChange, { kind: 'insert' | 'delete' }>, source: string): void {
        if (this.store.has(change.id)) return;
        this.store.insert([{ ...change.data }]);
        if (change.formulas) this.calc.cellFormulas.set(change.id, { ...change.formulas });
        if (change.kind === 'delete') this._tracker?.restoreDeleted(change.id, change.wasInserted, source);
        else this._tracker?.recordInsert(change.id, source);
        this._view.splice(Math.min(change.index, this._view.length), 0, { ...this.store.get(change.id)! });
    }

    private _applyStep(step: UndoStep, direction: 'undo' | 'redo'): void {
        this._replaying = true;
        const ids = new Set<string>();
        const fields = new Set<string>();
        let structural = false;
        try {
            const changes = direction === 'undo' ? [...step.changes].reverse() : step.changes;
            // rows come back in their original order, so restore them by ascending position
            const restores = changes.filter(c => (c.kind === 'insert' || c.kind === 'delete') && (direction === 'undo') === (c.kind === 'delete'));
            restores.sort((a, b) => (a as { index: number }).index - (b as { index: number }).index);
            for (const change of changes) {
                if (change.kind === 'cell') {
                    this._writeCell(change.id, change.field, direction === 'undo' ? change.before : change.after, direction);
                    ids.add(change.id);
                    fields.add(change.field);
                } else if (change.kind === 'comment') {
                    this._writeComment(change.id, change.field, direction === 'undo' ? change.before : change.after);
                    ids.add(change.id);
                } else if (!restores.includes(change)) {
                    this._removeRow(change, direction);
                    structural = true;
                }
            }
            for (const change of restores) {
                this._restoreRow(change as Extract<UndoChange, { kind: 'insert' | 'delete' }>, direction);
                structural = true;
            }
        } finally {
            this._replaying = false;
        }

        if (structural) {
            this.calc.setColumns(this.columns);
            this.calc.recalculateAll();
            this._renderBody();
            this._syncRows(null);
        } else {
            const scope = this.calc.recalculate([...ids], [...fields]);
            this._syncRows(scope === 'all' ? null : [...ids]);
        }
        this._afterTrackedChange();
        this._renderNavbar();
        this.emit(direction, { label: step.label, changes: step.changes.length });
    }

    /* ---------------------------------------------------------------- dialogs */

    /**
     * Asks the user to confirm, with the built-in modal or the `confirm` option.
     * Also available for your own actions: `if (await grid.confirm({ action: 'archive', message: '…' })) …`
     */
    async confirm(request: ConfirmRequest): Promise<boolean> {
        const custom = this.options.confirm;
        if (typeof custom === 'function') return !!await custom(request);
        return openConfirm(this.root, request, this.t);
    }

    /* ---------------------------------------------------------------- change tracking */

    private _readers: ChangeReaders = {
        current: id => this.store.get(id),
        publicRow: data => this._publicRow(data) ?? {},
        formulas: id => this.calc.cellFormulas.get(id),
        // calculated values are not user data, unless the user typed something into that cell
        tracked: (id, field, original) => !this.calc.columnFormulas.has(field)
            || this.calc.cellFormulas.get(id)?.[field] !== undefined
            || original?.[field] !== undefined
    };

    private _touch(id: string): void {
        this._tracker?.touch(id, this.store.get(id), this.calc.cellFormulas.get(id));
    }

    private _afterTrackedChange(): void {
        if (!this._tracker) return;
        const json = this._formInputs.length ? this.getChangesJSON() : '';
        for (const input of this._formInputs) input.value = json;
        this._renderNavbar();
        this.emit('changes', { summary: this.getChangeSummary(), hasChanges: this.hasChanges() });
    }

    /**
     * Net changes since the data was loaded or the last acceptChanges():
     * { inserted: [{id, row}], updated: [{id, changes: {field: {from, to}}, row}], deleted: [{id, row}] }
     */
    getChanges(): ChangeSet {
        if (!this._tracker) return { inserted: [], updated: [], deleted: [] };
        return this._tracker.getChanges(this._readers);
    }

    getChangesJSON(space?: number): string {
        return JSON.stringify(this.getChanges(), null, space);
    }

    getChangeSummary(): ChangeSummary {
        if (!this._tracker) return { inserted: 0, updated: 0, deleted: 0, total: 0 };
        return this._tracker.summary(this._readers);
    }

    hasChanges(): boolean {
        return this.getChangeSummary().total > 0;
    }

    /** Every insert, update and delete since the last acceptChanges(), oldest first. */
    getHistory(): HistoryEntry[] {
        return this._tracker ? this._tracker.history.map(entry => ({ ...entry })) : [];
    }

    /**
     * The current values become the new originals (call it after the server saved the changes).
     * @param ids only these rows (e.g. the ones the server accepted); all when omitted
     */
    acceptChanges(ids?: string[]): void {
        if (!this._tracker) return;
        this._tracker.forget(ids ? new Set(ids) : null);
        this._syncRows(null);
        this._afterTrackedChange();
        this.emit('changesAccept', { ids: ids ?? null });
    }

    /**
     * Restores the original state: removes inserted rows, restores deleted ones and reverts updates.
     * @param ids only these rows; all when omitted
     */
    rejectChanges(ids?: string[]): void {
        if (!this._tracker) return;
        this._closeEditor(false);
        const scope = ids ? new Set(ids) : null;
        const pending = this._tracker.pending(scope);

        this.store.remove(pending.inserted);
        this.calc.forgetRows(pending.inserted);
        pending.inserted.forEach(id => this._selected.delete(id));

        const restore = (id: string, formulas: Record<string, string> | undefined) => {
            if (formulas && Object.keys(formulas).length) this.calc.cellFormulas.set(id, { ...formulas });
            else this.calc.cellFormulas.delete(id);
        };
        for (const [id, snapshot] of pending.updated) {
            const { _id, ...values } = snapshot.data;
            const current = this.store.get(id);
            if (!current) continue;
            // fields added after the snapshot go back to blank
            for (const field of Object.keys(current)) if (field !== '_id' && !(field in values)) values[field] = null;
            this.store.update(id, values);
            restore(id, snapshot.formulas);
        }
        for (const [id, snapshot] of pending.deleted) {
            this.store.insert([{ ...snapshot.data }]);
            restore(id, snapshot.formulas);
        }

        this._tracker.forget(scope);
        this.calc.setColumns(this.columns);
        this.calc.recalculateAll();
        this.refresh();
        this._afterTrackedChange();
        this.emit('changesReject', { ids: ids ?? null });
    }

    /**
     * Keeps a hidden input with getChangesJSON() inside a form, updated on every change,
     * so a normal form submit sends the changes.
     * @return the hidden input
     */
    bindForm(form: string | HTMLFormElement, name = 'changes'): HTMLInputElement {
        const element = typeof form === 'string' ? document.querySelector<HTMLFormElement>(form) : form;
        if (!element) throw new Error('Intelligent Grid: form not found');
        let input = element.querySelector<HTMLInputElement>(`input[type="hidden"][name="${CSS.escape(name)}"]`);
        if (!input) {
            input = h('input', { type: 'hidden', name });
            element.append(input);
        }
        input.value = this.getChangesJSON();
        if (!this._formInputs.includes(input)) this._formInputs.push(input);
        return input;
    }

    /* ---------------------------------------------------------------- sort, filters, search */

    getSort(): SortEntry[] {
        return this._sort.map(s => ({ ...s }));
    }

    setSort(sort: SortEntry[] | null): void {
        this._sort = (sort ?? []).filter(s => this.getColumn(s.field)).map(s => ({ field: s.field, dir: s.dir === 'desc' ? 'desc' : 'asc' }));
        this._renderHeader();
        this._onQueryChange();
        this.emit('sortChange', { sort: this.getSort() });
    }

    /**
     * asc -> desc -> none. Additive keeps the other sorted columns (multi column sort).
     */
    toggleSort(field: string, additive = false): void {
        const column = this.getColumn(field);
        if (!column?.sortable) return;
        const current = this._sort.find(s => s.field === field);
        const next = !current ? 'asc' : current.dir === 'asc' ? 'desc' : null;
        let sort = additive ? this._sort.filter(s => s.field !== field) : [];
        if (additive && current && next) sort = this._sort.map(s => s.field === field ? { field, dir: next } : s);
        else if (next) sort.push({ field, dir: next });
        this.setSort(sort);
    }

    getFilters(): FilterModel {
        return { ...this._filters };
    }

    setFilter(field: string, filter: Filter | null): void {
        if (filter && isFilterActive(filter)) this._filters[field] = filter;
        else delete this._filters[field];
        this._renderHeader();
        this._onQueryChange();
        this.emit('filterChange', { field, filter: this._filters[field] ?? null, filters: this.getFilters() });
    }

    setFilters(filters: FilterModel | null): void {
        this._filters = {};
        for (const [field, filter] of Object.entries(filters ?? {})) if (isFilterActive(filter)) this._filters[field] = filter;
        this._renderHeader();
        this._onQueryChange();
        this.emit('filterChange', { field: null, filter: null, filters: this.getFilters() });
    }

    /** Column filters, search and the advanced filter. */
    clearFilters(): void {
        this._search = '';
        if (this._searchInput) this._searchInput.value = '';
        if (this._queryModel) {
            this._queryModel = null;
            this.emit('queryChange', { query: null, sorlaQuery: {} });
        }
        this.setFilters({});
    }

    /* ---------------------------------------------------------------- advanced filter (query builder) */

    /** The advanced filter as built in the query builder, null when none. */
    getQuery(): QueryNode | null {
        return this._queryModel ? structuredClone(this._queryModel) : null;
    }

    /**
     * Sets the advanced filter. It is combined (AND) with the column filters and the search.
     * Incomplete rules and empty groups are dropped.
     */
    setQuery(query: QueryNode | null): void {
        this._queryModel = normalizeQuery(query);
        this._renderNavbar();
        this._onQueryChange();
        this.emit('queryChange', { query: this.getQuery(), sorlaQuery: this.toSorlaQuery() });
    }

    /** The advanced filter as SorlaDB / MongoDB find() JSON ({} when none). */
    toSorlaQuery(query: QueryNode | null = this._queryModel): Record<string, unknown> {
        return writeSorlaQuery(query, this._columnMap, this.locale);
    }

    /** Loads a SorlaDB / MongoDB query (e.g. a saved one) into the advanced filter. */
    fromSorlaQuery(json: Record<string, unknown>): void {
        this.setQuery(parseSorlaQuery(json));
    }

    /** Opens or closes the query builder panel. */
    toggleQueryBuilder(open?: boolean): void {
        if (!this._queryBuilder) return;
        if (open === undefined) this._queryBuilder.toggle();
        else if (open) this._queryBuilder.open();
        else this._queryBuilder.close();
        this._renderNavbar();
    }

    /** @internal rows matching a query (with the other filters), for the builder preview */
    countQuery(query: QueryNode | null): number {
        const previous = this._queryModel;
        this._queryModel = normalizeQuery(query);
        try {
            const { query: sorla, predicates } = this._compiled();
            return this.store.query({ query: sorla, predicates }).length;
        } finally {
            this._queryModel = previous;
        }
    }

    /** @internal */
    queryColumns(): Map<string, Column> {
        return this._columnMap;
    }

    setSearch(text: string): void {
        this._search = String(text ?? '');
        if (this._searchInput && this._searchInput.value !== this._search) this._searchInput.value = this._search;
        this._onQueryChange();
        this.emit('searchChange', { search: this._search });
    }

    private _onQueryChange(): void {
        if (this._append?.serverSide) {
            this._resetAppend();
            this.loadMore();
            return;
        }
        this.refresh();
    }

    private _compiled(excludeField: string | null = null): CompiledFilters {
        const filters = { ...this._filters };
        if (excludeField) delete filters[excludeField];
        const { query, predicates } = compileFilters(filters, this._columnMap, {
            locale: this.locale,
            testFormula: (formula, row) => this.calc.evaluate(formula, row) === true
        });
        const needle = this._search.trim().toLocaleLowerCase(this.locale);
        if (needle) {
            const columns = this.visibleColumns;
            predicates.push(row => columns.some(c => formatCell(row[c.field], c, row, this.locale).toLocaleLowerCase(this.locale).includes(needle)));
        }
        if (!this._queryModel) return { query, predicates };

        const advanced = compileQuery(this._queryModel, this._columnMap, {
            locale: this.locale,
            idsFor: sorla => new Set(this.store.query({ query: sorla }).map(row => row._id))
        });
        return { query: andQuery([query, advanced.query]), predicates: [...predicates, ...advanced.predicates] };
    }

    private _query(): RowData[] {
        const { query, predicates } = this._append?.serverSide ? { query: {}, predicates: [] } : this._compiled();
        const sort = this._append?.serverSide ? [] : this._sort.map(s => ({ ...s, locale: this.locale }));
        return this.store.query({ query, predicates, sort, compare: compareCells });
    }

    /**
     * Distinct values of a field for the filter checklist, considering the other filters (Excel).
     */
    /** @internal used by the filter menu */
    distinctValues(field: string): DistinctValue[] {
        const column = this.getColumn(field);
        const { query, predicates } = this._compiled(field);
        const counts = new Map();
        for (const row of this.store.query({ query, predicates })) {
            const value = row[field];
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return [...counts].sort((a, b) => compareCells(a[0], b[0], { locale: this.locale }))
            .map(([value, count]) => ({ value, count, label: column ? formatCell(value, column, {}, this.locale) : String(value) }));
    }

    /**
     * Re-runs the query (filters + search + sort) through SorlaDB and renders from the top.
     */
    refresh(): void {
        this._closeEditor(false);
        this._view = this._query();
        this._renderBody();
        this._renderFooter();
        this._renderNavbar();
        this.emit('render', { rows: this._view.length });
    }

    /* ---------------------------------------------------------------- append / infinite scroll */

    private _resetAppend(): void {
        const append = this._append;
        if (!append) return;
        append.request++;
        append.loaded = 0;
        append.hasMore = true;
        append.loading = false;
        // reloading from the server replaces the rows, unsaved changes cannot survive it
        if (this.hasChanges()) this.emit('changesDiscarded', { changes: this.getChanges() });
        this._tracker?.reset();
        this._undo.clear();
        this.store.clear();
        this.calc.cellFormulas.clear();
        this.calc.setColumns(this.columns);
        this._view = [];
        this._scroller.scrollTop = 0;
        this._renderBody();
    }

    /**
     * Loads the next page from options.append.load({offset, limit, sort, filters, search}).
     * The loader resolves {rows, hasMore?, total?}.
     */
    async loadMore(): Promise<void> {
        const append = this._append;
        if (!append || append.loading || !append.hasMore) return;
        append.loading = true;
        const request = append.request;
        const params = {
            offset: append.loaded, limit: append.pageSize, sort: this.getSort(), filters: this.getFilters(), search: this._search,
            query: this.getQuery(), sorlaQuery: this.toSorlaQuery()
        };
        this._setLoading(true);
        this.emit('loadStart', params);

        try {
            const result = await append.load(params);
            if (request !== append.request) return;
            const page = Array.isArray(result) ? { rows: result } : result;
            const rows = page?.rows ?? [];
            const ids = this._insert(rows);
            append.loaded += rows.length;
            append.total = page?.total ?? null;
            append.hasMore = page?.hasMore ?? rows.length >= append.pageSize;

            const localQuery = !append.serverSide && (this._sort.length || Object.keys(this._filters).length || this._search || this._queryModel);
            if (localQuery) {
                append.loading = false;
                this.refresh();
            } else {
                const scopeAll = this.calc.hasColumnReferences();
                if (scopeAll) this._view.forEach((row, i) => { this._view[i] = { ...this.store.get(row._id)! }; });
                for (const id of ids) this._view.push({ ...this.store.get(id)! });
                this._renderBody();
                this._renderFooter();
                this._renderNavbar();
            }
            this.emit('loadEnd', { ...params, rows: rows.length, hasMore: append.hasMore, total: append.total });
        } catch (error) {
            if (request !== append.request) return;
            append.hasMore = false;
            this.emit('loadError', { ...params, error });
            this._showMessage(this.t('loadError'));
        } finally {
            if (request === append.request) {
                append.loading = false;
                this._setLoading(false);
                // fill the viewport when the first pages are shorter than the scroll area
                requestAnimationFrame(() => this._checkScrollEnd());
            }
        }
    }

    reload(): Promise<void> | void {
        if (this._append) {
            this._resetAppend();
            return this.loadMore();
        }
        this.refresh();
    }

    private _checkScrollEnd(): void {
        const scroller = this._scroller;
        if (!scroller) return;
        if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - (this._append?.threshold ?? 200)) return;
        if (this._append?.hasMore) this.loadMore();
        else this.emit('scrollEnd', {});
    }

    /* ---------------------------------------------------------------- selection */

    get selectionMode(): SelectionMode {
        return this.options.selection.mode;
    }

    getSelected(): Row[] {
        return [...this._selected].map(id => this.getRow(id)).filter(isRow);
    }

    getSelectedIds(): string[] {
        return [...this._selected];
    }

    select(ids: string[], { append = this.selectionMode === 'multiple' }: { append?: boolean } = {}): void {
        if (this.selectionMode === 'none') return;
        const list = this.selectionMode === 'single' ? ids.slice(-1) : ids;
        if (!append || this.selectionMode === 'single') this._selected.clear();
        list.filter(id => this.store.has(id)).forEach(id => this._selected.add(id));
        this._afterSelection();
    }

    deselect(ids: string[]): void {
        ids.forEach(id => this._selected.delete(id));
        this._afterSelection();
    }

    selectAll(): void {
        if (this.selectionMode !== 'multiple') return;
        this._view.forEach(row => this._selected.add(row._id));
        this._afterSelection();
    }

    clearSelection(): void {
        if (!this._selected.size) return;
        this._selected.clear();
        this._afterSelection();
    }

    private _selectionDetail(): { ids: string[]; rows: Row[] } {
        return { ids: this.getSelectedIds(), rows: this.getSelected() };
    }

    private _afterSelection(): void {
        for (const tr of this._rowEls.values()) {
            const selected = this._selected.has(tr.dataset.id ?? '');
            tr.classList.toggle('ig-selected', selected);
            tr.setAttribute('aria-selected', String(selected));
            const box = tr.querySelector<HTMLInputElement>('.ig-select-cell input');
            if (box) box.checked = selected;
        }
        this._syncSelectAll();
        this._renderNavbar();
        this.emit('selectionChange', this._selectionDetail());
    }

    private _syncSelectAll(): void {
        if (!this._selectAllBox) return;
        const total = this._view.length;
        const selected = this._view.filter(r => this._selected.has(r._id)).length;
        this._selectAllBox.checked = total > 0 && selected === total;
        this._selectAllBox.indeterminate = selected > 0 && selected < total;
    }

    private _clickSelect(id: string, event: SelectEventLike): void {
        const mode = this.selectionMode;
        if (mode === 'none') return;
        if (mode === 'single') {
            this.select([id], { append: false });
        } else if (event.shiftKey && this._anchorId) {
            const ids = this._view.map(r => r._id);
            const [a = -1, b = -1] = [ids.indexOf(this._anchorId), ids.indexOf(id)].sort((x, y) => x - y);
            if (a === -1) return this.select([id], { append: false });
            this.select(ids.slice(a, b + 1), { append: event.ctrlKey || event.metaKey });
            return;
        } else if (event.ctrlKey || event.metaKey || (event.target instanceof Element && event.target.closest('.ig-select-cell'))) {
            if (this._selected.has(id)) this.deselect([id]);
            else this.select([id], { append: true });
        } else {
            this.select([id], { append: false });
        }
        this._anchorId = id;
    }

    /* ---------------------------------------------------------------- export */

    private _exportRows(rows: 'filtered' | 'all' | 'selected' = 'filtered'): RowData[] {
        const live = (id: string) => this.store.get(id);
        const present = (row: RowData | undefined): row is RowData => row !== undefined;
        if (rows === 'selected') return this.getSelected().map(r => live(r._id)).filter(present);
        if (rows === 'all') return this.store.ids().map(live).filter(present);
        return this._view.map(r => this.store.get(r._id) ?? r);
    }

    private _exportColumns(columns: 'visible' | 'all' | string[] = 'visible'): Column[] {
        if (Array.isArray(columns)) return columns.map(f => this.getColumn(f)).filter((c): c is Column => c !== undefined);
        return columns === 'all' ? this.columns : this.visibleColumns;
    }

    /**
     * @param object options {rows: 'filtered'|'all'|'selected', columns: 'visible'|'all'|[fields],
     *   delimiter, formatted, bom, filename, download}
     * @return string
     */
    exportCSV(options: CsvExportOptions = {}): string | null {
        const event = this.emit<{ format: 'csv'; options: CsvExportOptions }>('beforeExport', { format: 'csv', options: { rows: 'filtered', columns: 'visible', ...options } });
        if (event.defaultPrevented) return null;
        const opts = event.detail.options;
        const { decimal } = localeSeparators(this.locale);
        // Excel opens ';' separated files in locales that use ',' as decimal separator
        const delimiter = opts.delimiter ?? (decimal === ',' ? ';' : ',');
        const csv = toCSV(this._exportRows(opts.rows), this._exportColumns(opts.columns), {
            ...opts,
            delimiter,
            decimal: opts.decimal ?? (opts.formatted ? '.' : decimal === ',' && delimiter === ';' ? ',' : '.'),
            format: (value, column, row) => formatCell(value, column, row, this.locale)
        });
        const content = (opts.bom ?? true) ? '﻿' + csv : csv;
        if (opts.download !== false) download(content, `${opts.filename ?? this.options.exportOptions.filename}.csv`, 'text/csv;charset=utf-8');
        this.emit('export', { format: 'csv', options: opts });
        return csv;
    }

    /**
     * @param object options {rows, columns, formulas (true), footer (true), sheetName, filename, download}
     * @return Uint8Array
     */
    exportXLSX(options: XlsxExportOptions = {}): Uint8Array | null {
        const event = this.emit<{ format: 'xlsx'; options: XlsxExportOptions }>('beforeExport', { format: 'xlsx', options: { rows: 'filtered', columns: 'visible', formulas: true, footer: true, ...options } });
        if (event.defaultPrevented) return null;
        const opts = event.detail.options;
        const columns = this._exportColumns(opts.columns).map(c => ({ ...c, numFmt: excelFormatCode(c, this.locale) }));
        const rows = this._exportRows(opts.rows);

        let footer: Record<string, XlsxFooterCell> | null = null;
        if (opts.footer && columns.some(c => c.footer)) {
            footer = {};
            for (const column of columns) {
                const formula = this._footerFormula(column);
                if (formula) footer[column.field] = { formula, value: this._footerValue(column, rows) };
            }
        }

        const bytes = toXLSX({
            columns,
            rows,
            footer,
            formulas: opts.formulas,
            sheetName: opts.sheetName ?? this.options.exportOptions.sheetName,
            formulaFor: (row, column) => this.calc.formulaFor(row._id, column.field)
        });
        if (opts.download !== false) {
            download(bytes, `${opts.filename ?? this.options.exportOptions.filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
        this.emit('export', { format: 'xlsx', options: opts });
        return bytes;
    }

    /* ---------------------------------------------------------------- footer */

    private _footerFormula(column: Column): string | null {
        const footer = column.footer;
        if (typeof footer !== 'string') return null;
        if (isFormula(footer)) return footer;
        const fn = FOOTER_SHORTCUTS[footer.toLowerCase()];
        return fn ? `=${fn}([${column.field}])` : null;
    }

    private _footerValue(column: Column, rows: RowData[] = this._view): unknown {
        if (typeof column.footer === 'function') return column.footer(rows.map(r => this._publicRow(r)).filter(isRow), column, this);
        const formula = this._footerFormula(column);
        if (!formula) return null;
        const value = this.calc.evaluate(formula, null, rows);
        return isError(value) ? value.code : value;
    }

    /* ---------------------------------------------------------------- DOM */

    private _build(): void {
        clear(this.element);
        this.root = h('div', { class: 'ig', lang: this.locale });
        this._navbar = h('div', { class: 'ig-navbar', role: 'toolbar' });
        this._colgroup = h('colgroup');
        this._thead = h('thead');
        this._tbody = h('tbody');
        this._tfoot = h('tfoot');
        this._table = h('table', { class: 'ig-table', role: 'grid', 'aria-multiselectable': this.selectionMode === 'multiple' ? 'true' : null },
            this._colgroup, this._thead, this._tbody, this._tfoot);
        this._message = h('div', { class: 'ig-message', hidden: true });
        this._loading = h('div', { class: 'ig-loading', hidden: true, text: this.t('loading') });
        this._topSpacer = h('tr', { class: 'ig-spacer', 'aria-hidden': 'true' });
        this._bottomSpacer = h('tr', { class: 'ig-spacer', 'aria-hidden': 'true' });
        this._scroller = h('div', { class: 'ig-scroll', tabindex: '0', style: { maxHeight: typeof this.options.height === 'number' ? `${this.options.height}px` : this.options.height } },
            this._table, this._message, this._loading);
        if (this.options.rowHeight) {
            this._layout.setDefaultHeight(this.options.rowHeight);
            this._calibrated = true;
        }
        this._status = h('div', { class: 'ig-status', 'aria-live': 'polite' });

        if (this.options.navbar) this.root.append(this._navbar);
        if (this.options.navbar && this.options.navbar.query) {
            this._queryBuilder = new QueryBuilder(this);
            this.root.append(this._queryBuilder.element);
            this.on('queryBuilderClose', () => this._renderNavbar());
        }
        if (this.options.find) {
            this._findBar = new FindBar(this);
            this.root.append(this._findBar.element);
        }
        this.root.append(this._scroller);
        if (this.options.statusBar) this.root.append(this._status);
        this.element.classList.add('ig-host');
        this.element.append(this.root);

        this._renderHeader();
        this._bindEvents();
    }

    private _bindEvents(): void {
        const scroller = this._scroller;
        // render the visible window once per frame while scrolling
        this._onScroll = () => {
            if (this._scrollFrame) return;
            this._scrollFrame = requestAnimationFrame(() => {
                this._scrollFrame = 0;
                this._renderWindow();
                this._checkScrollEnd();
            });
        };
        scroller.addEventListener('scroll', this._onScroll, { passive: true });

        this._tbody.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            if (targetOf(e)?.closest('.ig-fill-handle')) {
                e.preventDefault();
                this._startDrag(e, true);
                return;
            }
            const td = targetOf(e)?.closest<HTMLTableCellElement>('td[data-field]');
            const tr = td?.closest('tr');
            if (!td || !tr?.dataset.id || this._editing?.td === td || targetOf(e)?.closest('input, select, textarea, button, .ig-fill-handle')) return;
            // no text selection while dragging a range; keep keyboard focus on the grid
            e.preventDefault();
            this._scroller.focus({ preventScroll: true });
            this._selectCell(tr.dataset.id, td.dataset.field!, e.shiftKey && !!this._active);
            this._startDrag(e, false);
        });
        this._tbody.addEventListener('mouseover', e => {
            const td = targetOf(e)?.closest<HTMLTableCellElement>('td.ig-has-comment');
            if (td) this._showCommentTip(td);
        });
        this._tbody.addEventListener('mouseout', e => {
            const td = targetOf(e)?.closest('td.ig-has-comment');
            if (td && !td.contains(e.relatedTarget as Node | null)) this._hideCommentTip();
        });
        this._tbody.addEventListener('pointerover', e => {
            if (!this._dragging) return;
            const td = targetOf(e)?.closest<HTMLTableCellElement>('td[data-field]');
            if (td) this._dragOver(td);
        });
        this._tbody.addEventListener('dblclick', e => {
            // double click on the fill handle fills down to the last row, like Excel
            if (!targetOf(e)?.closest('.ig-fill-handle')) return;
            e.preventDefault();
            const bounds = this._rangeBounds();
            if (bounds) this.fill('down', this._view.length - 1 - bounds.r2);
        });
        this._tbody.addEventListener('click', e => {
            const group = targetOf(e)?.closest<HTMLElement>('tr.ig-group-row')?.dataset.group;
            if (group !== undefined) {
                this.toggleGroup(group);
                return;
            }
            const td = targetOf(e)?.closest('td') ?? null;
            const tr = targetOf(e)?.closest('tr');
            if (!tr || !tr.dataset.id || this._editing?.td === td) return;
            const id = tr.dataset.id;
            if (td?.dataset.field && !this._active) this._setActive(id, td.dataset.field);
            if (td?.classList.contains('ig-select-cell') || this.options.selection.selectOnClick === true) this._clickSelect(id, e);
            const row = this.getRow(id);
            this.emit('rowClick', { id, row, event: e });
            if (td?.dataset.field) this.emit('cellClick', { id, field: td.dataset.field, value: row?.[td.dataset.field], row, event: e });
        });
        this._tbody.addEventListener('dblclick', e => {
            const td = targetOf(e)?.closest<HTMLTableCellElement>('td[data-field]');
            const tr = targetOf(e)?.closest('tr');
            if (!tr?.dataset.id) return;
            this.emit('rowDblClick', { id: tr.dataset.id, row: this.getRow(tr.dataset.id), event: e });
            if (td?.dataset.field) this.startEdit(tr.dataset.id, td.dataset.field);
        });
        this._tbody.addEventListener('change', e => {
            // boolean cells toggle directly, like an Excel checkbox
            const box = e.target;
            if (!(box instanceof HTMLInputElement) || !box.matches('.ig-cell-checkbox')) return;
            const td = box.closest('td');
            const id = td?.parentElement?.dataset.id;
            if (!td?.dataset.field || !id) return;
            const result = this.setCellValue(id, td.dataset.field, box.checked, { source: 'edit' });
            if (!result.ok) box.checked = !box.checked;
        });

        scroller.addEventListener('keydown', e => this._onKeyDown(e));
        scroller.addEventListener('paste', e => this._onPaste(e));
        scroller.addEventListener('copy', e => this._onCopy(e));

        this._onDocumentPointer = e => {
            const target = targetOf(e);
            if (this._popover && !this._popover.contains(target) && !target?.closest('.ig-filter-btn, .ig-columns-btn')) this.closePopover();
        };
        document.addEventListener('pointerdown', this._onDocumentPointer);
    }

    /**
     * Which columns to render: pinned ones always, scrollable ones windowed when there are more than
     * `virtualColumns` of them.
     */
    private _columnPlan(): ColumnPlan {
        const columns = this.visibleColumns;
        const left = columns.filter(c => c.pinned === 'left');
        const right = columns.filter(c => c.pinned === 'right');
        const scrollable = columns.filter(c => c.pinned !== 'left' && c.pinned !== 'right');
        const selection = this.selectionMode !== 'none' && !!this.options.selection.checkbox;

        let center = scrollable;
        let before = 0;
        let after = 0;
        if (scrollable.length > this.options.virtualColumns) {
            const pinnedLeft = (selection ? SELECTION_WIDTH : 0) + left.reduce((sum, c) => sum + widthOf(c), 0);
            const pinnedRight = right.reduce((sum, c) => sum + widthOf(c), 0);
            const width = this._scroller?.clientWidth || 1200;
            const range = columnWindow(scrollable.map(widthOf), Math.max(0, (this._scroller?.scrollLeft ?? 0)), Math.max(200, width - pinnedLeft - pinnedRight), 2);
            center = scrollable.slice(range.start, range.end);
            before = range.before;
            after = range.after;
        }

        const sticky = new Map<string, { side: 'left' | 'right'; offset: number; edge: boolean }>();
        let offset = selection && left.length ? SELECTION_WIDTH : 0;
        left.forEach((column, i) => {
            sticky.set(column.field, { side: 'left', offset, edge: i === left.length - 1 });
            offset += widthOf(column);
        });
        offset = 0;
        [...right].reverse().forEach((column, i) => {
            sticky.set(column.field, { side: 'right', offset, edge: i === right.length - 1 });
            offset += widthOf(column);
        });

        const key = [selection, ...left.map(c => c.field), '|', before, ...center.map(c => c.field), after, '|', ...right.map(c => c.field)].join(',');
        return { left, center, right, before, after, selection, sticky, key };
    }

    /** Cells of a row in plan order; spacers keep the width of the columns that are not rendered. */
    private _planCells(plan: ColumnPlan, cell: (column: Column) => HTMLTableCellElement, spacer: () => HTMLTableCellElement, selectionCell: () => HTMLTableCellElement): HTMLTableCellElement[] {
        const cells: HTMLTableCellElement[] = [];
        if (plan.selection) {
            const select = selectionCell();
            if (plan.left.length) select.classList.add('ig-pinned', 'ig-pinned-left');
            cells.push(select);
        }
        const place = (column: Column) => {
            const element = cell(column);
            const pin = plan.sticky.get(column.field);
            if (pin) {
                element.classList.add('ig-pinned', `ig-pinned-${pin.side}`);
                if (pin.edge) element.classList.add(`ig-pinned-${pin.side}-edge`);
                element.style[pin.side] = `${pin.offset}px`;
            }
            return element;
        };
        cells.push(...plan.left.map(place));
        if (plan.before) cells.push(spacer());
        cells.push(...plan.center.map(place));
        if (plan.after) cells.push(spacer());
        cells.push(...plan.right.map(place));
        return cells;
    }

    private _renderHeader(): void {
        const plan = this._plan = this._columnPlan();
        clear(this._colgroup);
        clear(this._thead);
        const tr = h('tr', { 'aria-rowindex': '1' });
        const multi = this._sort.length > 1;
        const pinnedWidths = plan.left.length || plan.right.length || plan.before || plan.after;

        const col = (column: Column | null, width?: number) => h('col', {
            class: column ? null : 'ig-col-spacer',
            style: column
                ? { width: column.width || pinnedWidths ? `${widthOf(column)}px` : null, minWidth: `${column.minWidth}px` }
                : { width: `${width}px` }
        });
        if (plan.selection) this._colgroup.append(h('col', { class: 'ig-select-col' }));
        for (const column of plan.left) this._colgroup.append(col(column));
        if (plan.before) this._colgroup.append(col(null, plan.before));
        for (const column of plan.center) this._colgroup.append(col(column));
        if (plan.after) this._colgroup.append(col(null, plan.after));
        for (const column of plan.right) this._colgroup.append(col(column));
        const cols = [...this._colgroup.children] as HTMLTableColElement[];
        const colFor = (field: string) => {
            const index = [...(plan.selection ? [null] : []), ...plan.left, ...(plan.before ? [null] : []), ...plan.center, ...(plan.after ? [null] : []), ...plan.right]
                .findIndex(column => column?.field === field);
            return cols[index]!;
        };

        this._selectAllBox = plan.selection && this.selectionMode === 'multiple'
            ? h('input', { type: 'checkbox', 'aria-label': this.t('selectAll'), onchange: (e: Event) => (e.target as HTMLInputElement).checked ? this.selectAll() : this.clearSelection() })
            : null;

        const headerCell = (column: Column): HTMLTableCellElement => {
            const col = colFor(column.field);
            const sortIndex = this._sort.findIndex(s => s.field === column.field);
            const sort = this._sort[sortIndex];
            const filtered = isFilterActive(this._filters[column.field]);

            const th = h('th', {
                class: ['ig-th', `ig-align-${column.align}`, column.sortable ? 'ig-sortable' : '', sort ? 'ig-sorted' : '', column.headerClass ?? ''].join(' ').trim(),
                dataset: { field: column.field },
                scope: 'col',
                'aria-sort': sort ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null,
                title: column.tooltip ?? null
            },
            h('div', { class: 'ig-th-inner' },
                h('span', { class: 'ig-th-title', text: column.title }),
                sort ? h('span', { class: 'ig-sort-indicator', text: sort.dir === 'asc' ? '▲' : '▼' }, multi ? h('sup', { text: sortIndex + 1 }) : null) : null,
                column.filterable ? h('button', {
                    type: 'button',
                    class: `ig-filter-btn${filtered ? ' ig-active' : ''}`,
                    'aria-label': `${this.t('filter')} ${column.title}`,
                    text: filtered ? '⧩' : '▾',
                    onclick: (e: MouseEvent) => {
                        e.stopPropagation();
                        openFilterMenu(this, column, e.currentTarget as HTMLElement);
                    }
                }) : null),
            column.resizable ? h('span', { class: 'ig-resize', onpointerdown: (e: PointerEvent) => this._startResize(e, column, col) }) : null);

            th.addEventListener('click', e => {
                if (targetOf(e)?.closest('.ig-filter-btn, .ig-resize')) return;
                const additive = this.options.sort.mode === 'toggle' || e.shiftKey || e.ctrlKey || e.metaKey;
                this.toggleSort(column.field, additive);
            });
            return th;
        };
        tr.append(...this._planCells(plan, headerCell, () => h('th', { class: 'ig-spacer-cell', 'aria-hidden': 'true' }), () => h('th', { class: 'ig-select-cell' }, this._selectAllBox)));
        this._thead.append(tr);
        this._syncSelectAll();
    }

    private _startResize(event: PointerEvent, column: Column, col: HTMLTableColElement): void {
        event.preventDefault();
        event.stopPropagation();
        const th = targetOf(event)?.closest('th');
        if (!th) return;
        const start = event.clientX;
        const initial = th.getBoundingClientRect().width;
        const move = (e: PointerEvent) => {
            column.width = Math.max(column.minWidth, Math.round(initial + e.clientX - start));
            col.style.width = `${column.width}px`;
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            // sticky offsets and the column window depend on the widths
            this._plan = null;
            this._renderWindow(true);
            this.emit('columnResize', { field: column.field, width: column.width });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    /** The rows to show changed (query, inserts, deletes): rebuild the layout and render the window. */
    private _renderBody(): void {
        if (this._groupBy.length) this._sortGroups();
        this._stats.clear();
        this._viewIndex = new Map(this._view.map((row, i) => [row._id, i]));
        this._buildDisplay();
        this._layout.setKeys(this._display
            ? this._display.map(item => typeof item === 'number' ? this._view[item]!._id : `\u0001${item.key}`)
            : this._view.map(row => row._id));
        this._table.setAttribute('aria-rowcount', String(this._view.length + 1));
        this._renderWindow(true);
        this._showMessage(this._view.length || this._append?.loading ? null : this.t('noRows'));
        this._syncSelectAll();
    }

    /** Height of the visible area below the sticky header and above the sticky footer. */
    private _viewportHeight(): number {
        // the scroll area grows up to its max-height: before the rows are in, use that maximum
        const view = this._scroller.ownerDocument.defaultView;
        const max = view ? parseFloat(view.getComputedStyle(this._scroller).maxHeight) : NaN;
        const height = Math.max(this._scroller.clientHeight, Number.isFinite(max) ? max : 0) || (typeof this.options.height === 'number' ? this.options.height : 480);
        return Math.max(1, height - (this._thead.offsetHeight || 0) - (this._tfoot.offsetHeight || 0));
    }

    /**
     * Renders only the rows (and, with many columns, the columns) in view, plus spacers that keep the
     * scroll size of the rest. Rows that stay in view are reused.
     * @param force re-render every row (columns or data changed)
     */
    private _renderWindow(force = false): void {
        const plan = this._columnPlan();
        if (!this._plan || plan.key !== this._plan.key) {
            this._renderHeader();
            this._renderFooter();
            force = true;
        }
        const scrollTop = Math.max(0, this._scroller.scrollTop - (this._thead.offsetHeight || 0));
        const [start, end] = this._layout.window(scrollTop, this._viewportHeight(), this.options.overscan);
        if (!force && start === this._rowWindow[0] && end === this._rowWindow[1]) return;

        // an editor scrolled out of view commits (or is cancelled when the value is invalid)
        if (this._editing) {
            const index = this._displayOf(this._editing.id) ?? -1;
            if (index < start || index >= end) {
                if (!this._closeEditor(true)) this._closeEditor(false);
            }
        }

        this._rowWindow = [start, end];
        const rows: HTMLTableRowElement[] = [];
        const next = new Map<string, HTMLTableRowElement>();
        const groups = new Map<string, HTMLTableRowElement>();
        for (let i = start; i < end; i++) {
            const item = this._display ? this._display[i]! : i;
            if (typeof item !== 'number') {
                const tr = (force ? undefined : this._groupEls.get(item.key)) ?? this._createGroupRow(item, i);
                groups.set(item.key, tr);
                rows.push(tr);
                continue;
            }
            const row = this._view[item]!;
            let tr = force ? undefined : this._rowEls.get(row._id);
            if (!tr) tr = this._createRow(row, i);
            next.set(row._id, tr);
            rows.push(tr);
        }
        this._rowEls = next;
        this._groupEls = groups;
        const current = this._plan!;
        const columnCount = (current.selection ? 1 : 0) + current.left.length + current.center.length + current.right.length + (current.before ? 1 : 0) + (current.after ? 1 : 0);
        this._setSpacer(this._topSpacer, this._layout.offsetOf(start), columnCount);
        this._setSpacer(this._bottomSpacer, this._layout.total - this._layout.offsetOf(end), columnCount);
        this._tbody.replaceChildren(this._topSpacer, ...rows, this._bottomSpacer);
        this._measureRows(start, rows);
        this._paintRange();
    }

    private _setSpacer(tr: HTMLTableRowElement, height: number, columns: number): void {
        let td = tr.firstElementChild as HTMLTableCellElement | null;
        if (!td) {
            td = h('td');
            tr.append(td);
        }
        td.colSpan = Math.max(1, columns);
        td.style.height = `${Math.max(0, height)}px`;
        tr.hidden = height <= 0;
    }

    /**
     * Rows taller than the default (wrapped text) are measured, so the scroll size stays exact.
     * The first rendered row also calibrates the default height when no rowHeight is configured.
     */
    private _measureRows(start: number, rows: HTMLTableRowElement[]): void {
        if (!rows.length) return;
        let changed = false;
        if (!this._calibrated) {
            const height = rows[0]!.offsetHeight;
            if (height > 0) {
                this._layout.setDefaultHeight(height);
                this._calibrated = true;
                changed = true;
            }
        }
        if (this.columns.some(c => c.wrap && c.visible)) {
            rows.forEach((tr, i) => {
                const height = tr.offsetHeight;
                if (height > 0 && this._layout.measure(start + i, height)) changed = true;
            });
        }
        if (changed) {
            const [first, last] = this._rowWindow;
            const columns = (this._topSpacer.firstElementChild as HTMLTableCellElement | null)?.colSpan ?? 1;
            this._setSpacer(this._topSpacer, this._layout.offsetOf(first), columns);
            this._setSpacer(this._bottomSpacer, this._layout.total - this._layout.offsetOf(last), columns);
        }
    }

    /**
     * Scrolls so that a row is visible.
     * @param index position in the filtered and sorted rows
     */
    scrollToRow(index: number): void {
        if (index < 0 || index >= this._view.length) return;
        const id = this._view[index]!._id;
        if (this._display && !this._displayIndex.has(id)) this._openGroupsOf(id);
        const position = this._displayOf(id) ?? index;
        const top = this._layout.offsetOf(position);
        const bottom = top + this._layout.heightOf(position);
        const viewTop = this._scroller.scrollTop;
        const viewport = this._viewportHeight();
        if (top < viewTop) this._scroller.scrollTop = top;
        else if (bottom > viewTop + viewport) this._scroller.scrollTop = bottom - viewport;
        this._renderWindow();
    }

    /** Scrolls horizontally so that a column is rendered and visible. */
    private _scrollToColumn(field: string): void {
        const column = this.getColumn(field);
        if (!column || column.pinned === 'left' || column.pinned === 'right') return;
        const scrollable = this.visibleColumns.filter(c => c.pinned !== 'left' && c.pinned !== 'right');
        let x = 0;
        for (const c of scrollable) {
            if (c.field === field) break;
            x += widthOf(c);
        }
        const pinnedLeft = (this._plan?.selection ? SELECTION_WIDTH : 0) + (this._plan?.left ?? []).reduce((sum, c) => sum + widthOf(c), 0);
        const viewLeft = this._scroller.scrollLeft;
        const width = (this._scroller.clientWidth || 1200) - pinnedLeft;
        if (x < viewLeft) this._scroller.scrollLeft = x;
        else if (x + widthOf(column) > viewLeft + width) this._scroller.scrollLeft = x + widthOf(column) - width;
        this._renderWindow();
    }

    private _rowClasses(row: RowData, changed: Record<string, FieldChange>, index: number): string[] {
        const classes = ['ig-row'];
        // zebra by position in the list, not in the DOM (the DOM only holds the visible window)
        if (index % 2 === 1) classes.push('ig-row-alt');
        if (this._selected.has(row._id)) classes.push('ig-selected');
        if (this._tracker?.isInserted(row._id)) classes.push('ig-row-inserted');
        else if (Object.keys(changed).length) classes.push('ig-row-updated');
        if (typeof this.options.rowClass === 'function') classes.push(this.options.rowClass(this._publicRow(row)) ?? '');
        return classes;
    }

    private _createRow(row: RowData, index = this._displayOf(row._id) ?? 0): HTMLTableRowElement {
        const tr = h('tr', { dataset: { id: row._id }, 'aria-selected': String(this._selected.has(row._id)), 'aria-rowindex': String(index + 2) });
        const changed = this._tracker ? this._tracker.changedFields(row._id, this._readers) : {};
        tr.className = this._rowClasses(row, changed, index).join(' ').trim();
        this._applyFormats(tr, this.options.rowFormats, row);
        const plan = this._plan ?? this._columnPlan();
        tr.append(...this._planCells(plan,
            column => this._createCell(row, column, changed[column.field]),
            () => h('td', { class: 'ig-spacer-cell', 'aria-hidden': 'true' }),
            () => h('td', { class: 'ig-select-cell' }, h('input', {
                type: this.selectionMode === 'single' ? 'radio' : 'checkbox',
                tabindex: '-1',
                checked: this._selected.has(row._id),
                'aria-label': 'select'
            }))));
        return tr;
    }

    /** Re-renders one row in place when it is in view. */
    private _replaceRow(id: string): void {
        const old = this._rowEls.get(id);
        const index = this._viewIndex.get(id);
        if (!old || index === undefined) {
            // the row is not rendered, but its group subtotals may be
            if (this._display && index !== undefined) this._refreshGroupRows(id);
            return;
        }
        if (this._display && this._groupPath(this._view[index]!).at(-1) !== this._groupOf.get(id)) {
            // a group field changed: the row moves to its new group
            this._renderBody();
            return;
        }
        const tr = this._createRow(this._view[index]!, this._displayOf(id) ?? index);
        old.replaceWith(tr);
        this._rowEls.set(id, tr);
        if (this._display) this._refreshGroupRows(id);
        if (this._focus) this._paintRange();
    }

    private _isEditable(column: Column | undefined, row: RowData | null | undefined): boolean {
        if (!column) return false;
        if (typeof column.editable === 'function') return !!column.editable(this._publicRow(row), column);
        return !!column.editable;
    }

    private _createCell(row: RowData, column: Column, change?: FieldChange): HTMLTableCellElement {
        const value = row[column.field];
        const td = h('td', { dataset: { field: column.field }, role: 'gridcell' });
        const classes = ['ig-cell', `ig-align-${column.align}`, `ig-type-${column.type}`];
        const formula = this.calc.formulaFor(row._id, column.field);
        const invalid = this._invalid.get(`${row._id}\u0000${column.field}`);

        if (formula) classes.push('ig-formula');
        if (isErrorCode(value)) classes.push('ig-error');
        if (invalid) classes.push('ig-invalid');
        if (change) classes.push('ig-cell-changed');
        if (!this._isEditable(column, row)) classes.push('ig-readonly');
        if (NUMERIC_TYPES.has(column.type) && typeof value === 'number' && value < 0) classes.push('ig-negative');
        if (column.wrap) classes.push('ig-wrap');
        if (this._comments.get(row._id)?.has(column.field)) classes.push('ig-has-comment');
        if (this._active && this._active.id === row._id && this._active.field === column.field) classes.push('ig-active');
        if (typeof column.cellClass === 'function') classes.push(column.cellClass(value, this._publicRow(row), column) ?? '');
        else if (column.cellClass) classes.push(column.cellClass);
        td.className = classes.join(' ').trim();
        if (invalid) td.title = invalid;
        else if (formula) td.title = formula;
        else if (change) td.title = this.t('was', { value: change.from === null || change.from === '' ? this.t('blanks') : String(change.from) });

        const formatted = formatCell(value, column, row, this.locale);
        if (typeof column.render === 'function') {
            const output = column.render(value, this._publicRow(row), { column, grid: this, formatted });
            if (output instanceof Node) td.append(output);
            else if (column.html) td.innerHTML = output ?? '';
            else td.textContent = output ?? '';
        } else if (column.sparkline && !isErrorCode(value)) {
            td.classList.add('ig-sparkline-cell');
            td.append(sparkline(sparklineValues(value), column.sparkline === true ? {} : column.sparkline));
        } else if (column.type === 'boolean' && !isErrorCode(value) && !formula) {
            td.append(h('input', {
                type: 'checkbox', class: 'ig-cell-checkbox', tabindex: '-1',
                checked: value === true, disabled: !this._isEditable(column, row)
            }));
        } else {
            td.textContent = formatted;
        }

        this._applyFormats(td, column.conditionalFormats, row, value, column);
        return td;
    }

    private _columnStats(column: Column): ColumnStats | null {
        if (!this._stats.has(column.field)) this._stats.set(column.field, columnStats(this._view.map(r => r[column.field])));
        return this._stats.get(column.field) ?? null;
    }

    private _applyPreset(td: HTMLElement, format: PresetFormat, value: number, column: Column): void {
        const stats = this._columnStats(column);
        if (!stats) return;
        if (format.type === 'dataBar') {
            // bars start at zero unless the values go below it (like Excel's automatic minimum)
            const low = format.min ?? Math.min(0, stats.min);
            const high = format.max ?? stats.max;
            td.classList.add('ig-databar');
            if (format.showValue === false) td.classList.add('ig-databar-only');
            td.style.setProperty('--ig-bar', `${(ratio(value, low, high) * 100).toFixed(1)}%`);
            if (format.color) td.style.setProperty('--ig-bar-color', format.color);
        } else if (format.type === 'colorScale') {
            td.style.backgroundColor = scaleColor(colorScaleColors(format), ratio(value, format.min ?? stats.min, format.max ?? stats.max));
        } else {
            const { icon, tone } = iconFor(format, value, stats);
            const mark = h('i', { class: `ig-cf-icon ig-cf-icon-${tone}`, 'aria-hidden': 'true', text: icon });
            if (format.showValue === false) td.replaceChildren(mark);
            else td.prepend(mark);
        }
    }

    /**
     * Conditional formats: [{formula: '=[@total] > 1000', className, style}] or [{when(value, row), ...}]
     */
    private _applyFormats(element: HTMLElement, formats: ConditionalFormat[] | undefined, row: RowData, value?: unknown, column?: Column): void {
        for (const format of formats ?? []) {
            if (isPreset(format)) {
                if (column && typeof value === 'number' && Number.isFinite(value)) this._applyPreset(element, format, value, column);
                continue;
            }
            let hit = false;
            if (typeof format.when === 'function') hit = !!format.when(value, this._publicRow(row));
            else if (format.formula) hit = this.calc.evaluate(format.formula, this.store.get(row._id) ?? row) === true;
            if (!hit) continue;
            if (format.className) element.classList.add(...format.className.split(/\s+/).filter(Boolean));
            if (format.style) Object.assign(element.style, format.style);
        }
    }

    /**
     * Updates view rows from the store without re-sorting (like Excel, edited rows stay in place).
     * @param array|null ids null = every row
     */
    private _syncRows(ids: string[] | null): void {
        const targets = ids ? new Set(ids) : null;
        // an edit can move a column minimum or maximum: then every bar, scale and icon is redrawn
        const presets = this.visibleColumns.filter(c => c.conditionalFormats?.some(isPreset));
        const statsOf = () => JSON.stringify(presets.map(c => this._columnStats(c)));
        const before = presets.length ? statsOf() : null;
        const changed: string[] = [];
        this._view.forEach((row, i) => {
            if (targets && !targets.has(row._id)) return;
            const fresh = this.store.get(row._id);
            if (!fresh) return;
            this._view[i] = { ...fresh };
            changed.push(row._id);
        });
        this._stats.clear();
        if (before !== null && !this._editing && statsOf() !== before) {
            this._renderWindow(true);
        } else {
            for (const id of changed) {
                if (this._editing?.id !== id) this._replaceRow(id);
            }
        }
        if (!ids) this._showMessage(this._view.length ? null : this.t('noRows'));
        this._renderFooter();
        this._renderNavbar();
    }

    private _renderFooter(): void {
        clear(this._tfoot);
        if (!this.visibleColumns.some(c => c.footer)) return;
        const plan = this._plan ?? this._columnPlan();
        const tr = h('tr', { class: 'ig-footer' });
        const cell = (column: Column): HTMLTableCellElement => {
            if (!column.footer) return h('td', { dataset: { field: column.field } });
            const td = this._summaryCell(column, this._view);
            td.dataset.field = column.field;
            return td;
        };
        tr.append(...this._planCells(plan, cell, () => h('td', { class: 'ig-spacer-cell' }), () => h('td', { class: 'ig-select-cell' })));
        this._tfoot.append(tr);
    }

    /** A footer or subtotal cell: column.footer applied to the rows. */
    private _summaryCell(column: Column, rows: RowData[]): HTMLTableCellElement {
        const value = this._footerValue(column, rows);
        const shortcut = typeof column.footer === 'string' && /^count/i.test(column.footer);
        const text = shortcut ? formatCell(value, { type: 'integer', decimals: 0 }, {}, this.locale) : formatCell(value, column, {}, this.locale);
        return h('td', {
            class: `ig-cell ig-align-${column.align}${isErrorCode(value) ? ' ig-error' : ''}`,
            title: this._footerFormula(column) ?? null,
            text: column.type === 'boolean' && !isErrorCode(value) ? String(value ?? '') : text
        });
    }

    private _renderNavbar(): void {
        if (this.options.statusBar) {
            const total = this._append?.total ?? this.store.count();
            const parts = [this.t('status', { shown: this._view.length, total })];
            if (this._selected.size) parts.push(this.t('selected', { count: this._selected.size }));
            if (this._notice) parts.push(this._notice);
            this._status.textContent = parts.join(' · ');
        }

        const config = this.options.navbar;
        if (!config) return;
        const left = h('div', { class: 'ig-navbar-group' });
        const right = h('div', { class: 'ig-navbar-group ig-navbar-right' });

        if (config.title) left.append(h('strong', { class: 'ig-title', text: config.title }));
        if (config.search) {
            if (!this._searchInput) {
                let timer: ReturnType<typeof setTimeout> | undefined;
                this._searchInput = h('input', { class: 'ig-input ig-search', type: 'search', placeholder: this.t('search'), 'aria-label': this.t('search') });
                this._searchInput.addEventListener('input', () => {
                    clearTimeout(timer);
                    timer = setTimeout(() => this.setSearch(this._searchInput?.value ?? ''), 200);
                });
            }
            left.append(this._searchInput);
        }

        if (config.query && this._queryBuilder) {
            const active = isQueryActive(this._queryModel);
            left.append(h('button', {
                type: 'button',
                class: `ig-btn ig-query-btn${active ? ' ig-active' : ''}`,
                'aria-expanded': String(this._queryBuilder.isOpen),
                text: this.t('advancedFilter'),
                onclick: () => this.toggleQueryBuilder()
            }));
        }

        if (config.filters) {
            if (this._queryModel) {
                left.append(h('span', { class: 'ig-chip ig-chip-query' },
                    h('span', { text: describeQuery(this._queryModel, this._columnMap, this.t, (value, column) => formatCell(value, column as Column, {}, this.locale)) }),
                    h('button', { type: 'button', class: 'ig-chip-remove', 'aria-label': this.t('clear'), text: '×', onclick: () => this.setQuery(null) })));
            }
            for (const [field, filter] of Object.entries(this._filters)) {
                const column = this.getColumn(field);
                if (!column) continue;
                left.append(h('span', { class: 'ig-chip' },
                    h('span', { text: `${column.title}: ${this._describeFilter(filter, column)}` }),
                    h('button', { type: 'button', class: 'ig-chip-remove', 'aria-label': this.t('clear'), text: '×', onclick: () => this.setFilter(field, null) })));
            }
            if (Object.keys(this._filters).length || this._search || this._queryModel) {
                left.append(h('button', { type: 'button', class: 'ig-btn ig-btn-link', text: this.t('clearFilters'), onclick: () => this.clearFilters() }));
            }
        }

        const button = (item: NavbarItem) => h('button', {
            type: 'button',
            class: `ig-btn ${item.className ?? ''}`.trim(),
            title: item.title ?? null,
            disabled: typeof item.disabled === 'function' ? item.disabled(this) : !!item.disabled,
            text: item.label,
            onclick: (e: MouseEvent) => item.onClick(this, e)
        });

        for (const item of config.items ?? []) (item.position === 'left' ? left : right).append(button(item));

        const editable = config.add || config.delete || this.columns.some(c => c.editable);
        if (config.undo && editable) {
            right.append(
                h('button', { type: 'button', class: 'ig-btn ig-btn-icon', text: '↶', 'aria-label': this.t('undo'), title: this.t('undo') + (this._undo.undoLabel ? ` (${this._undo.undoLabel})` : ''), disabled: !this._undo.canUndo, onclick: () => this.undo() }),
                h('button', { type: 'button', class: 'ig-btn ig-btn-icon', text: '↷', 'aria-label': this.t('redo'), title: this.t('redo') + (this._undo.redoLabel ? ` (${this._undo.redoLabel})` : ''), disabled: !this._undo.canRedo, onclick: () => this.redo() }));
        }
        if (config.add) right.append(button({ label: this.t('addRow'), onClick: () => this.addRow(typeof config.add === 'function' ? config.add(this) : {}) }));
        if (config.delete && this.selectionMode !== 'none') {
            right.append(button({
                label: this.t('deleteRows'),
                className: 'ig-btn-danger',
                disabled: !this._selected.size,
                onClick: async () => {
                    const ids = this.getSelectedIds();
                    if (this.options.confirmDelete && !await this.confirm({
                        action: 'delete',
                        title: this.t('deleteTitle'),
                        message: this.t('confirmDelete', { count: ids.length }),
                        confirmLabel: this.t('deleteRows'),
                        danger: true
                    })) return;
                    this.deleteRows(ids);
                }
            }));
        }
        if (config.changes && this._tracker) {
            const summary = this.getChangeSummary();
            if (summary.total) {
                right.append(h('span', {
                    class: 'ig-changes-badge',
                    title: this.t('changesDetail', summary as unknown as Record<string, unknown>),
                    text: this.t('changesCount', { count: summary.total })
                }));
                right.append(button({
                    label: this.t('discardChanges'),
                    onClick: async () => {
                        if (this.options.confirmDelete && !await this.confirm({
                            action: 'discard',
                            title: this.t('discardChanges'),
                            message: this.t('confirmDiscard', { count: summary.total }),
                            confirmLabel: this.t('discard'),
                            danger: true
                        })) return;
                        this.rejectChanges();
                    }
                }));
            }
        }
        if (config.columns) {
            right.append(h('button', {
                type: 'button', class: 'ig-btn ig-columns-btn', text: this.t('columns'),
                onclick: (e: MouseEvent) => this._openColumnsMenu(e.currentTarget as HTMLElement)
            }));
        }
        if (config.import) {
            const options: ImportOptions = config.import === true ? {} : config.import;
            const input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', hidden: true });
            input.addEventListener('change', async () => {
                const file = input.files?.[0];
                input.value = '';
                if (file) await this._importFromNavbar(file, options);
            });
            right.append(input, button({ label: this.t('importFile'), onClick: () => input.click() }));
        }
        const exports = config.export === true ? ['csv', 'xlsx'] : config.export || [];
        if (exports.includes('csv')) right.append(button({ label: this.t('exportCsv'), onClick: () => this.exportCSV() }));
        if (exports.includes('xlsx')) right.append(button({ label: this.t('exportXlsx'), onClick: () => this.exportXLSX() }));

        // keep the search input (and its focus/caret) alive between renders
        const search = this._searchInput;
        const caret = search && document.activeElement === search ? search.selectionStart : null;
        this._navbar.replaceChildren(left, right);
        if (search && caret !== null) {
            search.focus();
            search.setSelectionRange(caret, caret);
        }
    }

    private _describeFilter(filter: Filter, column: Column): string {
        const parts = [];
        if (Array.isArray(filter.values)) parts.push(filter.values.length === 1 ? (formatCell(filter.values[0], column, {}, this.locale) || this.t('blanks')) : `${filter.values.length} ✓`);
        for (const condition of filter.conditions ?? []) {
            const value = condition.op === 'empty' || condition.op === 'notEmpty' ? '' : ` ${condition.value}${condition.op === 'between' ? `–${condition.value2}` : ''}`;
            parts.push(`${this.t(`op_${condition.op}`)}${value}`);
        }
        if (filter.formula) parts.push(filter.formula);
        if (filter.test) parts.push('ƒ');
        return parts.join(filter.join === 'or' ? ` ${this.t('or')} ` : ', ');
    }

    private _openColumnsMenu(anchor: HTMLElement): void {
        this.closePopover();
        const menu = h('div', { class: 'ig-popover ig-columns-menu' },
            this.columns.map(column => h('label', { class: 'ig-value' },
                h('input', { type: 'checkbox', checked: column.visible, onchange: (e: Event) => this.setColumnVisible(column.field, (e.target as HTMLInputElement).checked) }),
                h('span', { text: column.title }))));
        this.showPopover(menu, anchor);
    }

    /** @internal */
    showPopover(element: HTMLElement, anchor: HTMLElement): void {
        this._popover = element;
        this.root.append(element);
        const rootBox = this.root.getBoundingClientRect();
        const box = anchor.getBoundingClientRect();
        const left = Math.min(box.left - rootBox.left, Math.max(0, rootBox.width - element.offsetWidth - 4));
        element.style.left = `${Math.max(0, left)}px`;
        element.style.top = `${box.bottom - rootBox.top + 4}px`;
        element.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                this.closePopover();
                anchor.focus();
            }
        });
        element.querySelector<HTMLElement>('input, select, button')?.focus();
    }

    /** @internal */
    closePopover(): void {
        this._popover?.remove();
        this._popover = null;
    }

    private _showMessage(text: string | null): void {
        this._message.hidden = !text;
        this._message.textContent = text ?? '';
    }

    private _setLoading(loading: boolean): void {
        this._loading.hidden = !loading;
        this.root.classList.toggle('ig-is-loading', loading);
        if (loading) this._showMessage(null);
    }

    /* ---------------------------------------------------------------- active cell & keyboard */

    private _cellElement(id: string, field: string): HTMLTableCellElement | null {
        return this._rowEls.get(id)?.querySelector(`td[data-field="${CSS.escape(field)}"]`) ?? null;
    }

    /**
     * Makes a cell active (collapsing the range) or, with extend, moves the other corner of the range.
     */
    private _selectCell(id: string, field: string, extend: boolean): void {
        if (!extend || !this._active) {
            this._setActive(id, field);
            return;
        }
        this._focus = { id, field };
        const index = this._viewIndex.get(id);
        if (index !== undefined) this.scrollToRow(index);
        if (!this._cellElement(id, field)) this._scrollToColumn(field);
        this._paintRange();
        this.emit('rangeChange', this.getRange());
    }

    private _setActive(id: string, field: string): void {
        this._tbody.querySelector('.ig-active')?.classList.remove('ig-active');
        const changed = !!this._focus;
        this._focus = null;
        this._active = { id, field };
        const index = this._viewIndex.get(id);
        if (index !== undefined) this.scrollToRow(index);
        if (!this._cellElement(id, field)) this._scrollToColumn(field);
        this._cellElement(id, field)?.classList.add('ig-active');
        this._paintRange();
        this.emit('activeCellChange', { id, field });
        if (changed) this.emit('rangeChange', this.getRange());
    }

    /* ---------------------------------------------------------------- comments */

    getComment(id: string, field: string): string | null {
        return this._comments.get(id)?.get(field) ?? null;
    }

    /** Comments of the rows that exist, in no particular order. */
    getComments(): CellComment[] {
        const comments: CellComment[] = [];
        for (const [id, fields] of this._comments) {
            if (!this.store.has(id)) continue;
            for (const [field, text] of fields) comments.push({ id, field, text });
        }
        return comments;
    }

    /** Sets (or with null / '' removes) the comment of a cell; undoable. */
    setComment(id: string, field: string, text: string | null): boolean {
        if (!this.store.has(id) || !this.getColumn(field)) return false;
        const before = this.getComment(id, field);
        const after = text ? text : null;
        if (before === after) return false;
        this.batch(() => {
            this._writeComment(id, field, after);
            if (!this._replaying) this._undo.record({ kind: 'comment', id, field, before, after });
        }, 'comment');
        this._replaceRow(id);
        this._renderNavbar();
        this.emit('commentChange', { id, field, text: after, oldText: before });
        return true;
    }

    private _writeComment(id: string, field: string, text: string | null): void {
        const fields = this._comments.get(id);
        if (text) {
            if (fields) fields.set(field, text);
            else this._comments.set(id, new Map([[field, text]]));
        } else if (fields) {
            fields.delete(field);
            if (!fields.size) this._comments.delete(id);
        }
    }

    /** Opens the comment editor of a cell (Shift+F2). Ctrl+Enter saves, Esc cancels. */
    editComment(id: string, field: string): void {
        const td = this._cellElement(id, field);
        if (!td) return;
        this._hideCommentTip();
        const textarea = h('textarea', { class: 'ig-input ig-comment-input', rows: 4, 'aria-label': this.t('comment') });
        textarea.value = this.getComment(id, field) ?? '';
        const save = () => {
            this.setComment(id, field, textarea.value.trim() || null);
            this.closePopover();
            this.focus();
        };
        const menu = h('div', { class: 'ig-popover ig-comment-editor', role: 'dialog', 'aria-label': this.t('comment') },
            textarea,
            h('div', { class: 'ig-comment-actions' },
                h('button', { type: 'button', class: 'ig-btn', text: this.t('deleteComment'), onclick: () => { textarea.value = ''; save(); } }),
                h('button', { type: 'button', class: 'ig-btn', text: this.t('cancel'), onclick: () => { this.closePopover(); this.focus(); } }),
                h('button', { type: 'button', class: 'ig-btn ig-btn-primary', text: this.t('saveComment'), onclick: save })));
        textarea.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                this.closePopover();
                this.focus();
            }
        });
        this.showPopover(menu, td);
        textarea.focus();
    }

    private _showCommentTip(td: HTMLTableCellElement): void {
        const id = td.closest('tr')?.dataset.id;
        const text = id ? this.getComment(id, td.dataset.field!) : null;
        if (!text || this._popover) return;
        this._commentTip ??= h('div', { class: 'ig-comment-tip', role: 'tooltip' });
        this._commentTip.textContent = text;
        this.root.append(this._commentTip);
        const rootBox = this.root.getBoundingClientRect();
        const box = td.getBoundingClientRect();
        this._commentTip.style.left = `${Math.max(0, Math.min(box.right - rootBox.left + 4, rootBox.width - 220))}px`;
        this._commentTip.style.top = `${box.top - rootBox.top}px`;
    }

    private _hideCommentTip(): void {
        this._commentTip?.remove();
    }

    /* ---------------------------------------------------------------- duplicates */

    /**
     * Rows that repeat an earlier row in the given columns (the first of each set is not included).
     * @return ids, in view order
     */
    findDuplicates({ fields, matchCase = false, scope = 'filtered' }: DuplicateOptions = {}): string[] {
        const columns = fields ?? this.visibleColumns.filter(c => !c.formula).map(c => c.field);
        const rows = scope === 'all' ? this.store.ids().map(id => this.store.get(id)!) : this._view;
        const seen = new Set<string>();
        const duplicates: string[] = [];
        for (const row of rows) {
            const key = JSON.stringify(columns.map(field => {
                const value = this._publicValue(row[field]);
                return typeof value === 'string' && !matchCase ? value.trim().toLocaleLowerCase(this.locale) : value;
            }));
            if (seen.has(key)) duplicates.push(row._id);
            else seen.add(key);
        }
        return duplicates;
    }

    /**
     * Deletes the duplicate rows (see findDuplicates), as one undo step. No confirmation is asked.
     * @return removed ids
     */
    removeDuplicates(options: DuplicateOptions = {}): string[] {
        const ids = this.findDuplicates(options);
        return ids.length ? this.deleteRows(ids) : [];
    }

    /* ---------------------------------------------------------------- import */

    /**
     * Imports a .csv, .tsv, .txt or .xlsx file (for example from an <input type="file">).
     * Headers are matched to columns by field or title, ignoring case; values are read like typed text.
     */
    async importFile(file: Blob & { name?: string }, options: ImportOptions = {}): Promise<ImportResult> {
        const bytes = new Uint8Array(await readBlob(file));
        // .xlsx files are zip files: they start with "PK"
        const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
        if (zip || /\.xlsx$/i.test(file.name ?? '')) return this.importXLSX(bytes, options);
        const text = new TextDecoder().decode(bytes);
        return this.importCSV(text, { delimiter: /\.tsv$/i.test(file.name ?? '') ? '\t' : undefined, ...options });
    }

    private async _importFromNavbar(file: File, options: ImportOptions): Promise<void> {
        const summary = this.getChangeSummary();
        if ((options.mode ?? 'replace') === 'replace' && this.hasChanges() && !await this.confirm({
            action: 'import',
            title: this.t('importFile'),
            message: this.t('confirmImport', { count: summary.total }),
            confirmLabel: this.t('importFile'),
            danger: true
        })) return;
        try {
            const result = await this.importFile(file, options);
            this._showNotice(result.errors.length
                ? this.t('importErrors', { count: result.rows, errors: result.errors.length })
                : this.t('importDone', { count: result.rows }));
        } catch (error) {
            this._showNotice(error instanceof Error ? error.message : String(error));
            this.emit('importError', { error });
        }
    }

    private _showNotice(text: string): void {
        this._notice = text;
        clearTimeout(this._noticeTimer);
        this._noticeTimer = setTimeout(() => {
            this._notice = null;
            this._renderNavbar();
        }, 6000);
        this._renderNavbar();
    }

    /** Imports CSV / TSV text. */
    importCSV(text: string, options: ImportOptions = {}): ImportResult {
        return this.importTable(parseDelimited(text, options.delimiter), options);
    }

    /** Imports the first sheet (or options.sheet) of an .xlsx file. */
    async importXLSX(data: Uint8Array | ArrayBuffer, options: ImportOptions = {}): Promise<ImportResult> {
        const sheet = await readXlsx(data, { sheet: options.sheet });
        return { ...this.importTable(sheet.rows, options), sheet: sheet.name };
    }

    /**
     * Imports rows of cells (the first one being the header unless header: false).
     * Text is parsed like typed input (numbers, dates, options in the grid locale); other values are kept.
     */
    importTable(table: unknown[][], { mode = 'replace', header = true, createColumns }: ImportOptions = {}): ImportResult {
        const lines = table.filter(line => line.some(cell => cell !== null && cell !== undefined && cell !== ''));
        const headerLine = header ? (lines.shift() ?? []).map(cell => String(cell ?? '').trim()) : null;
        const create = createColumns ?? this.columns.length === 0;
        const lookup = new Map<string, Column>();
        for (const column of this.columns) {
            lookup.set(column.field.toLocaleLowerCase(this.locale), column);
            lookup.set(column.title.toLocaleLowerCase(this.locale), column);
        }

        const skipped: string[] = [];
        const created: ColumnDefinition[] = [];
        // what each position of a line goes to: a column, a new field, or nothing
        const targets: Array<{ field: string; column: Column | null } | null> = headerLine
            ? headerLine.map((title, i) => {
                const column = title ? lookup.get(title.toLocaleLowerCase(this.locale)) : undefined;
                if (column) return column.formula ? null : { field: column.field, column };
                if (!title || !create) {
                    if (title) skipped.push(title);
                    return null;
                }
                const field = created.some(c => c.field === title) ? `${title} ${i + 1}` : title;
                created.push({ field, title, type: inferType(lines.map(line => line[i])) });
                return { field, column: null };
            })
            : this.columns.filter(c => !c.formula).map(column => ({ field: column.field, column }));

        if (created.length) {
            this._setColumns([...this.columns.map(({ ...column }) => column as ColumnDefinition), ...created]);
            this._renderHeader();
            for (const target of targets) if (target && !target.column) target.column = this.getColumn(target.field)!;
        }

        const errors: ImportResult['errors'] = [];
        const rows = lines.map((line, n) => {
            const row: Record<string, unknown> = {};
            targets.forEach((target, i) => {
                if (!target?.column) return;
                const raw = line[i];
                if (raw === null || raw === undefined || raw === '') return;
                if (typeof raw !== 'string') {
                    row[target.field] = raw;
                    return;
                }
                const parsed = parseInput(raw, target.column, this.locale);
                if (parsed.error) errors.push({ line: n + (header ? 2 : 1), field: target.field, value: raw, error: this.t(parsed.error) });
                else row[target.field] = parsed.value;
            });
            return row;
        });

        if (mode === 'append') this.addRows(rows);
        else this.setData(rows);
        const result: ImportResult = { rows: rows.length, fields: targets.filter(t => t !== null).map(t => t.field), skipped, errors };
        this.emit('import', { ...result });
        return result;
    }

    /* ---------------------------------------------------------------- grouping */

    /**
     * Groups the rows by one or more fields (outermost first), with a group row showing the value,
     * the row count and subtotals (column `subtotal`, or its `footer`). Pass [] or null to ungroup.
     */
    setGroupBy(fields: string[] | null): void {
        this._groupBy = (fields ?? []).filter(field => this.getColumn(field));
        this._collapsed.clear();
        this._knownGroups.clear();
        this._scroller.scrollTop = 0;
        // re-run the query: ungrouping brings back the sort order chosen by the user
        this.refresh();
        this.emit('groupChange', { groupBy: [...this._groupBy] });
    }

    getGroupBy(): string[] {
        return [...this._groupBy];
    }

    /** Groups in display order, including the ones inside collapsed groups. */
    getGroups(): GroupInfo[] {
        const groups: GroupInfo[] = [];
        this._eachGroup((group) => {
            groups.push({ key: group.key, level: group.level, field: group.field, value: this._publicValue(group.value), count: group.end - group.start, collapsed: this._collapsed.has(group.key) });
        });
        return groups;
    }

    /** Opens or closes a group (by key, see getGroups()); without `open` it toggles. */
    toggleGroup(key: string, open?: boolean): void {
        const collapse = open === undefined ? !this._collapsed.has(key) : !open;
        if (collapse === this._collapsed.has(key)) return;
        if (collapse) this._collapsed.add(key);
        else this._collapsed.delete(key);
        // the active cell cannot stay in a hidden row
        if (collapse && this._active && this._groupOf.get(this._active.id)?.startsWith(key)) {
            this._active = null;
            this._focus = null;
        }
        this._renderBody();
        this.emit('groupToggle', { key, collapsed: collapse });
    }

    expandGroups(): void {
        this._collapsed.clear();
        this._collapseNew = false;
        this._renderBody();
    }

    collapseGroups(): void {
        this._eachGroup(group => { this._collapsed.add(group.key); });
        this._collapseNew = true;
        this._active = null;
        this._focus = null;
        this._renderBody();
    }

    private _publicValue(value: unknown): unknown {
        return value === '' || value === undefined ? null : value;
    }

    private _groupPart(field: string, value: unknown): string {
        const v = this._publicValue(value);
        return `${field}=${v === null ? '' : `${typeof v}:${String(v)}`}`;
    }

    /** Keys of the groups a row belongs to, outermost first. */
    private _groupPath(row: RowData): string[] {
        const keys: string[] = [];
        let key = '';
        for (const field of this._groupBy) {
            key = key ? `${key}\u0002${this._groupPart(field, row[field])}` : this._groupPart(field, row[field]);
            keys.push(key);
        }
        return keys;
    }

    private _sortGroups(): void {
        const fields = this._groupBy.map(field => ({ field, dir: this._sort.find(s => s.field === field)?.dir ?? 'asc' }));
        // stable: the sort chosen by the user still orders the rows inside each group
        this._view.sort((a, b) => {
            for (const { field, dir } of fields) {
                const result = compareCells(a[field], b[field], { dir, locale: this.locale });
                if (result) return result;
            }
            return 0;
        });
    }

    /** Calls fn for every group in display order, with whether it is hidden inside a collapsed group. */
    private _eachGroup(fn: (group: GroupItem, hidden: boolean) => void, onRows?: (start: number, end: number) => void): void {
        const fields = this._groupBy;
        if (!fields.length) return;
        const walk = (start: number, end: number, level: number, parent: string, hidden: boolean) => {
            if (level === fields.length) {
                if (!hidden) onRows?.(start, end);
                return;
            }
            const field = fields[level]!;
            let i = start;
            while (i < end) {
                const part = this._groupPart(field, this._view[i]![field]);
                let j = i + 1;
                while (j < end && this._groupPart(field, this._view[j]![field]) === part) j++;
                const key = parent ? `${parent}\u0002${part}` : part;
                const group: GroupItem = { key, level, field, value: this._view[i]![field], start: i, end: j };
                fn(group, hidden);
                walk(i, j, level + 1, key, hidden || this._collapsed.has(key));
                i = j;
            }
        };
        walk(0, this._view.length, 0, '', false);
    }

    private _buildDisplay(): void {
        this._displayIndex.clear();
        this._groupOf.clear();
        if (!this._groupBy.length) {
            this._display = null;
            return;
        }
        const display: DisplayItem[] = [];
        this._eachGroup((group, hidden) => {
            // groups seen for the first time start collapsed after collapseGroups() or groupsCollapsed
            if (!this._knownGroups.has(group.key)) {
                this._knownGroups.add(group.key);
                if (this._collapseNew) this._collapsed.add(group.key);
            }
            if (group.level === this._groupBy.length - 1) {
                for (let i = group.start; i < group.end; i++) this._groupOf.set(this._view[i]!._id, group.key);
            }
            if (!hidden) display.push(group);
        }, (start, end) => {
            for (let i = start; i < end; i++) {
                this._displayIndex.set(this._view[i]!._id, display.length);
                display.push(i);
            }
        });
        this._display = display;
    }

    /** Position of a row in the rendered list; undefined when it is hidden in a collapsed group. */
    private _displayOf(id: string): number | undefined {
        return this._display ? this._displayIndex.get(id) : this._viewIndex.get(id);
    }

    /** The nearest view index at or after (direction 1) or before (-1) that is not hidden. */
    private _visibleRow(index: number, direction: 1 | -1): number {
        if (!this._display) return index;
        for (let i = index; i >= 0 && i < this._view.length; i += direction) {
            if (this._displayIndex.has(this._view[i]!._id)) return i;
        }
        for (let i = index - direction; i >= 0 && i < this._view.length; i -= direction) {
            if (this._displayIndex.has(this._view[i]!._id)) return i;
        }
        return index;
    }

    private _openGroupsOf(id: string): void {
        const key = this._groupOf.get(id);
        if (!key) return;
        let changed = false;
        for (const collapsed of [...this._collapsed]) {
            if (key === collapsed || key.startsWith(`${collapsed}\u0002`)) {
                this._collapsed.delete(collapsed);
                changed = true;
            }
        }
        if (changed) this._renderBody();
    }

    /** Re-renders the visible group rows that contain a row (their subtotals changed). */
    private _refreshGroupRows(id: string): void {
        const key = this._groupOf.get(id);
        if (!key || !this._display) return;
        for (const [groupKey, tr] of this._groupEls) {
            if (key !== groupKey && !key.startsWith(`${groupKey}\u0002`)) continue;
            const position = Number(tr.dataset.position);
            const item = this._display[position];
            if (typeof item !== 'object' || item.key !== groupKey) continue;
            const fresh = this._createGroupRow(item, position);
            tr.replaceWith(fresh);
            this._groupEls.set(groupKey, fresh);
        }
    }

    private _createGroupRow(group: GroupItem, position: number): HTMLTableRowElement {
        const collapsed = this._collapsed.has(group.key);
        const column = this.getColumn(group.field)!;
        const count = group.end - group.start;
        const tr = h('tr', {
            class: `ig-group-row ig-group-level-${group.level}${collapsed ? ' ig-group-collapsed' : ''}`,
            dataset: { group: group.key, position: String(position) },
            'aria-expanded': String(!collapsed),
            'aria-level': String(group.level + 1),
            'aria-rowindex': String(position + 2)
        });
        const plan = this._plan ?? this._columnPlan();
        const first = [...plan.left, ...plan.center, ...plan.right][0];
        const rows = this._view.slice(group.start, group.end);
        const value = group.value;
        const text = value === '' || value === null || value === undefined ? this.t('blankGroup') : formatCell(value, column, this._publicRow(this._view[group.start]!) ?? {}, this.locale);
        tr.append(...this._planCells(plan,
            c => {
                if (c === first) {
                    return h('td', { class: 'ig-cell ig-group-label', style: { paddingLeft: `${8 + group.level * 18}px` } },
                        h('button', {
                            type: 'button', class: 'ig-group-toggle', tabindex: '-1',
                            'aria-label': this.t(collapsed ? 'expandGroup' : 'collapseGroup'),
                            text: collapsed ? '▸' : '▾'
                        }),
                        h('span', { class: 'ig-group-title', text: `${column.title}: ${text}` }),
                        h('span', { class: 'ig-group-count', text: ` (${formatCell(count, { type: 'integer', decimals: 0 }, {}, this.locale)})` }));
                }
                const subtotal = c.subtotal === undefined ? c.footer : c.subtotal;
                if (!subtotal) return h('td', { class: 'ig-cell' });
                return this._summaryCell({ ...c, footer: subtotal }, rows);
            },
            () => h('td', { class: 'ig-spacer-cell' }),
            () => h('td', { class: 'ig-select-cell' })));
        return tr;
    }

    /* ---------------------------------------------------------------- ranges */

    /** Row and column positions of the selected range, or null. */
    private _rangeBounds(): { r1: number; r2: number; c1: number; c2: number } | null {
        if (!this._active) return null;
        const columns = this.visibleColumns.map(c => c.field);
        const focus = this._focus ?? this._active;
        const ra = this._viewIndex.get(this._active.id);
        const rb = this._viewIndex.get(focus.id);
        const ca = columns.indexOf(this._active.field);
        const cb = columns.indexOf(focus.field);
        if (ra === undefined || rb === undefined || ca === -1 || cb === -1) return null;
        return { r1: Math.min(ra, rb), r2: Math.max(ra, rb), c1: Math.min(ca, cb), c2: Math.max(ca, cb) };
    }

    /**
     * The selected range: from the active cell to the other corner.
     * @return {from, to, rows (ids, in display order), fields} or null
     */
    getRange(): { from: { id: string; field: string }; to: { id: string; field: string }; rows: string[]; fields: string[] } | null {
        const bounds = this._rangeBounds();
        if (!bounds || !this._active) return null;
        const fields = this.visibleColumns.slice(bounds.c1, bounds.c2 + 1).map(c => c.field);
        const rows = this._view.slice(bounds.r1, bounds.r2 + 1).map(r => r._id);
        return { from: { ...this._active }, to: { ...(this._focus ?? this._active) }, rows, fields };
    }

    /** Selects the cells between two corners; `from` becomes the active cell. */
    setRange(from: { id: string; field: string }, to: { id: string; field: string } = from): void {
        this._setActive(from.id, from.field);
        if (to.id !== from.id || to.field !== from.field) this._selectCell(to.id, to.field, true);
    }

    /** Values of the selected range as rows of stored values. */
    getRangeValues(): unknown[][] {
        const range = this.getRange();
        if (!range) return [];
        return range.rows.map(id => {
            const row = this.getRow(id)!;
            return range.fields.map(field => row[field]);
        });
    }

    /** Clears every editable cell of the range, as one undo step. @return cleared cells */
    clearRange(): number {
        const range = this.getRange();
        if (!range) return 0;
        let cleared = 0;
        this.batch(() => {
            for (const id of range.rows) {
                for (const field of range.fields) {
                    const column = this.getColumn(field);
                    const data = this.store.get(id);
                    if (!this._isEditable(column, data) || data?.[field] === '' || data?.[field] === undefined) continue;
                    if (this.setCellValue(id, field, null, { source: 'edit' }).ok) cleared++;
                }
            }
        }, 'clear');
        return cleared;
    }

    /** Marks the cells of the range in the rendered rows (and the fill handle on its corner). */
    private _paintRange(): void {
        const bounds = this._rangeBounds();
        const multiple = !!bounds && (bounds.r1 !== bounds.r2 || bounds.c1 !== bounds.c2);
        const columns = new Map(this.visibleColumns.map((c, i) => [c.field, i]));
        for (const [id, tr] of this._rowEls) {
            const r = this._viewIndex.get(id) ?? -1;
            for (const td of tr.querySelectorAll<HTMLTableCellElement>('td[data-field]')) {
                const c = columns.get(td.dataset.field!) ?? -1;
                const inside = multiple && r >= bounds!.r1 && r <= bounds!.r2 && c >= bounds!.c1 && c <= bounds!.c2;
                td.classList.toggle('ig-in-range', inside);
                td.classList.toggle('ig-range-top', inside && r === bounds!.r1);
                td.classList.toggle('ig-range-bottom', inside && r === bounds!.r2);
                td.classList.toggle('ig-range-left', inside && c === bounds!.c1);
                td.classList.toggle('ig-range-right', inside && c === bounds!.c2);
                td.classList.toggle('ig-find-match', this._highlighted.has(`${id}\u0000${td.dataset.field}`));
                const corner = !!bounds && r === bounds.r2 && c === bounds.c2;
                const handle = td.querySelector('.ig-fill-handle');
                if (corner && !handle && this._fillEnabled()) td.append(h('span', { class: 'ig-fill-handle', 'aria-hidden': 'true' }));
                else if (!corner && handle) handle.remove();
            }
        }
    }

    /** Whether the fill handle is shown (something editable). */
    private _fillEnabled(): boolean {
        return this.columns.some(c => c.editable);
    }

    /** Range or fill drag: follows the pointer and scrolls when it nears an edge of the grid. */
    private _startDrag(e: PointerEvent, fill: boolean): void {
        this._dragging = true;
        this._filling = fill ? { direction: 'down', count: 0 } : null;
        this._pointer = { x: e.clientX, y: e.clientY };
        this.root.classList.add('ig-dragging');
        const move = (event: PointerEvent) => {
            this._pointer = { x: event.clientX, y: event.clientY };
            if (!this._autoScroll) this._autoScroll = requestAnimationFrame(() => this._dragScroll());
        };
        const stop = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            cancelAnimationFrame(this._autoScroll);
            this._autoScroll = 0;
            this._dragging = false;
            this.root.classList.remove('ig-dragging');
            const filling = this._filling;
            this._filling = null;
            this._paintFill(null);
            if (filling?.count) this.fill(filling.direction, filling.count);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
    }

    private _dragScroll(): void {
        this._autoScroll = 0;
        if (!this._dragging || !this._pointer) return;
        const box = this._scroller.getBoundingClientRect();
        const edge = 24;
        const { x, y } = this._pointer;
        const dy = y < box.top + edge ? y - box.top - edge : y > box.bottom - edge ? y - box.bottom + edge : 0;
        const dx = x < box.left + edge ? x - box.left - edge : x > box.right - edge ? x - box.right + edge : 0;
        if (!dx && !dy) return;
        this._scroller.scrollTop += dy;
        this._scroller.scrollLeft += dx;
        // the cell under the pointer changes while scrolling even when the pointer does not move
        const td = document.elementFromPoint?.(Math.max(box.left + 1, Math.min(box.right - 1, x)), Math.max(box.top + 1, Math.min(box.bottom - 1, y)))?.closest<HTMLTableCellElement>('td[data-field]');
        if (td && this._tbody.contains(td)) this._dragOver(td);
        this._autoScroll = requestAnimationFrame(() => this._dragScroll());
    }

    private _dragOver(td: HTMLTableCellElement): void {
        const id = td.closest('tr')?.dataset.id;
        if (!id) return;
        if (!this._filling) {
            this._selectCell(id, td.dataset.field!, true);
            return;
        }
        const bounds = this._rangeBounds();
        const r = this._viewIndex.get(id);
        const c = this.visibleColumns.findIndex(column => column.field === td.dataset.field);
        if (!bounds || r === undefined || c === -1) return;
        // the fill goes in one direction: the one the pointer is furthest out of the block
        const down = r - bounds.r2;
        const up = bounds.r1 - r;
        const right = c - bounds.c2;
        const left = bounds.c1 - c;
        const best = Math.max(down, up, right, left);
        let next: { direction: FillDirection; count: number } = { direction: 'down', count: 0 };
        if (best > 0) {
            if (down === best) next = { direction: 'down', count: down };
            else if (up === best) next = { direction: 'up', count: up };
            else if (right === best) next = { direction: 'right', count: right };
            else next = { direction: 'left', count: left };
        }
        this._filling = next;
        this._paintFill(next);
    }

    /** Cells a fill would write to, as view bounds. */
    private _fillBounds(direction: FillDirection, count: number): { r1: number; r2: number; c1: number; c2: number } | null {
        const b = this._rangeBounds();
        if (!b || count <= 0) return null;
        const lastRow = this._view.length - 1;
        const lastColumn = this.visibleColumns.length - 1;
        switch (direction) {
            case 'down': return b.r2 >= lastRow ? null : { ...b, r1: b.r2 + 1, r2: Math.min(lastRow, b.r2 + count) };
            case 'up': return b.r1 <= 0 ? null : { ...b, r1: Math.max(0, b.r1 - count), r2: b.r1 - 1 };
            case 'right': return b.c2 >= lastColumn ? null : { ...b, c1: b.c2 + 1, c2: Math.min(lastColumn, b.c2 + count) };
            default: return b.c1 <= 0 ? null : { ...b, c1: Math.max(0, b.c1 - count), c2: b.c1 - 1 };
        }
    }

    private _paintFill(fill: { direction: FillDirection; count: number } | null): void {
        const target = fill ? this._fillBounds(fill.direction, fill.count) : null;
        const columns = new Map(this.visibleColumns.map((c, i) => [c.field, i]));
        for (const [id, tr] of this._rowEls) {
            const r = this._viewIndex.get(id) ?? -1;
            for (const td of tr.querySelectorAll<HTMLTableCellElement>('td[data-field]')) {
                const c = columns.get(td.dataset.field!) ?? -1;
                td.classList.toggle('ig-fill-target', !!target && r >= target.r1 && r <= target.r2 && c >= target.c1 && c <= target.c2);
            }
        }
    }

    /**
     * Copies the first row of the range into the rest of it (down, Ctrl+D) or the first column (right, Ctrl+R).
     * @return cells written
     */
    fillCopy(direction: 'down' | 'right' = 'down'): number {
        const b = this._rangeBounds();
        if (!b) return 0;
        const rows = this._view;
        const columns = this.visibleColumns;
        let written = 0;
        this.batch(() => {
            for (let r = b.r1; r <= b.r2; r++) {
                for (let c = b.c1; c <= b.c2; c++) {
                    if (direction === 'down' ? r === b.r1 : c === b.c1) continue;
                    const source = this.getRow(rows[direction === 'down' ? b.r1 : r]!._id)!;
                    const field = columns[c]!.field;
                    const value = source[direction === 'down' ? field : columns[b.c1]!.field];
                    if (this._fillCell(rows[r]!._id, field, value)) written++;
                }
            }
        }, 'fill');
        return written;
    }

    /**
     * Extends the selected range like Excel's fill handle: numbers and dates continue their step,
     * "Item 1" becomes "Item 2", anything else repeats. One undo step; the range grows over the filled cells.
     * @param direction where to fill
     * @param count rows (up / down) or columns (left / right) to fill
     * @return cells written
     */
    fill(direction: FillDirection, count: number): number {
        const b = this._rangeBounds();
        const target = this._fillBounds(direction, count);
        if (!b || !target || !this._active) return 0;
        const rows = this._view;
        const columns = this.visibleColumns;
        const vertical = direction === 'down' || direction === 'up';
        const forward = direction === 'down' || direction === 'right';
        let written = 0;
        this.batch(() => {
            // one series per column (vertical) or per row (horizontal)
            const lines = vertical ? [b.c1, b.c2] : [b.r1, b.r2];
            for (let line = lines[0]!; line <= lines[1]!; line++) {
                const cells: Array<[number, number]> = [];
                if (vertical) for (let r = b.r1; r <= b.r2; r++) cells.push([r, line]);
                else for (let c = b.c1; c <= b.c2; c++) cells.push([line, c]);
                const source = cells.map(([r, c]) => this.getRow(rows[r]!._id)![columns[c]!.field]);
                const size = vertical ? target.r2 - target.r1 + 1 : target.c2 - target.c1 + 1;
                const type = vertical ? columns[line]!.type : 'text';
                const values = forward ? fillSeries(source, size, type) : fillSeriesBackward(source, size, type);
                for (let i = 0; i < size; i++) {
                    const r = vertical ? target.r1 + i : line;
                    const c = vertical ? line : target.c1 + i;
                    if (this._fillCell(rows[r]!._id, columns[c]!.field, values[i])) written++;
                }
            }
        }, 'fill');
        // the range now covers the source and the filled cells, the active cell stays
        const corner = forward
            ? { id: rows[vertical ? target.r2 : b.r2]!._id, field: columns[vertical ? b.c2 : target.c2]!.field }
            : { id: rows[vertical ? target.r1 : b.r1]!._id, field: columns[vertical ? b.c1 : target.c1]!.field };
        const anchor = forward
            ? { id: rows[b.r1]!._id, field: columns[b.c1]!.field }
            : { id: rows[b.r2]!._id, field: columns[b.c2]!.field };
        this.setRange(anchor, corner);
        this.emit('fill', { direction, count, written, range: this.getRange() });
        return written;
    }

    /** Writes one filled value when the cell is editable and the value fits the column type. */
    private _fillCell(id: string, field: string, value: unknown): boolean {
        const column = this.getColumn(field);
        const data = this.store.get(id);
        if (!this._isEditable(column, data)) return false;
        // a value that does not fit the column (text into a number column) is written as typed text
        if (typeof value !== 'string' && value !== null && value !== undefined && column && column.type === 'text') value = String(value);
        return this.setCellValue(id, field, value ?? null, { source: 'fill' }).ok;
    }

    /* ---------------------------------------------------------------- find / replace / go to */

    /** The active cell, or null. */
    getActiveCell(): CellRef | null {
        return this._active ? { ...this._active } : null;
    }

    /** Moves keyboard focus to the grid. */
    focus(): void {
        this._scroller.focus({ preventScroll: true });
    }

    /** Opens the find / replace / go to bar (Ctrl+F, Ctrl+H, Ctrl+G). */
    openFind(mode: FindMode = 'find'): void {
        this._findBar?.open(mode);
    }

    closeFind(): void {
        this._findBar?.close();
    }

    /** Position of a cell in reading order (row by row), for comparing cells; -1 when not in the view. */
    indexOfCell(cell: CellRef | null): number {
        if (!cell) return -1;
        const r = this._viewIndex.get(cell.id);
        const c = this.visibleColumns.findIndex(column => column.field === cell.field);
        return r === undefined || c === -1 ? -1 : r * this.visibleColumns.length + c;
    }

    private _matcher(text: string, { matchCase = false, wholeCell = false }: FindOptions): (value: string) => boolean {
        const needle = matchCase ? text : text.toLocaleLowerCase(this.locale);
        return value => {
            const hay = matchCase ? value : value.toLocaleLowerCase(this.locale);
            return wholeCell ? hay === needle : hay.includes(needle);
        };
    }

    /**
     * Cells whose displayed text contains the text, in reading order over the filtered and sorted view.
     * @return matching cells
     */
    find(text: string, options: FindOptions = {}): CellRef[] {
        if (!text) return [];
        const matches = this._matcher(text, options);
        const columns = this.visibleColumns.filter(c => !options.fields || options.fields.includes(c.field));
        const result: CellRef[] = [];
        for (const data of this._view) {
            const row = this._publicRow(data)!;
            for (const column of columns) {
                if (matches(formatCell(row[column.field], column, row, this.locale))) result.push({ id: data._id, field: column.field });
            }
        }
        return result;
    }

    /**
     * Replaces the text in the editable matching cells (in what you would type in the cell),
     * as one undo step.
     * @return cells changed
     */
    replace(text: string, replacement: string, options: ReplaceOptions = {}): number {
        if (!text) return 0;
        const cells = options.cells ?? this.find(text, options);
        const pattern = new RegExp(escapeRegex(text), options.matchCase ? 'g' : 'gi');
        let replaced = 0;
        this.batch(() => {
            for (const { id, field } of cells) {
                const column = this.getColumn(field);
                const data = this.store.get(id);
                if (!column || !this._isEditable(column, data)) continue;
                const current = editorText(this._publicRow(data)![field], column, this.locale);
                const next = options.wholeCell
                    ? (this._matcher(text, options)(current) ? replacement : current)
                    : current.replace(pattern, () => replacement);
                if (next !== current && this.setCellValue(id, field, next, { source: 'edit' }).ok) replaced++;
            }
        }, 'replace');
        this.emit('replace', { text, replacement, replaced });
        return replaced;
    }

    /**
     * Goes to a row of the view (1 based) and optionally a column, by title or field.
     * @param target a row number, or text such as "120 Price"
     * @return whether the cell exists
     */
    goTo(target: number | string, field?: string): boolean {
        let row = typeof target === 'number' ? target : NaN;
        if (typeof target === 'string') {
            const match = /^\s*(\d+)\s*[,;:]?\s*(.*?)\s*$/.exec(target);
            if (!match) return false;
            row = Number(match[1]);
            field = field ?? (match[2] || undefined);
        }
        const data = this._view[row - 1];
        if (!data) return false;
        const columns = this.visibleColumns;
        const lower = field?.toLocaleLowerCase(this.locale);
        const column = field === undefined
            ? (columns.find(c => c.field === this._active?.field) ?? columns[0])
            : columns.find(c => c.field === field || c.field.toLocaleLowerCase(this.locale) === lower || c.title.toLocaleLowerCase(this.locale) === lower);
        if (!column) return false;
        this.setRange({ id: data._id, field: column.field });
        this.focus();
        return true;
    }

    /** Marks cells (find matches); an empty list removes the marks. */
    highlightCells(cells: CellRef[]): void {
        this._highlighted = new Set(cells.map(c => `${c.id}\u0000${c.field}`));
        this._paintRange();
    }

    private _move(rowDelta: number, columnDelta: number, extend = false): void {
        const columns = this.visibleColumns;
        const active = extend ? (this._focus ?? this._active) : this._active;
        if (!active) {
            const first = this._view[0];
            if (first && columns[0]) this._setActive(first._id, columns[0].field);
            return;
        }
        let rowIndex = this._viewIndex.get(active.id) ?? 0;
        let columnIndex = columns.findIndex(c => c.field === active.field);
        columnIndex += columnDelta;
        if (Math.abs(columnDelta) > 1 || extend) {
            columnIndex = Math.max(0, Math.min(columns.length - 1, columnIndex));
        } else if (columnIndex >= columns.length) {
            columnIndex = 0;
            rowIndex++;
        } else if (columnIndex < 0) {
            columnIndex = columns.length - 1;
            rowIndex--;
        }
        rowIndex = this._visibleRow(Math.max(0, Math.min(this._view.length - 1, rowIndex + rowDelta)), rowDelta < 0 ? -1 : 1);
        columnIndex = Math.max(0, Math.min(columns.length - 1, columnIndex));
        const row = this._view[rowIndex];
        const column = columns[columnIndex];
        if (row && column) this._selectCell(row._id, column.field, extend);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (this._editing || targetOf(e)?.closest('.ig-popover') || e.target !== this._scroller) return;
        const active = this._active;
        const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

        const move = moves[e.key];
        if (move) {
            e.preventDefault();
            // Shift extends the range, Ctrl jumps to the edge of the data
            const [rows, cols] = move;
            const far = e.ctrlKey || e.metaKey ? Number.MAX_SAFE_INTEGER : 1;
            this._move(rows * far, cols * far, e.shiftKey);
            return;
        }
        if (e.key === 'Tab' && active) {
            e.preventDefault();
            this._move(0, e.shiftKey ? -1 : 1);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
            e.preventDefault();
            const redo = e.key.toLowerCase() === 'y' || e.shiftKey;
            if (redo) this.redo();
            else this.undo();
            return;
        }
        if (e.key === 'F2' && e.shiftKey && this._active) {
            e.preventDefault();
            this.editComment(this._active.id, this._active.field);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && this._findBar && !e.shiftKey && !e.altKey && ['f', 'h', 'g'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            this.openFind(({ f: 'find', h: 'replace', g: 'goto' } as const)[e.key.toLowerCase() as 'f' | 'h' | 'g']);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'r') && !e.shiftKey && !e.altKey) {
            // Ctrl+D copies the first row of the range down, Ctrl+R the first column right
            e.preventDefault();
            this.fillCopy(e.key.toLowerCase() === 'd' ? 'down' : 'right');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const columns = this.visibleColumns;
            const first = this._view[0];
            const last = this._view.at(-1);
            if (first && last && columns.length) {
                this._active = { id: first._id, field: columns[0]!.field };
                this._focus = { id: last._id, field: columns.at(-1)!.field };
                this._paintRange();
                this.emit('rangeChange', this.getRange());
            }
            if (this.selectionMode === 'multiple') this.selectAll();
            return;
        }
        if (!active) return;
        if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault();
            this.startEdit(active.id, active.field);
        } else if (e.key === ' ' && this.selectionMode !== 'none') {
            e.preventDefault();
            const range = this.getRange();
            if (range && range.rows.length > 1 && this.selectionMode === 'multiple') this.select(range.rows, { append: true });
            else this._clickSelect(active.id, { ctrlKey: true, target: e.target });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.clearRange();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // typing replaces the cell content, like Excel
            if (this.startEdit(active.id, active.field, e.key)) e.preventDefault();
        }
    }

    /* ---------------------------------------------------------------- editing */

    /**
     * @param string id
     * @param string field
     * @param string|null initialText replaces the content (typing on a selected cell)
     * @return boolean
     */
    startEdit(id: string, field: string, initialText: string | null = null): boolean {
        const column = this.getColumn(field);
        const data = this.store.get(id);
        if (!column || !data || !this._isEditable(column, data)) return false;
        this._closeEditor(true);
        if (this._editing) return false;

        const td = this._cellElement(id, field);
        if (!td) return false;
        const formula = this.calc.cellFormulas.get(id)?.[field] || null;
        const value = data[field];
        const event = this.emit('beforeCellEdit', { id, field, value, row: this._publicRow(data), column });
        if (event.defaultPrevented) return false;

        const editorDefinition = resolveEditor(column, !!formula || (initialText === '=' && column.allowFormulas));
        const text = initialText ?? formula ?? editorText(value, column, this.locale);
        const editor = editorDefinition.create({
            value, text, column, row: this._publicRow(data), grid: this, t: this.t,
            commit: () => this._closeEditor(true),
            cancel: () => this._closeEditor(false)
        });

        this._active = { id, field };
        this._editing = { id, field, td, editor, column };
        clear(td);
        td.classList.add('ig-editing', 'ig-active');
        td.append(editor.element);
        editor.focus?.();
        const input: HTMLElement = editor.element;
        if (initialText !== null && (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && input.type !== 'checkbox') {
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                this._closeEditor(false);
                this._scroller.focus();
            } else if (e.key === 'Enter' && !(input instanceof HTMLTextAreaElement && (e.shiftKey || e.altKey))) {
                e.preventDefault();
                if (this._closeEditor(true)) {
                    this._scroller.focus();
                    this._move(e.shiftKey ? -1 : 1, 0);
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                if (this._closeEditor(true)) {
                    this._scroller.focus();
                    this._move(0, e.shiftKey ? -1 : 1);
                }
            }
        });
        input.addEventListener('blur', () => setTimeout(() => {
            if (this._editing?.editor === editor && !td.contains(document.activeElement)) this._closeEditor(true);
        }, 0));
        if ((input instanceof HTMLInputElement && input.type === 'checkbox') || input instanceof HTMLSelectElement) {
            input.addEventListener('change', () => this._closeEditor(true));
        }

        this.emit('cellEditStart', { id, field, value, row: this._publicRow(data), column });
        return true;
    }

    /**
     * @param boolean commit
     * @return boolean false when the value was rejected (the editor stays open)
     */
    private _closeEditor(commit: boolean): boolean {
        const editing = this._editing;
        if (!editing) return true;
        const { id, field, td, editor, column } = editing;

        if (commit) {
            const raw = editor.getValue();
            const before = this.calc.cellFormulas.get(id)?.[field] || editorText(this.store.get(id)?.[field], column, this.locale);
            if (raw !== before) {
                this._editing = null;
                const result = this.setCellValue(id, field, raw, { source: 'edit' });
                if (!result.ok && result.error !== 'cancelled') {
                    this._editing = editing;
                    td.classList.add('ig-invalid');
                    td.title = result.error ?? '';
                    editor.focus?.();
                    return false;
                }
            }
        } else {
            this._invalid.delete(`${id}\u0000${field}`);
            this.emit('cellEditCancel', { id, field });
        }

        this._editing = null;
        editor.destroy?.();
        const index = this._view.findIndex(r => r._id === id);
        const row = index === -1 ? null : this._view[index];
        if (row && td.isConnected) {
            const fresh = this.store.get(id) ?? row;
            this._view[index] = { ...fresh };
            this._replaceRow(id);
        }
        return true;
    }

    /* ---------------------------------------------------------------- clipboard */

    private _onCopy(e: ClipboardEvent): void {
        if (this._editing) return;
        const columns = this.visibleColumns;
        const range = this.getRange();
        let text: string;
        if (range && (range.rows.length > 1 || range.fields.length > 1)) {
            const rows = range.rows.map(id => this.store.get(id)!);
            const rangeColumns = range.fields.map(field => this.getColumn(field)!);
            text = toCSV(rows, rangeColumns, { delimiter: '\t', header: false, sanitize: false, formatted: true, lineBreak: '\n', format: (v, c, r) => formatCell(v, c, r, this.locale) });
        } else if (this._selected.size > 1 || (this._selected.size && !this._active)) {
            const rows = this._view.filter(r => this._selected.has(r._id));
            text = toCSV(rows, columns, { delimiter: '\t', header: false, sanitize: false, formatted: true, lineBreak: '\n', format: (v, c, r) => formatCell(v, c, r, this.locale) });
        } else if (this._active) {
            const row = this.store.get(this._active.id);
            const column = this.getColumn(this._active.field);
            if (!row || !column) return;
            text = formatCell(row[this._active.field], column, row, this.locale);
        } else {
            return;
        }
        e.preventDefault();
        e.clipboardData?.setData('text/plain', text);
        this.emit('copy', { text });
    }

    /**
     * Pastes tab separated text from the active cell, through the normal edit pipeline.
     */
    private _onPaste(e: ClipboardEvent): void {
        const active = this._active;
        if (this._editing || !active) return;
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;
        e.preventDefault();
        // Excel quotes cells that contain tabs, line breaks or quotes
        const lines = parseDelimited(text, '\t');
        const columns = this.visibleColumns;
        const bounds = this._rangeBounds();
        const startRow = bounds ? bounds.r1 : (this._viewIndex.get(active.id) ?? 0);
        const startColumn = bounds ? bounds.c1 : columns.findIndex(c => c.field === active.field);
        // one value pasted over a range fills the whole range, like Excel
        if (bounds && lines.length === 1 && lines[0]!.length === 1 && (bounds.r1 !== bounds.r2 || bounds.c1 !== bounds.c2)) {
            const value = lines[0]![0]!;
            lines.splice(0, 1, ...Array.from({ length: bounds.r2 - bounds.r1 + 1 }, () => Array.from({ length: bounds.c2 - bounds.c1 + 1 }, () => value)));
        }
        const results: Array<SetCellResult & { id: string; field: string }> = [];
        this._undo.begin('paste');
        lines.forEach((cells, r) => {
            const row = this._view[startRow + r];
            if (!row) return;
            cells.forEach((value, c) => {
                const column = columns[startColumn + c];
                if (!column || !this._isEditable(column, this.store.get(row._id))) return;
                results.push({ id: row._id, field: column.field, ...this.setCellValue(row._id, column.field, value, { source: 'paste' }) });
            });
        });
        this._undo.end();
        this._renderNavbar();
        this.emit('paste', { text, results });
    }

    /* ---------------------------------------------------------------- lifecycle */

    destroy(): void {
        if (this._scrollFrame) cancelAnimationFrame(this._scrollFrame);
        clearTimeout(this._noticeTimer);
        if (this._onDocumentPointer) document.removeEventListener('pointerdown', this._onDocumentPointer);
        this.closePopover();
        this.root.remove();
        this.element.classList.remove('ig-host');
        this.store.clear();
        this.emit('destroy', {});
        this.events = new Emitter(this);
    }
}

