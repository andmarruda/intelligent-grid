/**
 * Change tracking: what was inserted, updated or deleted since the data was loaded (or since the
 * last acceptChanges()), plus a chronological history of every operation.
 *
 * Rows are snapshotted lazily, right before their first change, so untouched rows cost nothing.
 * getChanges() reports *net* changes: a value edited and edited back is not a change, a row
 * inserted and then deleted disappears, a deleted row reports its original values.
 */
import type { RowData } from '../types.ts';

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

const copyFormulas = (formulas: CellFormulas): CellFormulas => {
    if (!formulas) return undefined;
    // '' marks a typed value in a calculated column, it is not a formula to report
    const real = Object.fromEntries(Object.entries(formulas).filter(([, formula]) => formula));
    return Object.keys(real).length ? real : undefined;
};

export class ChangeTracker {
    history: HistoryEntry[] = [];
    historyLimit: number;
    private originals = new Map<string, Snapshot>();
    private inserted = new Set<string>();
    private deleted = new Map<string, Snapshot>();
    private seq = 0;

    constructor(historyLimit = 5000) {
        this.historyLimit = historyLimit;
    }

    /**
     * Must be called before a row is modified, so its original values can be compared later.
     */
    touch(id: string, data: RowData | undefined, formulas: CellFormulas): void {
        if (!data || this.inserted.has(id) || this.originals.has(id)) return;
        this.originals.set(id, { data: { ...data }, formulas: formulas ? { ...formulas } : undefined });
    }

    private log(entry: Omit<HistoryEntry, 'seq' | 'at'>): void {
        this.history.push({ seq: ++this.seq, at: new Date().toISOString(), ...entry });
        if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    }

    recordInsert(id: string, source = 'api'): void {
        this.inserted.add(id);
        this.log({ type: 'insert', id, source });
    }

    recordUpdate(id: string, field: string, from: unknown, to: unknown, source = 'api', formula?: string | null): void {
        const entry: Omit<HistoryEntry, 'seq' | 'at'> = { type: 'update', id, field, from, to, source };
        if (formula !== undefined) entry.formula = formula;
        this.log(entry);
    }

    /**
     * @param data the row right before it is removed
     */
    /**
     * @return whether the row had been inserted in this session (undo needs it to restore it)
     */
    recordDelete(id: string, data: RowData, formulas: CellFormulas, source = 'api'): boolean {
        const wasInserted = this.inserted.has(id);
        if (wasInserted) {
            this.inserted.delete(id);
        } else {
            this.deleted.set(id, this.originals.get(id) ?? { data: { ...data }, formulas: formulas ? { ...formulas } : undefined });
        }
        this.originals.delete(id);
        this.log({ type: 'delete', id, source });
        return wasInserted;
    }

    /**
     * Undo of a delete: the row is tracked again as before (inserted, or compared with its original).
     */
    restoreDeleted(id: string, wasInserted: boolean, source = 'undo'): void {
        if (wasInserted) {
            this.inserted.add(id);
        } else {
            const snapshot = this.deleted.get(id);
            this.deleted.delete(id);
            if (snapshot) this.originals.set(id, snapshot);
        }
        this.log({ type: 'insert', id, source });
    }

    isInserted(id: string): boolean {
        return this.inserted.has(id);
    }

    /**
     * Fields of a row whose value differs from the original (empty for untouched rows).
     */
    changedFields(id: string, readers: ChangeReaders): Record<string, FieldChange> {
        const original = this.originals.get(id);
        const data = readers.current(id);
        if (!original || !data) return {};
        const before = readers.publicRow(original.data);
        const after = readers.publicRow(data);
        const changes: Record<string, FieldChange> = {};
        for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (field === '_id' || !readers.tracked(id, field, original.formulas)) continue;
            if (!sameValue(before[field], after[field])) changes[field] = { from: before[field] ?? null, to: after[field] ?? null };
        }
        return changes;
    }

    getChanges(readers: ChangeReaders): ChangeSet {
        const withFormulas = <T extends object>(entry: T, formulas: CellFormulas): T => {
            const real = copyFormulas(formulas);
            return real ? { ...entry, formulas: real } : entry;
        };

        const inserted: InsertedRow[] = [];
        for (const id of this.inserted) {
            const data = readers.current(id);
            if (data) inserted.push(withFormulas({ id, row: readers.publicRow(data) }, readers.formulas(id)));
        }

        const updated: UpdatedRow[] = [];
        for (const id of this.originals.keys()) {
            const changes = this.changedFields(id, readers);
            const data = readers.current(id);
            if (data && Object.keys(changes).length) {
                updated.push(withFormulas({ id, changes, row: readers.publicRow(data) }, readers.formulas(id)));
            }
        }

        const deleted: DeletedRow[] = [...this.deleted].map(([id, snapshot]) => ({ id, row: readers.publicRow(snapshot.data) }));
        return { inserted, updated, deleted };
    }

    summary(readers: ChangeReaders): ChangeSummary {
        const changes = this.getChanges(readers);
        const inserted = changes.inserted.length;
        const updated = changes.updated.length;
        const deleted = changes.deleted.length;
        return { inserted, updated, deleted, total: inserted + updated + deleted };
    }

    /**
     * What has to be undone to restore the original state, for the given rows (all when null).
     */
    pending(ids: Set<string> | null): { inserted: string[]; updated: Array<[string, Snapshot]>; deleted: Array<[string, Snapshot]> } {
        const inScope = (id: string) => !ids || ids.has(id);
        return {
            inserted: [...this.inserted].filter(inScope),
            updated: [...this.originals].filter(([id]) => inScope(id)),
            deleted: [...this.deleted].filter(([id]) => inScope(id))
        };
    }

    /**
     * Forgets the tracked state of the given rows (all when null): their current values become the new originals.
     */
    forget(ids: Set<string> | null): void {
        if (!ids) {
            this.originals.clear();
            this.inserted.clear();
            this.deleted.clear();
            this.history = [];
            return;
        }
        for (const id of ids) {
            this.originals.delete(id);
            this.inserted.delete(id);
            this.deleted.delete(id);
        }
        this.history = this.history.filter(entry => !ids.has(entry.id));
    }

    reset(): void {
        this.forget(null);
    }

    /**
     * A value that came from the server becomes the original of a field, so it is not reported as
     * a change of the user (rows without tracked state are not affected).
     */
    rebase(id: string, field: string, value: unknown): void {
        const original = this.originals.get(id);
        if (original) original.data[field] = value;
    }
}

function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
}
