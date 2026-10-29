import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { AppendLoadParams, GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

const data = [
    { id: 1, name: 'Ana', age: 25, city: 'A' },
    { id: 2, name: 'Bruno', age: 31, city: 'B' },
    { id: 3, name: 'Carla', age: 42, city: 'C' },
    { id: 4, name: 'X', age: 30, city: 'C' }
];

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', data,
        columns: [{ field: 'name', title: 'Name' }, { field: 'age', title: 'Age', type: 'integer' }, { field: 'city', title: 'City', options: ['A', 'B', 'C'] }],
        ...options
    });
}

const names = (grid: IntelligentGridType) => [...grid.root.querySelectorAll('tbody td[data-field="name"]')].map(td => td.textContent);
const panel = (grid: IntelligentGridType) => grid.root.querySelector<HTMLElement>('.ig-qb')!;
const click = (element: Element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const change = (element: HTMLSelectElement | HTMLInputElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new window.Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};
const buttonByText = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find(b => b.textContent === text)!;
const wait = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

test('builds "age ≥ 30 AND (name = X OR city in [A, B])" with clicks', async () => {
    const grid = create();
    click(buttonByText(grid.root.querySelector('.ig-navbar')!, 'Advanced filter'));
    assert.equal(panel(grid).hidden, false);

    // first rule: Age ≥ 30
    let [field, op] = panel(grid).querySelectorAll<HTMLSelectElement>('.ig-qb-rule select');
    change(field!, 'age');
    [field, op] = panel(grid).querySelectorAll<HTMLSelectElement>('.ig-qb-rule select');
    change(op!, 'gte');
    change(panel(grid).querySelector<HTMLInputElement>('.ig-qb-rule input')!, '30');

    // nested OR group with name = X
    click(buttonByText(panel(grid), '+ Group'));
    const nested = panel(grid).querySelector('.ig-qb-group .ig-qb-group')!;
    assert.equal(nested.getAttribute('data-join'), 'or', 'a nested group starts with the other join');
    change(nested.querySelector<HTMLInputElement>('.ig-qb-rule input')!, 'X');

    // second rule in the nested group: City is one of A, B
    click(buttonByText(nested, '+ Rule'));
    const cityRule = panel(grid).querySelectorAll('.ig-qb-group .ig-qb-group .ig-qb-rule')[1]!;
    change(cityRule.querySelector<HTMLSelectElement>('select')!, 'city');
    const cityRuleAgain = panel(grid).querySelectorAll('.ig-qb-group .ig-qb-group .ig-qb-rule')[1]!;
    change(cityRuleAgain.querySelectorAll<HTMLSelectElement>('select')[1]!, 'in');
    const list = panel(grid).querySelectorAll('.ig-qb-group .ig-qb-group .ig-qb-rule')[1]!.querySelector<HTMLSelectElement>('select[multiple]')!;
    for (const option of list.options) option.selected = option.textContent === 'A' || option.textContent === 'B';
    list.dispatchEvent(new window.Event('change', { bubbles: true }));

    const json = JSON.parse(panel(grid).querySelector('.ig-qb-json')!.textContent!);
    assert.deepEqual(json, { $and: [{ age: { $gte: 30, $ne: '' } }, { $or: [{ name: { $eq: 'X' } }, { city: { $in: ['A', 'B'] } }] }] });
    await wait();
    assert.match(panel(grid).querySelector('.ig-qb-preview')!.textContent!, /2 matching/);
    assert.deepEqual(names(grid), ['Ana', 'Bruno', 'Carla', 'X'], 'nothing applied before Apply');

    click(buttonByText(panel(grid), 'Apply'));
    assert.equal(panel(grid).hidden, true);
    assert.deepEqual(names(grid), ['Bruno', 'X']);
    assert.equal(grid.root.querySelector('.ig-chip-query')!.textContent, 'Age ≥ 30 AND (Name = X OR City in A, B)×');
    assert.ok(grid.root.querySelector('.ig-query-btn')!.classList.contains('ig-active'));
    assert.deepEqual(grid.toSorlaQuery(), json);
});

test('the advanced filter combines with column filters and search; chip and clear remove it', () => {
    const grid = create();
    grid.fromSorlaQuery({ $or: [{ city: 'C' }, { age: { $lt: 30 } }] });
    assert.deepEqual(names(grid), ['Ana', 'Carla', 'X']);
    grid.setFilter('age', { conditions: [{ op: 'gt', value: 29 }] });
    assert.deepEqual(names(grid), ['Carla', 'X']);
    grid.setSearch('car');
    assert.deepEqual(names(grid), ['Carla']);

    click(grid.root.querySelector('.ig-chip-query .ig-chip-remove')!);
    assert.equal(grid.getQuery(), null);
    assert.deepEqual(names(grid), ['Carla']);
    grid.setQuery({ type: 'rule', field: 'name', op: 'contains', value: 'a' });
    grid.clearFilters();
    assert.equal(grid.getQuery(), null);
    assert.equal(names(grid).length, 4);
});

test('Esc and Cancel discard the draft; reopening shows the applied query', () => {
    const grid = create({ initialQuery: { type: 'rule', field: 'city', op: 'eq', value: 'C' } });
    assert.deepEqual(names(grid), ['Carla', 'X']);
    grid.toggleQueryBuilder(true);
    assert.equal(panel(grid).querySelectorAll('.ig-qb-rule').length, 1);
    click(buttonByText(panel(grid), '+ Rule'));
    panel(grid).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(panel(grid).hidden, true);
    assert.deepEqual(names(grid), ['Carla', 'X']);
    grid.toggleQueryBuilder(true);
    assert.equal(panel(grid).querySelectorAll('.ig-qb-rule').length, 1, 'the extra draft rule was discarded');
});

test('NOT, removing rules and groups', () => {
    const grid = create();
    grid.toggleQueryBuilder(true);
    change(panel(grid).querySelector<HTMLInputElement>('.ig-qb-rule input')!, 'Ana');
    const not = panel(grid).querySelector<HTMLInputElement>('.ig-qb-not input')!;
    not.checked = true;
    not.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.deepEqual(JSON.parse(panel(grid).querySelector('.ig-qb-json')!.textContent!), { $nor: [{ name: { $eq: 'Ana' } }] });
    click(buttonByText(panel(grid), 'Apply'));
    assert.deepEqual(names(grid), ['Bruno', 'Carla', 'X']);

    grid.toggleQueryBuilder(true);
    click(panel(grid).querySelector('.ig-qb-rule .ig-qb-remove')!);
    assert.match(panel(grid).textContent!, /Add a rule to start/);
    click(buttonByText(panel(grid), 'Apply'));
    assert.equal(grid.getQuery(), null, 'an empty query clears the advanced filter');
});

test('text rules are flagged as grid side and explained', () => {
    const grid = create();
    grid.toggleQueryBuilder(true);
    change(panel(grid).querySelectorAll<HTMLSelectElement>('.ig-qb-rule select')[1]!, 'contains');
    assert.ok(panel(grid).querySelector('.ig-qb-badge'));
    assert.equal(panel(grid).querySelector<HTMLElement>('.ig-qb-note')!.hidden, false);
});

test('events and append mode receive the query', async () => {
    const calls: AppendLoadParams[] = [];
    const grid = create({
        data: [],
        append: { pageSize: 50, load: async params => { calls.push(params); return { rows: data, hasMore: false }; } }
    });
    const changes: unknown[] = [];
    grid.on('queryChange', e => changes.push(e.detail.sorlaQuery));
    await wait(20);
    grid.setQuery({ type: 'group', join: 'or', children: [{ type: 'rule', field: 'age', op: 'lt', value: 30 }, { type: 'rule', field: 'city', op: 'eq', value: 'B' }] });
    await wait(20);
    const last = calls.at(-1)!;
    assert.deepEqual(last.sorlaQuery, { $or: [{ age: { $lt: 30, $ne: '' } }, { city: { $eq: 'B' } }] });
    assert.equal(last.offset, 0, 'a new query reloads from the start');
    assert.equal(names(grid).length, 4, 'server side: the grid does not filter again');
    assert.deepEqual(changes, [last.sorlaQuery]);
});

test('navbar.query: false hides the button', () => {
    const grid = create({ navbar: { query: false } });
    assert.equal(grid.root.querySelector('.ig-query-btn'), null);
    assert.equal(grid.root.querySelector('.ig-qb'), null);
});
