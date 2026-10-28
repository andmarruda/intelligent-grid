import type { FormulaError } from './errors.js';
/** Any value a formula can produce: scalars, blanks (null), errors and arrays (column ranges). */
export type FormulaValue = number | string | boolean | null | FormulaError | FormulaValue[];
export type Scalar = Exclude<FormulaValue, FormulaValue[]>;
export interface TextContext {
    decimalSeparator?: string;
}
/**
 * Normalizes a value read from a row: '' and undefined are blank (null), stored error codes become errors.
 */
export declare function fromCell(value: unknown): FormulaValue;
export declare function toNumber(value: unknown): number;
/**
 * Number or null, never throws. Used where Excel silently skips non numeric values (criteria, lookups).
 */
export declare function asNumber(value: unknown): number | null;
export declare function toText(value: unknown, ctx?: TextContext): string;
export declare function formatGeneral(number: number, decimalSeparator?: string): string;
export declare function toBoolean(value: unknown): boolean;
/**
 * Excel comparison: numbers < text < booleans, text is case insensitive, blank equals 0 / "" / FALSE.
 */
export declare function compareValues(a: unknown, b: unknown): -1 | 0 | 1;
/**
 * Element-wise application for array arithmetic ([qty]*[price]); scalars broadcast.
 * Errors stay inside their element instead of failing the whole array.
 */
export declare function lift2(a: FormulaValue, b: FormulaValue, fn: (x: FormulaValue, y: FormulaValue) => FormulaValue): FormulaValue;
export declare function lift1(a: FormulaValue, fn: (x: FormulaValue) => FormulaValue): FormulaValue;
//# sourceMappingURL=values.d.ts.map