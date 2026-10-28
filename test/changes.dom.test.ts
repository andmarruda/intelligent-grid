import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { ColumnDefinition, GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

const columns: ColumnDefinition[] = [
    { field: 'name', title: 'Name' },
    { field: 'qty', type: 'integer' },
    { field: 'price', type: 'number' },
    { field: 'total', type: 'number', formula: '=[@qty]*[@price]' }
];
const data = () => [
    { id: 1, name: 'Pen', qty: 2, price: 1.5 },
    { id: 2, name: 'Book', qty: 1, price: 20 },
    { id: 3, name: 'Ink', qty: 5, price: 3 }
];

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<form id="save"><div id="grid"></div></form>';
    return new IntelligentGrid('#grid', { sorla: Sorla, locale: 'en-US', idField: 'id', editable: true, columns, data: data(), ...options });
}

test('loaded data is the baseline', () => {
    const grid = create();
    assert.equal(grid.hasChanges(), false);
    assert.deepEqual(grid.getChanges(), { inserted: [], updated: [], deleted: [] });
});

test('updates report only the fields that really changed', () => {
    const grid = create();
    grid.setCellValue('1', 'qty', '4', { source: 'edit' });
    grid.setCellValue('1', 'name', 'Pencil', { source: 'edit' });

    const { updated } = grid.getChanges();
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, '1');
    // calculated columns are not user data: total is in the row but not in changes
    assert.deepEqual(updated[0]!.changes, { qty: { from: 2, to: 4 }, name: { from: 'Pen', to: 'Pencil' } });
    assert.equal(updated[0]!.row.total, 6);

    // editing back to the original value is not a change anymore
    grid.setCellValue('1', 'qty', 2);
    grid.setCellValue('1', 'name', 'Pen');
    assert.equal(grid.hasChanges(), false);
    assert.equal(grid.getHistory().length, 4, 'the history keeps every operation');
});

test('inserted rows stay inserted when edited, and vanish when deleted', () => {
    const grid = create();
    const id = grid.addRow({ name: 'Cup', qty: 1, price: 7 })!;
    grid.setCellValue(id, 'qty', 3);
    let changes = grid.getChanges();
    assert.equal(changes.inserted.length, 1);
    assert.equal(changes.updated.length, 0);
    assert.equal(changes.inserted[0]!.row.qty, 3);
    assert.equal(changes.inserted[0]!.row.total, 21);

    grid.deleteRows([id]);
    changes = grid.getChanges();
    assert.deepEqual(changes, { inserted: [], updated: [], deleted: [] });
    assert.deepEqual(grid.getHistory().map(h => h.type), ['insert', 'update', 'delete']);
});

test('deleted rows report their original values', () => {
    const grid = create();
    grid.setCellValue('2', 'price', 25);
    grid.deleteRows(['2']);
    const { deleted, updated } = grid.getChanges();
    assert.equal(updated.length, 0);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0]!.id, '2');
    assert.equal(deleted[0]!.row.price, 20);
});

test('cell formulas and typed values in calculated columns are tracked', () => {
    const grid = create();
    grid.setCellFormula('3', 'price', '=[@qty]*2');
    grid.setCellValue('3', 'total', 99);
    const [entry] = grid.getChanges().updated;
    assert.deepEqual(entry!.changes, { price: { from: 3, to: 10 }, total: { from: 15, to: 99 } });
    assert.deepEqual(entry!.formulas, { price: '=[@qty]*2' });
});

test('JSON for a form: hidden input kept up to date', () => {
    const grid = create({ changeTracking: { form: '#save', inputName: 'grid_changes' } });
    const input = document.querySelector<HTMLInputElement>('input[name="grid_changes"]')!;
    assert.deepEqual(JSON.parse(input.value), { inserted: [], updated: [], deleted: [] });

    grid.setCellValue('1', 'qty', 9);
    grid.deleteRows(['3']);
    grid.addRow({ name: 'New' });
    const sent = JSON.parse(new FormData(document.querySelector<HTMLFormElement>('#save')!).get('grid_changes') as string);
    assert.equal(sent.updated[0].changes.qty.to, 9);
    assert.equal(sent.deleted[0].id, '3');
    assert.equal(sent.inserted[0].row.name, 'New');
    assert.deepEqual(JSON.parse(grid.getChangesJSON()), sent);
});

test('acceptChanges makes the current state the new baseline (all or some rows)', () => {
    const grid = create();
    grid.setCellValue('1', 'qty', 9);
    grid.setCellValue('2', 'qty', 9);
    grid.acceptChanges(['1']);
    assert.deepEqual(grid.getChanges().updated.map(u => u.id), ['2']);
    assert.ok(grid.getHistory().every(h => h.id === '2'));
    grid.acceptChanges();
    assert.equal(grid.hasChanges(), false);
    assert.equal(grid.getRow('1')!.qty, 9);
});

test('rejectChanges restores the original state', () => {
    const grid = create();
    grid.setCellValue('1', 'qty', 9);
    grid.setCellFormula('2', 'price', '=1');
    grid.deleteRows(['3']);
    grid.addRow({ name: 'Extra', qty: 1, price: 1 });
    assert.equal(grid.getChangeSummary().total, 4);

    grid.rejectChanges();
    assert.equal(grid.hasChanges(), false);
    const rows = grid.getRows().sort((a, b) => Number(a.id) - Number(b.id));
    assert.deepEqual(rows.map(r => [r.id, r.qty, r.price, r.total]), [[1, 2, 1.5, 3], [2, 1, 20, 20], [3, 5, 3, 15]]);
    assert.equal(grid.getCellFormula('2', 'price'), null);
});

test('rejectChanges for some rows only', () => {
    const grid = create();
    grid.setCellValue('1', 'qty', 9);
    grid.setCellValue('2', 'qty', 9);
    grid.rejectChanges(['1']);
    assert.equal(grid.getRow('1')!.qty, 2);
    assert.deepEqual(grid.getChanges().updated.map(u => u.id), ['2']);
});

test('rows and cells are marked, navbar shows the count, events fire', () => {
    const grid = create();
    const events: unknown[] = [];
    grid.on('changes', e => events.push(e.detail));
    grid.setCellValue('1', 'qty', 9);
    const id = grid.addRow({ name: 'New' })!;

    assert.ok(grid.root.querySelector('tr[data-id="1"]')!.classList.contains('ig-row-updated'));
    assert.ok(grid.root.querySelector('tr[data-id="1"] td[data-field="qty"]')!.classList.contains('ig-cell-changed'));
    assert.ok(!grid.root.querySelector('tr[data-id="1"] td[data-field="name"]')!.classList.contains('ig-cell-changed'));
    assert.ok(grid.root.querySelector(`tr[data-id="${id}"]`)!.classList.contains('ig-row-inserted'));
    assert.match(grid.root.querySelector('.ig-changes-badge')!.textContent!, /2 change/);
    assert.equal(events.length, 2);
});

test('setData resets tracking; changeTracking: false disables it', () => {
    const grid = create();
    grid.setCellValue('1', 'qty', 9);
    grid.setData(data());
    assert.equal(grid.hasChanges(), false);
    assert.equal(grid.getHistory().length, 0);

    const off = create({ changeTracking: false });
    off.setCellValue('1', 'qty', 9);
    assert.equal(off.hasChanges(), false);
    assert.equal(off.root.querySelector('.ig-changes-badge'), null);
});
