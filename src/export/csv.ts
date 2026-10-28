/**
 * CSV export (RFC 4180). Values are raw by default so spreadsheets keep numbers as numbers;
 * "formatted: true" writes what the grid shows instead.
 */
import { isBlank } from '../core/store.ts';

export interface CsvColumn {
    field: string;
    title: string;
}

export interface CsvOptions<C extends CsvColumn> {
    delimiter?: string;
    header?: boolean;
    formatted?: boolean;
    sanitize?: boolean;
    decimal?: string;
    lineBreak?: string;
    format?: (value: unknown, column: C, row: Record<string, unknown>) => unknown;
}

const DANGEROUS = /^[=+\-@\t\r]/;

/**
 */
export function toCSV<C extends CsvColumn>(rows: Array<Record<string, unknown>>, columns: C[], options: CsvOptions<C> = {}): string {
    const {
        delimiter = ',',
        header = true,
        formatted = false,
        // prefixes text starting with = + - @ so spreadsheets do not run it (CSV injection)
        sanitize = true,
        decimal = '.',
        lineBreak = '\r\n',
        format = (value: unknown) => value
    } = options;

    const escape = (text: unknown): string => {
        const value = String(text);
        return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    };

    const cell = (value: unknown, column: C, row: Record<string, unknown>): string => {
        if (formatted) value = format(value, column, row);
        if (isBlank(value)) return '';
        if (typeof value === 'number') return escape(decimal === '.' ? String(value) : String(value).replace('.', decimal));
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        let text = String(value);
        if (sanitize && DANGEROUS.test(text) && !/^-?\d/.test(text)) text = `'${text}`;
        return escape(text);
    };

    const lines = [];
    if (header) lines.push(columns.map(c => escape(c.title)).join(delimiter));
    for (const row of rows) lines.push(columns.map(c => cell(row[c.field], c, row)).join(delimiter));
    return lines.join(lineBreak);
}
