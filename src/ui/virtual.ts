/**
 * Virtualization math: which rows and columns are visible, and how much space the others take.
 * Kept free of DOM code so it can be unit tested and reused by every renderer.
 */

/**
 * Vertical layout of a list of rows with a default height and measured exceptions
 * (rows with wrapped text are taller). Offsets are prefix sums, rebuilt lazily.
 */
export class RowLayout {
    defaultHeight: number;
    private keys: string[] = [];
    private heights = new Map<string, number>();
    private offsets = new Float64Array(1);
    private dirtyFrom = 0;

    constructor(defaultHeight: number) {
        this.defaultHeight = defaultHeight;
    }

    get count(): number {
        return this.keys.length;
    }

    /** The rows, in display order. Measured heights of rows that stay are kept. */
    setKeys(keys: string[]): void {
        this.keys = keys;
        if (this.offsets.length < keys.length + 1) this.offsets = new Float64Array(Math.max(keys.length + 1, this.offsets.length * 2));
        this.dirtyFrom = 0;
    }

    setDefaultHeight(height: number): void {
        if (height > 0 && height !== this.defaultHeight) {
            this.defaultHeight = height;
            this.dirtyFrom = 0;
        }
    }

    heightOf(index: number): number {
        const key = this.keys[index];
        return key === undefined ? this.defaultHeight : this.heights.get(key) ?? this.defaultHeight;
    }

    /**
     * Records a measured height.
     * @return whether the layout changed
     */
    measure(index: number, height: number): boolean {
        const key = this.keys[index];
        if (key === undefined || Math.abs(this.heightOf(index) - height) < 0.5) return false;
        if (Math.abs(height - this.defaultHeight) < 0.5) this.heights.delete(key);
        else this.heights.set(key, height);
        this.dirtyFrom = Math.min(this.dirtyFrom, index);
        return true;
    }

    forget(key: string): void {
        this.heights.delete(key);
        this.dirtyFrom = 0;
    }

    private ensure(): void {
        if (this.dirtyFrom > this.keys.length) return;
        const offsets = this.offsets;
        for (let i = this.dirtyFrom; i < this.keys.length; i++) offsets[i + 1] = offsets[i]! + this.heightOf(i);
        this.dirtyFrom = this.keys.length + 1;
    }

    /** Top of a row, in pixels. */
    offsetOf(index: number): number {
        this.ensure();
        return this.offsets[Math.max(0, Math.min(index, this.keys.length))]!;
    }

    get total(): number {
        return this.offsetOf(this.keys.length);
    }

    /** Index of the row at a vertical position (binary search). */
    indexAt(y: number): number {
        this.ensure();
        let low = 0;
        let high = this.keys.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (this.offsets[mid]! <= y) low = mid;
            else high = mid - 1;
        }
        return Math.max(0, low);
    }

    /**
     * Rows to render for a viewport, with extra rows above and below for smooth scrolling.
     * @return [start, end) indexes
     */
    window(scrollTop: number, viewportHeight: number, overscan: number): [number, number] {
        if (!this.keys.length) return [0, 0];
        const start = Math.max(0, this.indexAt(scrollTop) - overscan);
        const last = this.indexAt(scrollTop + Math.max(viewportHeight, 1));
        const end = Math.min(this.keys.length, last + 1 + overscan);
        return [start, end];
    }
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
export function columnWindow(widths: number[], scrollLeft: number, viewportWidth: number, overscan: number): ColumnWindow {
    if (!widths.length) return { start: 0, end: 0, before: 0, after: 0 };
    let x = 0;
    let first = widths.length - 1;
    for (let i = 0; i < widths.length; i++) {
        if (x + widths[i]! > scrollLeft) {
            first = i;
            break;
        }
        x += widths[i]!;
    }
    let last = first;
    let right = x;
    for (let i = first; i < widths.length; i++) {
        right += widths[i]!;
        last = i;
        if (right >= scrollLeft + viewportWidth) break;
    }
    const start = Math.max(0, first - overscan);
    const end = Math.min(widths.length, last + 1 + overscan);
    let before = 0;
    for (let i = 0; i < start; i++) before += widths[i]!;
    let after = 0;
    for (let i = end; i < widths.length; i++) after += widths[i]!;
    return { start, end, before, after };
}
