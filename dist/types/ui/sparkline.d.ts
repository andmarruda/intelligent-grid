/**
 * Sparklines: a small line, bar or win/loss chart of a list of numbers, drawn as inline SVG in a cell.
 */
import type { SparklineOptions } from '../types.js';
/** Numbers of a value: an array, or text such as "1, 2, 3". Other entries are skipped. */
export declare function sparklineValues(value: unknown): number[];
export declare function sparkline(values: number[], { type, color, negativeColor, width, height, min, max }?: SparklineOptions): SVGSVGElement;
//# sourceMappingURL=sparkline.d.ts.map