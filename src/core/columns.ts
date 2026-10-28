/**
 * Column schema: types, defaults, display formatting, input parsing and validation.
 *
 * Types follow what Excel offers for cells: text, number, integer, currency, percent (stored as a
 * fraction, 0.15 = 15%), date / datetime (stored as ISO strings), boolean and select.
 */
import { formatValue, isDateFormat, localeSeparators } from '../formula/numfmt.ts';
import { partsToSerial, serialToISO, toSerial } from '../formula/dates.ts';
import { isErrorCode } from '../formula/errors.ts';
import { isBlank } from './store.ts';
import type { BuiltInEditor, Column, ColumnDefinition, ColumnType, Row, RowData, SelectOption, ValidationRule } from '../types.ts';

export const TYPES: readonly ColumnType[] = ['text', 'number', 'integer', 'currency', 'percent', 'date', 'datetime', 'boolean', 'select'];
export const NUMERIC_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>(['number', 'integer', 'currency', 'percent']);
export const DATE_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>(['date', 'datetime']);

const DEFAULT_CURRENCY: Record<string, string> = { 'pt-BR': 'BRL', 'en-US': 'USD', 'en-GB': 'GBP', 'es-ES': 'EUR', 'de-DE': 'EUR', 'fr-FR': 'EUR' };

export interface ColumnDefaults {
    locale: string;
    editable: boolean;
    cellFormulas: boolean;
    currency?: string;
}

/** Result of parsing user input: a value, or an error message key. */
export type ParseResult = { value: unknown; error?: undefined } | { error: string; value?: undefined };

export function normalizeColumn(definition: ColumnDefinition, grid: ColumnDefaults): Column {
    if (!definition || typeof definition.field !== 'string' || !definition.field) {
        throw new Error('Every column needs a "field"');
    }
    if (/[.$]/.test(definition.field)) {
        throw new Error(`Column field "${definition.field}" cannot contain "." or "$" (reserved by SorlaDB)`);
    }

    const type: ColumnType = definition.type ?? (definition.options ? 'select' : 'text');
    if (!TYPES.includes(type)) throw new Error(`Unknown column type "${String(type)}"`);

    const isFormula = typeof definition.formula === 'string';
    const { options, editor, ...rest } = definition;
    return {
        title: definition.field,
        width: null,
        minWidth: 60,
        visible: true,
        sortable: true,
        filterable: true,
        resizable: true,
        editable: isFormula ? false : grid.editable,
        allowFormulas: grid.cellFormulas,
        decimals: type === 'integer' ? 0 : type === 'currency' ? 2 : null,
        currency: grid.currency ?? DEFAULT_CURRENCY[grid.locale] ?? 'USD',
        align: NUMERIC_TYPES.has(type) ? 'right' : type === 'boolean' ? 'center' : 'left',
        conditionalFormats: [],
        html: false,
        ...rest,
        type,
        options: options ? normalizeOptions(options) : undefined,
        editor: editor ?? defaultEditor(type)
    };
}

function normalizeOptions(options: NonNullable<ColumnDefinition['options']>): SelectOption[] {
    return options.map(option => typeof option === 'object' && option !== null
        ? { value: option.value, label: String(option.label ?? option.value) }
        : { value: option, label: String(option) });
}

function defaultEditor(type: ColumnType): BuiltInEditor {
    if (NUMERIC_TYPES.has(type)) return 'number';
    if (type === 'date') return 'date';
    if (type === 'datetime') return 'datetime';
    if (type === 'boolean') return 'checkbox';
    if (type === 'select') return 'select';
    return 'text';
}

const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = locale + JSON.stringify(options);
    let formatter = numberFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, options);
        numberFormatters.set(key, formatter);
    }
    return formatter;
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = locale + JSON.stringify(options);
    let formatter = dateFormatters.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, options);
        dateFormatters.set(key, formatter);
    }
    return formatter;
}

/** The parts of a column the formatter reads (footers format with a partial column). */
export type FormatColumn = Pick<Column, 'type'> & Partial<Pick<Column, 'format' | 'decimals' | 'currency' | 'options'>>;

/**
 * Text shown in the cell.
 */
export function formatCell(value: unknown, column: FormatColumn, row: Record<string, unknown>, locale: string): string {
    if (isErrorCode(value)) return value;
    if (typeof column.format === 'function') return String(column.format(value, row as RowData, column as Column) ?? '');
    if (isBlank(value)) return '';
    if (typeof column.format === 'string') return formatValue(value, column.format, locale);

    switch (column.type) {
        case 'number':
        case 'integer':
        case 'currency':
        case 'percent': {
            const number = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(number)) return String(value);
            const decimals = column.decimals ?? null;
            const options: Intl.NumberFormatOptions = {
                style: column.type === 'currency' ? 'currency' : column.type === 'percent' ? 'percent' : 'decimal',
                minimumFractionDigits: decimals ?? 0,
                maximumFractionDigits: decimals ?? (column.type === 'percent' ? 2 : 4)
            };
            if (column.type === 'currency') options.currency = column.currency ?? 'USD';
            return numberFormatter(locale, options).format(number);
        }
        case 'date':
        case 'datetime': {
            const serial = toSerial(value);
            if (serial === null) return String(value);
            // serials are wall-clock values, format them in UTC so the timezone never shifts the day
            const date = new Date(`${serialToISO(serial, true)}Z`);
            const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' };
            if (column.type === 'datetime') Object.assign(options, { hour: '2-digit', minute: '2-digit' });
            return dateFormatter(locale, options).format(date);
        }
        case 'boolean':
            return value === true ? '✓' : value === false ? '✗' : String(value);
        case 'select': {
            const option = column.options?.find(o => o.value === value);
            return option ? option.label : String(value);
        }
        default:
            return String(value);
    }
}

/**
 * Excel number format code for the XLSX export (the same display the grid shows).
 */
export function excelFormatCode(column: Column, locale: string): string | null {
    if (typeof column.format === 'string') return column.format;
    const decimals = column.decimals;
    const fraction = (places: number) => places > 0 ? '.' + '0'.repeat(places) : '';

    switch (column.type) {
        case 'integer': return '#,##0';
        case 'number': return decimals === null || decimals === undefined ? 'General' : `#,##0${fraction(decimals)}`;
        case 'percent': return `0${fraction(decimals ?? 0)}%`;
        case 'currency': {
            const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: column.currency }).formatToParts(1);
            const symbol = parts.find(p => p.type === 'currency')?.value ?? column.currency;
            const symbolFirst = parts.findIndex(p => p.type === 'currency') < parts.findIndex(p => p.type === 'integer');
            const number = `#,##0${fraction(decimals ?? 2)}`;
            const quoted = `"${symbol}"`;
            return symbolFirst ? `${quoted} ${number};-${quoted} ${number}` : `${number} ${quoted};-${number} ${quoted}`;
        }
        case 'date': return localeDatePattern(locale);
        case 'datetime': return `${localeDatePattern(locale)} hh:mm`;
        default: return null;
    }
}

export function localeDatePattern(locale: string): string {
    const parts = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date(Date.UTC(2026, 0, 31)));
    const tokens: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = { day: 'dd', month: 'mm', year: 'yyyy' };
    return parts.map(p => p.type === 'literal' ? p.value : tokens[p.type] ?? '').join('');
}

/**
 * Turns what the user typed (or pasted) into a stored value.
 */
export function parseInput(input: unknown, column: Column, locale: string): ParseResult {
    if (typeof column.parse === 'function') {
        try {
            return { value: column.parse(input, column) };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    }

    if (typeof input !== 'string') {
        if (input instanceof Date) return { value: serialToISO(toSerial(input)!, column.type === 'datetime') };
        return { value: input };
    }

    const text = input.trim();
    if (text === '') return { value: null };

    switch (column.type) {
        case 'number':
        case 'integer':
        case 'currency':
        case 'percent': {
            const number = parseNumberText(text, locale);
            if (number === null) return { error: 'invalidNumber' };
            if (column.type === 'percent' && !text.endsWith('%')) return { value: number / 100 };
            if (column.type === 'percent') return { value: number };
            if (column.type === 'integer' && !Number.isInteger(number)) return { error: 'invalidInteger' };
            return { value: number };
        }
        case 'date':
        case 'datetime': {
            const iso = parseDateText(text, locale, column.type === 'datetime');
            return iso === null ? { error: 'invalidDate' } : { value: iso };
        }
        case 'boolean': {
            const lower = text.toLowerCase();
            if (['true', '1', 'yes', 'sim', 'x', 'verdadeiro', '✓'].includes(lower)) return { value: true };
            if (['false', '0', 'no', 'não', 'nao', 'falso', '✗'].includes(lower)) return { value: false };
            return { error: 'invalidBoolean' };
        }
        case 'select': {
            const lower = text.toLowerCase();
            const option = column.options?.find(o => String(o.value).toLowerCase() === lower || o.label.toLowerCase() === lower);
            if (option) return { value: option.value };
            return column.strict === false ? { value: text } : { error: 'invalidOption' };
        }
        default:
            return { value: input };
    }
}

/**
 * Locale aware number parsing that also accepts currency symbols and percent signs.
 */
export function parseNumberText(text: string, locale: string): number | null {
    const { group, decimal } = localeSeparators(locale);
    let value = text.replace(/[^\d.,\-+%eE]/g, '');
    const percent = value.endsWith('%');
    value = value.replace('%', '');
    if (!value) return null;

    const hasGroup = value.includes(group);
    const hasDecimal = value.includes(decimal);
    if (decimal === ',' && !hasDecimal && hasGroup && !/^\d{1,3}(\.\d{3})+$/.test(value)) {
        // "1.5" typed in a comma-decimal locale is a decimal, "1.500" is fifteen hundred
        value = value.replace('.', ',');
    }
    const normalized = value.split(group).join('').replace(decimal, '.');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(normalized)) return null;
    const number = Number(normalized);
    return percent ? number / 100 : number;
}

export function parseDateText(text: string, locale: string, withTime: boolean): string | null {
    const serial = toSerial(text);
    if (serial !== null) return withTime ? serialToISO(serial, true).slice(0, 16) : serialToISO(serial);

    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (!match) return null;
    const [, a = '', b = '', yearText = '', h = '0', mi = '0', s = '0'] = match;
    let year = Number(yearText);
    if (year < 100) year += year < 30 ? 2000 : 1900;
    const monthFirst = localeDatePattern(locale).startsWith('mm');
    const month = Number(monthFirst ? a : b);
    const day = Number(monthFirst ? b : a);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    // rejects 31/02 and friends
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null;
    const iso = serialToISO(partsToSerial(year, month, day, Number(h), Number(mi), Number(s)), withTime);
    return withTime ? iso.slice(0, 16) : iso;
}

/**
 * Value for an <input> while editing.
 */
export function editorText(value: unknown, column: Column, locale: string): string {
    if (isBlank(value)) return '';
    if (column.type === 'date') return String(value).slice(0, 10);
    if (column.type === 'datetime') return String(value).slice(0, 16);
    if (NUMERIC_TYPES.has(column.type) && typeof value === 'number') {
        const shown = column.type === 'percent' ? Number((value * 100).toPrecision(15)) : value;
        return String(shown).replace('.', localeSeparators(locale).decimal) + (column.type === 'percent' ? '%' : '');
    }
    return String(value);
}

function compareBound(value: unknown, bound: number | string): number {
    // dates compare as serials, everything else as numbers or text
    const a = (toSerial(value) ?? value) as number | string;
    const b = toSerial(bound) ?? bound;
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Validation rules: column.validate is an object {required, min, max, minLength, maxLength, pattern,
 * message} and/or a function (value, row, column) => true | false | 'error message'.
 * @return error message key or text, null when valid
 */
export function validateValue(value: unknown, column: Column, row: Row | null): string | null {
    const rules = column.validate;
    if (!rules) return null;

    const check = (rule: ValidationRule): string | null => {
        if (typeof rule === 'function') {
            const result = rule(value, row, column);
            if (result === true || result === undefined || result === null) return null;
            return result === false ? 'invalidValue' : String(result);
        }

        const blank = isBlank(value);
        if (rule.required && blank) return rule.message ?? 'required';
        if (blank) return null;
        if (rule.min !== undefined && compareBound(value, rule.min) < 0) return rule.message ?? `min:${rule.min}`;
        if (rule.max !== undefined && compareBound(value, rule.max) > 0) return rule.message ?? `max:${rule.max}`;
        if (rule.minLength !== undefined && String(value).length < rule.minLength) return rule.message ?? `minLength:${rule.minLength}`;
        if (rule.maxLength !== undefined && String(value).length > rule.maxLength) return rule.message ?? `maxLength:${rule.maxLength}`;
        if (rule.pattern && !new RegExp(rule.pattern).test(String(value))) return rule.message ?? 'pattern';
        return null;
    };

    for (const rule of Array.isArray(rules) ? rules : [rules]) {
        const error = check(rule);
        if (error) return error;
    }
    return null;
}

export { isDateFormat };
