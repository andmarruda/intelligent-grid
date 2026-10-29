/**
 * Conditional format presets, like Excel's: data bars, color scales and icon sets.
 * Each one places a cell's number between the column's minimum and maximum (over the filtered rows)
 * unless the format fixes `min` / `max`.
 */
import type { ColorScaleFormat, ConditionalFormat, IconSetFormat, PresetFormat } from '../types.ts';

export interface ColumnStats {
    min: number;
    max: number;
}

/** Icons from low to high; each gets a class for its color. */
export const ICON_SETS: Record<string, Array<{ icon: string; tone: 'bad' | 'mid' | 'good' }>> = {
    arrows: [{ icon: '↓', tone: 'bad' }, { icon: '→', tone: 'mid' }, { icon: '↑', tone: 'good' }],
    traffic: [{ icon: '●', tone: 'bad' }, { icon: '●', tone: 'mid' }, { icon: '●', tone: 'good' }],
    flags: [{ icon: '⚑', tone: 'bad' }, { icon: '⚑', tone: 'mid' }, { icon: '⚑', tone: 'good' }],
    stars: [{ icon: '☆', tone: 'mid' }, { icon: '⯪', tone: 'mid' }, { icon: '★', tone: 'mid' }]
};

/** Red, yellow, green: Excel's default three color scale. */
const DEFAULT_COLORS = ['#f8696b', '#ffeb84', '#63be7b'];

export const isPreset = (format: ConditionalFormat): format is PresetFormat =>
    format.type === 'dataBar' || format.type === 'colorScale' || format.type === 'iconSet';

/** Minimum and maximum of the numbers, or null when there are none. */
export function columnStats(values: Iterable<unknown>): ColumnStats | null {
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    return min === Infinity ? null : { min, max };
}

/** Position of a value between low and high, from 0 to 1. */
export function ratio(value: number, low: number, high: number): number {
    if (high <= low) return 1;
    return Math.max(0, Math.min(1, (value - low) / (high - low)));
}

function parseHex(color: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
    if (!match) return null;
    const hex = match[1]!.length === 3 ? [...match[1]!].map(c => c + c).join('') : match[1]!;
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Color at a position of a scale of two or more hex colors.
 * @return rgb() color, or the nearest stop as given when a color is not hex
 */
export function scaleColor(colors: string[], t: number): string {
    if (colors.length === 1) return colors[0]!;
    const scaled = Math.max(0, Math.min(1, t)) * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = parseHex(colors[index]!);
    const b = parseHex(colors[index + 1]!);
    if (!a || !b) return colors[Math.round(scaled)]!;
    const mix = a.map((channel, i) => Math.round(channel + (b[i]! - channel) * local));
    return `rgb(${mix.join(', ')})`;
}

export const colorScaleColors = (format: ColorScaleFormat): string[] =>
    format.colors && format.colors.length ? format.colors : DEFAULT_COLORS;

/**
 * Icon of an icon set for a position. Thresholds are percents of the range (default equal parts),
 * or numbers with thresholdType: 'number'.
 */
export function iconFor(format: IconSetFormat, value: number, stats: ColumnStats): { icon: string; tone: string } {
    const set = Array.isArray(format.icons)
        ? format.icons.map(icon => ({ icon, tone: 'custom' }))
        : ICON_SETS[format.icons ?? 'arrows'] ?? ICON_SETS.arrows!;
    const icons = format.reverse ? [...set].reverse() : set;
    const parts = icons.length;
    const thresholds = format.thresholds ?? Array.from({ length: parts - 1 }, (_, i) => ((i + 1) * 100) / parts);
    const position = format.thresholdType === 'number' ? value : ratio(value, format.min ?? stats.min, format.max ?? stats.max) * 100;
    let index = 0;
    while (index < thresholds.length && position >= thresholds[index]!) index++;
    return icons[Math.min(index, parts - 1)]!;
}
