import type { RowData, SorlaCollection, SorlaDatabase, SorlaInstance, SorlaSource, SortEntry } from '../types.js';
/**
 * Values SorlaDB can store and compare safely.
 * SorlaDB 1.0 workaround: insertOne() throws on null values (_validateKeys calls Object.keys(null)),
 * and Date objects break $eq, so blanks are stored as '' and dates as ISO strings.
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
     * SorlaDB 1.0 workaround: there is no updateOne() yet and the document proxy rejects writes from
     * outside the library, so values are written on the document data object.
     * @return previous values of the changed fields
     */
    update(id: string, patch: Record<string, unknown>): Record<string, unknown>;
    /**
     * SorlaDB 1.0 workaround: there is no deleteOne()/deleteMany() yet.
     * @return removed rows data
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