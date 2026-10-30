import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

function create(): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id',
        columns: [{ field: 'name' }, { field: 'qty', type: 'integer' }, { field: 'paid', type: 'boolean' }],
        data: [{ id: 1, name: 'Recife', qty: 2, paid: true }, { id: 2, name: 'Curitiba', qty: 5, paid: false }, { id: 3, name: 'Natal', qty: 2, paid: false }]
    });
}

function openMenu(grid: IntelligentGridType, field: string) {
    grid.root.querySelector<HTMLElement>(`th[data-field="${field}"] .ig-filter-btn`)!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const menu = grid.root.querySelector('.ig-filter-menu')!;
    const [op, value] = menu.querySelectorAll<HTMLSelectElement | HTMLInputElement>('.ig-condition .ig-input');
    const apply = [...menu.querySelectorAll('button')].find(b => b.textContent === 'Apply')!;
    return { op: op as HTMLSelectElement, value: value as HTMLInputElement | HTMLSelectElement, apply };
}
const type = (input: HTMLInputElement | HTMLSelectElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
};

test('typing a value without an operator filters with "contains" on text columns', () => {
    const grid = create();
    const { op, value, apply } = openMenu(grid, 'name');
    assert.equal(op.value, '');
    type(value, 'i');
    assert.equal(op.value, 'contains', 'the operator shows up as soon as the user types');
    apply.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(grid.getFilters().name!.conditions, [{ op: 'contains', value: 'i', value2: '' }]);
    assert.deepEqual(grid.getRows('filtered').map(r => r.name), ['Recife', 'Curitiba']);
});

test('numbers default to "equals"; an operator the user chose is kept', () => {
    const grid = create();
    let menu = openMenu(grid, 'qty');
    type(menu.value, '2');
    assert.equal(menu.op.value, 'eq');
    menu.apply.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(grid.getRows('filtered').map(r => r.id), [1, 3]);

    menu = openMenu(grid, 'qty');
    menu.op.value = 'gt';
    menu.op.dispatchEvent(new window.Event('change', { bubbles: true }));
    type(menu.value, '2');
    assert.equal(menu.op.value, 'gt');
});

test('boolean columns get no default: applying without an operator adds no condition', () => {
    const grid = create();
    const { op, apply } = openMenu(grid, 'paid');
    assert.equal(op.value, '');
    apply.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(grid.getFilters().paid?.conditions, undefined);
    assert.equal(grid.getRows('filtered').length, 3);
});
