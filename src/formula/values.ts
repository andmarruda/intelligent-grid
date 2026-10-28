/**
 * Excel coercion rules shared by operators and functions.
 * Functions signal failures by throwing FormulaError; the evaluator turns it back into a value.
 */
import { ERRORS, err, isError, reviveError } from './errors.ts';
import type { FormulaError } from './errors.ts';
import { isISODate, toSerial } from './dates.ts';

/** Any value a formula can produce: scalars, blanks (null), errors and arrays (column ranges). */
export type FormulaValue = number | string | boolean | null | FormulaError | FormulaValue[];

export type Scalar = Exclude<FormulaValue, FormulaValue[]>;

export interface TextContext {
    decimalSeparator?: string;
}

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Normalizes a value read from a row: '' and undefined are blank (null), stored error codes become errors.
 */
export function fromCell(value: unknown): FormulaValue {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) return toSerial(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return reviveError(value);
    if (Array.isArray(value)) return value.map(fromCell);
    return String(value);
}

export function toNumber(value: unknown): number {
    if (isError(value)) throw value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw err(ERRORS.NUM);
        return value;
    }
    if (value === null || value === undefined) return 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (Array.isArray(value)) {
        if (value.length === 1) return toNumber(value[0]);
        throw err(ERRORS.VALUE);
    }
    if (typeof value === 'string') {
        const text = value.trim();
        if (NUMERIC.test(text)) return Number(text);
        if (/^[+-]?(\d+\.?\d*|\.\d+)%$/.test(text)) return Number(text.slice(0, -1)) / 100;
        if (isISODate(text)) return toSerial(text)!;
    }
    throw err(ERRORS.VALUE);
}

/**
 * Number or null, never throws. Used where Excel silently skips non numeric values (criteria, lookups).
 */
export function asNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const text = value.trim();
        if (NUMERIC.test(text)) return Number(text);
        if (isISODate(text)) return toSerial(text);
    }
    return null;
}

export function toText(value: unknown, ctx?: TextContext): string {
    if (isError(value)) throw value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') return formatGeneral(value, ctx?.decimalSeparator ?? '.');
    if (Array.isArray(value)) {
        if (value.length === 1) return toText(value[0], ctx);
        throw err(ERRORS.VALUE);
    }
    return String(value);
}

export function formatGeneral(number: number, decimalSeparator = '.'): string {
    if (Number.isInteger(number)) return String(number);
    // Excel shows up to 15 significant digits
    const text = String(Number(number.toPrecision(15)));
    return decimalSeparator === '.' ? text : text.replace('.', decimalSeparator);
}

export function toBoolean(value: unknown): boolean {
    if (isError(value)) throw value;
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return value !== 0;
    if (Array.isArray(value)) {
        if (value.length === 1) return toBoolean(value[0]);
        throw err(ERRORS.VALUE);
    }
    const upper = String(value).trim().toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    throw err(ERRORS.VALUE);
}

const typeRank = (value: unknown): number => {
    if (typeof value === 'string') return 1;
    if (typeof value === 'boolean') return 2;
    return 0;
};

/**
 * Excel comparison: numbers < text < booleans, text is case insensitive, blank equals 0 / "" / FALSE.
 */
export function compareValues(a: unknown, b: unknown): -1 | 0 | 1 {
    if (isError(a)) throw a;
    if (isError(b)) throw b;

    if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;

    // dates arrive as ISO strings, compare them with numbers (serials) as numbers
    if (typeof a === 'string' && typeof b === 'number' && isISODate(a)) a = toSerial(a);
    if (typeof b === 'string' && typeof a === 'number' && isISODate(b)) b = toSerial(b);

    const rankA = typeRank(a);
    const rankB = typeRank(b);
    if (rankA !== rankB) return rankA < rankB ? -1 : 1;

    if (typeof a === 'string' && typeof b === 'string') {
        const x = a.toLowerCase();
        const y = b.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
    }

    if (a === b) return 0;
    return (a as number) < (b as number) ? -1 : 1;
}

/**
 * Element-wise application for array arithmetic ([qty]*[price]); scalars broadcast.
 * Errors stay inside their element instead of failing the whole array.
 */
export function lift2(a: FormulaValue, b: FormulaValue, fn: (x: FormulaValue, y: FormulaValue) => FormulaValue): FormulaValue {
    const apply = (x: FormulaValue, y: FormulaValue): FormulaValue => {
        try {
            return fn(x, y);
        } catch (e) {
            if (isError(e)) return e;
            throw e;
        }
    };

    const arrA = Array.isArray(a);
    const arrB = Array.isArray(b);
    if (!arrA && !arrB) return apply(a, b);

    const length = arrA && arrB ? Math.max(a.length, b.length) : (arrA ? a.length : (b as FormulaValue[]).length);
    const out: FormulaValue[] = new Array(length);
    for (let i = 0; i < length; i++) {
        const x = arrA ? (i < a.length ? a[i]! : err(ERRORS.NA)) : a;
        const y = arrB ? (i < b.length ? b[i]! : err(ERRORS.NA)) : b;
        out[i] = apply(x, y);
    }
    return out;
}

export function lift1(a: FormulaValue, fn: (x: FormulaValue) => FormulaValue): FormulaValue {
    return lift2(a, null, x => fn(x));
}
