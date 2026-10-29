import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { frames, open } from './helpers.ts';

test.beforeEach(async ({ page }) => open(page));

const cell = (page: Page, id: number, field: string) => page.locator(`tbody tr[data-id="${id}"] td[data-field="${field}"]`);

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
}
const center = async (page: Page, id: number, field: string) => {
    const box = (await cell(page, id, field).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('dragging selects a range and Delete clears it', async ({ page }) => {
    await page.evaluate(() => window.make({ editable: true, data: window.rows(50), columns: [{ field: 'id', type: 'integer', editable: false }, { field: 'name' }, { field: 'qty', type: 'integer' }] }));
    await drag(page, await center(page, 2, 'name'), await center(page, 4, 'qty'));
    await expect(page.locator('td.ig-in-range')).toHaveCount(6);
    expect(await page.evaluate(() => window.ig.getRange()!.rows)).toEqual(['2', '3', '4']);
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('', 'no text is selected by the drag');

    await page.keyboard.press('Delete');
    await expect(cell(page, 3, 'name')).toHaveText('');
    await page.keyboard.press('Control+z');
    await expect(cell(page, 3, 'name')).toHaveText('Row 3');
});

test('the fill handle continues a series and auto scrolls past the bottom', async ({ page }) => {
    await page.evaluate(() => window.make({ editable: true, data: window.rows(200, () => ({ qty: null })), columns: [{ field: 'id', type: 'integer', editable: false }, { field: 'qty', type: 'integer' }] }));
    await page.evaluate(() => {
        window.ig.setCellValue('1', 'qty', 1);
        window.ig.setCellValue('2', 'qty', 2);
        window.ig.setRange({ id: '1', field: 'qty' }, { id: '2', field: 'qty' });
    });
    const handle = (await page.locator('.ig-fill-handle').boundingBox())!;
    const target = await center(page, 6, 'qty');
    await drag(page, { x: handle.x + 3, y: handle.y + 3 }, target);
    await expect(cell(page, 6, 'qty')).toHaveText('6');
    await expect(cell(page, 7, 'qty')).toHaveText('');

    // hold the pointer below the grid: it scrolls and keeps extending the fill
    const box = (await page.locator('.ig-scroll').boundingBox())!;
    const corner = (await page.locator('.ig-fill-handle').boundingBox())!;
    await page.mouse.move(corner.x + 3, corner.y + 3);
    await page.mouse.down();
    await page.mouse.move(corner.x + 3, box.y + box.height - 4, { steps: 4 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await frames(page);
    const filled = await page.evaluate(() => window.ig.getRows('filtered').filter(r => r.qty !== null).length);
    expect(filled).toBeGreaterThan(15);
    const values = await page.evaluate(() => window.ig.getRows('filtered').slice(0, 20).map(r => r.qty));
    expect(values.slice(0, 15)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
});

test('copy and paste a range through the real clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => window.make({ editable: true, data: window.rows(10), columns: [{ field: 'name' }, { field: 'qty', type: 'integer' }] }));
    await drag(page, await center(page, 1, 'name'), await center(page, 2, 'qty'));
    await page.keyboard.press('Control+c');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Row 1\t0\nRow 2\t1');
    await cell(page, 5, 'name').click();
    await page.keyboard.press('Control+v');
    await expect(cell(page, 6, 'qty')).toHaveText('1');
    await expect(cell(page, 5, 'name')).toHaveText('Row 1');
});
