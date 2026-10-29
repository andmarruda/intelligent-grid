/**
 * Fill handle series, following Excel's AutoFill:
 * - numbers: two or more values continue their step (1, 2 → 3, 4), one value is copied;
 * - dates: continue their step, one date adds one day;
 * - text ending in a number continues the number ("Item 1" → "Item 2");
 * - anything else repeats the source block.
 */
import { DATE_TYPES } from './columns.ts';
import { serialToISO, toSerial } from '../formula/dates.ts';
import type { ColumnType } from '../types.ts';

const TRAILING_NUMBER = /^(.*?)(\d+)$/;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Constant step between the values, or null when they are not an arithmetic series. */
function stepOf(values: number[]): number | null {
    if (values.length < 2) return null;
    const step = values[1]! - values[0]!;
    for (let i = 2; i < values.length; i++) {
        if (Math.abs(values[i]! - values[i - 1]! - step) > 1e-9) return null;
    }
    return step;
}

/**
 * Next values after the source.
 * @param source values of the source cells, in fill direction
 * @param count how many values to produce
 * @param type column type (dates are stored as ISO strings)
 */
export function fillSeries(source: unknown[], count: number, type: ColumnType = 'text'): unknown[] {
    if (!source.length || count <= 0) return [];
    const repeat = () => Array.from({ length: count }, (_, i) => source[i % source.length]);

    if (DATE_TYPES.has(type) && source.every(v => typeof v === 'string' && toSerial(v) !== null)) {
        const serials = source.map(v => toSerial(v)!);
        const step = source.length === 1 ? 1 : stepOf(serials);
        if (step === null) return repeat();
        const last = serials.at(-1)!;
        return Array.from({ length: count }, (_, i) => serialToISO(last + step * (i + 1), type === 'datetime'));
    }

    if (source.every(isNumber)) {
        const step = stepOf(source);
        if (step === null) return repeat();
        const last = source.at(-1)!;
        // round away floating point noise from steps like 0.1
        return Array.from({ length: count }, (_, i) => Number((last + step * (i + 1)).toPrecision(12)));
    }

    if (source.every(v => typeof v === 'string' && TRAILING_NUMBER.test(v))) {
        const parts = (source as string[]).map(v => TRAILING_NUMBER.exec(v)!);
        const prefix = parts[0]![1];
        if (parts.every(p => p[1] === prefix)) {
            const numbers = parts.map(p => Number(p[2]));
            const step = numbers.length === 1 ? 1 : stepOf(numbers);
            if (step !== null) {
                const width = parts[0]![2]!.length;
                const last = numbers.at(-1)!;
                return Array.from({ length: count }, (_, i) => {
                    const n = last + step * (i + 1);
                    // keep leading zeros ("A001" → "A002")
                    return n < 0 ? `${prefix}${n}` : `${prefix}${String(n).padStart(width, '0')}`;
                });
            }
        }
    }

    return repeat();
}

/**
 * Values for cells filled before the source (dragging up or left): the series run backwards.
 * @return values in display order, ending next to the source
 */
export function fillSeriesBackward(source: unknown[], count: number, type: ColumnType = 'text'): unknown[] {
    return fillSeries([...source].reverse(), count, type).reverse();
}
