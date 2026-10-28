import type { Column, Filter, FilterCondition, FilterModel, FilterOperator, RangeOperator, RowData, TextOperator } from '../types.js';
export declare const TEXT_OPERATORS: readonly TextOperator[];
export declare const RANGE_OPERATORS: readonly RangeOperator[];
export declare const BOOLEAN_OPERATORS: readonly RangeOperator[];
type FilterColumn = Pick<Column, 'field' | 'type'> & Partial<Pick<Column, 'options'>>;
type SorlaOperators = Record<string, unknown>;
export declare function operatorsFor(column: FilterColumn): readonly FilterOperator[];
/**
 * Plain JS evaluation of a condition, used for anything not sent to SorlaDB.
 */
export declare function testCondition(rawValue: unknown, condition: FilterCondition, column: FilterColumn, locale: string): boolean;
export declare function isFilterActive(filter: Filter | null | undefined): filter is Filter;
export interface CompiledFilters {
    query: Record<string, SorlaOperators>;
    predicates: Array<(row: RowData) => boolean>;
}
export declare function compileFilters(filters: FilterModel | null | undefined, columns: Map<string, FilterColumn>, { locale, testFormula }?: {
    locale?: string;
    testFormula?: (formula: string, row: RowData) => boolean;
}): CompiledFilters;
export {};
//# sourceMappingURL=filters.d.ts.map