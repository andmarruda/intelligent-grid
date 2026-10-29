import type { Page } from '@playwright/test';
import type { IntelligentGrid } from '../src/ui/grid.ts';
import type * as Lib from '../src/index.ts';

declare global {
    interface Window {
        ready: boolean;
        ig: IntelligentGrid;
        make: (options: Record<string, unknown>) => boolean;
        rows: (count: number, extra?: (i: number) => Record<string, unknown>) => Record<string, unknown>[];
        lib: typeof Lib;
    }
}

export async function open(page: Page): Promise<void> {
    page.on('pageerror', error => { throw error; });
    await page.goto('/e2e/fixture.html');
    await page.waitForFunction(() => window.ready === true);
}

/** Waits two frames, so scroll handlers and measurements have run. */
export const frames = (page: Page) => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
