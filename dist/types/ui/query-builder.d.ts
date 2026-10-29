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