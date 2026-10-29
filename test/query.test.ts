import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla } from './helpers.ts';
import { SorlaStore } from '../src/core/store.ts';
import { normalizeColumn } from '../src/core/columns.ts';
import { compileFilters, testCondition } from '../src/core/filters.ts';
import { compileQuery, describeQuery, fromSorlaQuery, normalizeQuery, toSorlaQuery } from '../src/core/query.ts';
import { createTranslator } from '../src/i18n/labels.ts';
import type { Column, FilterCondition, QueryGroup, QueryNode, RowData } from '../src/types.ts';

const defaults = { locale: 'en-US', editable: false, cellFormulas: false };
const columns = new Map<string, Column>([
    ['name', normalizeColumn({ field: 'name', title: 'Name' }, defaults)],
    ['age', normalizeColumn({ field: 'age', title: 'Age', type: 'integer' }, defaults)],
    ['city', normalizeColumn({ field: 'city', title: 'City', options: ['A', 'B', 'C'] }, defaults)],
    ['joined', normalizeColumn({ field: 'joined', title: 'Joined', type: 'date' }, defaults)],
    ['active', normalizeColumn({ field: 'active', title: 'Active', type: 'boolean' }, defaults)]
]);
const people = [
    { id: 1, name: 'Ana', age: 25, city: 'A', joined: '2024-01-10', active: true },
    { id: 2, name: 'Bruno', age: 31, city: 'B', joined: '2025-03-01', active: false },
    { id: 3, name: 'Carla', age: 42, city: 'C', joined: '2023-07-20', active: true },
    { id: 4, name: 'Davi', age: 35, city: 'A', joined: null, active: false },
    { id: 5, name: 'X', age: 30, city: 'C', joined: '2026-02-02', active: true },
    { id: 6, name: 'Xavier', age: null, city: 'B', joined: '2022-12-31', active: true }
];

function setup() {
    const store = new SorlaStore({ sorla: Sorla, idField: 'id' });
    store.setFields([...columns.keys()]);
    store.insert(people);
    const finds: Array<Record<string, unknown>> = [];
    const idsFor = (query: Record<string, unknown>) => {
        finds.push(query);
        return new Set(store.query({ query }).map(row => row._id));
    };
    const run = (node: QueryNode) => {
        const { query, predicates } = compileQuery(node, columns, { locale: 'en-US', idsFor });
        return store.query({ query, predicates }).map(row => row.name);
    };
    return { store, run, finds };
}

const rule = (field: string, op: string, value?: unknown, extra: Record<string, unknown> = {}): QueryNode =>
    ({ type: 'rule', field, op, value, ...extra }) as QueryNode;
const group = (join: 'and' | 'or', children: QueryNode[], not = false): QueryGroup => ({ type: 'group', join, children, ...(not ? { not } : {}) });

test('the example from the issue: age ≥ 30 AND (name = X OR city in [A, B])', () => {
    const { run } = setup();
    const query = group('and', [rule('age', 'gte', 30), group('or', [rule('name', 'eq', 'X'), rule('city', 'in', undefined, { values: ['A', 'B'] })])]);
    assert.deepEqual(run(query), ['Bruno', 'Davi', 'X']);
    assert.deepEqual(toSorlaQuery(query, columns), {
        $and: [
            { age: { $gte: 30, $ne: '' } },
            { $or: [{ name: { $eq: 'X' } }, { city: { $in: ['A', 'B'] } }] }
        ]
    });
});

test('fully expressible queries run as a single SorlaDB find()', () => {
    const { run, finds } = setup();
    const query = group('or', [group('and', [rule('city', 'eq', 'A'), rule('age', 'lt', 30)]), rule('active', 'eq', false)]);
    const { query: sorla, predicates } = compileQuery(query, columns, { idsFor: () => new Set() });
    assert.equal(predicates.length, 0);
    assert.deepEqual(sorla, { $or: [{ $and: [{ city: { $eq: 'A' } }, { age: { $lt: 30, $ne: '' } }] }, { active: { $eq: false } }] });
    assert.deepEqual(run(query), ['Ana', 'Bruno', 'Davi']);
    assert.equal(finds.length, 0, 'no extra finds');
});

test('NOT groups become $nor', () => {
    const { run } = setup();
    const query = group('and', [group('or', [rule('city', 'eq', 'A'), rule('age', 'gt', 40)], true)]);
    assert.deepEqual(toSorlaQuery(query, columns), { $nor: [{ $or: [{ city: { $eq: 'A' } }, { age: { $gt: 40, $ne: '' } }] }] });
    assert.deepEqual(run(query), ['Bruno', 'X', 'Xavier']);
});

test('text matching runs in the grid, SorlaDB subtrees still run in find()', () => {
    const { run, finds } = setup();
    const query = group('or', [rule('name', 'startsWith', 'x'), group('and', [rule('city', 'eq', 'A'), rule('active', 'eq', true)])]);
    assert.deepEqual(run(query), ['Ana', 'X', 'Xavier']);
    assert.deepEqual(finds, [{ $and: [{ city: { $eq: 'A' } }, { active: { $eq: true } }] }], 'the AND subtree ran as one find()');
    assert.deepEqual(toSorlaQuery(query, columns), {
        $or: [{ name: { $regex: '^x', $options: 'i' } }, { $and: [{ city: { $eq: 'A' } }, { active: { $eq: true } }] }]
    });
});

test('a top level AND keeps SorlaDB children in the query and moves only text rules to predicates', () => {
    const query = group('and', [rule('age', 'between', 25, { value2: 35 }), rule('name', 'contains', 'a')]);
    const { query: sorla, predicates } = compileQuery(query, columns, { idsFor: () => new Set() });
    assert.deepEqual(sorla, { age: { $gte: 25, $lte: 35, $ne: '' } });
    assert.equal(predicates.length, 1);
    assert.deepEqual(setup().run(query), ['Ana', 'Davi'], 'Bruno is in range but has no "a"');
});

test('blanks, dates and every operator', () => {
    const { run } = setup();
    assert.deepEqual(run(rule('joined', 'empty')), ['Davi']);
    assert.deepEqual(run(rule('age', 'notEmpty')), ['Ana', 'Bruno', 'Carla', 'Davi', 'X']);
    assert.deepEqual(run(rule('joined', 'gte', '2025-01-01')), ['Bruno', 'X']);
    assert.deepEqual(run(rule('joined', 'lt', '01/01/2024')), ['Carla', 'Xavier'], 'locale dates are parsed');
    assert.deepEqual(run(rule('age', 'ne', 30)), ['Ana', 'Bruno', 'Carla', 'Davi', 'Xavier']);
    assert.deepEqual(run(rule('city', 'nin', undefined, { values: ['A', 'C'] })), ['Bruno', 'Xavier']);
    assert.deepEqual(run(rule('name', 'notContains', 'a')), ['Bruno', 'X']);
    assert.deepEqual(run(rule('name', 'endsWith', 'IER')), ['Xavier']);
    assert.deepEqual(run(rule('name', 'eq', 'x')), [], 'builder equality is exact');
});

test('incomplete rules and empty groups are ignored', () => {
    const query = group('and', [rule('age', 'gte', ''), group('or', []), rule('city', 'in', undefined, { values: [] }), rule('name', 'eq', 'Ana')]);
    assert.deepEqual(normalizeQuery(query), group('and', [rule('name', 'eq', 'Ana')]));
    assert.equal(normalizeQuery(group('and', [rule('age', 'gt', '')])), null);
});

test('toSorlaQuery / fromSorlaQuery round trip', () => {
    const queries: QueryNode[] = [
        group('and', [rule('age', 'gte', 30), group('or', [rule('name', 'eq', 'X'), rule('city', 'in', undefined, { values: ['A', 'B'] })])]),
        group('or', [rule('name', 'contains', 'a.b'), rule('name', 'startsWith', 'x'), rule('name', 'endsWith', 'z'), rule('name', 'notContains', 'q')]),
        group('and', [rule('age', 'between', 20, { value2: 40 }), rule('joined', 'empty'), rule('active', 'eq', true)]),
        group('and', [group('or', [rule('city', 'eq', 'A'), rule('city', 'eq', 'B')], true), rule('age', 'nin', undefined, { values: [30, 31] })])
    ];
    for (const query of queries) {
        const json = toSorlaQuery(query, columns);
        const back = fromSorlaQuery(json);
        assert.deepEqual(toSorlaQuery(back, columns), json, JSON.stringify(json));
        // and the parsed model selects the same rows
        assert.deepEqual(setup().run(back), setup().run(query), JSON.stringify(json));
    }
    assert.throws(() => fromSorlaQuery({ age: { $exists: true } }), /\$exists/);
});

test('describeQuery reads like the builder', () => {
    const t = createTranslator('en-US');
    const query = group('and', [rule('age', 'gte', 30), group('or', [rule('name', 'eq', 'X'), rule('city', 'in', undefined, { values: ['A', 'B'] })])]);
    const text = describeQuery(query, columns, t, value => String(value));
    assert.equal(text, 'Age ≥ 30 AND (Name = X OR City in A, B)');
    assert.equal(describeQuery(group('or', [rule('name', 'contains', 'a')], true), columns, t, String), 'NOT (Name contains "a")');
    assert.equal(describeQuery(group('and', [rule('name', 'contains', 'a')], true), columns, createTranslator('pt-BR'), String), 'NÃO (Name contém "a")');
});

test('column filters joined by OR now run in SorlaDB', () => {
    const { query, predicates } = compileFilters({ age: { join: 'or', conditions: [{ op: 'lt', value: 30 }, { op: 'gt', value: 40 }] } }, columns);
    assert.equal(predicates.length, 0);
    assert.deepEqual(query, { $or: [{ age: { $lt: 30, $ne: '' } }, { age: { $gt: 40, $ne: '' } }] });
    const { store } = setup();
    assert.deepEqual(store.query({ query }).map(r => r.name), ['Ana', 'Carla']);
});

test('300 random builder queries match a plain JS evaluation', () => {
    const { run } = setup();
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
    const values: Record<string, () => unknown> = {
        name: () => pick(['Ana', 'X', 'a', 'x', 'r']), age: () => pick([25, 30, 31, 35, 40]),
        city: () => pick(['A', 'B', 'C']), joined: () => pick(['2023-01-01', '2024-06-01', '2025-06-01']), active: () => random() > 0.5
    };
    const ops: Record<string, string[]> = {
        name: ['eq', 'ne', 'contains', 'notContains', 'startsWith', 'endsWith', 'empty', 'notEmpty', 'in'],
        age: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty', 'in', 'nin'],
        city: ['eq', 'ne', 'in', 'nin'], joined: ['gt', 'lt', 'gte', 'lte', 'empty'], active: ['eq']
    };
    const makeRule = (): QueryNode => {
        const field = pick(Object.keys(values));
        const op = pick(ops[field]!);
        if (op === 'in' || op === 'nin') return rule(field, op, undefined, { values: [values[field]!(), values[field]!()] });
        if (op === 'between') return rule(field, op, 25, { value2: 35 });
        return rule(field, op, values[field]!());
    };
    const makeNode = (depth: number): QueryNode => depth < 3 && random() > 0.5
        ? group(random() > 0.5 ? 'and' : 'or', Array.from({ length: 1 + Math.floor(random() * 3) }, () => makeNode(depth + 1)), random() > 0.8)
        : makeRule();

    // reference: evaluate the tree directly with the column filter semantics
    const exact = (row: RowData, r: Extract<QueryNode, { type: 'rule' }>) => {
        const value = row[r.field];
        const column = columns.get(r.field)!;
        if (r.op === 'in' || r.op === 'nin') return (r.values ?? []).includes(value) === (r.op === 'in');
        if ((r.op === 'eq' || r.op === 'ne') && (column.type === 'text' || column.type === 'select')) return (value === (r.value ?? '')) === (r.op === 'eq');
        const op = (r.op === 'eq' ? 'eq' : r.op) as FilterCondition['op'];
        return testCondition(value, { op, value: r.value, value2: r.value2 }, column, 'en-US');
    };
    const reference = (row: RowData, node: QueryNode): boolean => {
        if (node.type === 'rule') return exact(row, node);
        const results = node.children.map(child => reference(row, child));
        const combined = node.join === 'or' ? results.some(Boolean) : results.every(Boolean);
        return node.not ? !combined : combined;
    };

    const { store } = setup();
    const all = store.query();
    for (let i = 0; i < 300; i++) {
        const query = group('and', [makeNode(0)]);
        const expected = all.filter(row => reference(row, normalizeQuery(query) ?? group('and', []))).map(row => row.name);
        assert.deepEqual(run(query), expected, JSON.stringify(query));
    }
});
