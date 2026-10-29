/**
 * Intelligent Grid: an Excel-like data grid backed by SorlaDB.
 *
 *   const grid = new IntelligentGrid('#orders', { columns, data, editable: true });
 *   grid.on('cellChange', e => save(e.detail.row));
 */
import { SorlaStore } from '../core/store.js';
import { Emitter } from '../core/events.js';
import type { ChangeSet, ChangeSummary, HistoryEntry } from '../core/changes.js';
import { CalcEngine } from '../formula/engine.js';
import type { FormulaFunction, FunctionDefinition, LazyFormulaFunction } from '../formula/functions.js';
import type { FindMode } from './find-bar.js';
import type { ChangeSource, Column, ConfirmRequest, ColumnDefinition, CellRef, CsvExportOptions, FillDirection, FindOptions, ChangeTrackingOptions, Filter, FilterModel, GridEvent, QueryNode, GridEventHandler, GridOptions, NavbarOptions, Row, SelectionMode, CellComment, DuplicateOptions, GroupInfo, ImportOptions, ImportResult, ReplaceOptions, SelectionOptions, SortEntry, Translator, XlsxExportOptions } from '../types.js';
type ResolvedOptions = Required<Omit<GridOptions, 'selection' | 'navbar' | 'sort' | 'sorla' | 'database' | 'currency' | 'locale' | 'changeTracking' | 'confirm'>> & {
    confirm?: GridOptions['confirm'];
    changeTracking: ChangeTrackingOptions | false;
    selection: SelectionOptions;
    navbar: NavbarOptions | false;
    sort: {
        mode: 'modifier' | 'toggle';
    };
    locale: string | null;
    currency?: string;
};
export interface SetCellResult {
    ok: boolean;
    error?: string;
}
export interface DistinctValue {
    value: unknown;
    count: number;
    label: string;
}
export declare class IntelligentGrid {
    element: HTMLElement;
    options: ResolvedOptions;
    locale: string;
    t: Translator;
    events: Emitter;
    functions: Map<string, FunctionDefinition>;
    store: SorlaStore;
    calc: CalcEngine;
    columns: Column[];
    root: HTMLDivElement;
    private _columnMap;
    private _sort;
    private _filters;
    private _queryModel;
    private _queryBuilder;
    private _findBar;
    private _highlighted;
    private _search;
    private _selected;
    private _anchorId;
    private _active;
    private _focus;
    private _dragging;
    private _filling;
    private _pointer;
    private _autoScroll;
    private _editing;
    private _view;
    private _groupBy;
    private _collapsed;
    private _collapseNew;
    private _display;
    private _displayIndex;
    private _groupOf;
    private _groupEls;
    private _knownGroups;
    private _stats;
    private _notice;
    private _comments;
    private _commentTip;
    private _noticeTimer;
    private _layout;
    private _viewIndex;
    private _rowWindow;
    private _rowEls;
    private _plan;
    private _topSpacer;
    private _bottomSpacer;
    private _scrollFrame;
    private _calibrated;
    private _invalid;
    private _append;
    private _navbar;
    private _colgroup;
    private _thead;
    private _tbody;
    private _tfoot;
    private _table;
    private _message;
    private _loading;
    private _scroller;
    private _status;
    private _searchInput;
    private _selectAllBox;
    private _popover;
    private _onScroll;
    private _onDocumentPointer;
    private _tracker;
    private _undo;
    private _replaying;
    private _formInputs;
    /**
     * @param string|HTMLElement target
     * @param object options see README
     */
    constructor(target: string | HTMLElement, options: GridOptions);
    on(type: string, handler: GridEventHandler): () => void;
    once(type: string, handler: GridEventHandler): () => void;
    off(type: string, handler?: GridEventHandler): void;
    emit<T>(type: string, detail: T): GridEvent<T>;
    private _setColumns;
    getColumn(field: string): Column | undefined;
    /** Visible columns in display order: pinned left, scrollable, pinned right. */
    get visibleColumns(): Column[];
    /**
     * Freezes a column on the left or right edge while scrolling horizontally (Excel's freeze panes).
     * @param side 'left' | 'right' | null to unfreeze
     */
    pinColumn(field: string, side: 'left' | 'right' | null): void;
    setColumns(definitions: ColumnDefinition[]): void;
    addColumn(definition: ColumnDefinition, index?: number): void;
    removeColumn(field: string): void;
    setColumnVisible(field: string, visible: boolean): void;
    setColumnFormula(field: string, formula: string | null): void;
    /** Registers a formula function for this grid only (takes precedence over global functions). */
    registerFunction(name: string, fn: FormulaFunction, options?: {
        errors?: boolean;
    }): void;
    registerFunction(name: string, fn: LazyFormulaFunction, options: {
        lazy: true;
    }): void;
    /** Registers a formula function for every grid. */
    static defineFunction(name: string, fn: FormulaFunction, options?: {
        errors?: boolean;
    }): void;
    static defineFunction(name: string, fn: LazyFormulaFunction, options: {
        lazy: true;
    }): void;
    private _insert;
    /**
     * Row as handed to developers: a copy, blanks of non text columns as null.
     */
    private _publicRow;
    setData(rows: Record<string, unknown>[]): void;
    /**
     * @param string scope 'all' | 'filtered' (sorted as shown) | 'selected'
     */
    getRows(scope?: 'all' | 'filtered' | 'selected'): Row[];
    getRow(id: string): Row | null;
    addRow(row?: Record<string, unknown>, { position }?: {
        position?: 'start' | 'end';
    }): string | null;
    private _addRow;
    /**
     * Adds many rows at the end with one render and one undo step (no beforeRowAdd per row).
     * @return the new ids
     */
    addRows(rows: Record<string, unknown>[]): string[];
    updateRow(id: string, patch: Record<string, unknown>): boolean;
    private _updateRow;
    deleteRows(ids: string[]): string[];
    private _deleteRows;
    /**
     * Same pipeline as a user edit: parsing (strings), formulas, validation and events.
     * @return object {ok, error?}
     */
    setCellValue(id: string, field: string, value: unknown, { source }?: {
        source?: ChangeSource;
    }): SetCellResult;
    private _setCellValue;
    setCellFormula(id: string, field: string, formula: string | null, { source }?: {
        source?: ChangeSource;
    }): SetCellResult;
    private _setCellFormula;
    /** Formula of a cell: its own, or the column formula; null for plain values. */
    getCellFormula(id: string, field: string): string | null;
    private _invalidCell;
    /**
     * Evaluates a formula: grid.evaluate('=SUM([total])') over the filtered rows, or for one row.
     */
    evaluate(formula: string, id?: string | null): unknown;
    /**
     * Groups every change made inside fn into one undo step: grid.batch(() => { ... }, 'import').
     * @return what fn returns
     */
    batch<T>(fn: () => T, label?: string): T;
    canUndo(): boolean;
    canRedo(): boolean;
    /** Undoes the last step (Ctrl+Z). @return whether something was undone */
    undo(): boolean;
    /** Redoes the last undone step (Ctrl+Y). @return whether something was redone */
    redo(): boolean;
    clearUndo(): void;
    private _cellState;
    private _recordCell;
    private _writeCell;
    private _removeRow;
    private _restoreRow;
    private _applyStep;
    /**
     * Asks the user to confirm, with the built-in modal or the `confirm` option.
     * Also available for your own actions: `if (await grid.confirm({ action: 'archive', message: '…' })) …`
     */
    confirm(request: ConfirmRequest): Promise<boolean>;
    private _readers;
    private _touch;
    private _afterTrackedChange;
    /**
     * Net changes since the data was loaded or the last acceptChanges():
     * { inserted: [{id, row}], updated: [{id, changes: {field: {from, to}}, row}], deleted: [{id, row}] }
     */
    getChanges(): ChangeSet;
    getChangesJSON(space?: number): string;
    getChangeSummary(): ChangeSummary;
    hasChanges(): boolean;
    /** Every insert, update and delete since the last acceptChanges(), oldest first. */
    getHistory(): HistoryEntry[];
    /**
     * The current values become the new originals (call it after the server saved the changes).
     * @param ids only these rows (e.g. the ones the server accepted); all when omitted
     */
    acceptChanges(ids?: string[]): void;
    /**
     * Restores the original state: removes inserted rows, restores deleted ones and reverts updates.
     * @param ids only these rows; all when omitted
     */
    rejectChanges(ids?: string[]): void;
    /**
     * Keeps a hidden input with getChangesJSON() inside a form, updated on every change,
     * so a normal form submit sends the changes.
     * @return the hidden input
     */
    bindForm(form: string | HTMLFormElement, name?: string): HTMLInputElement;
    getSort(): SortEntry[];
    setSort(sort: SortEntry[] | null): void;
    /**
     * asc -> desc -> none. Additive keeps the other sorted columns (multi column sort).
     */
    toggleSort(field: string, additive?: boolean): void;
    getFilters(): FilterModel;
    setFilter(field: string, filter: Filter | null): void;
    setFilters(filters: FilterModel | null): void;
    /** Column filters, search and the advanced filter. */
    clearFilters(): void;
    /** The advanced filter as built in the query builder, null when none. */
    getQuery(): QueryNode | null;
    /**
     * Sets the advanced filter. It is combined (AND) with the column filters and the search.
     * Incomplete rules and empty groups are dropped.
     */
    setQuery(query: QueryNode | null): void;
    /** The advanced filter as SorlaDB / MongoDB find() JSON ({} when none). */
    toSorlaQuery(query?: QueryNode | null): Record<string, unknown>;
    /** Loads a SorlaDB / MongoDB query (e.g. a saved one) into the advanced filter. */
    fromSorlaQuery(json: Record<string, unknown>): void;
    /** Opens or closes the query builder panel. */
    toggleQueryBuilder(open?: boolean): void;
    /** @internal rows matching a query (with the other filters), for the builder preview */
    countQuery(query: QueryNode | null): number;
    /** @internal */
    queryColumns(): Map<string, Column>;
    setSearch(text: string): void;
    private _onQueryChange;
    private _compiled;
    private _query;
    /**
     * Distinct values of a field for the filter checklist, considering the other filters (Excel).
     */
    /** @internal used by the filter menu */
    distinctValues(field: string): DistinctValue[];
    /**
     * Re-runs the query (filters + search + sort) through SorlaDB and renders from the top.
     */
    refresh(): void;
    private _resetAppend;
    /**
     * Loads the next page from options.append.load({offset, limit, sort, filters, search}).
     * The loader resolves {rows, hasMore?, total?}.
     */
    loadMore(): Promise<void>;
    reload(): Promise<void> | void;
    private _checkScrollEnd;
    get selectionMode(): SelectionMode;
    getSelected(): Row[];
    getSelectedIds(): string[];
    select(ids: string[], { append }?: {
        append?: boolean;
    }): void;
    deselect(ids: string[]): void;
    selectAll(): void;
    clearSelection(): void;
    private _selectionDetail;
    private _afterSelection;
    private _syncSelectAll;
    private _clickSelect;
    private _exportRows;
    private _exportColumns;
    /**
     * @param object options {rows: 'filtered'|'all'|'selected', columns: 'visible'|'all'|[fields],
     *   delimiter, formatted, bom, filename, download}
     * @return string
     */
    exportCSV(options?: CsvExportOptions): string | null;
    /**
     * @param object options {rows, columns, formulas (true), footer (true), sheetName, filename, download}
     * @return Uint8Array
     */
    exportXLSX(options?: XlsxExportOptions): Uint8Array | null;
    private _footerFormula;
    private _footerValue;
    private _build;
    private _bindEvents;
    /**
     * Which columns to render: pinned ones always, scrollable ones windowed when there are more than
     * `virtualColumns` of them.
     */
    private _columnPlan;
    /** Cells of a row in plan order; spacers keep the width of the columns that are not rendered. */
    private _planCells;
    private _renderHeader;
    private _startResize;
    /** The rows to show changed (query, inserts, deletes): rebuild the layout and render the window. */
    private _renderBody;
    /** Height of the visible area below the sticky header and above the sticky footer. */
    private _viewportHeight;
    /**
     * Renders only the rows (and, with many columns, the columns) in view, plus spacers that keep the
     * scroll size of the rest. Rows that stay in view are reused.
     * @param force re-render every row (columns or data changed)
     */
    private _renderWindow;
    private _setSpacer;
    /**
     * Rows taller than the default (wrapped text) are measured, so the scroll size stays exact.
     * The first rendered row also calibrates the default height when no rowHeight is configured.
     */
    private _measureRows;
    /**
     * Scrolls so that a row is visible.
     * @param index position in the filtered and sorted rows
     */
    scrollToRow(index: number): void;
    /** Scrolls horizontally so that a column is rendered and visible. */
    private _scrollToColumn;
    private _rowClasses;
    private _createRow;
    /** Re-renders one row in place when it is in view. */
    private _replaceRow;
    private _isEditable;
    private _createCell;
    private _columnStats;
    private _applyPreset;
    /**
     * Conditional formats: [{formula: '=[@total] > 1000', className, style}] or [{when(value, row), ...}]
     */
    private _applyFormats;
    /**
     * Updates view rows from the store without re-sorting (like Excel, edited rows stay in place).
     * @param array|null ids null = every row
     */
    private _syncRows;
    private _renderFooter;
    /** A footer or subtotal cell: column.footer applied to the rows. */
    private _summaryCell;
    private _renderNavbar;
    private _describeFilter;
    private _openColumnsMenu;
    /** @internal */
    showPopover(element: HTMLElement, anchor: HTMLElement): void;
    /** @internal */
    closePopover(): void;
    private _showMessage;
    private _setLoading;
    private _cellElement;
    /**
     * Makes a cell active (collapsing the range) or, with extend, moves the other corner of the range.
     */
    private _selectCell;
    private _setActive;
    getComment(id: string, field: string): string | null;
    /** Comments of the rows that exist, in no particular order. */
    getComments(): CellComment[];
    /** Sets (or with null / '' removes) the comment of a cell; undoable. */
    setComment(id: string, field: string, text: string | null): boolean;
    private _writeComment;
    /** Opens the comment editor of a cell (Shift+F2). Ctrl+Enter saves, Esc cancels. */
    editComment(id: string, field: string): void;
    private _showCommentTip;
    private _hideCommentTip;
    /**
     * Rows that repeat an earlier row in the given columns (the first of each set is not included).
     * @return ids, in view order
     */
    findDuplicates({ fields, matchCase, scope }?: DuplicateOptions): string[];
    /**
     * Deletes the duplicate rows (see findDuplicates), as one undo step. No confirmation is asked.
     * @return removed ids
     */
    removeDuplicates(options?: DuplicateOptions): string[];
    /**
     * Imports a .csv, .tsv, .txt or .xlsx file (for example from an <input type="file">).
     * Headers are matched to columns by field or title, ignoring case; values are read like typed text.
     */
    importFile(file: Blob & {
        name?: string;
    }, options?: ImportOptions): Promise<ImportResult>;
    private _importFromNavbar;
    private _showNotice;
    /** Imports CSV / TSV text. */
    importCSV(text: string, options?: ImportOptions): ImportResult;
    /** Imports the first sheet (or options.sheet) of an .xlsx file. */
    importXLSX(data: Uint8Array | ArrayBuffer, options?: ImportOptions): Promise<ImportResult>;
    /**
     * Imports rows of cells (the first one being the header unless header: false).
     * Text is parsed like typed input (numbers, dates, options in the grid locale); other values are kept.
     */
    importTable(table: unknown[][], { mode, header, createColumns }?: ImportOptions): ImportResult;
    /**
     * Groups the rows by one or more fields (outermost first), with a group row showing the value,
     * the row count and subtotals (column `subtotal`, or its `footer`). Pass [] or null to ungroup.
     */
    setGroupBy(fields: string[] | null): void;
    getGroupBy(): string[];
    /** Groups in display order, including the ones inside collapsed groups. */
    getGroups(): GroupInfo[];
    /** Opens or closes a group (by key, see getGroups()); without `open` it toggles. */
    toggleGroup(key: string, open?: boolean): void;
    expandGroups(): void;
    collapseGroups(): void;
    private _publicValue;
    private _groupPart;
    /** Keys of the groups a row belongs to, outermost first. */
    private _groupPath;
    private _sortGroups;
    /** Calls fn for every group in display order, with whether it is hidden inside a collapsed group. */
    private _eachGroup;
    private _buildDisplay;
    /** Position of a row in the rendered list; undefined when it is hidden in a collapsed group. */
    private _displayOf;
    /** The nearest view index at or after (direction 1) or before (-1) that is not hidden. */
    private _visibleRow;
    private _openGroupsOf;
    /** Re-renders the visible group rows that contain a row (their subtotals changed). */
    private _refreshGroupRows;
    private _createGroupRow;
    /** Row and column positions of the selected range, or null. */
    private _rangeBounds;
    /**
     * The selected range: from the active cell to the other corner.
     * @return {from, to, rows (ids, in display order), fields} or null
     */
    getRange(): {
        from: {
            id: string;
            field: string;
        };
        to: {
            id: string;
            field: string;
        };
        rows: string[];
        fields: string[];
    } | null;
    /** Selects the cells between two corners; `from` becomes the active cell. */
    setRange(from: {
        id: string;
        field: string;
    }, to?: {
        id: string;
        field: string;
    }): void;
    /** Values of the selected range as rows of stored values. */
    getRangeValues(): unknown[][];
    /** Clears every editable cell of the range, as one undo step. @return cleared cells */
    clearRange(): number;
    /** Marks the cells of the range in the rendered rows (and the fill handle on its corner). */
    private _paintRange;
    /** Whether the fill handle is shown (something editable). */
    private _fillEnabled;
    /** Range or fill drag: follows the pointer and scrolls when it nears an edge of the grid. */
    private _startDrag;
    private _dragScroll;
    private _dragOver;
    /** Cells a fill would write to, as view bounds. */
    private _fillBounds;
    private _paintFill;
    /**
     * Copies the first row of the range into the rest of it (down, Ctrl+D) or the first column (right, Ctrl+R).
     * @return cells written
     */
    fillCopy(direction?: 'down' | 'right'): number;
    /**
     * Extends the selected range like Excel's fill handle: numbers and dates continue their step,
     * "Item 1" becomes "Item 2", anything else repeats. One undo step; the range grows over the filled cells.
     * @param direction where to fill
     * @param count rows (up / down) or columns (left / right) to fill
     * @return cells written
     */
    fill(direction: FillDirection, count: number): number;
    /** Writes one filled value when the cell is editable and the value fits the column type. */
    private _fillCell;
    /** The active cell, or null. */
    getActiveCell(): CellRef | null;
    /** Moves keyboard focus to the grid. */
    focus(): void;
    /** Opens the find / replace / go to bar (Ctrl+F, Ctrl+H, Ctrl+G). */
    openFind(mode?: FindMode): void;
    closeFind(): void;
    /** Position of a cell in reading order (row by row), for comparing cells; -1 when not in the view. */
    indexOfCell(cell: CellRef | null): number;
    private _matcher;
    /**
     * Cells whose displayed text contains the text, in reading order over the filtered and sorted view.
     * @return matching cells
     */
    find(text: string, options?: FindOptions): CellRef[];
    /**
     * Replaces the text in the editable matching cells (in what you would type in the cell),
     * as one undo step.
     * @return cells changed
     */
    replace(text: string, replacement: string, options?: ReplaceOptions): number;
    /**
     * Goes to a row of the view (1 based) and optionally a column, by title or field.
     * @param target a row number, or text such as "120 Price"
     * @return whether the cell exists
     */
    goTo(target: number | string, field?: string): boolean;
    /** Marks cells (find matches); an empty list removes the marks. */
    highlightCells(cells: CellRef[]): void;
    private _move;
    private _onKeyDown;
    /**
     * @param string id
     * @param string field
     * @param string|null initialText replaces the content (typing on a selected cell)
     * @return boolean
     */
    startEdit(id: string, field: string, initialText?: string | null): boolean;
    /**
     * @param boolean commit
     * @return boolean false when the value was rejected (the editor stays open)
     */
    private _closeEditor;
    private _onCopy;
    /**
     * Pastes tab separated text from the active cell, through the normal edit pipeline.
     */
    private _onPaste;
    destroy(): void;
}
export {};
//# sourceMappingURL=grid.d.ts.map