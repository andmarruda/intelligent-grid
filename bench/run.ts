/**
 * Runs bench/index.html in a real Chromium and prints the timings.
 *   npm run bench                 10k and 100k rows
 *   npm run bench -- 10000 1000000
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const counts = sizes.length ? sizes : [10_000, 100_000];
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
    const file = normalize(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
    try {
        res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
    } catch {
        res.writeHead(404).end();
    }
}).listen(0);
const port = (server.address() as { port: number }).port;

const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const results: Array<Record<string, unknown>> = [];
for (const count of counts) {
    // a fresh page per size, so memory and caches do not carry over
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => console.error('page error:', error.message));
    await page.goto(`http://localhost:${port}/bench/index.html`);
    await page.waitForFunction(() => (window as unknown as { benchReady?: boolean }).benchReady === true);
    const result = await page.evaluate(n => (window as unknown as { runBenchmark: (n: number) => Promise<Record<string, unknown>> }).runBenchmark(n), count);
    results.push(result);
    console.log(JSON.stringify(result));
    await page.close();
}
await browser.close();
server.close();

console.log('\n| rows | open | filter | text filter | clear | sort | edit + recalc | scroll avg / p95 frame | DOM rows | heap |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
    console.log(`| ${Number(r.rows).toLocaleString('en-US')} | ${r.open} ms | ${r.filter} ms | ${r.textFilter} ms | ${r.clearFilters} ms | ${r.sort} ms | ${r.editWithRecalc} ms | ${r.scrollAvgFrameMs} / ${r.scrollP95FrameMs} ms | ${r.domRows} | ${r.heapMB} MB |`);
}
