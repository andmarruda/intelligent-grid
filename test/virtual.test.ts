import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RowLayout, columnWindow } from '../src/ui/virtual.ts';

test('row layout: offsets, windows and measured heights', () => {
    const layout = new RowLayout(30);
    layout.setKeys(Array.from({ length: 1000 }, (_, i) => `r${i}`));
    assert.equal(layout.total, 30_000);
    assert.equal(layout.offsetOf(10), 300);
    assert.equal(layout.indexAt(0), 0);
    assert.equal(layout.indexAt(299), 9);
    assert.equal(layout.indexAt(300), 10);
    assert.equal(layout.indexAt(1e9), 999);
    assert.deepEqual(layout.window(3000, 600, 5), [95, 126]);
    assert.deepEqual(layout.window(0, 600, 5), [0, 26]);

    // a wrapped row of 90px pushes the following rows down
    assert.equal(layout.measure(5, 90), true);
    assert.equal(layout.measure(5, 90), false, 'same height is not a change');
    assert.equal(layout.offsetOf(6), 5 * 30 + 90);
    assert.equal(layout.total, 30_000 + 60);
    assert.equal(layout.indexAt(5 * 30 + 89), 5);

    // heights follow the row, not the position
    layout.setKeys(['r5', 'x', 'y']);
    assert.equal(layout.total, 90 + 30 + 30);
    layout.setDefaultHeight(40);
    assert.equal(layout.total, 90 + 40 + 40);
    assert.deepEqual(new RowLayout(30).window(0, 600, 5), [0, 0]);
});

test('row layout handles a million rows quickly', () => {
    const layout = new RowLayout(34);
    const started = Date.now();
    layout.setKeys(Array.from({ length: 1_000_000 }, (_, i) => String(i)));
    assert.equal(layout.total, 34_000_000);
    assert.deepEqual(layout.window(17_000_000, 800, 8), [499_992, 500_032]);
    assert.ok(Date.now() - started < 1500);
});

test('column window', () => {
    const widths = Array.from({ length: 100 }, () => 100);
    assert.deepEqual(columnWindow(widths, 0, 450, 1), { start: 0, end: 6, before: 0, after: 9400 });
    assert.deepEqual(columnWindow(widths, 1050, 300, 1), { start: 9, end: 15, before: 900, after: 8500 });
    assert.deepEqual(columnWindow(widths, 99_999, 300, 0), { start: 99, end: 100, before: 9900, after: 0 });
    assert.deepEqual(columnWindow([], 0, 300, 1), { start: 0, end: 0, before: 0, after: 0 });
});
