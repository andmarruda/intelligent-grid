/**
 * Virtualization math: which rows and columns are visible, and how much space the others take.
 * Kept free of DOM code so it can be unit tested and reused by every renderer.
 */
/**
 * Vertical layout of a list of rows with a default height and measured exceptions
 * (rows with wrapped text are taller). Offsets are prefix sums, rebuilt lazily.
 */
export declare class RowLayout {
    defaultHeight: number;
    private keys;
    private heights;
    private offsets;
    private dirtyFrom;
    constructor(defaultHeight: number);
    get count(): number;
    /** The rows, in display order. Measured heights of rows that stay are kept. */
    setKeys(keys: string[]): void;
    setDefaultHeight(height: number): void;
    heightOf(index: number): number;
    /**
     * Records a measured height.
     * @return whether the layout changed
     */
    measure(index: number, height: number): boolean;
    forget(key: string): void;
    private ensure;
    /** Top of a row, in pixels. */
    offsetOf(index: number): number;
    get total(): number;
    /** Index of the row at a vertical position (binary search). */
    indexAt(y: number): number;
    /**
     * Rows to render for a viewport, with extra rows above and below for smooth scrolling.
     * @return [start, end) indexes
     */
    window(scrollTop: number, viewportHeight: number, overscan: number): [number, number];
}
export interface ColumnWindow {
    /** [start, end) of the scrollable columns to render. */
    start: number;
    end: number;
    /** Width of the scrollable columns before start and after end. */
    before: number;
    after: number;
}
/**
 * Scrollable columns to render for a horizontal viewport.
 * @param widths widths of the scrollable (not pinned) columns
 * @param scrollLeft scroll position relative to the first scrollable column
 * @param viewportWidth width available for scrollable columns
 * @param overscan extra columns on each side
 */
export declare function columnWindow(widths: number[], scrollLeft: number, viewportWidth: number, overscan: number): ColumnWindow;
//# sourceMappingURL=virtual.d.ts.map