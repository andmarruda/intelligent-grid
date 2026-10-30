import type { IntelligentGrid } from './grid.js';
export declare class QueryBuilder {
    element: HTMLDivElement;
    private grid;
    private draft;
    private body;
    private json;
    private preview;
    private previewTimer;
    constructor(grid: IntelligentGrid);
    get isOpen(): boolean;
    open(): void;
    /** Starts the draft again from the applied query (also when the query changes while the panel is open). */
    reload(): void;
    close(): void;
    toggle(): void;
    private apply;
    private clear;
    private columns;
    private newRule;
    private changed;
    private render;
    private renderGroup;
    private renderRule;
    private operatorLabel;
    private renderValue;
}
//# sourceMappingURL=query-builder.d.ts.map