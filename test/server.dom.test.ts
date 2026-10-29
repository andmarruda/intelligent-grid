import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import type { AppendLoadParams, GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', editable: true,
        columns: [{ field: 'id', type: 'integer' }, { field: 'name' }, { field: 'qty', type: 'integer' }, { field: 'total', type: 'integer', formula: '=[@qty]*2' }],
        data: [{ id: 1, name: 'Pen', qty: 1 }, { id: 2, name: 'Ink', qty: 2 }],
        ...options
    });
}

test('applyServerChanges adds, updates and removes rows without unsaved changes or undo', () => {
    const grid = create();
    const events: unknown[] = [];
    grid.on('serverChange', e => events.push(e.detail));
    const result = grid.applyServerChanges({ rows: [{ id: 2, qty: 5 }, { id: 3, name: 'Book', qty: 1 }] });
    assert.deepEqual(result, { inserted: ['3'], updated: ['2'], removed: [] });
    assert.deepEqual(grid.getRows().map(r => [r.id, r.name, r.qty, r.total]), [[1, 'Pen', 1, 2], [2, 'Ink', 5, 10], [3, 'Book', 1, 2]]);
    assert.equal(grid.hasChanges(), false, 'server rows are not unsaved changes');
    assert.equal(grid.canUndo(), false);

    grid.applyServerChanges({ type: 'delete', ids: [1, 99] });
    assert.deepEqual(grid.getRows().map(r => r.id), [2, 3]);
    assert.equal(events.length, 2);
});

test('fields the user edited keep the user value; the others follow the server', () => {
    const grid = create();
    grid.setCellValue('1', 'name', 'Pencil');
    grid.applyServerChanges({ rows: [{ id: 1, name: 'Server pen', qty: 9 }] });
    assert.equal(grid.getRow('1')!.name, 'Pencil');
    assert.equal(grid.getRow('1')!.qty, 9);
    const changes = grid.getChanges();
    assert.deepEqual(changes.updated.map(u => Object.keys(u.changes)), [['name']], 'qty from the server is not a user change');
});

test('new rows respect the local sort', () => {
    const grid = create({ initialSort: [{ field: 'qty', dir: 'desc' }] });
    grid.applyServerChanges({ rows: [{ id: 5, name: 'Big', qty: 50 }] });
    assert.deepEqual(grid.getRows('filtered').map(r => r.id), [5, 2, 1]);
});

test('append.socket loads pages through the connection and applies pushes; where joins the filters', async () => {
    const calls: AppendLoadParams[] = [];
    let push: ((event: { message: Record<string, unknown> }) => void) | null = null;
    const socket = {
        async load(params: Record<string, unknown>) {
            calls.push(params as unknown as AppendLoadParams);
            const offset = params.offset as number;
            return { rows: Array.from({ length: 3 }, (_, i) => ({ id: offset + i + 1, name: `Row ${offset + i + 1}`, qty: i })), hasMore: offset < 3, total: 6 };
        },
        on(_event: 'push', listener: (event: { message: Record<string, unknown> }) => void) {
            push = listener;
            return () => { push = null; };
        }
    };
    const grid = create({ data: [], append: { pageSize: 3, socket } });
    await tick(10);
    assert.equal(grid.getRows().length, 3);
    assert.equal(calls[0]!.offset, 0);
    assert.deepEqual(calls[0]!.where, {});

    push!({ message: { type: 'rows', rows: [{ id: 2, name: 'Changed by another user', qty: 7 }] } });
    assert.equal(grid.getRow('2')!.name, 'Changed by another user');
    push!({ message: { type: 'delete', ids: [1] } });
    assert.equal(grid.getRow('1'), null);

    grid.setFilter('qty', { conditions: [{ op: 'gt', value: 1 }] });
    await tick(10);
    assert.deepEqual(calls.at(-1)!.where, { qty: { $gt: 1, $ne: '' } });
    grid.destroy();
    assert.equal(push, null, 'destroy stops listening');
});

test('loadStream loads SSE blocks into the grid, with progress and a final refresh', async () => {
    const listeners: Record<string, Array<(e: { data: string; lastEventId: string }) => void>> = {};
    class FakeEventSource {
        readyState = 1;
        constructor() { FakeEventSource.last = this; }
        static last: FakeEventSource;
        addEventListener(type: string, fn: (e: { data: string; lastEventId: string }) => void) { (listeners[type] ??= []).push(fn); }
        close() { this.readyState = 2; }
    }
    const emit = (type: string, data: unknown, id = '') => (listeners[type] ?? []).forEach(fn => fn({ data: JSON.stringify(data), lastEventId: id }));

    const grid = create({ initialSort: [{ field: 'id', dir: 'desc' }], statusBar: true });
    const progress: number[] = [];
    const stream = grid.loadStream('/orders/stream', { transport: 'eventsource', EventSource: FakeEventSource, onProgress: s => progress.push(s.loaded) });
    assert.equal(grid.getRows().length, 0, 'replace: true clears the rows');
    emit('meta', { total: 4 });
    emit('rows', [{ id: 1, name: 'a', qty: 1 }, { id: 2, name: 'b', qty: 2 }], '1');
    assert.match(grid.root.querySelector('.ig-status')!.textContent!, /Loading 2 of 4 rows/);
    emit('rows', [{ id: 3, name: 'c', qty: 3 }, { id: 4, name: 'd', qty: 4 }], '2');
    emit('end', {});
    const state = await stream.done;
    await tick();
    assert.equal(state.loaded, 4);
    assert.deepEqual(progress, [0, 2, 4]);
    assert.deepEqual(grid.getRows('filtered').map(r => r.id), [4, 3, 2, 1], 'sorted after the stream');
    assert.equal(grid.getRow('4')!.total, 8, 'formulas computed');
    assert.equal(grid.hasChanges(), false);
    assert.match(grid.root.querySelector('.ig-status')!.textContent!, /4 rows loaded/);
});
