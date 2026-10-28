/**
 * Compiles the grid filter model into a SorlaDB query plus residual predicates.
 *
 * Filter model, per field (Excel AutoFilter):
 *   {
 *     values: ['a', 'b', ''],              checklist of stored values ('' = blanks)
 *     conditions: [{ op, value, value2 }],  custom filter conditions
 *     join: 'and' | 'or',                   how conditions combine (default 'and')
 *     formula: '=[@total] > 100',           formula that must be TRUE for the row
 *     test: (value, row) => boolean         developer predicate
 *   }
 *
 * Everything SorlaDB can answer goes into the query ($eq $ne $gt $gte $lt $lte $in), the rest
 * (case insensitive text, "contains", OR between conditions, formulas) becomes a JS predicate.
 */
import { DATE_TYPES, NUMERIC_TYPES, parseDateText, parseNumberText } from './columns.ts';
import { isBlank } from './store.ts';
import { toSerial, serialToISO } from '../formula/dates.ts';
import type { Column, Filter, FilterCondition, FilterModel, FilterOperator, RangeOperator, RowData, TextOperator } from '../types.ts';

export const TEXT_OPERATORS: readonly TextOperator[] = ['contains', 'notContains', 'equals', 'notEquals', 'startsWith', 'endsWith', 'empty', 'notEmpty'];
export const RANGE_OPERATORS: readonly RangeOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'];
export const BOOLEAN_OPERATORS: readonly RangeOperator[] = ['eq', 'empty', 'notEmpty'];

type FilterColumn = Pick<Column, 'field' | 'type'> & Partial<Pick<Column, 'options'>>;
type SorlaOperators = Record<string, unknown>;

export function operatorsFor(column: FilterColumn): readonly FilterOperator[] {
    if (column.type === 'boolean') return BOOLEAN_OPERATORS;
    if (NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type)) return RANGE_OPERATORS;
    return TEXT_OPERATORS;
}

const isRangeType = (column: FilterColumn) => NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type);

/**
 * Converts what the user typed in the filter UI into a comparable stored value.
 */
function coerceOperand(value: unknown, column: FilterColumn, locale: string): unknown {
    if (value === null || value === undefined || value === '') return null;
    if (NUMERIC_TYPES.has(column.type)) {
        if (typeof value === 'number') return value;
        const number = parseNumberText(String(value), locale);
        if (number === null) return null;
        return column.type === 'percent' && !String(value).includes('%') ? number / 100 : number;
    }
    if (DATE_TYPES.has(column.type)) return parseDateText(String(value), locale, false);
    if (column.type === 'boolean') return value === true || value === 'true';
    return value;
}

const nextDay = (iso: string) => serialToISO(Math.floor(toSerial(iso)!) + 1);

/**
 * @return SorlaDB operators for one condition, null when Sorla cannot express it
 */
function toSorla(condition: FilterCondition, column: FilterColumn, locale: string): SorlaOperators | null {
    const { op } = condition;
    if (op === 'empty') return { $eq: '' };
    if (op === 'notEmpty') return { $ne: '' };

    if (column.type === 'boolean') {
        return op === 'eq' ? { $eq: coerceOperand(condition.value, column, locale) } : null;
    }

    if (!isRangeType(column)) {
        // select values are exact, typed text filters are case insensitive like Excel
        if (column.type === 'select' && (op === 'equals' || op === 'notEquals')) {
            return op === 'equals' ? { $eq: condition.value } : { $ne: condition.value };
        }
        return null;
    }

    const value = coerceOperand(condition.value, column, locale);
    if (value === null) return {};
    // ISO dates compare as strings; a datetime belongs to a day until midnight of the next one
    const day = column.type === 'datetime';
    const iso = value as string;

    switch (op) {
        case 'eq': return day ? { $gte: value, $lt: nextDay(iso) } : { $eq: value };
        case 'ne': return day ? null : { $ne: value };
        // blanks are stored as '' and '' < 5 is true in JS, so range operators exclude them
        case 'gt': return day ? { $gte: nextDay(iso), $ne: '' } : { $gt: value, $ne: '' };
        case 'gte': return { $gte: value, $ne: '' };
        case 'lt': return { $lt: value, $ne: '' };
        case 'lte': return day ? { $lt: nextDay(iso), $ne: '' } : { $lte: value, $ne: '' };
        case 'between': {
            const upper = coerceOperand(condition.value2, column, locale);
            if (upper === null) return { $gte: value, $ne: '' };
            return day ? { $gte: value, $lt: nextDay(upper as string), $ne: '' } : { $gte: value, $lte: upper, $ne: '' };
        }
    }
    return null;
}

/**
 * Plain JS evaluation of a condition, used for anything not sent to SorlaDB.
 */
export function testCondition(rawValue: unknown, condition: FilterCondition, column: FilterColumn, locale: string): boolean {
    const { op } = condition;
    if (op === 'empty') return isBlank(rawValue);
    if (op === 'notEmpty') return !isBlank(rawValue);

    if (isRangeType(column) || column.type === 'boolean') {
        const operand = coerceOperand(condition.value, column, locale);
        if (operand === null) return true;
        if (isBlank(rawValue)) return op === 'ne';
        const toComparable = (v: unknown) => DATE_TYPES.has(column.type) ? Math.floor(toSerial(v) ?? NaN) : v as number;
        const value = toComparable(rawValue);
        const target = toComparable(operand);
        switch (op) {
            case 'eq': return value === target;
            case 'ne': return value !== target;
            case 'gt': return value > target;
            case 'gte': return value >= target;
            case 'lt': return value < target;
            case 'lte': return value <= target;
            case 'between': {
                const upper = coerceOperand(condition.value2, column, locale);
                return value >= target && (upper === null || value <= toComparable(upper));
            }
        }
        return true;
    }

    const needle = String(condition.value ?? '').toLocaleLowerCase(locale);
    const option = column.options?.find(o => o.value === rawValue);
    const haystack = String(option ? option.label : rawValue ?? '').toLocaleLowerCase(locale);
    const raw = String(rawValue ?? '').toLocaleLowerCase(locale);
    switch (op) {
        case 'contains': return haystack.includes(needle);
        case 'notContains': return !haystack.includes(needle);
        case 'equals': return haystack === needle || raw === needle;
        case 'notEquals': return haystack !== needle && raw !== needle;
        case 'startsWith': return haystack.startsWith(needle);
        case 'endsWith': return haystack.endsWith(needle);
    }
    return true;
}

/**
 * Merges operators for one field, refusing conflicting duplicates (e.g. two different $gt).
 */
function mergeOperators(target: SorlaOperators, operators: SorlaOperators): boolean {
    for (const [key, value] of Object.entries(operators)) {
        if (key in target && target[key] !== value) return false;
    }
    Object.assign(target, operators);
    return true;
}

const isActive = (condition: FilterCondition | null | undefined): condition is FilterCondition => !!condition && !!condition.op &&
    (condition.op === 'empty' || condition.op === 'notEmpty' || (condition.value !== undefined && condition.value !== null && condition.value !== ''));

export function isFilterActive(filter: Filter | null | undefined): filter is Filter {
    if (!filter) return false;
    return Array.isArray(filter.values) ||
        (filter.conditions ?? []).some(isActive) ||
        (typeof filter.formula === 'string' && filter.formula.trim() !== '') ||
        typeof filter.test === 'function';
}

export interface CompiledFilters {
    query: Record<string, SorlaOperators>;
    predicates: Array<(row: RowData) => boolean>;
}

export function compileFilters(
    filters: FilterModel | null | undefined,
    columns: Map<string, FilterColumn>,
    { locale = 'en-US', testFormula }: { locale?: string; testFormula?: (formula: string, row: RowData) => boolean } = {}
): CompiledFilters {
    const query: Record<string, SorlaOperators> = {};
    const predicates: CompiledFilters['predicates'] = [];

    for (const [field, filter] of Object.entries(filters ?? {})) {
        if (!isFilterActive(filter)) continue;
        const column: FilterColumn = columns.get(field) ?? { field, type: 'text' };
        const operators: SorlaOperators = {};

        if (Array.isArray(filter.values)) {
            operators.$in = [...filter.values];
        }

        const conditions = (filter.conditions ?? []).filter(isActive);
        if (conditions.length) {
            const join = filter.join === 'or' && conditions.length > 1 ? 'or' : 'and';
            const residual: FilterCondition[] = [];

            if (join === 'and') {
                for (const condition of conditions) {
                    const sorla = toSorla(condition, column, locale);
                    if (sorla === null || !mergeOperators(operators, sorla)) residual.push(condition);
                }
                if (residual.length) {
                    predicates.push(row => residual.every(c => testCondition(row[field], c, column, locale)));
                }
            } else {
                predicates.push(row => conditions.some(c => testCondition(row[field], c, column, locale)));
            }
        }

        const test = filter.test;
        if (typeof test === 'function') {
            predicates.push(row => !!test(row[field], row));
        }

        const formula = filter.formula;
        if (typeof formula === 'string' && formula.trim() && testFormula) {
            predicates.push(row => testFormula(formula, row));
        }

        if (Object.keys(operators).length) query[field] = operators;
    }

    return { query, predicates };
}
