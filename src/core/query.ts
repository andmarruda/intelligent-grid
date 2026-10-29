/**
 * Query builder model: nested AND / OR / NOT groups of rules, compiled to the SorlaDB query language.
 *
 *   { type: 'group', join: 'and', children: [
 *       { type: 'rule', field: 'age', op: 'gte', value: 30 },
 *       { type: 'group', join: 'or', children: [
 *           { type: 'rule', field: 'name', op: 'eq', value: 'X' },
 *           { type: 'rule', field: 'city', op: 'in', values: ['A', 'B'] } ] } ] }
 *
 *   => { $and: [ { age: { $gte: 30, $ne: '' } }, { $or: [ { name: { $eq: 'X' } }, { city: { $in: ['A', 'B'] } } ] } ] }
 *
 * Every subtree SorlaDB can express runs as one collection.find(), text matching included ($regex,
 * sorla-db 1.3+). The few rules SorlaDB cannot express are evaluated by the grid, and a group mixing
 * both still sends its SorlaDB parts to find().
 */
import { DATE_TYPES, NUMERIC_TYPES } from './columns.ts';
import { andQuery, escapeRegex, testCondition, toSorla } from './filters.ts';
import { isBlank } from './store.ts';
import type { Column, FilterCondition, QueryGroup, QueryNode, QueryOperator, QueryRule, RowData, Translator } from '../types.ts';

type QueryColumn = Pick<Column, 'field' | 'type' | 'title'> & Partial<Pick<Column, 'options' | 'format' | 'decimals' | 'currency'>>;
type SorlaQuery = Record<string, unknown>;

export const TEXT_QUERY_OPERATORS: readonly QueryOperator[] = ['eq', 'ne', 'in', 'nin', 'contains', 'notContains', 'startsWith', 'endsWith', 'empty', 'notEmpty'];
export const RANGE_QUERY_OPERATORS: readonly QueryOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'nin', 'empty', 'notEmpty'];
export const BOOLEAN_QUERY_OPERATORS: readonly QueryOperator[] = ['eq', 'empty', 'notEmpty'];

const TEXT_MATCH = new Set<QueryOperator>(['contains', 'notContains', 'startsWith', 'endsWith']);
const NO_VALUE = new Set<QueryOperator>(['empty', 'notEmpty']);
const LIST = new Set<QueryOperator>(['in', 'nin']);

export function queryOperatorsFor(column: Pick<Column, 'type'>): readonly QueryOperator[] {
    if (column.type === 'boolean') return BOOLEAN_QUERY_OPERATORS;
    if (NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type)) return RANGE_QUERY_OPERATORS;
    return TEXT_QUERY_OPERATORS;
}

export const emptyGroup = (join: 'and' | 'or' = 'and'): QueryGroup => ({ type: 'group', join, children: [] });

/**
 * A rule is complete when it has a field, an operator and the values that operator needs.
 */
export function isCompleteRule(rule: QueryRule): boolean {
    if (!rule.field || !rule.op) return false;
    if (NO_VALUE.has(rule.op)) return true;
    if (LIST.has(rule.op)) return Array.isArray(rule.values) && rule.values.length > 0;
    if (rule.op === 'between') return !isBlank(rule.value) && !isBlank(rule.value2);
    return rule.value !== undefined && rule.value !== null && (rule.value !== '' || rule.op === 'eq' || rule.op === 'ne');
}

/**
 * Drops incomplete rules and empty groups; returns null when nothing is left.
 */
export function normalizeQuery(node: QueryNode | null | undefined): QueryNode | null {
    if (!node) return null;
    if (node.type === 'rule') return isCompleteRule(node) ? { ...node } : null;
    const children = node.children.map(normalizeQuery).filter((child): child is QueryNode => child !== null);
    if (!children.length) return null;
    const group: QueryGroup = { type: 'group', join: node.join === 'or' ? 'or' : 'and', children };
    if (node.not) group.not = true;
    return group;
}

export function isQueryActive(node: QueryNode | null | undefined): boolean {
    return normalizeQuery(node) !== null;
}

const isRange = (column: QueryColumn) => NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type);

const asCondition = (rule: QueryRule, column: QueryColumn): FilterCondition => {
    // the column filter names equality "equals" on text/select columns, "eq" on number/date/boolean ones
    const textual = !isRange(column) && column.type !== 'boolean';
    const op = textual && rule.op === 'eq' ? 'equals' : textual && rule.op === 'ne' ? 'notEquals' : rule.op;
    return { op: op as FilterCondition['op'], value: rule.value, value2: rule.value2 };
};

/**
 * SorlaDB operators for one rule, or null when SorlaDB cannot express it.
 */
function ruleOperators(rule: QueryRule, column: QueryColumn, locale: string): SorlaQuery | null {
    if (LIST.has(rule.op)) return { [rule.op === 'in' ? '$in' : '$nin']: [...(rule.values ?? [])] };
    if (TEXT_MATCH.has(rule.op)) return toSorla({ op: rule.op as FilterCondition['op'], value: rule.value }, column, locale);
    if (!isRange(column) && column.type !== 'boolean') {
        // text and select equality are exact in the builder (SorlaDB $eq), unlike the case insensitive column filter
        if (rule.op === 'eq') return { $eq: rule.value ?? '' };
        if (rule.op === 'ne') return { $ne: rule.value ?? '' };
    }
    return toSorla({ op: rule.op as FilterCondition['op'], value: rule.value, value2: rule.value2 }, column, locale);
}

function ruleTest(rule: QueryRule, column: QueryColumn, locale: string): (row: RowData) => boolean {
    return row => testCondition(row[rule.field], asCondition(rule, column), column, locale);
}

type Compiled = { kind: 'sorla'; query: SorlaQuery } | { kind: 'js'; test: (row: RowData) => boolean };

export interface CompileOptions {
    locale?: string;
    /** Ids of the rows matching a SorlaDB query (used when a group mixes SorlaDB and grid side rules). */
    idsFor: (query: SorlaQuery) => Set<string>;
}

function compileNode(node: QueryNode, columns: Map<string, QueryColumn>, options: CompileOptions): Compiled {
    const locale = options.locale ?? 'en-US';
    if (node.type === 'rule') {
        const column = columns.get(node.field) ?? { field: node.field, type: 'text', title: node.field };
        const operators = ruleOperators(node, column, locale);
        return operators ? { kind: 'sorla', query: { [node.field]: operators } } : { kind: 'js', test: ruleTest(node, column, locale) };
    }

    const children = node.children.map(child => compileNode(child, columns, options));
    if (children.every(child => child.kind === 'sorla')) {
        const queries = children.map(child => (child as { query: SorlaQuery }).query);
        const inner = queries.length === 1 ? queries[0]! : { [node.join === 'or' ? '$or' : '$and']: queries };
        return { kind: 'sorla', query: node.not ? { $nor: [inner] } : inner };
    }

    // mixed group: each SorlaDB subtree still runs as one find(), the grid combines the results
    const tests = children.map(child => {
        if (child.kind === 'js') return child.test;
        let ids: Set<string> | null = null;
        return (row: RowData) => (ids ??= options.idsFor(child.query)).has(row._id);
    });
    const combined = node.join === 'or'
        ? (row: RowData) => tests.some(test => test(row))
        : (row: RowData) => tests.every(test => test(row));
    return { kind: 'js', test: node.not ? row => !combined(row) : combined };
}

/**
 * Compiles a query into a SorlaDB query plus grid side predicates. A top level AND keeps its
 * SorlaDB children in the query and only moves the others to predicates.
 */
export function compileQuery(node: QueryNode | null | undefined, columns: Map<string, QueryColumn>, options: CompileOptions): { query: SorlaQuery; predicates: Array<(row: RowData) => boolean> } {
    const normalized = normalizeQuery(node);
    if (!normalized) return { query: {}, predicates: [] };

    if (normalized.type === 'group' && normalized.join === 'and' && !normalized.not) {
        const clauses: SorlaQuery[] = [];
        const predicates: Array<(row: RowData) => boolean> = [];
        for (const child of normalized.children) {
            const compiled = compileNode(child, columns, options);
            if (compiled.kind === 'sorla') clauses.push(compiled.query);
            else predicates.push(compiled.test);
        }
        return { query: andQuery(clauses), predicates };
    }

    const compiled = compileNode(normalized, columns, options);
    return compiled.kind === 'sorla' ? { query: compiled.query, predicates: [] } : { query: {}, predicates: [compiled.test] };
}

const unescapeRegex = (text: string) => text.replace(/\\(.)/g, '$1');

/**
 * The query as MongoDB / SorlaDB JSON (text rules are case insensitive $regex conditions).
 */
export function toSorlaQuery(node: QueryNode | null | undefined, columns: Map<string, QueryColumn>, locale = 'en-US'): SorlaQuery {
    const normalized = normalizeQuery(node);
    if (!normalized) return {};

    const write = (current: QueryNode): SorlaQuery => {
        if (current.type === 'rule') {
            const column = columns.get(current.field) ?? { field: current.field, type: 'text', title: current.field };
            const operators = ruleOperators(current, column, locale);
            if (operators) return { [current.field]: operators };
            const text = escapeRegex(String(current.value ?? ''));
            const pattern = current.op === 'startsWith' ? `^${text}` : current.op === 'endsWith' ? `${text}$` : text;
            const regex = { $regex: pattern, $options: 'i' };
            return { [current.field]: current.op === 'notContains' ? { $not: regex } : regex };
        }
        const parts = current.children.map(write);
        const inner = parts.length === 1 ? parts[0]! : { [current.join === 'or' ? '$or' : '$and']: parts };
        return current.not ? { $nor: [inner] } : inner;
    };
    return write(normalized);
}

const OPERATOR_FROM_SORLA: Record<string, QueryOperator> = { $eq: 'eq', $ne: 'ne', $gt: 'gt', $gte: 'gte', $lt: 'lt', $lte: 'lte', $in: 'in', $nin: 'nin' };

/**
 * Reads a SorlaDB / MongoDB query (as produced by toSorlaQuery) back into the builder model.
 * @throws Error on constructs the builder cannot represent
 */
export function fromSorlaQuery(query: SorlaQuery): QueryGroup {
    const readField = (field: string, condition: unknown): QueryNode[] => {
        if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
            return [{ type: 'rule', field, op: 'eq', value: condition }];
        }
        const ops = { ...(condition as Record<string, unknown>) };

        if ('$regex' in ops) {
            const pattern = String(ops.$regex);
            if (pattern.startsWith('^')) return [{ type: 'rule', field, op: 'startsWith', value: unescapeRegex(pattern.slice(1)) }];
            if (pattern.endsWith('$') && !pattern.endsWith('\\$')) return [{ type: 'rule', field, op: 'endsWith', value: unescapeRegex(pattern.slice(0, -1)) }];
            return [{ type: 'rule', field, op: 'contains', value: unescapeRegex(pattern) }];
        }
        const not = ops.$not as Record<string, unknown> | undefined;
        if (not && typeof not === 'object' && '$regex' in not) {
            return [{ type: 'rule', field, op: 'notContains', value: unescapeRegex(String(not.$regex)) }];
        }
        if (ops.$eq === '' && Object.keys(ops).length === 1) return [{ type: 'rule', field, op: 'empty' }];
        if (ops.$ne === '' && Object.keys(ops).length === 1) return [{ type: 'rule', field, op: 'notEmpty' }];
        // "$ne: ''" is how range rules skip blanks, it is implied by the range operator
        if (ops.$ne === '' && Object.keys(ops).some(key => key !== '$ne')) delete ops.$ne;
        if ('$gte' in ops && '$lte' in ops) {
            const rule: QueryRule = { type: 'rule', field, op: 'between', value: ops.$gte, value2: ops.$lte };
            delete ops.$gte;
            delete ops.$lte;
            return [rule, ...readField(field, ops)];
        }

        return Object.entries(ops).map(([operator, value]) => {
            if (operator === '$not') return { ...emptyGroup(), not: true, children: readField(field, value) };
            const op = OPERATOR_FROM_SORLA[operator];
            if (!op) throw new Error(`The query builder cannot represent ${operator}`);
            return op === 'in' || op === 'nin'
                ? { type: 'rule', field, op, values: [...(value as unknown[])] }
                : { type: 'rule', field, op, value };
        });
    };

    const read = (current: SorlaQuery, join: 'and' | 'or' = 'and'): QueryGroup => {
        const children: QueryNode[] = [];
        for (const [key, value] of Object.entries(current)) {
            if (key === '$and' || key === '$or' || key === '$nor') {
                if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
                const groups = value.map(item => read(item as SorlaQuery));
                if (key === '$nor') {
                    children.push({ type: 'group', join: 'or', not: true, children: groups.flatMap(unwrap) });
                } else {
                    children.push({ type: 'group', join: key === '$or' ? 'or' : 'and', children: groups.flatMap(unwrap) });
                }
            } else if (key.startsWith('$')) {
                throw new Error(`The query builder cannot represent ${key}`);
            } else {
                children.push(...readField(key, value));
            }
        }
        return { type: 'group', join, children };
    };

    // a single-child AND group inside another group is just its child
    const unwrap = (group: QueryGroup): QueryNode[] => group.join === 'and' && !group.not && group.children.length === 1 ? [group.children[0]!] : [group];

    const root = read(query);
    const only = root.children[0];
    if (root.children.length === 1 && only && only.type === 'group') return only;
    return root;
}

const OPERATOR_SYMBOLS: Partial<Record<QueryOperator, string>> = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

/**
 * Readable text: "Age ≥ 30 AND (Name = X OR City in A, B)".
 */
export function describeQuery(
    node: QueryNode | null | undefined,
    columns: Map<string, QueryColumn>,
    t: Translator,
    format: (value: unknown, column: QueryColumn) => string
): string {
    const normalized = normalizeQuery(node);
    if (!normalized) return '';

    const text = (current: QueryNode, nested: boolean): string => {
        if (current.type === 'rule') {
            const column = columns.get(current.field) ?? { field: current.field, type: 'text', title: current.field };
            const show = (value: unknown) => isBlank(value) ? t('blanks') : format(value, column);
            const symbol = OPERATOR_SYMBOLS[current.op];
            if (symbol) return `${column.title} ${symbol} ${show(current.value)}`;
            if (NO_VALUE.has(current.op)) return `${column.title} ${t(`op_${current.op}`).toLowerCase()}`;
            if (LIST.has(current.op)) return `${column.title} ${t(`q_${current.op}`)} ${(current.values ?? []).map(show).join(', ')}`;
            if (current.op === 'between') return `${column.title} ${t('op_between').toLowerCase()} ${show(current.value)} – ${show(current.value2)}`;
            return `${column.title} ${t(`op_${current.op}`).toLowerCase()} "${String(current.value ?? '')}"`;
        }
        const joined = current.children.map(child => text(child, true)).join(` ${t(current.join === 'or' ? 'or' : 'and').toUpperCase()} `);
        const wrapped = (nested && current.children.length > 1) || current.not ? `(${joined})` : joined;
        return current.not ? `${t('not').toUpperCase()} ${wrapped}` : wrapped;
    };
    return text(normalized, false);
}
