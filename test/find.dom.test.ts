import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', editable: true,
        columns: [{ field: 'name', title: 'Name' }, { field: 'city', title: 'City' }, { field: 'price', title: 'Price', type: 'currency' }],
        data: [
            { id: 1, name: 'Ana Paula', city: 'Paris', price: 1200 },
            { id: 2, name: 'Bruno', city: 'Lisbon', price: 15 },
            { id: 3, name: 'paulo', city: 'Porto', price: 1250.5 }
        ],
        ...options
    });
}
const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const bar = (grid: IntelligentGridType) => grid.root.querySelector<HTMLElement>('.ig-find')!;
const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
};

test('find matches the displayed text, in view order, with case and whole cell options', () => {
    const grid = create();
    assert.deepEqual(grid.find('paul'), [{ id: '1', field: 'name' }, { id: '3', field: 'name' }]);
    assert.deepEqual(grid.find('paul', { matchCase: true }), [{ id: '3', field: 'name' }]);
    assert.deepEqual(grid.find('bruno', { wholeCell: true }), [{ id: '2', field: 'name' }]);
    assert.deepEqual(grid.find('1,2'), [{ id: '1', field: 'price' }, { id: '3', field: 'price' }], 'formatted numbers');
    assert.deepEqual(grid.find('p', { fields: ['city'] }).map(c => c.id), ['1', '3']);
    grid.setSort([{ field: 'name', dir: 'desc' }]);
    assert.deepEqual(grid.find('paul').map(c => c.id), ['3', '1'], 'follows the sort');
});

test('Ctrl+F opens the bar; Enter walks the matches; Esc closes and clears marks', () => {
    const grid = create();
    key(grid.root.querySelector('.ig-scroll')!, 'f', { ctrlKey: true });
    assert.equal(bar(grid).hidden, false);
    const input = bar(grid).querySelector<HTMLInputElement>('.ig-find-input')!;
    input.value = 'P';
    grid['_findBar']!.search();
    assert.equal(bar(grid).querySelector('.ig-find-count')!.textContent, '1 of 4');
    assert.deepEqual(grid.getActiveCell(), { id: '1', field: 'name' });
    assert.equal(grid.root.querySelectorAll('.ig-find-match').length, 4);
    key(input, 'Enter');
    assert.deepEqual(grid.getActiveCell(), { id: '1', field: 'city' });
    key(input, 'Enter', { shiftKey: true });
    key(input, 'Enter', { shiftKey: true });
    assert.deepEqual(grid.getActiveCell(), { id: '3', field: 'city' }, 'wraps around');

    type(input, 'zzz');
    grid['_findBar']!.search();
    assert.equal(bar(grid).querySelector('.ig-find-count')!.textContent, 'No matches');
    key(input, 'Escape');
    assert.equal(bar(grid).hidden, true);
    assert.equal(grid.root.querySelectorAll('.ig-find-match').length, 0);
});

test('replace and replace all edit what you would type, as one undo step', () => {
    const grid = create();
    assert.equal(grid.replace('paul', 'Paul', { cells: [{ id: '3', field: 'name' }] }), 1);
    assert.equal(grid.getRow('3')!.name, 'Paulo');
    assert.equal(grid.replace('P', 'B'), 4, 'names and cities');
    assert.deepEqual(grid.getRows().map(r => [r.name, r.city]), [['Ana Baula', 'Baris'], ['Bruno', 'Lisbon'], ['Baulo', 'Borto']]);
    grid.undo();
    assert.equal(grid.getRow('1')!.city, 'Paris');
    assert.equal(grid.getRow('3')!.name, 'Paulo', 'the earlier single replace is its own step');
    assert.equal(grid.replace('15', '16', { wholeCell: false, fields: ['price'] }), 1);
    assert.equal(grid.getRow('2')!.price, 16, 'parsed back to a number');
});

test('replace from the bar moves on to the next match', () => {
    const grid = create();
    grid.openFind('replace');
    const [find, replaceWith] = bar(grid).querySelectorAll<HTMLInputElement>('.ig-find-input');
    find!.value = 'paul';
    grid['_findBar']!.search();
    replaceWith!.value = 'X';
    const replace = [...bar(grid).querySelectorAll('button')].find(b => b.textContent === 'Replace')!;
    replace.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(grid.getRow('1')!.name, 'Ana Xa');
    assert.deepEqual(grid.getActiveCell(), { id: '3', field: 'name' });
    const all = [...bar(grid).querySelectorAll('button')].find(b => b.textContent === 'Replace all')!;
    all.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(grid.getRow('3')!.name, 'Xo');
    assert.equal(bar(grid).querySelector('.ig-find-count')!.textContent, '1 replaced');
});

test('go to a row, and a row with a column title', () => {
    const grid = create();
    assert.equal(grid.goTo(2), true);
    assert.deepEqual(grid.getActiveCell(), { id: '2', field: 'name' });
    assert.equal(grid.goTo('3 price'), true);
    assert.deepEqual(grid.getActiveCell(), { id: '3', field: 'price' });
    assert.equal(grid.goTo('9'), false);
    assert.equal(grid.goTo('1 nope'), false);

    key(grid.root.querySelector('.ig-scroll')!, 'g', { ctrlKey: true });
    const input = bar(grid).querySelector<HTMLInputElement>('.ig-find-input')!;
    input.value = '1, City';
    key(input, 'Enter');
    assert.deepEqual(grid.getActiveCell(), { id: '1', field: 'city' });
    assert.equal(bar(grid).hidden, true);
});

test('find: false leaves Ctrl+F to the browser', () => {
    const grid = create({ find: false });
    assert.equal(bar(grid), null);
    const event = new window.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
});
