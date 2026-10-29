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
import type { ChangeSource, Column, ConfirmRequest, ColumnDefinition, CsvExportOptions, ChangeTrackingOptions, Filter, FilterModel, GridEvent, QueryNode, GridEventHandler, GridOptions, NavbarOptions, Row, SelectionMode, SelectionOptions, SortEntry, Translator, XlsxExportOptions } from '../types.js';
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
    private _search;
    private _selected;
    private _anchorId;
    private _active;
    private _editing;
    private _view;
    private _rendered;
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
    private _sentinel;
    private _scroller;
    private _status;
    private _searchInput;
    private _selectAllBox;
    private _popover;
    private _observer;
    private _onScroll;
    private _onDocumentPointer;
    private _tracker;
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
    get visibleColumns(): Column[];
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
    updateRow(id: string, patch: Record<string, unknown>): boolean;
    deleteRows(ids: string[]): string[];
    /**
     * Same pipeline as a user edit: parsing (strings), formulas, validation and events.
     * @return object {ok, error?}
     */
    setCellValue(id: string, field: string, value: unknown, { source }?: {
        source?: ChangeSource;
    }): SetCellResult;
    setCellFormula(id: string, field: string, formula: string | null, { source }?: {
        source?: ChangeSource;
    }): SetCellResult;
    /** Formula of a cell: its own, or the column formula; null for plain values. */
    getCellFormula(id: string, field: string): string | null;
    private _invalidCell;
    /**
     * Evaluates a formula: grid.evaluate('=SUM([total])') over the filtered rows, or for one row.
     */
    evaluate(formula: string, id?: string | null): unknown;
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
    private _renderHeader;
    private _startResize;
    private _renderBody;
    private _renderMore;
    private _renderRows;
    private _rowClasses;
    private _createRow;
    private _isEditable;
    private _createCell;
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
    private _setActive;
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