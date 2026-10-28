import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { ConfirmRequest, GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla,
        locale: 'en-US',
        idField: 'id',
        editable: true,
        navbar: { delete: true, export: false },
        columns: [{ field: 'name' }, { field: 'qty', type: 'integer' }],
        data: [{ id: 1, name: 'a', qty: 1 }, { id: 2, name: 'b', qty: 2 }],
        ...options
    });
}

const button = (grid: IntelligentGridType, label: string) =>
    [...grid.root.querySelectorAll<HTMLButtonElement>('.ig-navbar button')].find(b => b.textContent === label)!;
const modal = () => document.querySelector('.ig-modal');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('delete asks with a modal: Esc and backdrop cancel, confirm deletes', async () => {
    const grid = create();
    grid.select(['1']);

    button(grid, 'Delete').click();
    assert.ok(modal(), 'modal is open');
    assert.equal(modal()!.getAttribute('role'), 'alertdialog');
    assert.match(modal()!.textContent!, /Delete 1 row/);
    assert.equal(document.activeElement?.textContent, 'Cancel', 'destructive actions focus Cancel');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    assert.equal(modal(), null);
    assert.equal(grid.getRows().length, 2);

    button(grid, 'Delete').click();
    const backdrop = document.querySelector('.ig-modal-backdrop')!;
    backdrop.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    await tick();
    assert.equal(grid.getRows().length, 2);

    button(grid, 'Delete').click();
    [...modal()!.querySelectorAll('button')].find(b => b.textContent === 'Delete')!.click();
    await tick();
    assert.equal(modal(), null);
    assert.deepEqual(grid.getRows().map(r => r.id), [2]);
});

test('discard changes uses the modal too', async () => {
    const grid = create();
    grid.setCellValue('1', 'qty', 9);
    button(grid, 'Discard changes').click();
    [...modal()!.querySelectorAll('button')].find(b => b.textContent === 'Discard')!.click();
    await tick();
    assert.equal(grid.getRow('1')!.qty, 1);
    assert.equal(grid.hasChanges(), false);
});

test('the confirm option replaces the modal; grid.confirm() is public', async () => {
    const asked: ConfirmRequest[] = [];
    const grid = create({ confirm: request => { asked.push(request); return Promise.resolve(true); } });
    grid.select(['2']);
    button(grid, 'Delete').click();
    await tick();
    assert.equal(modal(), null, 'no built-in modal');
    assert.equal(asked[0]!.action, 'delete');
    assert.deepEqual(grid.getRows().map(r => r.id), [1]);

    assert.equal(await grid.confirm({ action: 'archive', message: 'Archive?' }), true);
});

test('confirmDelete: false deletes without asking', async () => {
    const grid = create({ confirmDelete: false });
    grid.select(['1', '2']);
    button(grid, 'Delete').click();
    await tick();
    assert.equal(modal(), null);
    assert.equal(grid.getRows().length, 0);
});
