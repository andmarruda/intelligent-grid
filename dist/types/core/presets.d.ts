/**
 * Conditional format presets, like Excel's: data bars, color scales and icon sets.
 * Each one places a cell's number between the column's minimum and maximum (over the filtered rows)
 * unless the format fixes `min` / `max`.
 */
import type { ColorScaleFormat, ConditionalFormat, IconSetFormat, PresetFormat } from '../types.js';
export interface ColumnStats {
    min: number;
    max: number;
}
/** Icons from low to high; each gets a class for its color. */
export declare const ICON_SETS: Record<string, Array<{
    icon: string;
    tone: 'bad' | 'mid' | 'good';
}>>;
export declare const isPreset: (format: ConditionalFormat) => format is PresetFormat;
/** Minimum and maximum of the numbers, or null when there are none. */
export declare function columnStats(values: Iterable<unknown>): ColumnStats | null;
/** Position of a value between low and high, from 0 to 1. */
export declare function ratio(value: number, low: number, high: number): number;
/**
 * Color at a position of a scale of two or more hex colors.
 * @return rgb() color, or the nearest stop as given when a color is not hex
 */
export declare function scaleColor(colors: string[], t: number): string;
export declare const colorScaleColors: (format: ColorScaleFormat) => string[];
/**
 * Icon of an icon set for a position. Thresholds are percents of the range (default equal parts),
 * or numbers with thresholdType: 'number'.
 */
export declare function iconFor(format: IconSetFormat, value: number, stats: ColumnStats): {
    icon: string;
    tone: string;
};
//# sourceMappingURL=presets.d.ts.map