/**
 * SorlaStore: the only place where Intelligent Grid talks to SorlaDB.
 *
 * Rows live as documents of a SorlaDB collection; filtering runs through collection.find() with the
 * Sorla query language. SorlaDB 1.0 still lacks a few operations the grid needs, those workarounds
 * are kept here and marked "SorlaDB 1.0 workaround" so they can be replaced as soon as the library
 * ships them (see docs/sorla-db.md).
 */
import { isErrorCode } from '../formula/errors.ts';
import type { RowData, SorlaCollection, SorlaDatabase, SorlaDocument, SorlaInstance, SorlaSource, SortEntry, StoredValue } from '../types.ts';

let storeCounter = 0;

/**
 * Accepts the sorla class, an instance, or nothing (falls back to window.sorla from dist/sorla.min.js).
 */
function resolveSorla(sorla?: SorlaSource): SorlaInstance {
    const candidate = sorla ?? (globalThis as { sorla?: SorlaSource }).sorla;
    if (!candidate) {
        throw new Error('Intelligent Grid needs SorlaDB: load sorla-db (window.sorla) or pass the "sorla" option');
    }
    return typeof candidate === 'function' ? new candidate() : candidate;
}

/**
 * Values SorlaDB can store and compare safely.
 * SorlaDB 1.0 workaround: insertOne() throws on null values (_validateKeys calls Object.keys(null)),
 * and Date objects break $eq, so blanks are stored as '' and dates as ISO strings.
 */
export function encodeValue(value: unknown): unknown {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString();
    if (typeof value === 'number' && !Number.isFinite(value)) return '';
    return value;
}

export const isBlank = (value: unknown): boolean => value === '' || value === null || value === undefined;

export type SortCompare = (a: unknown, b: unknown, entry: SortEntry & { locale?: string }) => number;

export interface QueryOptions {
    /** SorlaDB query object ({} for everything). */
    query?: Record<string, unknown>;
    /** Extra row tests for what the Sorla query language cannot express yet. */
    predicates?: Array<(row: RowData) => boolean>;
    sort?: Array<SortEntry & { locale?: string }>;
    compare?: SortCompare;
}

export interface StoreOptions {
    sorla?: SorlaSource;
    database?: string;
    collection?: string;
    idField?: string | null;
}

export class SorlaStore {
    sorla: SorlaInstance;
    databaseName: string;
    collectionName: string;
    idField: string | null;
    fields: string[] = [];
    db: SorlaDatabase;
    // documents by _id, SorlaDB 1.0 has no indexes and findOne() throws when nothing matches
    private byId = new Map<string, SorlaDocument>();

    constructor({ sorla, database, collection = 'rows', idField = null }: StoreOptions = {}) {
        this.sorla = resolveSorla(sorla);
        this.databaseName = database ?? `intelligent_grid_${++storeCounter}`;
        this.collectionName = collection;
        this.idField = idField;

        this.sorla.useDb(this.databaseName);
        this.db = this.sorla.db;
        if (!this.db[this.collectionName]) this.db.createCollection(this.collectionName);
        for (const doc of this.collection.all) this.byId.set(doc._data._id, doc);
    }

    get collection(): SorlaCollection {
        return this.db[this.collectionName] as SorlaCollection;
    }

    /**
     * Fields that every document must have, so "not equal" style queries see blanks.
     */
    setFields(fields: string[]): void {
        this.fields = fields;
    }

    private prepare(row: Record<string, unknown>): Record<string, unknown> {
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) data[key] = encodeValue(value);
        for (const field of this.fields) if (!(field in data)) data[field] = '';
        if (this.idField && !isBlank(row[this.idField])) data._id = String(row[this.idField]);
        if (data._id !== undefined && this.byId.has(String(data._id))) {
            throw new Error(`Duplicate row id "${String(data._id)}"`);
        }
        return data;
    }

    /**
     * Inserts rows (copied, the caller objects are never mutated).
     * @return ids
     */
    insert(rows: Record<string, unknown>[]): string[] {
        const ids: string[] = [];
        const collection = this.collection;
        for (const row of rows) {
            const data = this.prepare(row);
            // insertOne instead of insertMany: SorlaDB 1.0 insertMany logs to the console on every call
            collection.insertOne(data);
            const doc = collection.all[collection.all.length - 1]!;
            const id = String(doc._data._id);
            this.byId.set(id, doc);
            ids.push(id);
        }
        return ids;
    }

    has(id: string): boolean {
        return this.byId.has(id);
    }

    /**
     * Live document data, for internal reads only (formulas, rendering).
     */
    get(id: string): RowData | undefined {
        return this.byId.get(id)?._data;
    }

    /**
     * SorlaDB 1.0 workaround: there is no updateOne() yet and the document proxy rejects writes from
     * outside the library, so values are written on the document data object.
     * @return previous values of the changed fields
     */
    update(id: string, patch: Record<string, unknown>): Record<string, unknown> {
        const data = this.get(id);
        if (!data) throw new Error(`Row "${id}" not found`);
        const previous: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(patch)) {
            if (field === '_id') continue;
            previous[field] = data[field];
            data[field] = encodeValue(value);
        }
        return previous;
    }

    /**
     * SorlaDB 1.0 workaround: there is no deleteOne()/deleteMany() yet.
     * @return removed rows data
     */
    remove(ids: string[]): RowData[] {
        const targets = new Set(ids.filter(id => this.byId.has(id)));
        if (!targets.size) return [];
        const removed: RowData[] = [];
        const documents = this.collection.all;
        for (let i = documents.length - 1; i >= 0; i--) {
            const data = documents[i]!._data;
            if (targets.has(data._id)) {
                removed.push(data);
                documents.splice(i, 1);
                this.byId.delete(data._id);
            }
        }
        return removed.reverse();
    }

    clear(): void {
        this.collection.all.length = 0;
        this.byId.clear();
    }

    count(): number {
        return this.collection.count();
    }

    ids(): string[] {
        return this.collection.all.map(doc => doc._data._id);
    }

    /**
     * Live values of a field across every row in insertion order (formula column ranges).
     */
    values(field: string): unknown[] {
        return this.collection.all.map(doc => doc._data[field]);
    }

    /**
     * Runs a query through SorlaDB.
     * @return row data (copies)
     */
    query({ query = {}, predicates = [], sort = [], compare = compareCells }: QueryOptions = {}): RowData[] {
        let documents = this.collection.find(query)._data;
        if (predicates.length) {
            documents = documents.filter(doc => predicates.every(test => test(doc._data)));
        }

        const rows = documents.map(doc => doc._data);
        if (!sort.length) return rows;

        // SorlaDB 1.0 workaround: cursor.sort() throws "documents is not a constructor" (circular
        // require between cursor.js and document.js), and its < > comparison has no blank/locale rules
        return rows.sort((a, b) => {
            for (const entry of sort) {
                const result = compare(a[entry.field], b[entry.field], entry);
                if (result !== 0) return result;
            }
            return 0;
        });
    }
}

const collators = new Map<string, Intl.Collator>();

/**
 * Excel sort order: numbers < text < booleans, then errors, blanks always last (asc and desc).
 */
export function compareCells(a: unknown, b: unknown, { dir = 'asc', locale = 'en-US' }: { dir?: 'asc' | 'desc'; locale?: string } = {}): number {
    const blankA = isBlank(a);
    const blankB = isBlank(b);
    if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;

    const rank = (value: unknown) => isErrorCode(value) ? 3 : typeof value === 'boolean' ? 2 : typeof value === 'string' ? 1 : 0;
    const rankA = rank(a);
    const rankB = rank(b);
    let result: number;
    if (rankA !== rankB) {
        result = rankA - rankB;
    } else if (rankA === 1) {
        let collator = collators.get(locale);
        if (!collator) {
            collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
            collators.set(locale, collator);
        }
        result = collator.compare(a as string, b as string);
    } else {
        const x = a as StoredValue;
        const y = b as StoredValue;
        result = x < y ? -1 : x > y ? 1 : 0;
    }
    return dir === 'desc' ? -result : result;
}
