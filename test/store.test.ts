import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla } from './helpers.ts';
import { SorlaStore } from '../src/core/store.ts';
import { compileFilters } from '../src/core/filters.ts';
import { normalizeColumn } from '../src/core/columns.ts';
import type { FilterModel, RowData, SortEntry } from '../src/types.ts';

const grid = { locale: 'en-US', editable: false, cellFormulas: false };
const columns = new Map([
    ['name', normalizeColumn({ field: 'name' }, grid)],
    ['age', normalizeColumn({ field: 'age', type: 'integer' }, grid)],
    ['city', normalizeColumn({ field: 'city', options: ['Ribeirão Preto', 'São Paulo', 'Curitiba'] }, grid)],
    ['since', normalizeColumn({ field: 'since', type: 'date' }, grid)],
    ['active', normalizeColumn({ field: 'active', type: 'boolean' }, grid)]
]);

function createStore() {
    const store = new SorlaStore({ sorla: Sorla, idField: 'id' });
    store.setFields([...columns.keys()]);
    store.insert([
        { id: 1, name: 'Sonia', age: 53, city: 'Ribeirão Preto', since: '2020-01-10', active: true },
        { id: 2, name: 'Anderson', age: 36, city: 'São Paulo', since: '2021-06-01', active: true },
        { id: 3, name: 'bruno', age: null, city: 'Curitiba', since: null, active: false },
        { id: 4, name: 'Carla', age: 28, city: 'São Paulo', since: '2023-03-15', active: false },
        { id: 5, name: 'alice', age: 36 }
    ]);
    return store;
}

const names = (rows: RowData[]) => rows.map(r => r.name);
const run = (store: SorlaStore, filters: FilterModel, sort: SortEntry[] = []) => {
    const { query, predicates } = compileFilters(filters, columns, { locale: 'en-US' });
    return store.query({ query, predicates, sort });
};

test('stores rows in SorlaDB without mutating the input and accepts blanks', () => {
    const input = { id: 9, name: 'x', age: null };
    const store = new SorlaStore({ sorla: Sorla, idField: 'id' });
    store.insert([input]);
    assert.deepEqual(input, { id: 9, name: 'x', age: null });
    assert.equal(store.count(), 1);
    assert.equal(store.get('9')!.age, '');
});

test('each store gets its own SorlaDB database', () => {
    const a = createStore();
    const b = new SorlaStore({ sorla: Sorla });
    assert.notEqual(a.databaseName, b.databaseName);
    assert.equal(b.count(), 0);
});

test('numeric filters run as SorlaDB queries and skip blanks', () => {
    const store = createStore();
    const filters: FilterModel = { age: { conditions: [{ op: 'lt', value: 40 }] } };
    assert.deepEqual(compileFilters(filters, columns).query, { age: { $lt: 40, $ne: '' } });
    assert.deepEqual(names(run(store, filters)), ['Anderson', 'Carla', 'alice']);
    assert.deepEqual(names(run(store, { age: { conditions: [{ op: 'between', value: 30, value2: 60 }] } })), ['Sonia', 'Anderson', 'alice']);
    assert.deepEqual(names(run(store, { age: { conditions: [{ op: 'ne', value: 36 }] } })), ['Sonia', 'bruno', 'Carla']);
    assert.deepEqual(names(run(store, { age: { conditions: [{ op: 'empty' }] } })), ['bruno']);
});

test('checklist values use $in, booleans and dates compare in SorlaDB', () => {
    const store = createStore();
    assert.deepEqual(names(run(store, { city: { values: ['São Paulo', ''] } })), ['Anderson', 'Carla', 'alice']);
    assert.deepEqual(names(run(store, { active: { conditions: [{ op: 'eq', value: true }] } })), ['Sonia', 'Anderson']);
    assert.deepEqual(names(run(store, { since: { conditions: [{ op: 'gte', value: '2021-01-01' }] } })), ['Anderson', 'Carla']);
    assert.deepEqual(names(run(store, { since: { conditions: [{ op: 'lt', value: '01/01/2022' }] } })), ['Sonia', 'Anderson']);
});

test('text filters run in SorlaDB as case insensitive $regex, select filters match labels', () => {
    const contains = compileFilters({ name: { conditions: [{ op: 'contains', value: 'AN' }] } }, columns);
    assert.deepEqual(contains, { query: { name: { $regex: 'AN', $options: 'i' } }, predicates: [] });
    const notEquals = compileFilters({ name: { conditions: [{ op: 'notEquals', value: 'ana' }] } }, columns);
    assert.deepEqual(notEquals.query, { name: { $not: { $regex: '^ana$', $options: 'i' } } });
    const store = createStore();
    assert.deepEqual(names(run(store, { name: { conditions: [{ op: 'equals', value: 'SONIA' }] } })), ['Sonia']);
    assert.deepEqual(names(run(store, { name: { conditions: [{ op: 'endsWith', value: 'O' }] } })), ['bruno']);
    assert.deepEqual(names(run(store, { city: { conditions: [{ op: 'startsWith', value: 'são' }] } })), ['Anderson', 'Carla']);
    assert.deepEqual(names(run(store, { city: { conditions: [{ op: 'notContains', value: 'paulo' }] } })), ['Sonia', 'bruno', 'alice'], 'blanks do not contain it');
});

test('text filters are case insensitive and OR joins work', () => {
    const store = createStore();
    assert.deepEqual(names(run(store, { name: { conditions: [{ op: 'contains', value: 'AN' }] } })), ['Anderson']);
    assert.deepEqual(names(run(store, { name: { conditions: [{ op: 'startsWith', value: 'a' }] } })), ['Anderson', 'alice']);
    const or: FilterModel = { age: { join: 'or', conditions: [{ op: 'lt', value: 30 }, { op: 'gt', value: 50 }] } };
    assert.deepEqual(names(run(store, or)), ['Sonia', 'Carla']);
    const combined = { ...or, city: { values: ['São Paulo'] } };
    assert.deepEqual(names(run(store, combined)), ['Carla']);
});

test('multi column sort with Excel order: blanks last in both directions, text by locale', () => {
    const store = createStore();
    const sort: SortEntry[] = [{ field: 'age', dir: 'desc' }, { field: 'name', dir: 'asc' }];
    assert.deepEqual(names(store.query({ sort })), ['Sonia', 'alice', 'Anderson', 'Carla', 'bruno']);
    assert.deepEqual(names(store.query({ sort: [{ field: 'age', dir: 'asc' }] })), ['Carla', 'Anderson', 'alice', 'Sonia', 'bruno']);
    assert.deepEqual(names(store.query({ sort: [{ field: 'name', dir: 'asc' }] })), ['alice', 'Anderson', 'bruno', 'Carla', 'Sonia']);
    const filtered = store.query({ query: { city: { $eq: 'São Paulo' } }, sort: [{ field: 'name', dir: 'desc' }] });
    assert.deepEqual(names(filtered), ['Carla', 'Anderson']);
});

test('update and remove keep SorlaDB queries in sync', () => {
    const store = createStore();
    const previous = store.update('2', { age: 37 });
    assert.equal(previous.age, 36);
    assert.deepEqual(names(store.query({ query: { age: { $eq: 37 } } })), ['Anderson']);
    store.remove(['1', '3']);
    assert.equal(store.count(), 3);
    assert.deepEqual(names(store.query()), ['Anderson', 'Carla', 'alice']);
    assert.throws(() => store.insert([{ id: 2, name: 'dup' }]), /Duplicate/);
    store.clear();
    assert.equal(store.count(), 0);
});
