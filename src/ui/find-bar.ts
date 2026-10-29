/**
 * Find / replace and Go to bar (Ctrl+F, Ctrl+H, Ctrl+G). Matches come from grid.find(), so they
 * follow the filtered and sorted view; the current match becomes the active cell.
 */
import { h } from './dom.ts';
import type { IntelligentGrid } from './grid.ts';
import type { CellRef, FindOptions } from '../types.ts';

export type FindMode = 'find' | 'replace' | 'goto';

export class FindBar {
    element: HTMLDivElement;
    private grid: IntelligentGrid;
    private mode: FindMode = 'find';
    private input: HTMLInputElement;
    private replaceInput: HTMLInputElement;
    private matchCase: HTMLInputElement;
    private wholeCell: HTMLInputElement;
    private count: HTMLSpanElement;
    private replaceRow: HTMLDivElement;
    private findOnly: HTMLElement[];
    private matches: CellRef[] = [];
    private current = -1;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(grid: IntelligentGrid) {
        this.grid = grid;
        const t = grid.t;
        const option = (label: string) => {
            const input = h('input', { type: 'checkbox', onchange: () => this.search() });
            return [input, h('label', { class: 'ig-find-option' }, input, label)] as const;
        };
        let caseLabel: HTMLElement;
        let wholeLabel: HTMLElement;
        [this.matchCase, caseLabel] = option(t('matchCase'));
        [this.wholeCell, wholeLabel] = option(t('wholeCell'));
        this.input = h('input', { type: 'search', class: 'ig-input ig-find-input', 'aria-label': t('find'), oninput: () => this.schedule() });
        this.replaceInput = h('input', { type: 'text', class: 'ig-input ig-find-input', placeholder: t('replaceWith'), 'aria-label': t('replaceWith') });
        this.count = h('span', { class: 'ig-find-count', 'aria-live': 'polite' });
        const button = (text: string, onclick: () => void, title?: string) => h('button', { type: 'button', class: 'ig-btn', text, title: title ?? text, 'aria-label': title ?? text, onclick });
        const previous = button('↑', () => this.step(-1), t('findPrevious'));
        const next = button('↓', () => this.step(1), t('findNext'));
        this.replaceRow = h('div', { class: 'ig-find-row' },
            this.replaceInput,
            button(t('replace'), () => this.replaceCurrent()),
            button(t('replaceAll'), () => this.replaceAll()));
        this.findOnly = [previous, next, caseLabel, wholeLabel, this.count];
        this.element = h('div', { class: 'ig-find', role: 'search', hidden: true },
            h('div', { class: 'ig-find-row' },
                this.input, previous, next, caseLabel, wholeLabel, this.count,
                h('button', { type: 'button', class: 'ig-btn ig-find-close', text: '×', title: t('close'), 'aria-label': t('close'), onclick: () => this.close() })),
            this.replaceRow);

        this.element.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.mode === 'goto') this.goTo();
                else if (e.target === this.replaceInput) this.replaceCurrent();
                else this.step(e.shiftKey ? -1 : 1);
            } else if ((e.ctrlKey || e.metaKey) && ['f', 'h', 'g'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                this.open(({ f: 'find', h: 'replace', g: 'goto' } as const)[e.key.toLowerCase() as 'f' | 'h' | 'g']);
            }
        });
    }

    get isOpen(): boolean {
        return !this.element.hidden;
    }

    open(mode: FindMode = 'find'): void {
        const t = this.grid.t;
        const changed = mode !== this.mode;
        this.mode = mode;
        this.element.hidden = false;
        this.element.dataset.mode = mode;
        this.replaceRow.hidden = mode !== 'replace';
        for (const el of this.findOnly) el.hidden = mode === 'goto';
        this.input.type = mode === 'goto' ? 'text' : 'search';
        this.input.placeholder = mode === 'goto' ? t('goToHint') : t('find');
        this.input.setAttribute('aria-label', mode === 'goto' ? t('goTo') : t('find'));
        if (changed && (mode === 'goto' || this.input.dataset.mode === 'goto')) this.input.value = '';
        this.input.dataset.mode = mode;
        this.input.focus();
        this.input.select();
        if (mode !== 'goto') this.search();
    }

    close(): void {
        if (this.element.hidden) return;
        this.element.hidden = true;
        this.matches = [];
        this.current = -1;
        this.grid.highlightCells([]);
        this.grid.focus();
    }

    private options(): FindOptions {
        return { matchCase: this.matchCase.checked, wholeCell: this.wholeCell.checked };
    }

    private schedule(): void {
        clearTimeout(this.timer);
        if (this.mode === 'goto') return;
        this.timer = setTimeout(() => this.search(), 120);
    }

    /** Finds every match and moves to the first one at or after the active cell. */
    search(): void {
        clearTimeout(this.timer);
        const text = this.input.value;
        this.matches = text ? this.grid.find(text, this.options()) : [];
        this.grid.highlightCells(this.matches);
        this.current = -1;
        if (this.matches.length) this.step(0);
        else this.updateCount();
    }

    private step(delta: number): void {
        if (!this.matches.length) {
            if (this.input.value) this.search();
            return;
        }
        if (this.current === -1) {
            // start from the active cell, like Excel
            const start = this.grid.indexOfCell(this.grid.getActiveCell());
            const after = this.matches.findIndex(m => this.grid.indexOfCell(m) >= start);
            this.current = after === -1 ? 0 : after;
            if (delta < 0) this.current = (this.current - 1 + this.matches.length) % this.matches.length;
        } else {
            this.current = (this.current + delta + this.matches.length) % this.matches.length;
        }
        this.select(this.current);
    }

    private select(index: number): void {
        this.current = index;
        const match = this.matches[index];
        if (match) this.grid.setRange(match);
        this.updateCount();
    }

    private updateCount(): void {
        const t = this.grid.t;
        this.count.textContent = !this.input.value ? ''
            : this.matches.length ? t('findCount', { current: this.current + 1, count: this.matches.length })
            : t('noMatches');
        this.input.classList.toggle('ig-invalid', !!this.input.value && !this.matches.length);
    }

    private replaceCurrent(): void {
        const match = this.matches[this.current];
        if (!match) {
            this.search();
            return;
        }
        this.grid.replace(this.input.value, this.replaceInput.value, { ...this.options(), cells: [match] });
        // go on with the next match after the replaced cell (it may still match, like "a" → "aa")
        const position = this.grid.indexOfCell(match);
        this.matches = this.grid.find(this.input.value, this.options());
        this.grid.highlightCells(this.matches);
        const next = this.matches.findIndex(m => this.grid.indexOfCell(m) > position);
        this.select(this.matches.length ? (next === -1 ? 0 : next) : -1);
    }

    private replaceAll(): void {
        const replaced = this.grid.replace(this.input.value, this.replaceInput.value, this.options());
        this.search();
        this.count.textContent = this.grid.t('replacedCount', { count: replaced });
    }

    private goTo(): void {
        const ok = this.grid.goTo(this.input.value);
        this.input.classList.toggle('ig-invalid', !ok);
        if (ok) this.close();
    }
}
