import { test, expect } from '@playwright/test';

// the server examples against the demo backend (scripts/demo-api.ts) served by playwright's webServer
test.beforeEach(({ page }) => {
    page.on('pageerror', error => { throw error; });
});

test('fetch pages: rows accumulate, scrolling back needs no request, filters go to the server', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/orders?')) requests.push(request.url()); });
    await page.goto('/examples/fetch-pages.html');
    await expect(page.locator('#stats')).toContainText('100 rows kept');
    const scroller = page.locator('.ig-scroll');
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('#stats')).toContainText('200 rows kept');
    const count = requests.length;
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(400);
    expect(requests.length).toBe(count);

    await page.locator('th[data-field="city"] .ig-filter-btn').click();
    await page.locator('.ig-filter-menu .ig-condition select.ig-input').first().selectOption('contains');
    await page.locator('.ig-filter-menu .ig-condition input.ig-input').first().fill('Recife');
    await page.locator('.ig-popover button', { hasText: 'Apply' }).click();
    const lastWhere = () => (requests.length ? new URL(requests.at(-1)!).searchParams.get('where') ?? '' : '');
    await expect.poll(lastWhere).toContain('Recife');
    expect(JSON.parse(lastWhere())).toEqual({ city: { $regex: 'Recife', $options: 'i' } });
    await expect(page.locator('tbody td[data-field="city"]').first()).toHaveText('Recife');
});

test('WebSocket: pages over the socket and pushed changes update rows in place', async ({ page }) => {
    await page.goto('/examples/websocket.html');
    await expect(page.locator('#state')).toHaveText('open');
    await expect(page.locator('tbody tr.ig-row').first()).toBeVisible();
    await page.locator('.ig-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator('#log')).toContainText('"offset":100');
    // the demo backend pushes a change every 3 s
    await expect(page.locator('#log')).toContainText('pushed', { timeout: 8000 });
});

test('SSE: 100 000 rows arrive in blocks with progress, sorted at the end', async ({ page }) => {
    await page.goto('/examples/sse-stream.html');
    await page.locator('#start').click();
    await expect(page.locator('#stats')).toContainText('of 100,000');
    await expect(page.locator('#log')).toContainText('done', { timeout: 30000 });
    await expect(page.locator('#stats')).toContainText('100,000 of 100,000 rows · 20 blocks');
    await expect(page.locator('tbody tr.ig-row').first().locator('td[data-field="id"]')).toHaveText('1');
    expect(await page.locator('tbody tr.ig-row').count()).toBeLessThan(60);
});
