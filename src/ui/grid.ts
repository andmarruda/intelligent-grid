/**
 * Intelligent Grid: an Excel-like data grid backed by SorlaDB.
 *
 *   const grid = new IntelligentGrid('#orders', { columns, data, editable: true });
 *   grid.on('cellChange', e => save(e.detail.row));
 */
import { SorlaStore, compareCells } from '../core/store.ts';
import { Emitter } from '../core/events.ts';
import { ChangeTracker } from '../core/changes.ts';
import type { ChangeReaders, ChangeSet, ChangeSummary, FieldChange, HistoryEntry } from '../core/changes.ts';
import { compileFilters, isFilterActive } from '../core/filters.ts';
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
import { clear, h } from './dom.ts';
import type {
    AppendOptions, CellChangeDetail, ChangeSource, Column, ColumnDefinition, ConditionalFormat, CsvExportOptions, EditorInstance,
    ChangeTrackingOptions, Filter, FilterModel, GridEvent, GridEventHandler, GridOptions, NavbarItem, NavbarOptions, Row, RowData, SelectionMode,
    SelectionOptions, SortEntry, Translator, XlsxExportOptions
} from '../types.ts';

type ResolvedOptions = Required<Omit<GridOptions, 'selection' | 'navbar' | 'sort' | 'sorla' | 'database' | 'currency' | 'locale' | 'changeTracking'>> & {
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
    selection: { mode: 'multiple', checkbox: true },
    navbar: { search: true, filters: true, columns: true, export: ['csv', 'xlsx'], add: false, delete: false, changes: true, items: [] },
    changeTracking: { inputName: 'changes', historyLimit: 5000 },
    statusBar: true,
    renderChunk: 100,
    append: null,
    rowClass: null,
    rowFormats: [],
    exportOptions: { filename: 'export', sheetName: 'Sheet1' },
    confirmDelete: true,
    on: {}
};

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
    private _search = '';
    private _selected = new Set<string>();
    private _anchorId: string | null = null;
    private _active: { id: string; field: string } | null = null;
    private _editing: EditingState | null = null;
    private _view: RowData[] = [];
    private _rendered = 0;
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
    private _sentinel!: HTMLDivElement;
    private _scroller!: HTMLDivElement;
    private _status!: HTMLDivElement;
    private _searchInput: HTMLInputElement | null = null;
    private _selectAllBox: HTMLInputElement | null = null;
    private _popover: HTMLElement | null = null;
    private _observer: IntersectionObserver | null = null;
    private _onScroll: (() => void) | null = null;
    private _onDocumentPointer: ((e: PointerEvent) => void) | null = null;
    private _tracker: ChangeTracker | null = null;
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

        this._sort = [...this.options.initialSort];
        this._filters = { ...this.options.initialFilters };
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

    get visibleColumns(): Column[] {
        return this.columns.filter(c => c.visible);
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
        const event = this.emit('beforeRowAdd', { row: { ...row } });
        if (event.defaultPrevented) return null;
        const id = this._insert([event.detail.row])[0]!;
        this._tracker?.recordInsert(id);
        const data = { ...this.store.get(id)! };
        if (position === 'start') this._view.unshift(data);
        else this._view.push(data);
        this._renderBody();
        this._renderFooter();
        this._afterTrackedChange();
        this.emit('rowAdd', { id, row: this.getRow(id) });
        return id;
    }

    updateRow(id: string, patch: Record<string, unknown>): boolean {
        if (!this.store.has(id)) return false;
        this._touch(id);
        const before = this.getRow(id)!;
        const previous = this.store.update(id, patch);
        const scope = this.calc.recalculate([id], Object.keys(patch));
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
        const event = this.emit('beforeRowDelete', { ids: [...ids], rows: ids.map(id => this.getRow(id)) });
        if (event.defaultPrevented) return [];
        for (const id of event.detail.ids) {
            const data = this.store.get(id);
            if (data) this._tracker?.recordDelete(id, data, this.calc.cellFormulas.get(id));
        }
        const removed = this.store.remove(event.detail.ids);
        const removedIds = removed.map(r => r._id);
        this.calc.forgetRows(removedIds);
        this.calc.recalculate([], this.columns.map(c => c.field));
        removedIds.forEach(id => this._selected.delete(id));
        const gone = new Set(removedIds);
        this._view = this._view.filter(r => !gone.has(r._id));
        this._rendered = Math.min(this._rendered, this._view.length);
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
        const column = this.getColumn(field);
        const data = this.store.get(id);
        if (!column || !data) return { ok: false, error: 'notFound' };

        if (isFormula(value) && column.allowFormulas) return this.setCellFormula(id, field, value as string, { source });

        if (typeof value === 'string' && source !== 'api') {
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
        const hadFormula = !!this.calc.cellFormulas.get(id)?.[field];
        if (this.calc.columnFormulas.has(field)) this.calc.setCellOverride(id, field);
        else if (hadFormula) this.calc.setCellFormula(id, field, null);
        this.store.update(id, { [field]: event.detail.value });
        this._invalid.delete(`${id}\u0000${field}`);
        const scope = this.calc.recalculate([id], [field]);
        this._syncRows(scope === 'all' || hadFormula ? null : [id]);

        const updated = this.getRow(id)!;
        this._tracker?.recordUpdate(id, field, oldValue ?? null, updated[field] ?? null, source);
        this._afterTrackedChange();
        const change: CellChangeDetail = { id, field, value: updated[field], oldValue, row: updated, source };
        column.onChange?.(change);
        this.emit('cellChange', change);
        return { ok: true };
    }

    setCellFormula(id: string, field: string, formula: string | null, { source = 'api' }: { source?: ChangeSource } = {}): SetCellResult {
        const column = this.getColumn(field);
        if (!column || !this.store.has(id)) return { ok: false, error: 'notFound' };
        const oldValue = this.getRow(id)![field];
        const event = this.emit<CellChangeDetail>('beforeCellChange', { id, field, value: formula, oldValue, row: this.getRow(id), column, source, formula: true });
        if (event.defaultPrevented) return { ok: false, error: 'cancelled' };

        this._touch(id);
        this.calc.setCellFormula(id, field, formula);
        this.calc.recalculate([id], [field]);
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

    clearFilters(): void {
        this._search = '';
        if (this._searchInput) this._searchInput.value = '';
        this.setFilters({});
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
        return { query, predicates };
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
        this._rendered = 0;
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
        this.store.clear();
        this.calc.cellFormulas.clear();
        this.calc.setColumns(this.columns);
        this._view = [];
        this._rendered = 0;
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
        const params = { offset: append.loaded, limit: append.pageSize, sort: this.getSort(), filters: this.getFilters(), search: this._search };
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

            const localQuery = !append.serverSide && (this._sort.length || Object.keys(this._filters).length || this._search);
            if (localQuery) {
                append.loading = false;
                this.refresh();
            } else {
                const scopeAll = this.calc.hasColumnReferences();
                if (scopeAll) this._view.forEach((row, i) => { this._view[i] = { ...this.store.get(row._id)! }; });
                this._view.push(...ids.map(id => ({ ...this.store.get(id)! })));
                if (scopeAll) {
                    this._rendered = 0;
                    this._renderBody();
                } else {
                    this._renderMore();
                }
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
        if (this._rendered < this._view.length) this._renderMore();
        else if (this._append?.hasMore) this.loadMore();
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
        for (const tr of this._tbody.rows) {
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
        this._sentinel = h('div', { class: 'ig-sentinel' });
        this._scroller = h('div', { class: 'ig-scroll', tabindex: '0', style: { maxHeight: typeof this.options.height === 'number' ? `${this.options.height}px` : this.options.height } },
            this._table, this._message, this._loading, this._sentinel);
        this._status = h('div', { class: 'ig-status', 'aria-live': 'polite' });

        if (this.options.navbar) this.root.append(this._navbar);
        this.root.append(this._scroller);
        if (this.options.statusBar) this.root.append(this._status);
        this.element.append(this.root);

        this._renderHeader();
        this._bindEvents();
    }

    private _bindEvents(): void {
        const scroller = this._scroller;
        this._onScroll = () => this._checkScrollEnd();
        scroller.addEventListener('scroll', this._onScroll, { passive: true });
        if (typeof IntersectionObserver !== 'undefined') {
            this._observer = new IntersectionObserver(entries => {
                if (entries.some(e => e.isIntersecting)) this._checkScrollEnd();
            }, { root: scroller, rootMargin: '200px' });
            this._observer.observe(this._sentinel);
        }

        this._tbody.addEventListener('click', e => {
            const td = targetOf(e)?.closest('td') ?? null;
            const tr = targetOf(e)?.closest('tr');
            if (!tr || !tr.dataset.id || this._editing?.td === td) return;
            const id = tr.dataset.id;
            if (td?.dataset.field) this._setActive(id, td.dataset.field);
            if (td?.classList.contains('ig-select-cell') || this.options.selection.selectOnClick !== false) this._clickSelect(id, e);
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

    private _renderHeader(): void {
        clear(this._colgroup);
        clear(this._thead);
        const tr = h('tr');
        const multi = this._sort.length > 1;

        if (this.selectionMode !== 'none' && this.options.selection.checkbox) {
            this._colgroup.append(h('col', { class: 'ig-select-col' }));
            this._selectAllBox = this.selectionMode === 'multiple'
                ? h('input', { type: 'checkbox', 'aria-label': this.t('selectAll'), onchange: (e: Event) => (e.target as HTMLInputElement).checked ? this.selectAll() : this.clearSelection() })
                : null;
            tr.append(h('th', { class: 'ig-select-cell' }, this._selectAllBox));
        } else {
            this._selectAllBox = null;
        }

        for (const column of this.visibleColumns) {
            const col = h('col', { style: { width: column.width ? `${column.width}px` : null, minWidth: `${column.minWidth}px` } });
            this._colgroup.append(col);
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
            tr.append(th);
        }
        this._thead.append(tr);
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
            this.emit('columnResize', { field: column.field, width: column.width });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    private _renderBody(): void {
        clear(this._tbody);
        const target = Math.max(this._rendered, Math.min(this.options.renderChunk, this._view.length));
        this._rendered = 0;
        this._renderRows(target);
        this._showMessage(this._view.length || this._append?.loading ? null : this.t('noRows'));
        this._syncSelectAll();
    }

    private _renderMore(): void {
        this._renderRows(this._rendered + this.options.renderChunk);
        this._showMessage(this._view.length ? null : this.t('noRows'));
        this._syncSelectAll();
    }

    private _renderRows(upTo: number): void {
        const end = Math.min(upTo, this._view.length);
        const fragment = document.createDocumentFragment();
        for (let i = this._rendered; i < end; i++) fragment.append(this._createRow(this._view[i]!));
        this._tbody.append(fragment);
        this._rendered = end;
    }

    private _rowClasses(row: RowData, changed: Record<string, FieldChange>): string[] {
        const classes = ['ig-row'];
        if (this._selected.has(row._id)) classes.push('ig-selected');
        if (this._tracker?.isInserted(row._id)) classes.push('ig-row-inserted');
        else if (Object.keys(changed).length) classes.push('ig-row-updated');
        if (typeof this.options.rowClass === 'function') classes.push(this.options.rowClass(this._publicRow(row)) ?? '');
        return classes;
    }

    private _createRow(row: RowData): HTMLTableRowElement {
        const tr = h('tr', { dataset: { id: row._id }, 'aria-selected': String(this._selected.has(row._id)) });
        const changed = this._tracker ? this._tracker.changedFields(row._id, this._readers) : {};
        tr.className = this._rowClasses(row, changed).join(' ').trim();
        this._applyFormats(tr, this.options.rowFormats, row);

        if (this.selectionMode !== 'none' && this.options.selection.checkbox) {
            tr.append(h('td', { class: 'ig-select-cell' }, h('input', {
                type: this.selectionMode === 'single' ? 'radio' : 'checkbox',
                tabindex: '-1',
                checked: this._selected.has(row._id),
                'aria-label': 'select'
            })));
        }
        for (const column of this.visibleColumns) tr.append(this._createCell(row, column, changed[column.field]));
        return tr;
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
        } else if (column.type === 'boolean' && !isErrorCode(value) && !formula) {
            td.append(h('input', {
                type: 'checkbox', class: 'ig-cell-checkbox', tabindex: '-1',
                checked: value === true, disabled: !this._isEditable(column, row)
            }));
        } else {
            td.textContent = formatted;
        }

        this._applyFormats(td, column.conditionalFormats, row, value);
        return td;
    }

    /**
     * Conditional formats: [{formula: '=[@total] > 1000', className, style}] or [{when(value, row), ...}]
     */
    private _applyFormats(element: HTMLElement, formats: ConditionalFormat[] | undefined, row: RowData, value?: unknown): void {
        for (const format of formats ?? []) {
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
        this._view.forEach((row, i) => {
            if (targets && !targets.has(row._id)) return;
            const fresh = this.store.get(row._id);
            if (!fresh) return;
            this._view[i] = { ...fresh };
            if (i >= this._rendered) return;
            const tr = this._tbody.children[i];
            if (!tr || (this._editing && this._editing.id === row._id)) return;
            tr.replaceWith(this._createRow(this._view[i]));
        });
        if (!ids) {
            this._rendered = Math.min(this._rendered, this._view.length);
            while (this._tbody.rows.length > this._rendered) this._tbody.lastElementChild?.remove();
            this._showMessage(this._view.length ? null : this.t('noRows'));
        }
        this._renderFooter();
        this._renderNavbar();
    }

    private _renderFooter(): void {
        clear(this._tfoot);
        const columns = this.visibleColumns;
        if (!columns.some(c => c.footer)) return;
        const tr = h('tr', { class: 'ig-footer' });
        if (this.selectionMode !== 'none' && this.options.selection.checkbox) tr.append(h('td', { class: 'ig-select-cell' }));
        for (const column of columns) {
            if (!column.footer) {
                tr.append(h('td'));
                continue;
            }
            const value = this._footerValue(column);
            const shortcut = typeof column.footer === 'string' && /^count/i.test(column.footer);
            const text = shortcut ? formatCell(value, { type: 'integer', decimals: 0 }, {}, this.locale) : formatCell(value, column, {}, this.locale);
            tr.append(h('td', {
                class: `ig-cell ig-align-${column.align}${isErrorCode(value) ? ' ig-error' : ''}`,
                title: this._footerFormula(column) ?? null,
                text: column.type === 'boolean' && !isErrorCode(value) ? String(value ?? '') : text
            }));
        }
        this._tfoot.append(tr);
    }

    private _renderNavbar(): void {
        if (this.options.statusBar) {
            const total = this._append?.total ?? this.store.count();
            const parts = [this.t('status', { shown: this._view.length, total })];
            if (this._selected.size) parts.push(this.t('selected', { count: this._selected.size }));
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

        if (config.filters) {
            for (const [field, filter] of Object.entries(this._filters)) {
                const column = this.getColumn(field);
                if (!column) continue;
                left.append(h('span', { class: 'ig-chip' },
                    h('span', { text: `${column.title}: ${this._describeFilter(filter, column)}` }),
                    h('button', { type: 'button', class: 'ig-chip-remove', 'aria-label': this.t('clear'), text: '×', onclick: () => this.setFilter(field, null) })));
            }
            if (Object.keys(this._filters).length || this._search) {
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

        if (config.add) right.append(button({ label: this.t('addRow'), onClick: () => this.addRow(typeof config.add === 'function' ? config.add(this) : {}) }));
        if (config.delete && this.selectionMode !== 'none') {
            right.append(button({
                label: this.t('deleteRows'),
                className: 'ig-btn-danger',
                disabled: !this._selected.size,
                onClick: () => {
                    const ids = this.getSelectedIds();
                    if (this.options.confirmDelete && !globalThis.confirm?.(this.t('confirmDelete', { count: ids.length }))) return;
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
                    onClick: () => {
                        if (this.options.confirmDelete && !globalThis.confirm?.(this.t('confirmDiscard', { count: summary.total }))) return;
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
        const index = this._view.findIndex(r => r._id === id);
        if (index === -1 || index >= this._rendered) return null;
        return this._tbody.children[index]?.querySelector(`td[data-field="${CSS.escape(field)}"]`) ?? null;
    }

    private _setActive(id: string, field: string): void {
        this._tbody.querySelector('.ig-active')?.classList.remove('ig-active');
        this._active = { id, field };
        const td = this._cellElement(id, field);
        if (td) {
            td.classList.add('ig-active');
            td.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
        this.emit('activeCellChange', { id, field });
    }

    private _move(rowDelta: number, columnDelta: number): void {
        const columns = this.visibleColumns;
        const active = this._active;
        if (!active) {
            const first = this._view[0];
            if (first && columns[0]) this._setActive(first._id, columns[0].field);
            return;
        }
        let rowIndex = this._view.findIndex(r => r._id === active.id);
        let columnIndex = columns.findIndex(c => c.field === active.field);
        columnIndex += columnDelta;
        if (columnIndex >= columns.length) {
            columnIndex = 0;
            rowIndex++;
        } else if (columnIndex < 0) {
            columnIndex = columns.length - 1;
            rowIndex--;
        }
        rowIndex = Math.max(0, Math.min(this._view.length - 1, rowIndex + rowDelta));
        if (rowIndex >= this._rendered) this._renderRows(rowIndex + this.options.renderChunk);
        const row = this._view[rowIndex];
        const column = columns[columnIndex];
        if (row && column) this._setActive(row._id, column.field);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (this._editing || targetOf(e)?.closest('.ig-popover') || e.target !== this._scroller) return;
        const active = this._active;
        const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

        const move = moves[e.key];
        if (move) {
            e.preventDefault();
            this._move(...move);
            if (e.shiftKey && this._active && this.selectionMode === 'multiple') this._clickSelect(this._active.id, { shiftKey: true });
            return;
        }
        if (e.key === 'Tab' && active) {
            e.preventDefault();
            this._move(0, e.shiftKey ? -1 : 1);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && this.selectionMode === 'multiple') {
            e.preventDefault();
            this.selectAll();
            return;
        }
        if (!active) return;
        if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault();
            this.startEdit(active.id, active.field);
        } else if (e.key === ' ' && this.selectionMode !== 'none') {
            e.preventDefault();
            this._clickSelect(active.id, { ctrlKey: true, target: e.target });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            const column = this.getColumn(active.field);
            if (this._isEditable(column, this.store.get(active.id))) {
                e.preventDefault();
                this.setCellValue(active.id, active.field, null, { source: 'edit' });
            }
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
            td.parentElement?.replaceWith(this._createRow(this._view[index]!));
        }
        return true;
    }

    /* ---------------------------------------------------------------- clipboard */

    private _onCopy(e: ClipboardEvent): void {
        if (this._editing) return;
        const columns = this.visibleColumns;
        let text: string;
        if (this._selected.size > 1 || (this._selected.size && !this._active)) {
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
        const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
        const columns = this.visibleColumns;
        const startRow = this._view.findIndex(r => r._id === active.id);
        const startColumn = columns.findIndex(c => c.field === active.field);
        const results: Array<SetCellResult & { id: string; field: string }> = [];
        lines.forEach((cells, r) => {
            const row = this._view[startRow + r];
            if (!row) return;
            cells.forEach((value, c) => {
                const column = columns[startColumn + c];
                if (!column || !this._isEditable(column, this.store.get(row._id))) return;
                results.push({ id: row._id, field: column.field, ...this.setCellValue(row._id, column.field, value, { source: 'paste' }) });
            });
        });
        this.emit('paste', { text, results });
    }

    /* ---------------------------------------------------------------- lifecycle */

    destroy(): void {
        this._observer?.disconnect();
        if (this._onDocumentPointer) document.removeEventListener('pointerdown', this._onDocumentPointer);
        this.closePopover();
        this.root.remove();
        this.store.clear();
        this.emit('destroy', {});
        this.events = new Emitter(this);
    }
}

