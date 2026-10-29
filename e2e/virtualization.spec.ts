import { test, expect } from '@playwright/test';
import { frames, open } from './helpers.ts';

test.beforeEach(async ({ page }) => open(page));

test('only the visible rows are in the DOM, also with 100 000 rows', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(100_000), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }, { field: 'qty', type: 'integer' }] }));
    await frames(page);
    const domRows = await page.locator('tbody tr.ig-row').count();
    expect(domRows).toBeGreaterThan(5);
    expect(domRows).toBeLessThan(60);

    // the scroll size represents every row
    const scrollHeight = await page.locator('.ig-scroll').evaluate(el => el.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(100_000 * 30);

    // jump to the end: the last rows are rendered
    await page.locator('.ig-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await frames(page);
    await expect(page.locator('tbody tr.ig-row[data-id="100000"]')).toBeVisible();
    expect(await page.locator('tbody tr.ig-row').count()).toBeLessThan(60);
});

test('keyboard navigation scrolls the active cell into view', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(500), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }] }));
    await page.locator('tbody td[data-field="name"]').first().click();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
    await frames(page);
    const active = page.locator('td.ig-active');
    await expect(active).toHaveText('Row 41');
    await expect(active).toBeInViewport();
});

test('scrollToRow, sorting and filtering keep the window consistent', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(10_000), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }, { field: 'qty', type: 'integer' }] }));
    await page.evaluate(() => window.ig.scrollToRow(5000));
    await frames(page);
    await expect(page.locator('tbody tr.ig-row[data-id="5001"]')).toBeInViewport();
    await page.evaluate(() => window.ig.setSort([{ field: 'id', dir: 'desc' }]));
    await page.evaluate(() => window.ig.setFilter('qty', { conditions: [{ op: 'eq', value: 7 }] }));
    await frames(page);
    expect(await page.evaluate(() => window.ig.getRows('filtered').length)).toBe(100);
    // zebra follows the position in the list, not the DOM
    const classes = await page.locator('tbody tr.ig-row').evaluateAll(rows => rows.slice(0, 4).map(r => r.classList.contains('ig-row-alt')));
    expect(classes.filter(Boolean).length).toBe(2);
});

test('pinned columns stay visible while scrolling horizontally; many columns are virtualized', async ({ page }) => {
    await page.evaluate(() => {
        const columns = [{ field: 'id', type: 'integer', pinned: 'left', width: 70 }, { field: 'name', pinned: 'left', width: 120 }];
        for (let c = 0; c < 80; c++) columns.push({ field: `c${c}`, type: 'integer', width: 100 } as never);
        columns.push({ field: 'qty', type: 'integer', pinned: 'right', width: 80 });
        window.make({ data: window.rows(200, i => Object.fromEntries(Array.from({ length: 80 }, (_, c) => [`c${c}`, i * c]))), columns });
    });
    await frames(page);
    const cellsPerRow = await page.locator('tbody tr.ig-row').first().locator('td').count();
    expect(cellsPerRow).toBeLessThan(30);

    const idBefore = await page.locator('tbody tr.ig-row').first().locator('td[data-field="id"]').boundingBox();
    await page.locator('.ig-scroll').evaluate(el => { el.scrollLeft = 5000; });
    await frames(page);
    const idAfter = await page.locator('tbody tr.ig-row').first().locator('td[data-field="id"]').boundingBox();
    expect(Math.round(idAfter!.x)).toBe(Math.round(idBefore!.x));
    await expect(page.locator('thead th[data-field="c55"]')).toBeAttached();
    await expect(page.locator('thead th[data-field="c0"]')).not.toBeAttached();
    await expect(page.locator('tbody tr.ig-row').first().locator('td[data-field="qty"]')).toBeInViewport();
});

test('wrapped text grows its row and the scroll size follows', async ({ page }) => {
    await page.evaluate(() => window.make({
        data: window.rows(300, i => ({ notes: i % 10 === 0 ? 'A long note '.repeat(20) : 'short' })),
        columns: [{ field: 'id', type: 'integer', width: 70 }, { field: 'notes', wrap: true, width: 200 }]
    }));
    await frames(page);
    const heights = await page.locator('tbody tr.ig-row').evaluateAll(rows => rows.slice(0, 2).map(r => r.getBoundingClientRect().height));
    expect(heights[0]!).toBeGreaterThan(heights[1]! * 2);
    // the last row is still reachable
    await page.locator('.ig-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await frames(page);
    await frames(page);
    await expect(page.locator('tbody tr.ig-row[data-id="300"]')).toBeInViewport();
});

test('pinColumn API and editing inside the window', async ({ page }) => {
    await page.evaluate(() => window.make({ editable: true, data: window.rows(1000), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }, { field: 'qty', type: 'integer' }] }));
    await page.evaluate(() => window.ig.pinColumn('qty', 'left'));
    await frames(page);
    await expect(page.locator('thead th').nth(1)).toHaveAttribute('data-field', 'qty');
    await page.locator('tbody tr.ig-row[data-id="3"] td[data-field="name"]').dblclick();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Edited');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.ig.getRow('3')!.name)).toBe('Edited');
});

test('grouping 100 000 rows stays virtualized and fast', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(100_000), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }, { field: 'qty', type: 'integer', footer: 'sum' }] }));
    const ms = await page.evaluate(() => {
        const start = performance.now();
        window.ig.setGroupBy(['qty']);
        return performance.now() - start;
    });
    await frames(page);
    expect(ms).toBeLessThan(1500);
    await expect(page.locator('tbody tr.ig-group-row').first()).toContainText('qty: 0 (1,000)');
    expect(await page.locator('tbody tr.ig-row, tbody tr.ig-group-row').count()).toBeLessThan(60);
    await page.evaluate(() => window.ig.collapseGroups());
    await frames(page);
    const scrollHeight = await page.locator('.ig-scroll').evaluate(el => el.scrollHeight);
    expect(scrollHeight).toBeLessThan(100 * 60 + 200);
    await page.locator('.ig-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await frames(page);
    await expect(page.locator('tbody tr.ig-group-row').last()).toContainText('qty: 99');
    test.info().annotations.push({ type: 'timing', description: `setGroupBy on 100k rows: ${ms.toFixed(0)} ms` });
});
