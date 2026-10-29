/**
 * Evaluates formula ASTs against a context:
 *   ctx.rowValue(field)      value of [@field] in the current row
 *   ctx.columnValues(field)  values of [field] across the rows in scope
 *   ctx.name(name)           named constants (grid option "names")
 *   ctx.functions            extra functions registered on the grid instance
 *   ctx.locale / ctx.decimalSeparator
 */
import { ERRORS, err, isError } from './errors.ts';
import { compareValues, lift1, lift2, toNumber, toText } from './values.ts';
import type { FormulaValue } from './values.ts';
import { getFunction } from './functions.ts';
import type { FormulaFunction, FunctionContext, FunctionDefinition, LazyFormulaFunction } from './functions.ts';
import { FormulaSyntaxError, parse } from './parser.ts';
import type { AstNode } from './parser.ts';

export interface EvaluationContext extends FunctionContext {
    rowValue: (field: string) => FormulaValue;
    columnValues: (field: string) => FormulaValue;
    name?: (name: string) => FormulaValue | undefined;
    functions?: Map<string, FunctionDefinition>;
    /**
     * Results of row independent subexpressions, shared by every row of one calculation pass:
     * SUM([total]) in =[@total]/SUM([total]) is computed once per column instead of once per row.
     */
    memo?: Map<AstNode, FormulaValue>;
}

// functions that must run for every cell even when their arguments do not depend on the row
const VOLATILE = new Set(['RAND', 'RANDBETWEEN']);

/** Subexpressions whose value is the same for every row (no [@field] and nothing volatile). */
const rowIndependent = new WeakSet<AstNode>();

/**
 * Marks the row independent subexpressions worth caching.
 * @return whether the node itself is row independent
 */
function markRowIndependent(node: AstNode): boolean {
    let independent: boolean;
    switch (node.type) {
        case 'ref':
            independent = node.scope === 'column';
            break;
        case 'call': {
            const children = node.args.map(markRowIndependent);
            independent = children.every(Boolean) && !VOLATILE.has(node.name);
            break;
        }
        case 'unary':
        case 'postfix':
            independent = markRowIndependent(node.arg);
            break;
        case 'binary': {
            const left = markRowIndependent(node.left);
            const right = markRowIndependent(node.right);
            independent = left && right;
            break;
        }
        case 'array':
            independent = node.items.map(markRowIndependent).every(Boolean);
            break;
        default:
            // literals, names and empty arguments are cheap: nothing to cache
            return true;
    }
    if (independent) rowIndependent.add(node);
    return independent;
}

const ARITHMETIC: Record<string, (a: number, b: number) => number> = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => {
        if (b === 0) throw err(ERRORS.DIV0);
        return a / b;
    },
    '^': (a, b) => {
        const result = Math.pow(a, b);
        if (!Number.isFinite(result)) throw err(ERRORS.NUM);
        return result;
    }
};

const COMPARISON: Record<string, (c: number) => boolean> = {
    '=': c => c === 0,
    '<>': c => c !== 0,
    '<': c => c < 0,
    '<=': c => c <= 0,
    '>': c => c > 0,
    '>=': c => c >= 0
};

export function evaluate(node: AstNode, ctx: EvaluationContext): FormulaValue {
    try {
        return evaluateNode(node, ctx);
    } catch (e) {
        if (isError(e)) return e;
        throw e;
    }
}

function evaluateNode(node: AstNode, ctx: EvaluationContext): FormulaValue {
    const memo = ctx.memo;
    if (memo && rowIndependent.has(node)) {
        if (memo.has(node)) return memo.get(node)!;
        const value = evaluateFresh(node, ctx);
        memo.set(node, value);
        return value;
    }
    return evaluateFresh(node, ctx);
}

function evaluateFresh(node: AstNode, ctx: EvaluationContext): FormulaValue {
    switch (node.type) {
        case 'number':
        case 'string':
        case 'boolean':
            return node.value;
        case 'error':
            return err(node.code);
        case 'empty':
            return null;
        case 'ref':
            return node.scope === 'row' ? ctx.rowValue(node.field) : ctx.columnValues(node.field);
        case 'name': {
            const value = ctx.name ? ctx.name(node.name) : undefined;
            return value === undefined ? err(ERRORS.NAME, `Unknown name ${node.name}`) : value;
        }
        case 'array':
            return node.items.map(item => {
                const value = evaluate(item, ctx);
                return Array.isArray(value) ? value[0] ?? null : value;
            });
        case 'unary': {
            const value = evaluate(node.arg, ctx);
            return lift1(value, x => node.op === '-' ? -toNumber(x) : toNumber(x));
        }
        case 'postfix':
            return lift1(evaluate(node.arg, ctx), x => toNumber(x) / 100);
        case 'binary':
            return evaluateBinary(node, ctx);
        case 'call':
            return evaluateCall(node, ctx);
    }
}

function evaluateBinary(node: Extract<AstNode, { type: 'binary' }>, ctx: EvaluationContext): FormulaValue {
    const left = evaluate(node.left, ctx);
    const right = evaluate(node.right, ctx);

    const arithmetic = ARITHMETIC[node.op];
    if (arithmetic) return lift2(left, right, (a, b) => arithmetic(toNumber(a), toNumber(b)));
    if (node.op === '&') return lift2(left, right, (a, b) => toText(a, ctx) + toText(b, ctx));
    const test = COMPARISON[node.op]!;
    return lift2(left, right, (a, b) => test(compareValues(a, b)));
}

function evaluateCall(node: Extract<AstNode, { type: 'call' }>, ctx: EvaluationContext): FormulaValue {
    const definition = ctx.functions?.get(node.name) ?? getFunction(node.name);
    if (!definition) return err(ERRORS.NAME, `Unknown function ${node.name}`);

    try {
        if (definition.lazy) {
            const result = (definition.fn as LazyFormulaFunction)(node.args, ctx, arg => arg ? evaluate(arg, ctx) : null);
            return result === undefined ? null : result;
        }

        const args = node.args.map(arg => evaluate(arg, ctx));
        if (!definition.errors) {
            const failed = args.find(isError);
            if (failed) return failed;
        }
        const result = (definition.fn as FormulaFunction)(args, ctx);
        return result === undefined ? null : result;
    } catch (e) {
        if (isError(e)) return e;
        throw e;
    }
}

/**
 * Final value of a cell: arrays cannot spill inside a grid cell, a single item array is unwrapped.
 */
export function toCellResult(value: FormulaValue): Exclude<FormulaValue, FormulaValue[]> {
    if (Array.isArray(value)) {
        return value.length === 1 ? toCellResult(value[0]!) : err(ERRORS.VALUE, 'A cell cannot hold an array');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return err(ERRORS.NUM);
    return value;
}

export interface CompiledFormula {
    ast: AstNode;
    error: FormulaSyntaxError | null;
}

const cache = new Map<string, CompiledFormula>();
const CACHE_LIMIT = 2000;

/**
 * Parses with memoization; syntax errors compile to a node that evaluates to #ERROR!.
 */
export function compile(formula: string): CompiledFormula {
    const key = String(formula);
    const cached = cache.get(key);
    if (cached) return cached;

    let compiled: CompiledFormula;
    try {
        compiled = { ast: parse(key), error: null };
        markRowIndependent(compiled.ast);
    } catch (e) {
        if (!(e instanceof FormulaSyntaxError)) throw e;
        compiled = { ast: { type: 'error', code: ERRORS.SYNTAX }, error: e };
    }

    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, compiled);
    return compiled;
}

export const isFormula = (value: unknown): boolean => typeof value === 'string' && value.trim().startsWith('=') && value.trim().length > 1;
