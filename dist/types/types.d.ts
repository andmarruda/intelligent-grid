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
/** A rule: a class or style when a formula or function says so. */
export interface RuleFormat {
    type?: 'rule';
    /** Formula that must evaluate to TRUE, e.g. '=[@total] > 1000'. */
    formula?: string;
    when?: (value: unknown, row: Row | null) => boolean;
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
}
/** Bar under the value, as long as the value is between the column minimum and maximum. */
export interface DataBarFormat {
    type: 'dataBar';
    /** CSS color (default: the --ig-databar theme color). */
    color?: string;
    /** Fixed ends of the scale (default: the column minimum, or 0, and maximum). */
    min?: number;
    max?: number;
    /** false shows only the bar (default true). */
    showValue?: boolean;
}
/** Background color between two or three colors (default red, yellow, green). */
export interface ColorScaleFormat {
    type: 'colorScale';
    colors?: string[];
    min?: number;
    max?: number;
}
/** Icon before the value: low, middle or high part of the range. */
export interface IconSetFormat {
    type: 'iconSet';
    /** A preset (default 'arrows') or your own icons from low to high. */
    icons?: 'arrows' | 'traffic' | 'flags' | 'stars' | string[];
    /** Where each next icon starts: percents of the range (default equal parts), or numbers with thresholdType: 'number'. */
    thresholds?: number[];
    thresholdType?: 'percent' | 'number';
    /** High values get the first icon. */
    reverse?: boolean;
    min?: number;
    max?: number;
    /** false shows only the icon (default true). */
    showValue?: boolean;
}
export type PresetFormat = DataBarFormat | ColorScaleFormat | IconSetFormat;
export type ConditionalFormat = RuleFormat | PresetFormat;
export type ChangeSource = 'edit' | 'paste' | 'fill' | 'api';
/** A group of rows, as returned by grid.getGroups(). */
export interface GroupInfo {
    key: string;
    /** 0 for the outermost group. */
    level: number;
    field: string;
    value: unknown;
    /** Rows in the group (with nested groups, all of them). */
    count: number;
    collapsed: boolean;
}
export interface ImportOptions {
    /** 'replace' (default) swaps the data, 'append' adds the rows (one undo step). */
    mode?: 'replace' | 'append';
    /** The first row holds column titles or fields (default true). Without it, columns are filled in order. */
    header?: boolean;
    /** CSV delimiter (default: detected from the first line). */
    delimiter?: string;
    /** XLSX sheet name or 0-based index (default the first). */
    sheet?: string | number;
    /** Add columns for headers that match none (default: only when the grid has no columns). */
    createColumns?: boolean;
}
export interface ImportError {
    /** 1-based line of the file. */
    line: number;
    field: string;
    value: unknown;
    error: string;
}
export interface ImportResult {
    /** Rows imported. */
    rows: number;
    /** Fields that received data, in file order. */
    fields: string[];
    /** Headers that matched no column and were skipped. */
    skipped: string[];
    /** Values that did not fit their column; they are imported as blanks. */
    errors: ImportError[];
    sheet?: string;
}
export interface SparklineOptions {
    type?: 'line' | 'bar' | 'winloss';
    /** CSS color (default: the text color). */
    color?: string;
    /** Color of negative bars (default: the --ig-negative theme color). */
    negativeColor?: string;
    width?: number;
    height?: number;
    /** Fixed ends of the scale, to compare rows (default: each row's own range). */
    min?: number;
    max?: number;
}
export interface DuplicateOptions {
    /** Columns that must all be equal (default: every visible column that is not a formula). */
    fields?: string[];
    /** Compare text with the same case (default false, like Excel). */
    matchCase?: boolean;
    /** 'filtered' (default) checks the rows shown, in their order; 'all' every row. */
    scope?: 'filtered' | 'all';
}
/** A note on a cell (Shift+F2 edits the one of the active cell). */
export interface CellComment {
    id: string;
    field: string;
    text: string;
}
/** A cell of the grid. */
export interface CellRef {
    id: string;
    field: string;
}
export interface FindOptions {
    /** Compare with the same upper and lower case (default false). */
    matchCase?: boolean;
    /** The whole displayed text must match (default false). */
    wholeCell?: boolean;
    /** Columns to search (default: every visible column). */
    fields?: string[];
}
export interface ReplaceOptions extends FindOptions {
    /** Replace only in these cells (default: every match). */
    cells?: CellRef[];
}
/** Direction of the fill handle (or grid.fill()). */
export type FillDirection = 'down' | 'up' | 'right' | 'left';
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
    /** Draw the value (a list of numbers, or text such as "1,2,3") as a small chart. */
    sparkline?: SparklineOptions | true;
    /** Subtotal on group rows; defaults to the footer. false shows none. */
    subtotal?: FooterShortcut | string | FooterFunction | false;
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
    /** Freeze the column on the left or right edge while scrolling horizontally. */
    pinned?: 'left' | 'right' | null;
    /** Wrap long text; rows grow to fit (their height is measured). */
    wrap?: boolean;
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
/** Operators of the query builder; eq / ne are exact (SorlaDB $eq / $ne), in / nin take `values`. */
export type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'nin' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty';
export interface QueryRule {
    type: 'rule';
    field: string;
    op: QueryOperator;
    value?: unknown;
    value2?: unknown;
    values?: unknown[];
}
export interface QueryGroup {
    type: 'group';
    join: 'and' | 'or';
    /** Negates the whole group (NOT). */
    not?: boolean;
    children: QueryNode[];
}
export type QueryNode = QueryRule | QueryGroup;
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
    /** "Advanced filter" button opening the visual query builder (default true). */
    query?: boolean;
    /** Undo / redo buttons, shown when something is editable (default true). */
    undo?: boolean;
    /** "Import" button for .csv, .tsv and .xlsx files (default false). true replaces the data; or pass import options. */
    import?: boolean | ImportOptions;
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
    /** Advanced filter (query builder model), null when none. */
    query: QueryNode | null;
    /** The advanced filter as SorlaDB / MongoDB JSON ({} when none). */
    sorlaQuery: Record<string, unknown>;
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
    insertOne(document: Record<string, unknown>): unknown;
    insertMany(documents: Record<string, unknown>[]): unknown[];
    deleteMany(filter: Record<string, unknown>): {
        deletedCount: number;
    };
    find(query: Record<string, unknown>): SorlaCursor;
    count(query?: Record<string, unknown>): number;
    on(event: 'insert' | 'update' | 'replace' | 'delete' | 'change', listener: (event: {
        type: string;
        ids: unknown[];
    }) => void): () => void;
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
    /** Fields to group rows by, outermost first (see setGroupBy). */
    groupBy?: string[];
    /** Start with every group collapsed (default false). */
    groupsCollapsed?: boolean;
    initialFilters?: FilterModel;
    /** Advanced filter applied on load (query builder model). */
    initialQuery?: QueryNode | null;
    /** Cell comments shown on load. */
    comments?: CellComment[];
    selection?: Partial<SelectionOptions> | false;
    navbar?: NavbarOptions | false;
    statusBar?: boolean;
    /** Find / replace and Go to bar on Ctrl+F, Ctrl+H and Ctrl+G (default true). */
    find?: boolean;
    /** @deprecated rows are virtualized: only the visible ones are rendered. Ignored. */
    renderChunk?: number;
    /** Row height in pixels; measured from the first row when not set. */
    rowHeight?: number | null;
    /** Undo steps kept (default 100). */
    undoLimit?: number;
    /** Rows rendered above and below the visible ones (default 8). */
    overscan?: number;
    /** Scrollable columns are virtualized when there are more than this many (default 40). */
    virtualColumns?: number;
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