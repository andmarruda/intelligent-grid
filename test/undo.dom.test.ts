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
const row = (grid: IntelligentGridType, id: string) => grid.getRow(id)!;
const order = (grid: IntelligentGridType) => grid.getRows('filtered').map(r => r.id);

test('undo and redo cell edits, recalculating formulas', () => {
    const grid = create();
    assert.equal(grid.canUndo(), false);
    grid.setCellValue('1', 'qty', 10);
    grid.setCellValue('1', 'name', 'Pencil');
    assert.equal(row(grid, '1').total, 15);

    assert.equal(grid.undo(), true);
    assert.equal(row(grid, '1').name, 'Pen');
    assert.equal(grid.undo(), true);
    assert.equal(row(grid, '1').qty, 2);
    assert.equal(row(grid, '1').total, 3, 'formula recalculated');
    assert.equal(grid.undo(), false, 'nothing left');

    assert.equal(grid.redo(), true);
    assert.equal(row(grid, '1').qty, 10);
    assert.equal(row(grid, '1').total, 15);
    assert.equal(grid.canRedo(), true);
    grid.setCellValue('2', 'qty', 3);
    assert.equal(grid.canRedo(), false, 'a new action drops the redo steps');
});

test('cell formulas and typed values in calculated columns are restored', () => {
    const grid = create();
    grid.setCellFormula('2', 'price', '=[@qty]*100');
    assert.equal(row(grid, '2').price, 100);
    grid.setCellValue('3', 'total', 999);
    grid.undo();
    assert.equal(row(grid, '3').total, 15, 'the column formula is back');
    assert.equal(grid.getCellFormula('3', 'total'), '=[@qty]*[@price]');
    grid.undo();
    assert.equal(row(grid, '2').price, 20);
    assert.equal(grid.getCellFormula('2', 'price'), null);
    grid.redo();
    assert.equal(grid.getCellFormula('2', 'price'), '=[@qty]*100');
    assert.equal(row(grid, '2').total, 100);
});

test('added and deleted rows come back with their id and position', () => {
    const grid = create();
    const id = grid.addRow({ name: 'Cup', qty: 1, price: 2 }, { position: 'start' })!;
    assert.deepEqual(order(grid), [Number(id) || null, 1, 2, 3].map((v, i) => i === 0 ? grid.getRow(id)!.id : v));
    grid.undo();
    assert.equal(grid.getRow(id), null);
    grid.redo();
    assert.equal(grid.getRow(id)!.name, 'Cup');
    assert.equal(grid.getRows('filtered')[0]!._id, id);

    grid.deleteRows(['1', '3']);
    assert.deepEqual(order(grid).slice(1), [2]);
    grid.undo();
    assert.deepEqual(grid.getRows('filtered').map(r => r._id), [id, '1', '2', '3'], 'one step restores both, in order');
    assert.equal(row(grid, '3').total, 15);
    grid.redo();
    assert.equal(grid.getRow('1'), null);
});

test('change tracking follows undo and redo', () => {
    const grid = create();
    grid.setCellValue('1', 'qty', 9);
    assert.equal(grid.getChangeSummary().updated, 1);
    grid.undo();
    assert.equal(grid.hasChanges(), false, 'undoing the edit removes the change');
    grid.deleteRows(['2']);
    assert.equal(grid.getChangeSummary().deleted, 1);
    grid.undo();
    assert.equal(grid.hasChanges(), false, 'undoing the delete removes it too');
    const id = grid.addRow({ name: 'New' })!;
    grid.deleteRows([id]);
    grid.undo();
    assert.deepEqual(grid.getChanges().inserted.map(r => r.id), [id], 'an inserted row stays inserted after undoing its delete');
});

test('paste and batch() are one step', () => {
    const grid = create();
    grid.batch(() => {
        grid.setCellValue('1', 'qty', 7);
        grid.setCellValue('2', 'qty', 8);
        grid.updateRow('3', { qty: 9, name: 'X' });
    }, 'bulk');
    grid.undo();
    assert.deepEqual(grid.getRows('all').map(r => r.qty), [2, 1, 5]);
    assert.equal(row(grid, '3').name, 'Ink');

    // paste a 2x2 block from the active cell
    grid.root.querySelector<HTMLElement>('tbody tr[data-id="1"] td[data-field="name"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const event = new window.Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: () => 'A\t11\nB\t12' };
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(event);
    assert.deepEqual([row(grid, '1').name, row(grid, '1').qty, row(grid, '2').name, row(grid, '2').qty], ['A', 11, 'B', 12]);
    grid.undo();
    assert.deepEqual([row(grid, '1').name, row(grid, '1').qty, row(grid, '2').name, row(grid, '2').qty], ['Pen', 2, 'Book', 1]);
});

test('keyboard shortcuts, navbar buttons, limit and reset', () => {
    const grid = create({ undoLimit: 2 });
    const scroller = grid.root.querySelector<HTMLElement>('.ig-scroll')!;
    const key = (k: string, extra: KeyboardEventInit = {}) => scroller.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, ...extra }));
    const undoButton = () => [...grid.root.querySelectorAll<HTMLButtonElement>('.ig-navbar button')].find(b => b.textContent === '↶')!;
    assert.equal(undoButton().disabled, true);

    grid.setCellValue('1', 'qty', 3);
    grid.setCellValue('1', 'qty', 4);
    grid.setCellValue('1', 'qty', 5);
    assert.equal(undoButton().disabled, false);
    assert.match(undoButton().title, /Undo \(edit\)/);
    key('z');
    key('z');
    assert.equal(row(grid, '1').qty, 3, 'only 2 steps were kept');
    assert.equal(grid.canUndo(), false);
    key('z', { shiftKey: true });
    assert.equal(row(grid, '1').qty, 4);
    key('y');
    assert.equal(row(grid, '1').qty, 5);

    const events: string[] = [];
    grid.on('undo', e => events.push(e.detail.label));
    grid.undo();
    assert.deepEqual(events, ['edit']);
    grid.setData([{ id: 9, name: 'Fresh', qty: 1, price: 1 }]);
    assert.equal(grid.canUndo(), false, 'setData clears the history');
    assert.equal(grid.canRedo(), false);
});
