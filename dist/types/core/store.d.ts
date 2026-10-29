import type { RowData, SorlaCollection, SorlaDatabase, SorlaInstance, SorlaSource, SortEntry } from '../types.js';
/**
 * Values as the grid stores them: blanks are '' and dates ISO strings, so every query has a single
 * blank to look for ({ $eq: '' }) and dates compare as text. SorlaDB accepts null since 1.2, but
 * mixing null and '' blanks would complicate every filter; rows handed to developers use null.
 */
export declare function encodeValue(value: unknown): unknown;
export declare const isBlank: (value: unknown) => boolean;
export type SortCompare = (a: unknown, b: unknown, entry: SortEntry & {
    locale?: string;
}) => number;
export interface QueryOptions {
    /** SorlaDB query object ({} for everything). */
    query?: Record<string, unknown>;
    /** Extra row tests for what the Sorla query language cannot express yet. */
    predicates?: Array<(row: RowData) => boolean>;
    sort?: Array<SortEntry & {
        locale?: string;
    }>;
    compare?: SortCompare;
}
export interface StoreOptions {
    sorla?: SorlaSource;
    database?: string;
    collection?: string;
    idField?: string | null;
}
export declare class SorlaStore {
    sorla: SorlaInstance;
    databaseName: string;
    collectionName: string;
    idField: string | null;
    fields: string[];
    db: SorlaDatabase;
    private byId;
    constructor({ sorla, database, collection, idField }?: StoreOptions);
    get collection(): SorlaCollection;
    /**
     * Fields that every document must have, so "not equal" style queries see blanks.
     */
    setFields(fields: string[]): void;
    private prepare;
    /**
     * Inserts rows (copied, the caller objects are never mutated).
     * @return ids
     */
    insert(rows: Record<string, unknown>[]): string[];
    has(id: string): boolean;
    /**
     * Live document data, for internal reads only (formulas, rendering).
     */
    get(id: string): RowData | undefined;
    /**
     * Writes values with updateOne() by _id: indexed, validated by a collection schema, and seen by
     * other code that listens to the collection (watch(), events).
     * @return previous values of the changed fields
     */
    update(id: string, patch: Record<string, unknown>): Record<string, unknown>;
    /**
     * Writes a calculated value. SorlaDB: written on the document data, without updateOne(): formula
     * recalculation writes one value per row of a column (100 000 for a column), where updateOne()
     * would copy each document and cost about 2 ms per 1 000 rows. Calculated values are derived from
     * the other fields, so no change event is emitted for them.
     */
    writeCalculated(data: RowData, field: string, value: unknown): void;
    /**
     * SorlaDB: updateOne() stores a new object for the document (stored data is never changed in
     * place), so the id map points to the new one. find({_id}) uses the collection index.
     */
    private refresh;
    /**
     * @return removed rows data, in collection order
     */
    remove(ids: string[]): RowData[];
    clear(): void;
    count(): number;
    ids(): string[];
    /**
     * Live values of a field across every row in insertion order (formula column ranges).
     */
    values(field: string): unknown[];
    /**
     * Runs a query through SorlaDB.
     * @return row data (copies)
     */
    query({ query, predicates, sort, compare }?: QueryOptions): RowData[];
}
/**
 * Excel sort order: numbers < text < booleans, then errors, blanks always last (asc and desc).
 */
export declare function compareCells(a: unknown, b: unknown, { dir, locale }?: {
    dir?: 'asc' | 'desc';
    locale?: string;
}): number;
//# sourceMappingURL=store.d.ts.map