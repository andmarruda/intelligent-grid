import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillSeries, fillSeriesBackward } from '../src/core/fill.ts';

test('numbers: a step continues, one value is copied', () => {
    assert.deepEqual(fillSeries([1, 2], 3, 'number'), [3, 4, 5]);
    assert.deepEqual(fillSeries([10, 8], 2, 'integer'), [6, 4]);
    assert.deepEqual(fillSeries([0.1, 0.2], 2, 'number'), [0.3, 0.4]);
    assert.deepEqual(fillSeries([7], 3, 'number'), [7, 7, 7]);
    assert.deepEqual(fillSeries([1, 5, 6], 4, 'number'), [1, 5, 6, 1], 'no constant step: repeat');
});

test('dates: one date adds a day, two continue their step', () => {
    assert.deepEqual(fillSeries(['2026-01-30'], 3, 'date'), ['2026-01-31', '2026-02-01', '2026-02-02']);
    assert.deepEqual(fillSeries(['2026-01-01', '2026-01-08'], 2, 'date'), ['2026-01-15', '2026-01-22']);
    assert.deepEqual(fillSeries(['2026-01-01T08:00:00'], 1, 'datetime'), ['2026-01-02T08:00:00']);
});

test('text with a trailing number continues the number, other text repeats', () => {
    assert.deepEqual(fillSeries(['Item 1'], 3), ['Item 2', 'Item 3', 'Item 4']);
    assert.deepEqual(fillSeries(['A001', 'A003'], 2), ['A005', 'A007']);
    assert.deepEqual(fillSeries(['x', 'y'], 3), ['x', 'y', 'x']);
    assert.deepEqual(fillSeries(['Q1', 'Z2'], 2), ['Q1', 'Z2'], 'different prefixes repeat');
    assert.deepEqual(fillSeries([true, false], 3, 'boolean'), [true, false, true]);
});

test('backward fills run the series in reverse, ending next to the source', () => {
    assert.deepEqual(fillSeriesBackward([3, 4], 2, 'number'), [1, 2]);
    assert.deepEqual(fillSeriesBackward(['a', 'b', 'c'], 2), ['b', 'c']);
    assert.deepEqual(fillSeries([], 2), []);
});
