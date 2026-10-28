import type { Scalar } from './values.js';
import type { FunctionDefinition } from './functions.js';
import type { SorlaStore } from '../core/store.js';
import type { Column, RowData } from '../types.js';
interface DependencyNode {
    row: Set<string>;
    column: Set<string>;
}
export declare class CalcEngine {
    store: SorlaStore;
    locale: string;
    names: Record<string, unknown>;
    functions: Map<string, FunctionDefinition>;
    fields: Set<string>;
    columnFormulas: Map<string, string>;
    cellFormulas: Map<string, Record<string, string>>;
    nodes: Map<string, DependencyNode>;
    order: string[];
    circular: Set<string>;
    private columnCache;
    constructor({ store, locale, names, functions }: {
        store: SorlaStore;
        locale?: string;
        names?: Record<string, unknown>;
        functions?: Map<string, FunctionDefinition>;
    });
    setColumns(columns: Column[]): void;
    private context;
    private allValues;
    /**
     * Formula fields and their dependencies, topologically ordered; cycles become #CIRC!.
     */
    private buildGraph;
    formulaFor(id: string, field: string): string | null;
    /**
     * A value typed into a calculated column: the column formula skips that cell from now on
     * (Excel's "calculated column exception"). Setting a cell formula or null removes it.
     */
    setCellOverride(id: string, field: string): void;
    isFormulaField(field: string): boolean;
    /** true when some formula reads a whole column, so appending rows changes existing results */
    hasColumnReferences(): boolean;
    setCellFormula(id: string, field: string, formula: string | null): void;
    forgetRows(ids: string[]): void;
    reset(columns: Column[]): void;
    private computeCell;
    private computeColumn;
    /**
     * Recomputes every formula of every row.
     */
    recalculateAll(): void;
    /**
     * Recomputes what depends on the changed fields.
     * @param ids rows that changed (inserted, edited or removed)
     * @param fields fields that changed
     * @return 'all' when every row may have changed, 'rows' otherwise
     */
    recalculate(ids: string[], fields: string[]): 'all' | 'rows';
    /**
     * Evaluates an ad-hoc formula: footers, conditional formats, formula filters, grid.evaluate().
     * @param row data for [@field] references
     * @param rows rows used by [field] ranges (defaults to every row)
     */
    evaluate(formula: string, row?: RowData | null, rows?: RowData[] | null): Scalar;
}
export {};
//# sourceMappingURL=engine.d.ts.map