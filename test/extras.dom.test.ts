import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;
let sparklineValues: (value: unknown) => number[];

before(async () => {
    ({ IntelligentGrid } = await setupDom());
    ({ sparklineValues } = await import('../src/ui/sparkline.ts'));
});

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', editable: true,
        columns: [{ field: 'name' }, { field: 'city' }, { field: 'trend', sparkline: { type: 'bar' } }, { field: 'id', type: 'integer' }],
        data: [
            { id: 1, name: 'Ana', city: 'Rio', trend: [1, -2, 3] },
            { id: 2, name: 'ana ', city: 'Rio', trend: '4, 5' },
            { id: 3, name: 'Ana', city: 'SP', trend: null },
            { id: 4, name: 'Bia', city: 'Rio', trend: [] },
            { id: 5, name: 'Ana', city: 'Rio', trend: [9] }
        ],
        ...options
    });
}

test('findDuplicates and removeDuplicates keep the first row of each set, as one undo step', () => {
    const grid = create();
    assert.deepEqual(grid.findDuplicates({ fields: ['name', 'city'] }), ['2', '5']);
    assert.deepEqual(grid.findDuplicates({ fields: ['name', 'city'], matchCase: true }), ['5'], 'matchCase keeps "ana " apart');
    assert.deepEqual(grid.findDuplicates({ fields: ['name'] }), ['2', '3', '5']);
    assert.deepEqual(grid.findDuplicates(), [], 'every column: the trends differ');

    grid.setSort([{ field: 'id', dir: 'desc' }]);
    assert.deepEqual(grid.findDuplicates({ fields: ['name', 'city'] }), ['2', '1'], 'the first row as shown is kept');
    grid.setSort([]);
    assert.deepEqual(grid.removeDuplicates({ fields: ['name', 'city'] }), ['2', '5']);
    assert.deepEqual(grid.getRows().map(r => r.id), [1, 3, 4]);
    grid.undo();
    assert.equal(grid.getRows().length, 5);
});

test('sparkline cells draw SVG bars from arrays or text', () => {
    const grid = create();
    assert.deepEqual(sparklineValues('1; 2 x 3'), [1, 2, 3]);
    const cell = (id: string) => grid.root.querySelector(`tr[data-id="${id}"] td[data-field="trend"]`)!;
    const bars = cell('1').querySelectorAll('svg.ig-sparkline-bar rect');
    assert.equal(bars.length, 3);
    assert.equal(bars[1]!.getAttribute('fill'), 'var(--ig-negative)');
    assert.equal(cell('2').querySelectorAll('rect').length, 2);
    assert.equal(cell('1').querySelector('svg')!.getAttribute('aria-label'), '1, -2, 3');
    assert.equal(cell('4').querySelectorAll('rect').length, 0);

    grid.setColumns([{ field: 'name' }, { field: 'trend', sparkline: true }]);
    assert.ok(cell('1').querySelector('svg.ig-sparkline-line polyline'));
    assert.equal(grid.exportCSV({ download: false, bom: false })!.split('\r\n')[1], 'Ana,"1,-2,3"');
});

test('comments: marker, API, undo, Shift+F2 editor, tooltip', () => {
    const grid = create({ comments: [{ id: '1', field: 'city', text: 'Check the address' }] });
    const cell = (id: string, field: string) => grid.root.querySelector<HTMLElement>(`tr[data-id="${id}"] td[data-field="${field}"]`)!;
    assert.ok(cell('1', 'city').classList.contains('ig-has-comment'));
    assert.equal(grid.getComment('1', 'city'), 'Check the address');

    const events: unknown[] = [];
    grid.on('commentChange', e => events.push(e.detail));
    assert.equal(grid.setComment('2', 'name', 'Duplicate?'), true);
    assert.ok(cell('2', 'name').classList.contains('ig-has-comment'));
    assert.deepEqual(events, [{ id: '2', field: 'name', text: 'Duplicate?', oldText: null }]);
    grid.undo();
    assert.equal(grid.getComment('2', 'name'), null);
    assert.equal(cell('2', 'name').classList.contains('ig-has-comment'), false);
    grid.redo();
    assert.equal(grid.getComment('2', 'name'), 'Duplicate?');

    // the editor
    grid.setRange({ id: '3', field: 'name' });
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', shiftKey: true, bubbles: true }));
    const textarea = grid.root.querySelector<HTMLTextAreaElement>('.ig-comment-editor textarea')!;
    textarea.value = 'New note';
    textarea.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    assert.equal(grid.getComment('3', 'name'), 'New note');
    assert.equal(grid.root.querySelector('.ig-comment-editor'), null);

    cell('1', 'city').dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(grid.root.querySelector('.ig-comment-tip')!.textContent, 'Check the address');
    cell('1', 'city').dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    assert.equal(grid.root.querySelector('.ig-comment-tip'), null);

    grid.deleteRows(['1']);
    assert.deepEqual(grid.getComments().map(c => c.id).sort(), ['2', '3'], 'comments of deleted rows are left out');
    grid.setComment('2', 'name', '');
    assert.equal(grid.getComment('2', 'name'), null);
});
