/**
 * Column schema: types, defaults, display formatting, input parsing and validation.
 *
 * Types follow what Excel offers for cells: text, number, integer, currency, percent (stored as a
 * fraction, 0.15 = 15%), date / datetime (stored as ISO strings), boolean and select.
 */
import { isDateFormat } from '../formula/numfmt.js';
import type { Column, ColumnDefinition, ColumnType, Row } from '../types.js';
export declare const TYPES: readonly ColumnType[];
export declare const NUMERIC_TYPES: ReadonlySet<ColumnType>;
export declare const DATE_TYPES: ReadonlySet<ColumnType>;
export interface ColumnDefaults {
    locale: string;
    editable: boolean;
    cellFormulas: boolean;
    currency?: string;
}
/** Result of parsing user input: a value, or an error message key. */
export type ParseResult = {
    value: unknown;
    error?: undefined;
} | {
    error: string;
    value?: undefined;
};
export declare function normalizeColumn(definition: ColumnDefinition, grid: ColumnDefaults): Column;
/** The parts of a column the formatter reads (footers format with a partial column). */
export type FormatColumn = Pick<Column, 'type'> & Partial<Pick<Column, 'format' | 'decimals' | 'currency' | 'options'>>;
/**
 * Text shown in the cell.
 */
export declare function formatCell(value: unknown, column: FormatColumn, row: Record<string, unknown>, locale: string): string;
/**
 * Excel number format code for the XLSX export (the same display the grid shows).
 */
export declare function excelFormatCode(column: Column, locale: string): string | null;
export declare function localeDatePattern(locale: string): string;
/**
 * Turns what the user typed (or pasted) into a stored value.
 */
export declare function parseInput(input: unknown, column: Column, locale: string): ParseResult;
/**
 * Locale aware number parsing that also accepts currency symbols and percent signs.
 */
export declare function parseNumberText(text: string, locale: string): number | null;
export declare function parseDateText(text: string, locale: string, withTime: boolean): string | null;
/**
 * Value for an <input> while editing.
 */
export declare function editorText(value: unknown, column: Column, locale: string): string;
/**
 * Validation rules: column.validate is an object {required, min, max, minLength, maxLength, pattern,
 * message} and/or a function (value, row, column) => true | false | 'error message'.
 * @return error message key or text, null when valid
 */
export declare function validateValue(value: unknown, column: Column, row: Row | null): string | null;
export { isDateFormat };
//# sourceMappingURL=columns.d.ts.map