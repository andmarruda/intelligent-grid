import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

const data = [
    { id: 1, region: 'South', city: 'Porto Alegre', sales: 10 },
    { id: 2, region: 'North', city: 'Manaus', sales: 5 },
    { id: 3, region: 'South', city: 'Curitiba', sales: 20 },
    { id: 4, region: 'South', city: 'Porto Alegre', sales: 30 },
    { id: 5, region: '', city: 'Nowhere', sales: 1 }
];

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', editable: true, data,
        columns: [{ field: 'city', title: 'City' }, { field: 'region', title: 'Region' }, { field: 'sales', title: 'Sales', type: 'integer', footer: 'sum' }],
        ...options
    });
}
/** Body lines as text: group rows as "> label | subtotal", rows as their city. */
const lines = (grid: IntelligentGridType) => [...grid.root.querySelectorAll('tbody tr.ig-group-row, tbody tr.ig-row')].map(tr =>
    tr.classList.contains('ig-group-row')
        ? `> ${tr.querySelector('.ig-group-title')!.textContent}${tr.querySelector('.ig-group-count')!.textContent} | ${tr.querySelector('td:last-child')!.textContent}`
        : tr.querySelector('td[data-field="city"]')!.textContent);

test('group rows with count and subtotals; blanks last; the sort applies inside groups', () => {
    const grid = create({ groupBy: ['region'], initialSort: [{ field: 'sales', dir: 'desc' }] });
    assert.deepEqual(lines(grid), [
        '> Region: North (1) | 5', 'Manaus',
        '> Region: South (3) | 60', 'Porto Alegre', 'Curitiba', 'Porto Alegre',
        '> Region: (blank) (1) | 1', 'Nowhere'
    ]);
    assert.equal(grid.root.querySelector('tfoot td[data-field="sales"]')!.textContent, '66', 'the footer still totals every row');
    assert.deepEqual(grid.getGroups().map(g => [g.value, g.count]), [['North', 1], ['South', 3], [null, 1]]);
});

test('nested groups, collapse and expand by clicking the group row', () => {
    const grid = create({ groupBy: ['region', 'city'] });
    const south = grid.getGroups().find(g => g.value === 'South')!;
    assert.equal(grid.getGroups().filter(g => g.level === 1).length, 4);
    const toggles: unknown[] = [];
    grid.on('groupToggle', e => toggles.push(e.detail));
    grid.root.querySelector<HTMLElement>(`tr[data-group="${CSS.escape(south.key)}"] td`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(lines(grid), ['> Region: North (1) | 5', '> City: Manaus (1) | 5', 'Manaus', '> Region: South (3) | 60', '> Region: (blank) (1) | 1', '> City: Nowhere (1) | 1', 'Nowhere']);
    assert.deepEqual(toggles, [{ key: south.key, collapsed: true }]);
    assert.equal(grid.getRows('filtered').length, 5, 'collapsed rows are still in the filtered rows (export, copy)');

    grid.collapseGroups();
    assert.equal(lines(grid).length, 3);
    grid.expandGroups();
    assert.equal(lines(grid).length, 12);
});

test('subtotal: false and custom subtotals', () => {
    const grid = create({
        groupBy: ['region'],
        columns: [{ field: 'city' }, { field: 'region' }, { field: 'sales', type: 'integer', footer: 'sum', subtotal: 'max' }]
    });
    assert.match(lines(grid)[2]!, /\| 30$/);
    grid.setColumns([{ field: 'city' }, { field: 'region' }, { field: 'sales', type: 'integer', footer: 'sum', subtotal: false }]);
    grid.setGroupBy(['region']);
    assert.match(lines(grid)[0]!, /\| $/);
});

test('editing updates subtotals and moves a row when its group field changes', () => {
    const grid = create({ groupBy: ['region'] });
    grid.setCellValue('2', 'sales', 7);
    assert.equal(lines(grid)[0], '> Region: North (1) | 7');
    grid.setCellValue('3', 'region', 'North');
    assert.deepEqual(lines(grid).slice(0, 3), ['> Region: North (2) | 27', 'Manaus', 'Curitiba']);
    grid.undo();
    assert.equal(lines(grid)[0], '> Region: North (1) | 7');
});

test('arrows skip rows of collapsed groups; going to a hidden row opens its group', () => {
    const grid = create({ groupBy: ['region'] });
    const south = grid.getGroups().find(g => g.value === 'South')!;
    grid.toggleGroup(south.key, false);
    grid.setRange({ id: '2', field: 'city' });
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.deepEqual(grid.getActiveCell(), { id: '5', field: 'city' });
    assert.ok(grid.find('Curitiba').length, 'find searches collapsed rows');
    grid.goTo('3');
    assert.equal(grid.getGroups().find(g => g.value === 'South')!.collapsed, false);
    assert.ok(grid.root.querySelector('td.ig-active'));
});

test('groupsCollapsed starts closed; setGroupBy(null) ungroups', () => {
    const grid = create({ groupBy: ['region'], groupsCollapsed: true });
    assert.deepEqual(lines(grid), ['> Region: North (1) | 5', '> Region: South (3) | 60', '> Region: (blank) (1) | 1']);
    const changes: unknown[] = [];
    grid.on('groupChange', e => changes.push(e.detail));
    grid.setGroupBy(null);
    assert.equal(grid.root.querySelectorAll('tr.ig-group-row').length, 0);
    assert.equal(lines(grid).length, 5);
    assert.deepEqual(changes, [{ groupBy: [] }]);
});

test('ungrouping restores the sort order of the rows', () => {
    const grid = create({ initialSort: [{ field: 'sales', dir: 'desc' }] });
    grid.setGroupBy(['region']);
    grid.setGroupBy(null);
    assert.deepEqual(grid.getRows('filtered').map(r => r.sales), [30, 20, 10, 5, 1]);
});
