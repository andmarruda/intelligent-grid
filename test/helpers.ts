import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import type { SorlaSource } from '../src/types.ts';
import type * as GridModule from '../src/ui/grid.ts';

const require = createRequire(import.meta.url);

export const Sorla = require('sorla-db') as SorlaSource;

/**
 * Installs a jsdom document as the global DOM and loads the grid against it.
 */
export async function setupDom(): Promise<typeof GridModule> {
    const dom = new JSDOM('<!doctype html><div id="grid"></div>', { pretendToBeVisual: true });
    const globals = globalThis as Record<string, unknown>;
    for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLFormElement', 'FormData', 'CSS', 'requestAnimationFrame', 'cancelAnimationFrame', 'FileReader', 'Blob'] as const) {
        globals[key] = dom.window[key] ?? globals[key];
    }
    globalThis.CSS ??= { escape: (s: string) => s.replace(/"/g, '\\"') } as unknown as typeof CSS;
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    return import('../src/ui/grid.ts');
}
