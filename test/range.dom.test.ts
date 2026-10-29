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
        columns: [{ field: 'name' }, { field: 'qty', type: 'integer' }, { field: 'price', type: 'number' }, { field: 'total', type: 'number', formula: '=[@qty]*[@price]' }],
        data: [{ id: 1, name: 'Pen', qty: 2, price: 1.5 }, { id: 2, name: 'Book', qty: 1, price: 20 }, { id: 3, name: 'Ink', qty: 5, price: 3 }],
        ...options
    });
}
const cell = (grid: IntelligentGridType, id: string, field: string) => grid.root.querySelector(`tr[data-id="${id}"] td[data-field="${field}"]`)!;
const pointer = (target: Element, type: string, init: MouseEventInit = {}) =>
    target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
const key = (grid: IntelligentGridType, k: string, init: KeyboardEventInit = {}) =>
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
function clipboard(grid: IntelligentGridType, type: 'copy' | 'paste', text = ''): string {
    let written = '';
    const event = new window.Event(type, { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: () => text, setData: (_: string, value: string) => { written = value; } };
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(event);
    return written;
}

test('drag selects a range, painted on the cells, without selecting rows', () => {
    const grid = create();
    const ranges: unknown[] = [];
    grid.on('rangeChange', e => ranges.push(e.detail));
    pointer(cell(grid, '1', 'name'), 'pointerdown');
    pointer(cell(grid, '2', 'qty'), 'pointerover');
    pointer(cell(grid, '2', 'qty'), 'pointerup');
    window.dispatchEvent(new window.MouseEvent('pointerup'));
    pointer(cell(grid, '3', 'price'), 'pointerover');

    const range = grid.getRange()!;
    assert.deepEqual(range.rows, ['1', '2']);
    assert.deepEqual(range.fields, ['name', 'qty']);
    assert.deepEqual(grid.getSelectedIds(), []);
    assert.equal(grid.root.querySelectorAll('.ig-in-range').length, 4);
    assert.ok(cell(grid, '2', 'qty').querySelector('.ig-fill-handle'), 'fill handle on the corner');
    assert.ok(ranges.length >= 1);
});

test('Shift+click and Shift+arrows extend; Ctrl+arrow jumps to the edge', () => {
    const grid = create();
    grid.setRange({ id: '1', field: 'name' });
    pointer(cell(grid, '2', 'price'), 'pointerdown', { shiftKey: true });
    assert.deepEqual(grid.getRange()!.fields, ['name', 'qty', 'price']);

    grid.setRange({ id: '1', field: 'qty' });
    key(grid, 'ArrowDown', { shiftKey: true });
    key(grid, 'ArrowRight', { shiftKey: true });
    assert.deepEqual(grid.getRange()!.rows, ['1', '2']);
    assert.deepEqual(grid.getRange()!.fields, ['qty', 'price']);
    key(grid, 'ArrowDown', { shiftKey: true, ctrlKey: true });
    assert.deepEqual(grid.getRange()!.rows, ['1', '2', '3']);
    key(grid, 'ArrowLeft');
    assert.equal(grid.getRange()!.rows.length, 1, 'a plain arrow collapses the range');
});

test('copy writes the range as TSV; paste fills from the top left', () => {
    const grid = create();
    grid.setRange({ id: '1', field: 'name' }, { id: '2', field: 'qty' });
    assert.equal(clipboard(grid, 'copy'), 'Pen\t2\nBook\t1');

    grid.setRange({ id: '2', field: 'qty' }, { id: '1', field: 'name' });
    clipboard(grid, 'paste', 'A\t7\nB\t8');
    assert.equal(grid.getRow('1')!.name, 'A');
    assert.equal(grid.getRow('2')!.qty, 8);
    grid.undo();
    assert.equal(grid.getRow('1')!.name, 'Pen');
    assert.equal(grid.getRow('2')!.qty, 1);
});

test('one pasted value fills the whole range', () => {
    const grid = create();
    grid.setRange({ id: '1', field: 'qty' }, { id: '3', field: 'price' });
    clipboard(grid, 'paste', '4');
    assert.deepEqual(grid.getRangeValues(), [[4, 4], [4, 4], [4, 4]]);
    assert.equal(grid.getRow('3')!.total, 16);
});

test('Delete clears the editable cells of the range in one undo step', () => {
    const grid = create();
    grid.setRange({ id: '1', field: 'name' }, { id: '2', field: 'total' });
    key(grid, 'Delete');
    assert.ok([null, ''].includes(grid.getRow('1')!.name as string), 'blank');
    assert.ok([null, ''].includes(grid.getRow('2')!.price as string), 'blank');
    assert.equal(grid.getRow('3')!.name, 'Ink');
    grid.undo();
    assert.equal(grid.getRow('1')!.name, 'Pen');
    assert.equal(grid.getRow('2')!.price, 20);
    assert.equal(grid.canUndo(), false, 'one step');
});

test('Ctrl+A selects every cell and every row', () => {
    const grid = create();
    grid.setRange({ id: '2', field: 'qty' });
    key(grid, 'a', { ctrlKey: true });
    assert.deepEqual(grid.getRange()!.fields, ['name', 'qty', 'price', 'total']);
    assert.equal(grid.getSelectedIds().length, 3);
});

test('fill handle drag continues the series down, as one undo step', () => {
    const grid = create({ data: [1, 2, 3, 4, 5].map(id => ({ id, name: id <= 2 ? `Item ${id}` : '', qty: id <= 2 ? id * 10 : null, price: 1 })) });
    const fills: unknown[] = [];
    grid.on('fill', e => fills.push(e.detail));
    grid.setRange({ id: '1', field: 'name' }, { id: '2', field: 'qty' });
    const handle = cell(grid, '2', 'qty').querySelector('.ig-fill-handle')!;
    pointer(handle, 'pointerdown');
    pointer(cell(grid, '4', 'qty'), 'pointerover');
    assert.equal(grid.root.querySelectorAll('.ig-fill-target').length, 4, 'target cells are marked while dragging');
    window.dispatchEvent(new window.MouseEvent('pointerup'));

    assert.deepEqual(grid.getRows('filtered').map(r => [r.name, r.qty]), [['Item 1', 10], ['Item 2', 20], ['Item 3', 30], ['Item 4', 40], ['', null]].map(([n, q]) => [n || grid.getRow('5')!.name, q]));
    assert.deepEqual(grid.getRange()!.rows, ['1', '2', '3', '4'], 'the range grows over the filled cells');
    assert.equal(grid.root.querySelectorAll('.ig-fill-target').length, 0);
    assert.equal((fills[0] as { written: number }).written, 4);
    grid.undo();
    assert.equal(grid.getRow('3')!.qty, null);
    assert.equal(grid.getRow('4')!.name, grid.getRow('5')!.name);
});

test('fill up and right, double click fills to the end, Ctrl+D copies down', () => {
    const grid = create();
    grid.setRange({ id: '3', field: 'qty' });
    assert.equal(grid.fill('up', 2), 2);
    assert.deepEqual(grid.getRows('filtered').map(r => r.qty), [5, 5, 5], 'one number is copied');

    grid.setRange({ id: '1', field: 'qty' }, { id: '1', field: 'price' });
    grid.fill('right', 5);
    assert.equal(grid.getRow('1')!.total, 7.5, 'formula columns are not written');

    grid.setRange({ id: '1', field: 'price' });
    cell(grid, '1', 'price').querySelector('.ig-fill-handle')!.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    assert.deepEqual(grid.getRows('filtered').map(r => r.price), [1.5, 1.5, 1.5]);

    grid.setRange({ id: '1', field: 'name' }, { id: '3', field: 'name' });
    key(grid, 'd', { ctrlKey: true });
    assert.deepEqual(grid.getRows('filtered').map(r => r.name), ['Pen', 'Pen', 'Pen']);
});
