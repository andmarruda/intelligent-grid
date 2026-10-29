import type { IntelligentGrid } from './grid.js';
export type FindMode = 'find' | 'replace' | 'goto';
export declare class FindBar {
    element: HTMLDivElement;
    private grid;
    private mode;
    private input;
    private replaceInput;
    private matchCase;
    private wholeCell;
    private count;
    private replaceRow;
    private findOnly;
    private matches;
    private current;
    private timer;
    constructor(grid: IntelligentGrid);
    get isOpen(): boolean;
    open(mode?: FindMode): void;
    close(): void;
    private options;
    private schedule;
    /** Finds every match and moves to the first one at or after the active cell. */
    search(): void;
    private step;
    private select;
    private updateCount;
    private replaceCurrent;
    private replaceAll;
    private goTo;
}
//# sourceMappingURL=find-bar.d.ts.map