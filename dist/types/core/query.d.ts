import type { Column, QueryGroup, QueryNode, QueryOperator, QueryRule, RowData, Translator } from '../types.js';
type QueryColumn = Pick<Column, 'field' | 'type' | 'title'> & Partial<Pick<Column, 'options' | 'format' | 'decimals' | 'currency'>>;
type SorlaQuery = Record<string, unknown>;
export declare const TEXT_QUERY_OPERATORS: readonly QueryOperator[];
export declare const RANGE_QUERY_OPERATORS: readonly QueryOperator[];
export declare const BOOLEAN_QUERY_OPERATORS: readonly QueryOperator[];
export declare function queryOperatorsFor(column: Pick<Column, 'type'>): readonly QueryOperator[];
export declare const emptyGroup: (join?: "and" | "or") => QueryGroup;
/**
 * A rule is complete when it has a field, an operator and the values that operator needs.
 */
export declare function isCompleteRule(rule: QueryRule): boolean;
/**
 * Drops incomplete rules and empty groups; returns null when nothing is left.
 */
export declare function normalizeQuery(node: QueryNode | null | undefined): QueryNode | null;
export declare function isQueryActive(node: QueryNode | null | undefined): boolean;
export interface CompileOptions {
    locale?: string;
    /** Ids of the rows matching a SorlaDB query (used when a group mixes SorlaDB and grid side rules). */
    idsFor: (query: SorlaQuery) => Set<string>;
}
/**
 * Compiles a query into a SorlaDB query plus grid side predicates. A top level AND keeps its
 * SorlaDB children in the query and only moves the others to predicates.
 */
export declare function compileQuery(node: QueryNode | null | undefined, columns: Map<string, QueryColumn>, options: CompileOptions): {
    query: SorlaQuery;
    predicates: Array<(row: RowData) => boolean>;
};
/**
 * The query as MongoDB / SorlaDB JSON. Rules SorlaDB 1.1 cannot run (text matching) are written as
 * case insensitive $regex conditions, which MongoDB understands.
 */
export declare function toSorlaQuery(node: QueryNode | null | undefined, columns: Map<string, QueryColumn>, locale?: string): SorlaQuery;
/**
 * Reads a SorlaDB / MongoDB query (as produced by toSorlaQuery) back into the builder model.
 * @throws Error on constructs the builder cannot represent
 */
export declare function fromSorlaQuery(query: SorlaQuery): QueryGroup;
/**
 * Readable text: "Age ≥ 30 AND (Name = X OR City in A, B)".
 */
export declare function describeQuery(node: QueryNode | null | undefined, columns: Map<string, QueryColumn>, t: Translator, format: (value: unknown, column: QueryColumn) => string): string;
export {};
//# sourceMappingURL=query.d.ts.map