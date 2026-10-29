/**
 * Undo / redo stack. Every user action is one step; actions made of many changes (paste, fill,
 * replace all, deleting several rows) are grouped with begin() / end() so one Ctrl+Z undoes them.
 */
import type { RowData } from '../types.ts';

/** A cell as stored: its value and its own formula ('' marks a typed value in a calculated column). */
export interface CellState {
    value: unknown;
    formula: string | undefined;
}

export type UndoChange =
    | { kind: 'cell'; id: string; field: string; before: CellState; after: CellState }
    | { kind: 'insert'; id: string; data: RowData; formulas?: Record<string, string>; index: number }
    | { kind: 'delete'; id: string; data: RowData; formulas?: Record<string, string>; index: number; wasInserted: boolean }
    | { kind: 'comment'; id: string; field: string; before: string | null; after: string | null };

export interface UndoStep {
    label: string;
    changes: UndoChange[];
}

export class UndoStack {
    limit: number;
    private undoSteps: UndoStep[] = [];
    private redoSteps: UndoStep[] = [];
    private open: UndoStep | null = null;
    private depth = 0;

    constructor(limit = 100) {
        this.limit = limit;
    }

    get canUndo(): boolean {
        return this.undoSteps.length > 0;
    }

    get canRedo(): boolean {
        return this.redoSteps.length > 0;
    }

    /** Label of the step Ctrl+Z would undo. */
    get undoLabel(): string | null {
        return this.undoSteps.at(-1)?.label ?? null;
    }

    get redoLabel(): string | null {
        return this.redoSteps.at(-1)?.label ?? null;
    }

    /** Starts (or joins) a step; nested calls end up in the outermost one. */
    begin(label: string): void {
        if (this.depth++ === 0) this.open = { label, changes: [] };
    }

    end(): void {
        if (this.depth === 0) return;
        if (--this.depth > 0) return;
        const step = this.open;
        this.open = null;
        if (step && step.changes.length) this.push(step);
    }

    record(change: UndoChange): void {
        if (this.open) this.open.changes.push(change);
        else this.push({ label: change.kind === 'cell' ? 'edit' : change.kind, changes: [change] });
    }

    private push(step: UndoStep): void {
        this.undoSteps.push(step);
        if (this.undoSteps.length > this.limit) this.undoSteps.splice(0, this.undoSteps.length - this.limit);
        // a new action makes the undone ones unreachable, like in every editor
        this.redoSteps = [];
    }

    takeUndo(): UndoStep | undefined {
        const step = this.undoSteps.pop();
        if (step) this.redoSteps.push(step);
        return step;
    }

    takeRedo(): UndoStep | undefined {
        const step = this.redoSteps.pop();
        if (step) this.undoSteps.push(step);
        return step;
    }

    clear(): void {
        this.undoSteps = [];
        this.redoSteps = [];
        this.open = null;
        this.depth = 0;
    }
}
