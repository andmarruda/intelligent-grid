import type { ColumnType } from '../types.js';
/**
 * Next values after the source.
 * @param source values of the source cells, in fill direction
 * @param count how many values to produce
 * @param type column type (dates are stored as ISO strings)
 */
export declare function fillSeries(source: unknown[], count: number, type?: ColumnType): unknown[];
/**
 * Values for cells filled before the source (dragging up or left): the series run backwards.
 * @return values in display order, ending next to the source
 */
export declare function fillSeriesBackward(source: unknown[], count: number, type?: ColumnType): unknown[];
//# sourceMappingURL=fill.d.ts.map