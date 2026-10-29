/**
 * Change tracking: what was inserted, updated or deleted since the data was loaded (or since the
 * last acceptChanges()), plus a chronological history of every operation.
 *
 * Rows are snapshotted lazily, right before their first change, so untouched rows cost nothing.
 * getChanges() reports *net* changes: a value edited and edited back is not a change, a row
 * inserted and then deleted disappears, a deleted row reports its original values.
 */
import type { RowData } from '../types.js';
export type CellFormulas = Record<string, string> | undefined;
export interface FieldChange {
    from: unknown;
    to: unknown;
}
export interface InsertedRow {
    id: string;
    row: Record<string, unknown>;
    /** Cell formulas typed by the user, by field (only present when there are any). */
    formulas?: Record<string, string>;
}
export interface UpdatedRow {
    id: string;
    /** Only the fields whose value differs from the original. */
    changes: Record<string, FieldChange>;
    /** The full current row. */
    row: Record<string, unknown>;
    formulas?: Record<string, string>;
}
export interface DeletedRow {
    id: string;
    /** The row as it was before any change. */
    row: Record<string, unknown>;
}
export interface ChangeSet {
    inserted: InsertedRow[];
    updated: UpdatedRow[];
    deleted: DeletedRow[];
}
export interface ChangeSummary {
    inserted: number;
    updated: number;
    deleted: number;
    total: number;
}
export type HistoryType = 'insert' | 'update' | 'delete';
export interface HistoryEntry {
    /** Increasing sequence number. */
    seq: number;
    type: HistoryType;
    id: string;
    field?: string;
    from?: unknown;
    to?: unknown;
    formula?: string | null;
    source?: string;
    /** ISO timestamp. */
    at: string;
}
interface Snapshot {
    data: RowData;
    formulas: CellFormulas;
}
export interface ChangeReaders {
    /** Live row data, undefined when the row does not exist. */
    current: (id: string) => RowData | undefined;
    /** Row as handed to developers (blanks decoded). */
    publicRow: (data: RowData) => Record<string, unknown>;
    /** Current cell formulas of a row. */
    formulas: (id: string) => CellFormulas;
    /** Whether a field counts as user data (calculated columns do not, unless overridden). */
    tracked: (id: string, field: string, original: CellFormulas) => boolean;
}
export declare class ChangeTracker {
    history: HistoryEntry[];
    historyLimit: number;
    private originals;
    private inserted;
    private deleted;
    private seq;
    constructor(historyLimit?: number);
    /**
     * Must be called before a row is modified, so its original values can be compared later.
     */
    touch(id: string, data: RowData | undefined, formulas: CellFormulas): void;
    private log;
    recordInsert(id: string, source?: string): void;
    recordUpdate(id: string, field: string, from: unknown, to: unknown, source?: string, formula?: string | null): void;
    /**
     * @param data the row right before it is removed
     */
    /**
     * @return whether the row had been inserted in this session (undo needs it to restore it)
     */
    recordDelete(id: string, data: RowData, formulas: CellFormulas, source?: string): boolean;
    /**
     * Undo of a delete: the row is tracked again as before (inserted, or compared with its original).
     */
    restoreDeleted(id: string, wasInserted: boolean, source?: string): void;
    isInserted(id: string): boolean;
    /**
     * Fields of a row whose value differs from the original (empty for untouched rows).
     */
    changedFields(id: string, readers: ChangeReaders): Record<string, FieldChange>;
    getChanges(readers: ChangeReaders): ChangeSet;
    summary(readers: ChangeReaders): ChangeSummary;
    /**
     * What has to be undone to restore the original state, for the given rows (all when null).
     */
    pending(ids: Set<string> | null): {
        inserted: string[];
        updated: Array<[string, Snapshot]>;
        deleted: Array<[string, Snapshot]>;
    };
    /**
     * Forgets the tracked state of the given rows (all when null): their current values become the new originals.
     */
    forget(ids: Set<string> | null): void;
    reset(): void;
    /**
     * A value that came from the server becomes the original of a field, so it is not reported as
     * a change of the user (rows without tracked state are not affected).
     */
    rebase(id: string, field: string, value: unknown): void;
}
export {};
//# sourceMappingURL=changes.d.ts.map