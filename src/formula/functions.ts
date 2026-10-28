/**
 * Excel worksheet function library.
 *
 * Each entry receives already evaluated arguments (scalars or arrays) and the evaluation context.
 * Options:
 *   lazy    receives AST nodes plus an evaluate callback (IF, IFERROR... only evaluate the branch they need)
 *   errors  receives error arguments instead of propagating them automatically (ISERROR...)
 * Functions report failures by throwing FormulaError.
 */
import { ERRORS, err, isError } from './errors.ts';
import { asNumber, compareValues, toBoolean, toNumber, toText } from './values.ts';
import type { FormulaValue, TextContext } from './values.ts';
import { partsToSerial, serialToParts, nowSerial, todaySerial, toSerial } from './dates.ts';
import { formatValue, localeSeparators } from './numfmt.ts';
import type { AstNode } from './parser.ts';

export interface FunctionContext extends TextContext {
    locale?: string;
}

/** Function result; undefined is read as blank. */
export type FunctionResult = FormulaValue | undefined;

export type FormulaFunction = (args: FormulaValue[], ctx: FunctionContext) => FunctionResult;

/** evaluate() reads a missing argument as blank. */
export type LazyFormulaFunction = (args: AstNode[], ctx: FunctionContext, evaluate: (node: AstNode | undefined) => FormulaValue) => FunctionResult;

export interface FunctionOptions {
    lazy?: boolean;
    errors?: boolean;
}

export interface FunctionDefinition {
    fn: FormulaFunction | LazyFormulaFunction;
    lazy: boolean;
    errors: boolean;
}

const registry = new Map<string, FunctionDefinition>();

export function defineFunction(name: string, fn: FormulaFunction, options: FunctionOptions = {}): void {
    registry.set(name.toUpperCase(), { fn, lazy: false, errors: !!options.errors });
}

export function defineLazyFunction(name: string, fn: LazyFormulaFunction): void {
    registry.set(name.toUpperCase(), { fn, lazy: true, errors: false });
}

export function getFunction(name: string): FunctionDefinition | undefined {
    return registry.get(name.toUpperCase());
}

export function listFunctions(): string[] {
    return [...registry.keys()].sort();
}

function fail(code: string): never {
    throw err(code);
}

const flat = (args: FormulaValue[]): FormulaValue[] => args.flatMap(arg => Array.isArray(arg) ? arg : [arg]);

/**
 * Numbers for aggregate functions: values inside ranges skip text/booleans/blanks (Excel behaviour),
 * values typed as direct arguments are coerced.
 */
function numbers(args: FormulaValue[]): number[] {
    const out: number[] = [];
    for (const arg of args) {
        if (Array.isArray(arg)) {
            for (const item of arg) {
                if (isError(item)) throw item;
                if (typeof item === 'number') out.push(item);
            }
        } else if (arg !== null && arg !== undefined) {
            out.push(toNumber(arg));
        }
    }
    return out;
}

const sum = (list: number[]): number => list.reduce((acc, n) => acc + n, 0);

function average(list: number[]): number {
    if (!list.length) fail(ERRORS.DIV0);
    return sum(list) / list.length;
}

function variance(list: number[], sample: boolean): number {
    if (list.length < (sample ? 2 : 1)) fail(ERRORS.DIV0);
    const mean = sum(list) / list.length;
    return sum(list.map(n => (n - mean) ** 2)) / (list.length - (sample ? 1 : 0));
}

function roundHalfAway(number: number, digits: number): number {
    const factor = Math.pow(10, digits);
    const scaled = Math.abs(number) * factor;
    return Math.sign(number) * Math.round(scaled * (1 + Number.EPSILON)) / factor;
}

const integer = (value: unknown): number => Math.trunc(toNumber(value));
const optional = <T>(value: FormulaValue | undefined, fallback: T): FormulaValue | T => value === undefined || value === null ? fallback : value;

type Comparison = '=' | '<>' | '<' | '<=' | '>' | '>=';

const OUTCOMES = (c: number): Record<Comparison, boolean> => ({ '=': c === 0, '<>': c !== 0, '<': c < 0, '<=': c <= 0, '>': c > 0, '>=': c >= 0 });

/**
 * Excel criteria for COUNTIF/SUMIF...: 5, ">5", "<>done", "a*", "=".
 */
export function compileCriteria(criteria: FormulaValue | undefined): (value: FormulaValue | undefined) => boolean {
    if (isError(criteria)) throw criteria;
    if (typeof criteria === 'number') return value => typeof value !== 'boolean' && asNumber(value) === criteria;
    if (typeof criteria === 'boolean') return value => value === criteria;

    const text = criteria === null || criteria === undefined ? '' : String(criteria);
    const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text)!;
    const op = (match[1] ?? '=') as Comparison;
    const operand = match[2] ?? '';
    const numeric = asNumber(operand);

    if (numeric !== null && operand.trim() !== '') {
        return value => {
            const n = typeof value === 'boolean' ? null : asNumber(value);
            if (n === null) return op === '<>';
            return OUTCOMES(n === numeric ? 0 : n < numeric ? -1 : 1)[op];
        };
    }

    if (op === '=' || op === '<>') {
        if (operand === '') {
            return op === '=' ? value => value === null || value === '' : value => value !== null && value !== '';
        }
        const upper = operand.toUpperCase();
        if (upper === 'TRUE' || upper === 'FALSE') {
            const bool = upper === 'TRUE';
            return value => (value === bool) === (op === '=');
        }
        const regex = wildcardRegex(operand);
        return value => {
            const hit = value !== null && value !== undefined && !isError(value) && regex.test(toText(value));
            return op === '=' ? hit : !hit;
        };
    }

    return value => {
        if (typeof value !== 'string') return false;
        return OUTCOMES(compareValues(value, operand))[op];
    };
}

function wildcardRegex(pattern: string): RegExp {
    const escape = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let source = '';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i]!;
        if (ch === '~' && i + 1 < pattern.length) source += escape(pattern[++i]!);
        else if (ch === '*') source += '.*';
        else if (ch === '?') source += '.';
        else source += escape(ch);
    }
    return new RegExp(`^${source}$`, 'is');
}

const asArray = (value: FormulaValue | undefined): FormulaValue[] => Array.isArray(value) ? value : [value ?? null];

/**
 * Pairs of (range, criteria) for the *IFS family; returns the indexes that match every pair.
 */
function matchingIndexes(pairs: Array<FormulaValue | undefined>): number[] {
    if (pairs.length % 2 !== 0 || pairs.length === 0) fail(ERRORS.VALUE);
    const ranges: Array<{ range: FormulaValue[]; test: (value: FormulaValue | undefined) => boolean }> = [];
    for (let i = 0; i < pairs.length; i += 2) {
        ranges.push({ range: asArray(pairs[i]), test: compileCriteria(pairs[i + 1]) });
    }
    const length = ranges[0]!.range.length;
    if (ranges.some(r => r.range.length !== length)) fail(ERRORS.VALUE);

    const indexes: number[] = [];
    for (let i = 0; i < length; i++) {
        if (ranges.every(r => r.test(r.range[i]))) indexes.push(i);
    }
    return indexes;
}

const numericAt = (range: FormulaValue[], indexes: number[]): number[] => indexes.map(i => range[i]).filter((v): v is number => {
    if (isError(v)) throw v;
    return typeof v === 'number';
});

/* ---------------------------------------------------------------- math & statistics */

defineFunction('SUM', args => sum(numbers(args)));
defineFunction('PRODUCT', args => numbers(args).reduce((acc, n) => acc * n, 1));
defineFunction('AVERAGE', args => average(numbers(args)));
defineFunction('MIN', args => { const list = numbers(args); return list.length ? Math.min(...list) : 0; });
defineFunction('MAX', args => { const list = numbers(args); return list.length ? Math.max(...list) : 0; });
defineFunction('COUNT', args => args.reduce<number>((count, arg) => {
    // ranges count only numbers, direct arguments also count numeric text and booleans
    if (Array.isArray(arg)) return count + arg.filter(v => typeof v === 'number').length;
    return count + (typeof arg === 'number' || typeof arg === 'boolean' || asNumber(arg) !== null ? 1 : 0);
}, 0));
defineFunction('COUNTA', args => flat(args).filter(v => v !== null && v !== undefined && v !== '').length, { errors: true });
defineFunction('COUNTBLANK', args => flat(args).filter(v => v === null || v === undefined || v === '').length);
defineFunction('ABS', ([n]) => Math.abs(toNumber(n)));
defineFunction('SIGN', ([n]) => Math.sign(toNumber(n)));
defineFunction('INT', ([n]) => Math.floor(toNumber(n)));
defineFunction('TRUNC', ([n, digits]) => {
    const factor = Math.pow(10, integer(optional(digits, 0)));
    return Math.trunc(toNumber(n) * factor) / factor;
});
defineFunction('ROUND', ([n, digits]) => roundHalfAway(toNumber(n), integer(optional(digits, 0))));
defineFunction('ROUNDUP', ([n, digits]) => {
    const factor = Math.pow(10, integer(optional(digits, 0)));
    const x = toNumber(n);
    return Math.sign(x) * Math.ceil(Number((Math.abs(x) * factor).toPrecision(15))) / factor;
});
defineFunction('ROUNDDOWN', ([n, digits]) => {
    const factor = Math.pow(10, integer(optional(digits, 0)));
    const x = toNumber(n);
    return Math.sign(x) * Math.floor(Number((Math.abs(x) * factor).toPrecision(15))) / factor;
});
defineFunction('MROUND', ([n, multiple]) => {
    const x = toNumber(n);
    const m = toNumber(multiple);
    if (m === 0) return 0;
    if (Math.sign(x) * Math.sign(m) < 0) fail(ERRORS.NUM);
    return roundHalfAway(x / m, 0) * m;
});
const ceiling: FormulaFunction = ([n, significance]) => {
    const s = Math.abs(toNumber(optional(significance, 1)));
    return s === 0 ? 0 : Math.ceil(Number((toNumber(n) / s).toPrecision(15))) * s;
};
const floor: FormulaFunction = ([n, significance]) => {
    const s = Math.abs(toNumber(optional(significance, 1)));
    return s === 0 ? 0 : Math.floor(Number((toNumber(n) / s).toPrecision(15))) * s;
};
defineFunction('CEILING', ceiling);
defineFunction('CEILING.MATH', ceiling);
defineFunction('FLOOR', floor);
defineFunction('FLOOR.MATH', floor);
defineFunction('MOD', ([a, b]) => {
    const x = toNumber(a);
    const y = toNumber(b);
    if (y === 0) fail(ERRORS.DIV0);
    return x - y * Math.floor(x / y);
});
defineFunction('POWER', ([a, b]) => {
    const result = Math.pow(toNumber(a), toNumber(b));
    if (!Number.isFinite(result)) fail(ERRORS.NUM);
    return result;
});
defineFunction('SQRT', ([n]) => {
    const x = toNumber(n);
    if (x < 0) fail(ERRORS.NUM);
    return Math.sqrt(x);
});
defineFunction('EXP', ([n]) => Math.exp(toNumber(n)));
defineFunction('LN', ([n]) => {
    const x = toNumber(n);
    if (x <= 0) fail(ERRORS.NUM);
    return Math.log(x);
});
defineFunction('LOG', ([n, base]) => {
    const x = toNumber(n);
    const b = toNumber(optional(base, 10));
    if (x <= 0 || b <= 0 || b === 1) fail(ERRORS.NUM);
    return Math.log(x) / Math.log(b);
});
defineFunction('LOG10', ([n]) => {
    const x = toNumber(n);
    if (x <= 0) fail(ERRORS.NUM);
    return Math.log10(x);
});
defineFunction('PI', () => Math.PI);
defineFunction('RAND', () => Math.random());
defineFunction('RANDBETWEEN', ([a, b]) => {
    const low = Math.ceil(toNumber(a));
    const high = Math.floor(toNumber(b));
    if (low > high) fail(ERRORS.NUM);
    return low + Math.floor(Math.random() * (high - low + 1));
});
defineFunction('SUMPRODUCT', args => {
    const arrays = args.map(asArray);
    const length = arrays[0]?.length ?? 0;
    if (arrays.some(a => a.length !== length)) fail(ERRORS.VALUE);
    let total = 0;
    for (let i = 0; i < length; i++) {
        let product = 1;
        for (const array of arrays) {
            const v = array[i];
            if (isError(v)) throw v;
            // text, booleans and blanks count as zero
            product *= typeof v === 'number' ? v : 0;
        }
        total += product;
    }
    return total;
});
defineFunction('MEDIAN', args => {
    const list = numbers(args).sort((a, b) => a - b);
    if (!list.length) fail(ERRORS.NUM);
    const mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid]! : (list[mid - 1]! + list[mid]!) / 2;
});
const mode: FormulaFunction = args => {
    const counts = new Map();
    let best = null;
    let bestCount = 1;
    for (const n of numbers(args)) {
        const c = (counts.get(n) ?? 0) + 1;
        counts.set(n, c);
        if (c > bestCount) {
            best = n;
            bestCount = c;
        }
    }
    if (best === null) fail(ERRORS.NA);
    return best;
};
defineFunction('MODE', mode);
defineFunction('MODE.SNGL', mode);
defineFunction('STDEV', args => Math.sqrt(variance(numbers(args), true)));
defineFunction('STDEV.S', args => Math.sqrt(variance(numbers(args), true)));
defineFunction('STDEVP', args => Math.sqrt(variance(numbers(args), false)));
defineFunction('STDEV.P', args => Math.sqrt(variance(numbers(args), false)));
defineFunction('VAR', args => variance(numbers(args), true));
defineFunction('VAR.S', args => variance(numbers(args), true));
defineFunction('VARP', args => variance(numbers(args), false));
defineFunction('VAR.P', args => variance(numbers(args), false));
defineFunction('LARGE', ([range, k]) => {
    const list = numbers([asArray(range)]).sort((a, b) => b - a);
    const i = integer(k);
    if (i < 1 || i > list.length) fail(ERRORS.NUM);
    return list[i - 1];
});
defineFunction('SMALL', ([range, k]) => {
    const list = numbers([asArray(range)]).sort((a, b) => a - b);
    const i = integer(k);
    if (i < 1 || i > list.length) fail(ERRORS.NUM);
    return list[i - 1];
});
const rank: FormulaFunction = ([n, range, order]) => {
    const x = toNumber(n);
    const list = numbers([asArray(range)]);
    if (!list.includes(x)) fail(ERRORS.NA);
    const ascending = toNumber(optional(order, 0)) !== 0;
    return 1 + list.filter(v => ascending ? v < x : v > x).length;
};
defineFunction('RANK', rank);
defineFunction('RANK.EQ', rank);
const percentile = ([range, k]: Array<FormulaValue | undefined>): number => {
    const list = numbers([asArray(range)]).sort((a, b) => a - b);
    const p = toNumber(k);
    if (!list.length || p < 0 || p > 1) fail(ERRORS.NUM);
    const position = (list.length - 1) * p;
    const lower = Math.floor(position);
    const fraction = position - lower;
    const base = list[lower]!;
    return lower + 1 < list.length ? base + fraction * (list[lower + 1]! - base) : base;
};
defineFunction('PERCENTILE', percentile);
defineFunction('PERCENTILE.INC', percentile);
const quartile: FormulaFunction = ([range, q]) => {
    const quart = integer(q);
    if (quart < 0 || quart > 4) fail(ERRORS.NUM);
    return percentile([range, quart / 4]);
};
defineFunction('QUARTILE', quartile);
defineFunction('QUARTILE.INC', quartile);

defineFunction('SUMIF', ([range, criteria, sumRange]) => {
    const indexes = matchingIndexes([range, criteria]);
    return sum(numericAt(asArray(optional(sumRange, range)), indexes));
});
defineFunction('SUMIFS', ([sumRange, ...pairs]) => sum(numericAt(asArray(sumRange), matchingIndexes(pairs))));
defineFunction('COUNTIF', ([range, criteria]) => matchingIndexes([range, criteria]).length);
defineFunction('COUNTIFS', pairs => matchingIndexes(pairs).length);
defineFunction('AVERAGEIF', ([range, criteria, avgRange]) => {
    const indexes = matchingIndexes([range, criteria]);
    return average(numericAt(asArray(optional(avgRange, range)), indexes));
});
defineFunction('AVERAGEIFS', ([avgRange, ...pairs]) => average(numericAt(asArray(avgRange), matchingIndexes(pairs))));
defineFunction('MAXIFS', ([maxRange, ...pairs]) => {
    const list = numericAt(asArray(maxRange), matchingIndexes(pairs));
    return list.length ? Math.max(...list) : 0;
});
defineFunction('MINIFS', ([minRange, ...pairs]) => {
    const list = numericAt(asArray(minRange), matchingIndexes(pairs));
    return list.length ? Math.min(...list) : 0;
});

const SUBTOTALS: Record<number, string> = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P' };
defineFunction('SUBTOTAL', ([fnNumber, ...ranges], ctx) => {
    const name = SUBTOTALS[integer(fnNumber) % 100];
    if (!name) fail(ERRORS.VALUE);
    return (registry.get(name)!.fn as FormulaFunction)(ranges, ctx);
});

/* ---------------------------------------------------------------- logical */

defineLazyFunction('IF', ([condition, whenTrue, whenFalse], ctx, evaluate) => {
    const test = toBoolean(evaluate(condition));
    if (test) return whenTrue ? evaluate(whenTrue) : true;
    return whenFalse ? evaluate(whenFalse) : false;
});
defineLazyFunction('IFS', (args, ctx, evaluate) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
        if (toBoolean(evaluate(args[i]))) return evaluate(args[i + 1]);
    }
    return fail(ERRORS.NA);
});
defineLazyFunction('IFERROR', ([value, fallback], ctx, evaluate) => {
    const result = evaluate(value);
    return isError(result) ? evaluate(fallback) : result;
});
defineLazyFunction('IFNA', ([value, fallback], ctx, evaluate) => {
    const result = evaluate(value);
    return isError(result) && result.code === ERRORS.NA ? evaluate(fallback) : result;
});
defineLazyFunction('SWITCH', ([expression, ...cases], ctx, evaluate) => {
    const value = evaluate(expression);
    if (isError(value)) return value;
    for (let i = 0; i + 1 < cases.length; i += 2) {
        if (compareValues(value, evaluate(cases[i])) === 0) return evaluate(cases[i + 1]);
    }
    return cases.length % 2 ? evaluate(cases[cases.length - 1]) : fail(ERRORS.NA);
});
defineLazyFunction('CHOOSE', ([index, ...options], ctx, evaluate) => {
    const i = integer(evaluate(index));
    if (i < 1 || i > options.length) fail(ERRORS.VALUE);
    return evaluate(options[i - 1]);
});

const booleans = (args: FormulaValue[]): boolean[] => {
    const out = [];
    for (const arg of args) {
        if (Array.isArray(arg)) {
            for (const item of arg) {
                if (isError(item)) throw item;
                if (typeof item === 'boolean' || typeof item === 'number') out.push(toBoolean(item));
            }
        } else if (arg !== null && arg !== undefined) {
            out.push(toBoolean(arg));
        }
    }
    if (!out.length) fail(ERRORS.VALUE);
    return out;
};
defineFunction('AND', args => booleans(args).every(Boolean));
defineFunction('OR', args => booleans(args).some(Boolean));
defineFunction('XOR', args => booleans(args).filter(Boolean).length % 2 === 1);
defineFunction('NOT', ([value]) => !toBoolean(value));
defineFunction('TRUE', () => true);
defineFunction('FALSE', () => false);

/* ---------------------------------------------------------------- information */

defineFunction('ISBLANK', ([v]) => v === null || v === undefined || v === '', { errors: true });
defineFunction('ISNUMBER', ([v]) => typeof v === 'number', { errors: true });
defineFunction('ISTEXT', ([v]) => typeof v === 'string', { errors: true });
defineFunction('ISNONTEXT', ([v]) => typeof v !== 'string', { errors: true });
defineFunction('ISLOGICAL', ([v]) => typeof v === 'boolean', { errors: true });
defineFunction('ISERROR', ([v]) => isError(v), { errors: true });
defineFunction('ISERR', ([v]) => isError(v) && v.code !== ERRORS.NA, { errors: true });
defineFunction('ISNA', ([v]) => isError(v) && v.code === ERRORS.NA, { errors: true });
defineFunction('ISEVEN', ([v]) => Math.trunc(toNumber(v)) % 2 === 0);
defineFunction('ISODD', ([v]) => Math.abs(Math.trunc(toNumber(v)) % 2) === 1);
defineFunction('NA', () => fail(ERRORS.NA));
defineFunction('N', ([v]) => typeof v === 'number' ? v : v === true ? 1 : 0);

/* ---------------------------------------------------------------- text */

defineFunction('CONCAT', (args, ctx) => flat(args).map(v => toText(v, ctx)).join(''));
defineFunction('CONCATENATE', (args, ctx) => args.map(v => toText(v, ctx)).join(''));
defineFunction('TEXTJOIN', ([delimiter, ignoreEmpty, ...values], ctx) => {
    const skip = toBoolean(ignoreEmpty);
    return flat(values).map(v => toText(v, ctx)).filter(t => !skip || t !== '').join(toText(delimiter, ctx));
});
defineFunction('LEFT', ([text, count], ctx) => {
    const n = integer(optional(count, 1));
    if (n < 0) fail(ERRORS.VALUE);
    return toText(text, ctx).slice(0, n);
});
defineFunction('RIGHT', ([text, count], ctx) => {
    const n = integer(optional(count, 1));
    if (n < 0) fail(ERRORS.VALUE);
    const value = toText(text, ctx);
    return n === 0 ? '' : value.slice(-n);
});
defineFunction('MID', ([text, start, count], ctx) => {
    const s = integer(start);
    const n = integer(count);
    if (s < 1 || n < 0) fail(ERRORS.VALUE);
    return toText(text, ctx).slice(s - 1, s - 1 + n);
});
defineFunction('LEN', ([text], ctx) => toText(text, ctx).length);
defineFunction('UPPER', ([text], ctx) => toText(text, ctx).toUpperCase());
defineFunction('LOWER', ([text], ctx) => toText(text, ctx).toLowerCase());
defineFunction('PROPER', ([text], ctx) => toText(text, ctx).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()));
defineFunction('TRIM', ([text], ctx) => toText(text, ctx).trim().replace(/ {2,}/g, ' '));
defineFunction('SUBSTITUTE', ([text, search, replacement, instance], ctx) => {
    const value = toText(text, ctx);
    const find = toText(search, ctx);
    const replace = toText(replacement, ctx);
    if (!find) return value;
    if (instance === undefined || instance === null) return value.split(find).join(replace);
    const target = integer(instance);
    let index = -1;
    for (let i = 0; i < target; i++) {
        index = value.indexOf(find, index + 1);
        if (index === -1) return value;
    }
    return value.slice(0, index) + replace + value.slice(index + find.length);
});
defineFunction('REPLACE', ([text, start, count, replacement], ctx) => {
    const value = toText(text, ctx);
    const s = integer(start) - 1;
    return value.slice(0, s) + toText(replacement, ctx) + value.slice(s + integer(count));
});
defineFunction('FIND', ([search, text, start], ctx) => {
    const index = toText(text, ctx).indexOf(toText(search, ctx), integer(optional(start, 1)) - 1);
    if (index === -1) fail(ERRORS.VALUE);
    return index + 1;
});
defineFunction('SEARCH', ([search, text, start], ctx) => {
    const haystack = toText(text, ctx);
    const from = integer(optional(start, 1)) - 1;
    const regex = new RegExp(wildcardRegex(toText(search, ctx)).source.slice(1, -1), 'is');
    const match = regex.exec(haystack.slice(from));
    if (!match) return fail(ERRORS.VALUE);
    return match.index + from + 1;
});
defineFunction('REPT', ([text, times], ctx) => {
    const n = integer(times);
    if (n < 0) fail(ERRORS.VALUE);
    return toText(text, ctx).repeat(n);
});
defineFunction('EXACT', ([a, b], ctx) => toText(a, ctx) === toText(b, ctx));
defineFunction('CHAR', ([n]) => String.fromCharCode(integer(n)));
defineFunction('CODE', ([text], ctx) => {
    const value = toText(text, ctx);
    if (!value) fail(ERRORS.VALUE);
    return value.charCodeAt(0);
});
defineFunction('TEXTBEFORE', ([text, delimiter], ctx) => {
    const value = toText(text, ctx);
    const index = value.indexOf(toText(delimiter, ctx));
    if (index === -1) fail(ERRORS.NA);
    return value.slice(0, index);
});
defineFunction('TEXTAFTER', ([text, delimiter], ctx) => {
    const value = toText(text, ctx);
    const d = toText(delimiter, ctx);
    const index = value.indexOf(d);
    if (index === -1) fail(ERRORS.NA);
    return value.slice(index + d.length);
});
defineFunction('TEXT', ([value, format], ctx) => {
    if (isError(value)) throw value;
    return formatValue(value, toText(format, ctx), ctx?.locale);
});
defineFunction('VALUE', ([text], ctx) => {
    if (typeof text === 'number') return text;
    const direct = asNumber(text);
    if (direct !== null) return direct;
    return parseLocaleNumber(toText(text, ctx), ctx?.locale);
});
defineFunction('NUMBERVALUE', ([text, decimal, group], ctx) => {
    const value = toText(text, ctx);
    const dec = decimal === undefined || decimal === null ? localeSeparators(ctx?.locale ?? 'en-US').decimal : toText(decimal, ctx);
    const grp = group === undefined || group === null ? localeSeparators(ctx?.locale ?? 'en-US').group : toText(group, ctx);
    const normalized = value.split(grp).join('').replace(dec, '.').replace(/\s/g, '');
    const n = asNumber(normalized);
    if (n === null) fail(ERRORS.VALUE);
    return n;
});

export function parseLocaleNumber(text: string, locale = 'en-US'): number {
    const { group, decimal } = localeSeparators(locale);
    let value = String(text).trim().replace(/\s/g, '');
    const percent = value.endsWith('%');
    if (percent) value = value.slice(0, -1);
    value = value.split(group).join('').replace(decimal, '.');
    const n = asNumber(value);
    if (n === null) return fail(ERRORS.VALUE);
    return percent ? n / 100 : n;
}

/* ---------------------------------------------------------------- date & time */

const serial = (value: FormulaValue | undefined): number => {
    if (value === null || value === undefined) return 0;
    const s = typeof value === 'string' ? toSerial(value) : null;
    return s ?? toNumber(value);
};

defineFunction('TODAY', () => todaySerial());
defineFunction('NOW', () => nowSerial());
defineFunction('DATE', ([y, m, d]) => partsToSerial(integer(y), integer(m), integer(d)));
defineFunction('TIME', ([h, m, s]) => ((integer(h) * 3600 + integer(m) * 60 + integer(s)) % 86400) / 86400);
defineFunction('DATEVALUE', ([text], ctx) => {
    const value = toText(text, ctx).trim();
    const iso = toSerial(value);
    if (iso !== null) return Math.floor(iso);
    // dd/mm/yyyy (pt-BR and most locales) or mm/dd/yyyy for en-US
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value);
    if (!match) fail(ERRORS.VALUE);
    const [a = 0, b = 0] = match.slice(1).map(Number);
    let y = Number(match[3]);
    if (y < 100) y += y < 30 ? 2000 : 1900;
    const monthFirst = (ctx?.locale ?? 'en-US') === 'en-US';
    return partsToSerial(y, monthFirst ? a : b, monthFirst ? b : a);
});
defineFunction('YEAR', ([v]) => serialToParts(serial(v)).year);
defineFunction('MONTH', ([v]) => serialToParts(serial(v)).month);
defineFunction('DAY', ([v]) => serialToParts(serial(v)).day);
defineFunction('HOUR', ([v]) => serialToParts(serial(v)).hours);
defineFunction('MINUTE', ([v]) => serialToParts(serial(v)).minutes);
defineFunction('SECOND', ([v]) => serialToParts(serial(v)).seconds);
defineFunction('WEEKDAY', ([v, type]) => {
    const day = serialToParts(serial(v)).weekday; // 0 = sunday
    switch (integer(optional(type, 1))) {
        case 1: return day + 1;
        case 2: return day === 0 ? 7 : day;
        case 3: return day === 0 ? 6 : day - 1;
        default: return fail(ERRORS.NUM);
    }
});
const addMonths = (start: FormulaValue | undefined, months: FormulaValue | undefined) => {
    const p = serialToParts(serial(start));
    return { year: p.year, month: p.month + integer(months), day: p.day };
};
defineFunction('EDATE', ([start, months]) => {
    const { year, month, day } = addMonths(start, months);
    const lastDay = serialToParts(partsToSerial(year, month + 1, 0)).day;
    return partsToSerial(year, month, Math.min(day, lastDay));
});
defineFunction('EOMONTH', ([start, months]) => {
    const { year, month } = addMonths(start, months);
    return partsToSerial(year, month + 1, 0);
});
defineFunction('DAYS', ([end, start]) => Math.floor(serial(end)) - Math.floor(serial(start)));
defineFunction('DATEDIF', ([start, end, unit], ctx) => {
    const a = Math.floor(serial(start));
    const b = Math.floor(serial(end));
    if (a > b) fail(ERRORS.NUM);
    const p = serialToParts(a);
    const q = serialToParts(b);
    let months = (q.year - p.year) * 12 + (q.month - p.month);
    if (q.day < p.day) months--;
    switch (toText(unit, ctx).toUpperCase()) {
        case 'D': return b - a;
        case 'M': return months;
        case 'Y': return Math.floor(months / 12);
        case 'YM': return months % 12;
        case 'MD': {
            const days = q.day - p.day;
            return days >= 0 ? days : b - partsToSerial(q.year, q.month - 1, p.day);
        }
        case 'YD': {
            let anniversary = partsToSerial(q.year, p.month, p.day);
            if (anniversary > b) anniversary = partsToSerial(q.year - 1, p.month, p.day);
            return b - anniversary;
        }
        default: return fail(ERRORS.NUM);
    }
});
const holidaySet = (holidays: FormulaValue | undefined): Set<number> => new Set(holidays === undefined || holidays === null ? [] : asArray(holidays).map(h => Math.floor(serial(h))));
const isWorkday = (day: number, holidays: Set<number>): boolean => {
    const weekday = serialToParts(day).weekday;
    return weekday !== 0 && weekday !== 6 && !holidays.has(day);
};
defineFunction('NETWORKDAYS', ([start, end, holidays]) => {
    let a = Math.floor(serial(start));
    let b = Math.floor(serial(end));
    const sign = a <= b ? 1 : -1;
    if (sign < 0) [a, b] = [b, a];
    const skip = holidaySet(holidays);
    let count = 0;
    for (let day = a; day <= b; day++) if (isWorkday(day, skip)) count++;
    return sign * count;
});
defineFunction('WORKDAY', ([start, days, holidays]) => {
    let day = Math.floor(serial(start));
    let remaining = integer(days);
    const step = remaining < 0 ? -1 : 1;
    const skip = holidaySet(holidays);
    while (remaining !== 0) {
        day += step;
        if (isWorkday(day, skip)) remaining -= step;
    }
    return day;
});

/* ---------------------------------------------------------------- financial */

defineFunction('PMT', ([rate, nper, pv, fv, type]) => {
    const r = toNumber(rate);
    const n = toNumber(nper);
    const p = toNumber(pv);
    const f = toNumber(optional(fv, 0));
    const t = toNumber(optional(type, 0)) ? 1 : 0;
    if (r === 0) return -(p + f) / n;
    const factor = Math.pow(1 + r, n);
    return -(r * (p * factor + f)) / ((1 + r * t) * (factor - 1));
});
defineFunction('FV', ([rate, nper, pmt, pv, type]) => {
    const r = toNumber(rate);
    const n = toNumber(nper);
    const payment = toNumber(pmt);
    const p = toNumber(optional(pv, 0));
    const t = toNumber(optional(type, 0)) ? 1 : 0;
    if (r === 0) return -(p + payment * n);
    const factor = Math.pow(1 + r, n);
    return -(p * factor + payment * (1 + r * t) * (factor - 1) / r);
});
defineFunction('PV', ([rate, nper, pmt, fv, type]) => {
    const r = toNumber(rate);
    const n = toNumber(nper);
    const payment = toNumber(pmt);
    const f = toNumber(optional(fv, 0));
    const t = toNumber(optional(type, 0)) ? 1 : 0;
    if (r === 0) return -(f + payment * n);
    const factor = Math.pow(1 + r, n);
    return -(f + payment * (1 + r * t) * (factor - 1) / r) / factor;
});
defineFunction('NPV', ([rate, ...values]) => {
    const r = toNumber(rate);
    return numbers(values).reduce((acc, v, i) => acc + v / Math.pow(1 + r, i + 1), 0);
});
defineFunction('IRR', ([values, guess]) => {
    const flows = numbers([asArray(values)]);
    let rate = toNumber(optional(guess, 0.1));
    for (let i = 0; i < 100; i++) {
        let npv = 0;
        let derivative = 0;
        flows.forEach((v, t) => {
            npv += v / Math.pow(1 + rate, t);
            derivative -= t * v / Math.pow(1 + rate, t + 1);
        });
        if (derivative === 0) break;
        const next = rate - npv / derivative;
        if (Math.abs(next - rate) < 1e-10) return next;
        rate = next;
    }
    return fail(ERRORS.NUM);
});

/* ---------------------------------------------------------------- lookup & arrays */

/**
 * Lookup equality: numbers (and ISO dates) by value, text case insensitive, booleans strictly.
 */
function sameValue(a: FormulaValue | undefined, b: FormulaValue | undefined): boolean {
    if (isError(a) || isError(b) || a === null || b === null) return a === b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
    const x = asNumber(a);
    const y = asNumber(b);
    if (x !== null && y !== null) return x === y;
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function exactIndex(value: FormulaValue | undefined, array: FormulaValue[], { fromEnd = false, wildcards = false } = {}): number {
    const test = wildcards && typeof value === 'string' ? compileCriteria(value) : (item: FormulaValue | undefined) => sameValue(item, value);
    if (fromEnd) {
        for (let i = array.length - 1; i >= 0; i--) if (test(array[i])) return i;
        return -1;
    }
    return array.findIndex(item => test(item));
}

/**
 * Index of the closest value: direction -1 = exact or next smaller, 1 = exact or next larger.
 */
function approximateIndex(value: FormulaValue | undefined, array: FormulaValue[], direction: -1 | 1): number {
    let best = -1;
    array.forEach((item, i) => {
        if (isError(item) || item === null) return;
        const c = compareValues(item, value);
        if (c === 0) {
            if (best === -1 || compareValues(array[best], value) !== 0) best = i;
            return;
        }
        if (Math.sign(c) !== direction) return;
        if (best === -1) {
            best = i;
            return;
        }
        const bestDiff = compareValues(array[best], value);
        if (bestDiff !== 0 && compareValues(item, array[best]) === -direction) best = i;
    });
    return best;
}

defineFunction('XLOOKUP', ([lookup, lookupArray, returnArray, notFound, matchMode, searchMode]) => {
    if (isError(lookup)) throw lookup;
    const keys = asArray(lookupArray);
    const results = asArray(returnArray);
    if (keys.length !== results.length) fail(ERRORS.VALUE);
    const mode = integer(optional(matchMode, 0));
    const fromEnd = integer(optional(searchMode, 1)) < 0;

    let index;
    if (mode === 0 || mode === 2) index = exactIndex(lookup, keys, { fromEnd, wildcards: mode === 2 });
    else if (mode === -1 || mode === 1) index = approximateIndex(lookup, keys, mode);
    else fail(ERRORS.VALUE);

    if (index === -1) {
        if (notFound !== undefined && notFound !== null) return notFound;
        fail(ERRORS.NA);
    }
    return results[index] ?? null;
});
defineFunction('MATCH', ([lookup, lookupArray, matchType]) => {
    if (isError(lookup)) throw lookup;
    const keys = asArray(lookupArray);
    const type = integer(optional(matchType, 1));
    if (type === 0) {
        const index = exactIndex(lookup, keys, { wildcards: true });
        if (index === -1) fail(ERRORS.NA);
        return index + 1;
    }
    // sorted lookups: largest value <= lookup (1) or smallest value >= lookup (-1)
    let found = -1;
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === null || isError(keys[i])) continue;
        const c = compareValues(keys[i], lookup);
        if (type > 0 ? c <= 0 : c >= 0) found = i;
        else break;
    }
    if (found === -1) fail(ERRORS.NA);
    return found + 1;
});
defineFunction('INDEX', ([array, position]) => {
    const list = asArray(array);
    const i = integer(position);
    if (i < 1 || i > list.length) fail(ERRORS.REF);
    return list[i - 1];
});
defineFunction('ROWS', ([array]) => asArray(array).length);
defineFunction('FILTER', ([array, include, ifEmpty]) => {
    const list = asArray(array);
    const mask = asArray(include);
    if (mask.length !== list.length) fail(ERRORS.VALUE);
    const out = list.filter((v, i) => !isError(mask[i]) && toBoolean(mask[i]));
    if (!out.length) {
        if (ifEmpty !== undefined && ifEmpty !== null) return ifEmpty;
        fail(ERRORS.NA);
    }
    return out;
});
defineFunction('UNIQUE', ([array]) => {
    const out: FormulaValue[] = [];
    for (const v of asArray(array)) {
        if (!out.some(o => sameValue(o, v))) out.push(v);
    }
    return out;
});
defineFunction('SORT', ([array, , order]) => {
    const descending = integer(optional(order, 1)) < 0;
    return [...asArray(array)].sort((a, b) => descending ? compareValues(b, a) : compareValues(a, b));
});
