import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { ColumnDefinition, GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

type GridClass = typeof IntelligentGridType;
type Grid = IntelligentGridType;
let IntelligentGrid: GridClass;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

const columns: ColumnDefinition[] = [
    { field: 'name', title: 'Name', validate: { required: true } },
    { field: 'qty', type: 'integer', footer: 'sum', validate: { min: 0 } },
    { field: 'price', type: 'number', decimals: 2 },
    { field: 'total', type: 'number', decimals: 2, formula: '=[@qty]*[@price]', footer: 'sum' },
    { field: 'kind', options: ['a', 'b'] }
];
const data = [
    { id: 1, name: 'Pen', qty: 2, price: 1.5, kind: 'a' },
    { id: 2, name: 'book', qty: 1, price: 20, kind: 'b' },
    { id: 3, name: 'Ink', qty: 5, price: 3, kind: 'a' }
];

function create(options: Partial<GridOptions> = {}): Grid {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', { sorla: Sorla, locale: 'en-US', idField: 'id', editable: true, columns, data, ...options });
}

const texts = (grid: Grid, field: string) => [...grid.root.querySelectorAll(`tbody td[data-field="${field}"]`)].map(td => td.textContent);

test('renders rows, formula column and footer', () => {
    const grid = create();
    assert.deepEqual(texts(grid, 'name'), ['Pen', 'book', 'Ink']);
    assert.deepEqual(texts(grid, 'total'), ['3.00', '20.00', '15.00']);
    const footer = [...grid.root.querySelectorAll('tfoot td')].map(td => td.textContent);
    assert.ok(footer.includes('8') && footer.includes('38.00'));
    assert.match(grid.root.querySelector('.ig-status')!.textContent!, /3 of 3/);
});

test('header click sorts, shift+click adds a sort column', () => {
    const grid = create();
    const th = (field: string) => grid.root.querySelector(`th[data-field="${field}"]`)!;
    th('kind').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    th('qty').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));
    th('qty').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));
    assert.deepEqual(grid.getSort(), [{ field: 'kind', dir: 'asc' }, { field: 'qty', dir: 'desc' }]);
    assert.deepEqual(texts(grid, 'name'), ['Ink', 'Pen', 'book']);
    assert.equal(grid.root.querySelector('th[data-field="qty"] sup')!.textContent, '2');
});

test('filters, search and chips', () => {
    const grid = create();
    grid.setFilter('kind', { values: ['a'] });
    assert.deepEqual(texts(grid, 'name'), ['Pen', 'Ink']);
    assert.equal(grid.root.querySelectorAll('.ig-chip').length, 1);
    grid.setSearch('ink');
    assert.deepEqual(texts(grid, 'name'), ['Ink']);
    grid.clearFilters();
    assert.equal(texts(grid, 'name').length, 3);
    grid.setFilter('total', { formula: '=[@total]>10' });
    assert.deepEqual(texts(grid, 'name'), ['book', 'Ink']);
});

test('editing parses, validates, recalculates and emits events', () => {
    const grid = create();
    const events: Array<Record<string, unknown>> = [];
    grid.on('cellChange', e => events.push(e.detail));
    grid.on('validationError', e => events.push({ error: e.detail.error }));

    assert.equal(grid.startEdit('1', 'qty'), true);
    const input = grid.root.querySelector<HTMLInputElement>('.ig-editor')!;
    input.value = '10';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(grid.getRow('1')!.total, 15);
    assert.equal(events[0].value, 10);
    assert.equal(events[0].oldValue, 2);

    assert.deepEqual(grid.setCellValue('1', 'qty', '-1', { source: 'edit' }).ok, false);
    assert.equal(events.at(-1)!.error, 'min:0');
    assert.equal(grid.setCellValue('1', 'qty', 'abc', { source: 'edit' }).ok, false);

    grid.on('beforeCellChange', e => { if (e.detail.field === 'name') e.detail.value = e.detail.value.toUpperCase(); });
    grid.setCellValue('2', 'name', 'novel', { source: 'edit' });
    assert.equal(grid.getRow('2')!.name, 'NOVEL');

    grid.setCellValue('3', 'price', '=[@qty]*2', { source: 'edit' });
    assert.equal(grid.getRow('3')!.price, 10);
    assert.equal(grid.getRow('3')!.total, 50);
    assert.equal(grid.getCellFormula('3', 'price'), '=[@qty]*2');
    assert.equal(grid.evaluate('=SUM([total])'), 15 + 20 + 50);
});

test('selection single and multiple, delete and add rows', () => {
    const grid = create();
    const changes: string[][] = [];
    grid.on('selectionChange', e => changes.push(e.detail.ids));
    const row = (id: string) => grid.root.querySelector(`tr[data-id="${id}"] td[data-field="name"]`)!;
    row('1').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    row('3').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));
    assert.deepEqual(grid.getSelectedIds(), ['1', '2', '3']);
    row('2').dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
    assert.deepEqual(grid.getSelectedIds().sort(), ['1', '3']);

    grid.options.confirmDelete = false;
    grid.deleteRows(grid.getSelectedIds());
    assert.deepEqual(texts(grid, 'name'), ['book']);
    const id = grid.addRow({ name: 'New', qty: 1, price: 1 })!;
    assert.equal(grid.getRow(id)!.total, 1);

    const single = create({ selection: { mode: 'single' } });
    single.select(['1', '2']);
    assert.deepEqual(single.getSelectedIds(), ['2']);
});

test('exports CSV and XLSX from the filtered view', () => {
    const grid = create();
    grid.setFilter('kind', { values: ['a'] });
    const csv = grid.exportCSV({ download: false, bom: false })!;
    assert.equal(csv.split('\r\n').length, 3);
    assert.match(csv, /^Name,qty,price,total,kind\r\nPen,2,1.5,3,a/);
    const bytes = grid.exportXLSX({ download: false })!;
    assert.match(new TextDecoder().decode(bytes), /<f>B2\*C2<\/f>/);
});

test('append mode loads pages on demand', async () => {
    const all = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `n${i + 1}`, qty: i, price: 1 }));
    const calls: number[] = [];
    const grid = create({
        data: [],
        append: {
            pageSize: 10,
            load: async ({ offset, limit }) => {
                calls.push(offset);
                return { rows: all.slice(offset, offset + limit), total: all.length };
            }
        }
    });
    await new Promise(r => setTimeout(r, 20));
    // the first page does not fill the (layout-less) viewport, so the grid keeps pulling pages
    assert.ok(texts(grid, 'name').length >= 10);
    for (let i = 0; i < 5; i++) await grid.loadMore();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(texts(grid, 'name').length, 25);
    assert.deepEqual(calls, [0, 10, 20]);
    await grid.loadMore();
    assert.equal(calls.length, 3, 'stops when hasMore is false');
});
