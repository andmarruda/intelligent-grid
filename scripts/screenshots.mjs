/**
 * Screenshots of the examples for the README and the website (docs/assets/*.png).
 *   npm run screenshots
 * Starts the demo server (with its backend), drives Chromium with Playwright and saves PNG files.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'docs/assets');
mkdirSync(assets, { recursive: true });
const port = 5397;
const base = `http://127.0.0.1:${port}/examples/`;

const server = spawn(process.execPath, [join(root, 'scripts/serve.ts')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
for (let i = 0; i < 50; i++) {
    try {
        await fetch(base);
        break;
    } catch {
        await wait(200);
    }
}

const browser = await chromium.launch();
const shot = async (name, { dark = false, path, act, target = '#grid', rows = true, wide = false, viewport = { width: 1360, height: 900 } }) => {
    const context = await browser.newContext({ viewport, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(base + path);
    // wide pages: let the example use the whole viewport
    if (wide) await page.addStyleTag({ content: 'main { max-width: none !important; }' });
    if (rows) await page.waitForSelector('tbody tr.ig-row');
    await page.evaluate(() => document.fonts.ready);
    if (act) await act(page);
    await wait(300);
    await page.locator(target).first().screenshot({ path: join(assets, `${name}.png`) });
    await context.close();
    console.log(`docs/assets/${name}.png`);
};

const cell = (page, id, field) => page.locator(`tbody tr[data-id="${id}"] td[data-field="${field}"]`);
const drag = async (page, from, to) => {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
};

// the hero: data bars, color scale, icons, sparklines, a pinned column and a selected range
await shot('spreadsheet', {
    path: 'spreadsheet.html',
    act: page => drag(page, cell(page, 3, 'qty'), cell(page, 7, 'discount'))
});

await shot('grouping', {
    path: 'spreadsheet.html',
    act: async page => {
        await page.click('#group2');
        // collapse the first two statuses of the first city: open and closed groups side by side
        await page.locator('tr.ig-group-row.ig-group-level-1').nth(0).click();
        await page.locator('tr.ig-group-row.ig-group-level-1').nth(1).click();
    }
});

await shot('find', {
    path: 'spreadsheet.html',
    act: async page => {
        await cell(page, 1, 'product').click();
        await page.keyboard.press('Control+f');
        await page.keyboard.type('Porto');
        await wait(300);
        await page.keyboard.press('Enter');
    }
});

await shot('dark', {
    dark: true,
    path: 'spreadsheet.html',
    act: page => drag(page, cell(page, 2, 'price'), cell(page, 5, 'total'))
});

await shot('query-builder', {
    path: 'query-builder.html',
    act: async page => {
        await page.click('#nested');
        // the example's button sets the query; open the builder to show it
        if (await page.locator('.ig-qb').isHidden()) await page.locator('.ig-query-btn').click();
    }
});

await shot('formulas', { path: 'formulas.html', wide: true, viewport: { width: 1900, height: 900 } });

await shot('sse', {
    path: 'sse-stream.html',
    target: 'main',
    rows: false,
    viewport: { width: 1360, height: 1000 },
    act: async page => {
        await page.click('#start');
        await page.waitForFunction(() => document.querySelector('#log')?.textContent.includes('done'), null, { timeout: 30000 });
    }
});

await browser.close();
server.kill();
