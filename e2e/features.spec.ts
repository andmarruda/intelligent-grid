import { test, expect } from '@playwright/test';
import { frames, open } from './helpers.ts';

test.beforeEach(async ({ page }) => open(page));

test('Ctrl+F opens the grid find bar instead of the browser one', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(2000), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }] }));
    await page.locator('tbody td[data-field="name"]').first().click();
    await page.keyboard.press('Control+f');
    const input = page.locator('.ig-find-input').first();
    await expect(input).toBeFocused();
    await input.fill('Row 1500');
    await expect(page.locator('.ig-find-count')).toHaveText('1 of 1');
    await expect(page.locator('td.ig-active')).toHaveText('Row 1500');
    await expect(page.locator('td.ig-active')).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ig-find')).toBeHidden();

    await page.keyboard.press('Control+g');
    await page.locator('.ig-find-input').first().fill('42 name');
    await page.keyboard.press('Enter');
    await expect(page.locator('td.ig-active')).toHaveText('Row 42');
});

test('imports an exported .xlsx through the file input (DecompressionStream path included)', async ({ page }) => {
    await page.evaluate(() => window.make({
        editable: true, navbar: { import: true }, statusBar: true,
        data: window.rows(30), columns: [{ field: 'id', type: 'integer' }, { field: 'name' }, { field: 'qty', type: 'integer' }]
    }));
    // a stored .xlsx from the grid itself, then the same file deflated by the browser
    const files = await page.evaluate(async () => {
        const stored = window.ig.exportXLSX({ download: false })!;
        const deflate = async (bytes: Uint8Array) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
        // rebuild the zip with deflated entries
        const view = new DataView(stored.buffer);
        let end = stored.length - 22;
        while (view.getUint32(end, true) !== 0x06054b50) end--;
        const count = view.getUint16(end + 10, true);
        let at = view.getUint32(end + 16, true);
        const entries: Array<{ name: Uint8Array; data: Uint8Array; crc: number; size: number }> = [];
        for (let i = 0; i < count; i++) {
            const nameLength = view.getUint16(at + 28, true);
            const offset = view.getUint32(at + 42, true);
            const size = view.getUint32(at + 24, true);
            const name = stored.slice(at + 46, at + 46 + nameLength);
            const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
            entries.push({ name, data: await deflate(stored.slice(start, start + size)), crc: view.getUint32(at + 16, true), size });
            at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
        }
        const parts: Uint8Array[] = [];
        const centrals: Uint8Array[] = [];
        let offset = 0;
        for (const e of entries) {
            const local = new Uint8Array(30 + e.name.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(14, e.crc, true);
            lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.size, true); lv.setUint16(26, e.name.length, true);
            local.set(e.name, 30);
            const central = new Uint8Array(46 + e.name.length);
            const cv = new DataView(central.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(16, e.crc, true);
            cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.size, true); cv.setUint16(28, e.name.length, true); cv.setUint32(42, offset, true);
            central.set(e.name, 46);
            parts.push(local, e.data);
            centrals.push(central);
            offset += local.length + e.data.length;
        }
        const size = centrals.reduce((n, c) => n + c.length, 0);
        const tail = new Uint8Array(22);
        const tv = new DataView(tail.buffer);
        tv.setUint32(0, 0x06054b50, true); tv.setUint16(8, count, true); tv.setUint16(10, count, true); tv.setUint32(12, size, true); tv.setUint32(16, offset, true);
        const blob = new Blob([...parts, ...centrals, tail]);
        return { stored: [...stored], deflated: [...new Uint8Array(await blob.arrayBuffer())] };
    });
    await page.evaluate(() => window.ig.setData([]));

    await page.locator('.ig-navbar input[type="file"]').setInputFiles({ name: 'rows.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(files.deflated) });
    await expect(page.locator('.ig-status')).toContainText('30 row(s) imported');
    expect(await page.evaluate(() => window.ig.getRows().slice(0, 2).map(r => [r.id, r.name, r.qty]))).toEqual([[1, 'Row 1', 0], [2, 'Row 2', 1]]);
    expect(files.deflated.length).toBeLessThan(files.stored.length);
});

test('group rows collapse on click and keep the body virtualized', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(5000), groupBy: ['qty'], columns: [{ field: 'id', type: 'integer', footer: 'count' }, { field: 'name' }, { field: 'qty', type: 'integer' }] }));
    const first = page.locator('tbody tr.ig-group-row').first();
    await expect(first).toContainText('qty: 0 (50)');
    await first.click();
    await frames(page);
    await expect(page.locator('tbody tr.ig-group-row').nth(1)).toContainText('qty: 1 (50)');
    expect(await page.evaluate(() => window.ig.getGroups()[0]!.collapsed)).toBe(true);
});

test('find highlights show on zebra rows too; group labels are readable in a narrow first column', async ({ page }) => {
    await page.evaluate(() => window.make({ data: window.rows(50), columns: [{ field: 'id', type: 'integer', width: 60 }, { field: 'name' }, { field: 'qty', title: 'Quantity in stock', type: 'integer' }] }));
    await page.evaluate(() => window.ig.highlightCells([{ id: '1', field: 'name' }, { id: '2', field: 'name' }]));
    const colors = await page.locator('td.ig-find-match').evaluateAll(cells => cells.map(td => getComputedStyle(td).backgroundColor));
    expect(colors.length).toBe(2);
    expect(colors[0]).toBe(colors[1]);

    await page.evaluate(() => window.ig.setGroupBy(['qty']));
    const label = page.locator('tr.ig-group-row td.ig-group-label').first();
    const box = (await label.boundingBox())!;
    const title = (await label.locator('.ig-group-title').boundingBox())!;
    expect(title.width).toBeGreaterThan(box.width);   // runs over the next cells instead of being cut
    await expect(label).toContainText('Quantity in stock: 0');
});
