/**
 * Public types of Intelligent Grid.
 */
import type { IntelligentGrid } from './ui/grid.js';
import type { FormulaFunction } from './formula/functions.js';
/** Value as stored in SorlaDB: blanks are '', dates ISO strings, formula errors their code ('#DIV/0!'). */
export type StoredValue = string | number | boolean;
/** Row data inside the grid. `_id` is the SorlaDB document id. */
export interface RowData {
    _id: string;
    [field: string]: unknown;
}
/** Row handed to developers: a copy where blanks of non text columns are `null`. */
export type Row = RowData;
export type ColumnType = 'text' | 'number' | 'integer' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean' | 'select';
export type Align = 'left' | 'right' | 'center';
export interface SelectOption {
    value: unknown;
    label: string;
}
export interface ValidationRules {
    required?: boolean;
    min?: number | string;
    max?: number | string;
    minLength?: number;
    maxLength?: number;
    pattern?: string | RegExp;
    message?: string;
}
export type ValidationFunction = (value: unknown, row: Row | null, column: Column) => boolean | string | null | undefined;
export type ValidationRule = ValidationRules | ValidationFunction;
export interface ConditionalFormat {
    /** Formula that must evaluate to TRUE, e.g. '=[@total] > 1000'. */
    formula?: string;
    when?: (value: unknown, row: Row | null) => boolean;
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
}
export type ChangeSource = 'edit' | 'paste' | 'api';
export interface CellChangeDetail {
    id: string;
    field: string;
    value: unknown;
    oldValue: unknown;
    row: Row | null;
    column?: Column;
    source: ChangeSource;
    formula?: string | boolean;
}
export interface EditorContext {
    value: unknown;
    text: string;
    column: Column;
    row: Row | null;
    grid: IntelligentGrid;
    t: Translator;
    commit: () => void;
    cancel: () => void;
}
export interface EditorInstance {
    element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLElement;
    /** Text (parsed with the column rules) or a final typed value. */
    getValue: () => unknown;
    focus?: () => void;
    destroy?: () => void;
}
export interface CustomEditor {
    create: (context: EditorContext) => EditorInstance;
}
export type BuiltInEditor = 'text' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox' | 'textarea';
export type FooterShortcut = 'sum' | 'avg' | 'average' | 'count' | 'counta' | 'min' | 'max' | 'median';
export type FooterFunction = (rows: Row[], column: Column, grid: IntelligentGrid) => unknown;
export interface ColumnDefinition {
    field: string;
    title?: string;
    type?: ColumnType;
    width?: number | null;
    minWidth?: number;
    align?: Align;
    visible?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    resizable?: boolean;
    decimals?: number | null;
    currency?: string;
    /** Excel format code (also written to the XLSX) or a formatter. */
    format?: string | ((value: unknown, row: RowData, column: Column) => unknown);
    options?: Array<SelectOption | string | number | boolean>;
    /** select type: false accepts values outside the options. */
    strict?: boolean;
    editable?: boolean | ((row: Row | null, column: Column) => boolean);
    editor?: BuiltInEditor | CustomEditor | CustomEditor['create'];
    allowFormulas?: boolean;
    parse?: (input: unknown, column: Column) => unknown;
    validate?: ValidationRule | ValidationRule[];
    /** Return false to cancel, or a new value. */
    beforeChange?: (detail: CellChangeDetail) => unknown;
    onChange?: (detail: CellChangeDetail) => void;
    /** Calculated column formula, e.g. '=[@qty]*[@price]'. */
    formula?: string;
    footer?: FooterShortcut | string | FooterFunction;
    conditionalFormats?: ConditionalFormat[];
    render?: (value: unknown, row: Row | null, context: {
        column: Column;
        grid: IntelligentGrid;
        formatted: string;
    }) => string | Node | null | undefined;
    html?: boolean;
    cellClass?: string | ((value: unknown, row: Row | null, column: Column) => string | null | undefined);
    headerClass?: string;
    tooltip?: string;
}
/** Column after defaults are applied. */
export interface Column extends ColumnDefinition {
    title: string;
    type: ColumnType;
    width: number | null;
    minWidth: number;
    align: Align;
    visible: boolean;
    sortable: boolean;
    filterable: boolean;
    resizable: boolean;
    decimals: number | null;
    currency: string;
    editable: boolean | ((row: Row | null, column: Column) => boolean);
    allowFormulas: boolean;
    conditionalFormats: ConditionalFormat[];
    html: boolean;
    options?: SelectOption[];
    editor: BuiltInEditor | CustomEditor | CustomEditor['create'];
}
export type TextOperator = 'contains' | 'notContains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty';
export type RangeOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'empty' | 'notEmpty';
export type FilterOperator = TextOperator | RangeOperator;
export interface FilterCondition {
    op: FilterOperator;
    value?: unknown;
    value2?: unknown;
}
export interface Filter {
    /** Checklist of stored values ('' = blanks). */
    values?: unknown[];
    conditions?: FilterCondition[];
    join?: 'and' | 'or';
    /** Formula that must be TRUE for the row, e.g. '=[@total] > 100'. */
    formula?: string;
    test?: (value: unknown, row: RowData) => boolean;
}
export type FilterModel = Record<string, Filter>;
export interface SortEntry {
    field: string;
    dir: 'asc' | 'desc';
}
export interface NavbarItem {
    label: string;
    title?: string;
    className?: string;
    position?: 'left' | 'right';
    disabled?: boolean | ((grid: IntelligentGrid) => boolean);
    onClick: (grid: IntelligentGrid, event: MouseEvent) => void;
}
export interface NavbarOptions {
    title?: string;
    search?: boolean;
    filters?: boolean;
    columns?: boolean;
    export?: boolean | Array<'csv' | 'xlsx'>;
    add?: boolean | ((grid: IntelligentGrid) => Record<string, unknown>);
    delete?: boolean;
    /** "N changes" badge and a "Discard changes" button while there are unsaved changes (default true). */
    changes?: boolean;
    items?: NavbarItem[];
}
export interface ConfirmRequest {
    /** What is being confirmed: 'delete', 'discard', or your own name when calling grid.confirm(). */
    action: string;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Destructive action: red confirm button, focus starts on cancel. */
    danger?: boolean;
}
export interface ChangeTrackingOptions {
    /** Form that receives a hidden input with the changes as JSON, kept up to date. */
    form?: string | HTMLFormElement;
    /** Name of the hidden input (default 'changes'). */
    inputName?: string;
    /** Maximum history entries kept (default 5000). */
    historyLimit?: number;
}
export type SelectionMode = 'single' | 'multiple' | 'none';
export interface SelectionOptions {
    mode: SelectionMode;
    checkbox?: boolean;
    selectOnClick?: boolean;
}
export interface AppendLoadParams {
    offset: number;
    limit: number;
    sort: SortEntry[];
    filters: FilterModel;
    search: string;
}
export interface AppendResult {
    rows: Record<string, unknown>[];
    hasMore?: boolean;
    total?: number | null;
}
export interface AppendOptions {
    load: (params: AppendLoadParams) => Promise<AppendResult | Record<string, unknown>[]>;
    pageSize?: number;
    /** Pixels from the bottom that trigger the next page. */
    threshold?: number;
    /** Send sort/filter/search to load() and reload on change (default true). */
    serverSide?: boolean;
}
export interface ExportOptions {
    rows?: 'filtered' | 'all' | 'selected';
    columns?: 'visible' | 'all' | string[];
    filename?: string;
    /** false returns the content without downloading. */
    download?: boolean;
}
export interface CsvExportOptions extends ExportOptions {
    delimiter?: string;
    decimal?: string;
    formatted?: boolean;
    bom?: boolean;
    header?: boolean;
    sanitize?: boolean;
}
export interface XlsxExportOptions extends ExportOptions {
    formulas?: boolean;
    footer?: boolean;
    sheetName?: string;
}
/** Constructor of the sorla-db library, or an instance of it. */
export type SorlaSource = (new () => SorlaInstance) | SorlaInstance;
export interface SorlaInstance {
    useDb(name: string): void;
    readonly db: SorlaDatabase;
}
export interface SorlaDatabase {
    createCollection(name: string): void;
    countCollections(): number;
    [collection: string]: unknown;
}
export interface SorlaDocument {
    _data: RowData;
}
export interface SorlaCursor {
    _data: SorlaDocument[];
}
export interface SorlaCollection {
    readonly all: SorlaDocument[];
    insertOne(document: Record<string, unknown>): void;
    find(query: Record<string, unknown>): SorlaCursor;
    count(): number;
}
export interface GridOptions {
    columns: ColumnDefinition[];
    data?: Record<string, unknown>[];
    idField?: string | null;
    sorla?: SorlaSource;
    database?: string;
    locale?: string | null;
    labels?: Record<string, string>;
    height?: number | string;
    editable?: boolean;
    cellFormulas?: boolean;
    currency?: string;
    names?: Record<string, unknown>;
    functions?: Record<string, FormulaFunction>;
    sort?: {
        mode?: 'modifier' | 'toggle';
    };
    initialSort?: SortEntry[];
    initialFilters?: FilterModel;
    selection?: Partial<SelectionOptions> | false;
    navbar?: NavbarOptions | false;
    statusBar?: boolean;
    renderChunk?: number;
    append?: AppendOptions | null;
    rowClass?: ((row: Row | null) => string | null | undefined) | null;
    rowFormats?: ConditionalFormat[];
    exportOptions?: {
        filename?: string;
        sheetName?: string;
    };
    confirmDelete?: boolean;
    /** Replace the built-in confirmation modal (e.g. with your UI library). Resolve true to proceed. */
    confirm?: ((request: ConfirmRequest) => boolean | Promise<boolean>) | null;
    /** Track inserted/updated/deleted rows (default true). */
    changeTracking?: boolean | ChangeTrackingOptions;
    on?: Record<string, GridEventHandler>;
}
export interface GridEvent<T = Record<string, unknown>> {
    type: string;
    detail: T;
    grid: IntelligentGrid;
    defaultPrevented: boolean;
    preventDefault(): void;
}
export type GridEventHandler = (event: GridEvent<any>) => void;
export type Translator = (key: string, params?: Record<string, unknown>) => string;
//# sourceMappingURL=types.d.ts.map