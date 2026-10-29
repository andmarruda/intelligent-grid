import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla, setupDom } from './helpers.ts';
import { columnStats, iconFor, ratio, scaleColor } from '../src/core/presets.ts';
import type { ColumnDefinition, GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

function create(column: Partial<ColumnDefinition>, options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', editable: true,
        columns: [{ field: 'name' }, { field: 'score', type: 'number', ...column }],
        data: [{ id: 1, name: 'a', score: 0 }, { id: 2, name: 'b', score: 50 }, { id: 3, name: 'c', score: 100 }, { id: 4, name: 'd', score: null }],
        ...options
    });
}
const cell = (grid: IntelligentGridType, id: string) => grid.root.querySelector<HTMLElement>(`tr[data-id="${id}"] td[data-field="score"]`)!;

test('stats, ratio, color interpolation and icon thresholds', () => {
    assert.deepEqual(columnStats([3, 'x', null, -2, 10, NaN]), { min: -2, max: 10 });
    assert.equal(columnStats(['a', null]), null);
    assert.equal(ratio(5, 0, 10), 0.5);
    assert.equal(ratio(20, 0, 10), 1);
    assert.equal(ratio(3, 3, 3), 1, 'a single value fills the bar');
    assert.equal(scaleColor(['#000000', '#ffffff'], 0.5), 'rgb(128, 128, 128)');
    assert.equal(scaleColor(['#f00', '#0f0', '#00f'], 0.75), 'rgb(0, 128, 128)');
    const stats = { min: 0, max: 100 };
    assert.equal(iconFor({ type: 'iconSet' }, 10, stats).icon, '↓');
    assert.equal(iconFor({ type: 'iconSet' }, 50, stats).icon, '→');
    assert.equal(iconFor({ type: 'iconSet' }, 90, stats).icon, '↑');
    assert.equal(iconFor({ type: 'iconSet', reverse: true }, 90, stats).icon, '↓');
    assert.equal(iconFor({ type: 'iconSet', icons: ['😞', '😐', '🙂', '😀'], thresholds: [10, 20, 30], thresholdType: 'number' }, 25, stats).icon, '🙂');
});

test('data bars scale to the column and redraw when an edit moves the maximum', () => {
    const grid = create({ conditionalFormats: [{ type: 'dataBar' }] });
    assert.ok(cell(grid, '2').classList.contains('ig-databar'));
    assert.equal(cell(grid, '2').style.getPropertyValue('--ig-bar'), '50.0%');
    assert.equal(cell(grid, '3').style.getPropertyValue('--ig-bar'), '100.0%');
    assert.equal(cell(grid, '4').classList.contains('ig-databar'), false, 'blank cells get no bar');
    grid.setCellValue('3', 'score', 200);
    assert.equal(cell(grid, '2').style.getPropertyValue('--ig-bar'), '25.0%', 'other rows follow the new maximum');
    grid.setFilter('score', { conditions: [{ op: 'lt', value: 100 }] });
    assert.equal(cell(grid, '2').style.getPropertyValue('--ig-bar'), '100.0%', 'the scale follows the filtered rows');
});

test('color scales and icon sets', () => {
    const scale = create({ conditionalFormats: [{ type: 'colorScale', colors: ['#ffffff', '#000000'] }] });
    assert.equal(cell(scale, '1').style.backgroundColor, 'rgb(255, 255, 255)');
    assert.equal(cell(scale, '2').style.backgroundColor, 'rgb(128, 128, 128)');

    const icons = create({ conditionalFormats: [{ type: 'iconSet', icons: 'traffic' }] });
    assert.equal(cell(icons, '3').querySelector('.ig-cf-icon')!.className, 'ig-cf-icon ig-cf-icon-good');
    assert.equal(cell(icons, '3').textContent, '●100');
    const only = create({ conditionalFormats: [{ type: 'iconSet', showValue: false }] });
    assert.equal(cell(only, '1').textContent, '↓');
});

test('presets combine with rules', () => {
    const grid = create({ conditionalFormats: [{ type: 'dataBar', color: 'red' }, { formula: '=[@score] > 60', className: 'hot' }] });
    assert.ok(cell(grid, '3').classList.contains('hot'));
    assert.equal(cell(grid, '3').style.getPropertyValue('--ig-bar-color'), 'red');
    assert.equal(cell(grid, '1').classList.contains('hot'), false);
});
