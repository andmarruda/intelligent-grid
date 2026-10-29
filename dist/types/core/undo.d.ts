/**
 * Undo / redo stack. Every user action is one step; actions made of many changes (paste, fill,
 * replace all, deleting several rows) are grouped with begin() / end() so one Ctrl+Z undoes them.
 */
import type { RowData } from '../types.js';
/** A cell as stored: its value and its own formula ('' marks a typed value in a calculated column). */
export interface CellState {
    value: unknown;
    formula: string | undefined;
}
export type UndoChange = {
    kind: 'cell';
    id: string;
    field: string;
    before: CellState;
    after: CellState;
} | {
    kind: 'insert';
    id: string;
    data: RowData;
    formulas?: Record<string, string>;
    index: number;
} | {
    kind: 'delete';
    id: string;
    data: RowData;
    formulas?: Record<string, string>;
    index: number;
    wasInserted: boolean;
} | {
    kind: 'comment';
    id: string;
    field: string;
    before: string | null;
    after: string | null;
};
export interface UndoStep {
    label: string;
    changes: UndoChange[];
}
export declare class UndoStack {
    limit: number;
    private undoSteps;
    private redoSteps;
    private open;
    private depth;
    constructor(limit?: number);
    get canUndo(): boolean;
    get canRedo(): boolean;
    /** Label of the step Ctrl+Z would undo. */
    get undoLabel(): string | null;
    get redoLabel(): string | null;
    /** Starts (or joins) a step; nested calls end up in the outermost one. */
    begin(label: string): void;
    end(): void;
    record(change: UndoChange): void;
    private push;
    takeUndo(): UndoStep | undefined;
    takeRedo(): UndoStep | undefined;
    clear(): void;
}
//# sourceMappingURL=undo.d.ts.map