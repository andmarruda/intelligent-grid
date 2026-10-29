/**
 * Visual query builder panel: nested AND / OR / NOT groups of rules, with a live preview of the
 * SorlaDB find() JSON and of how many rows match. Edits a draft; Apply hands it to the grid.
 */
import { h } from './dom.ts';
import { DATE_TYPES, NUMERIC_TYPES } from '../core/columns.ts';
import { emptyGroup, isCompleteRule, queryOperatorsFor, toSorlaQuery } from '../core/query.ts';
import type { IntelligentGrid } from './grid.ts';
import type { Column, QueryGroup, QueryOperator, QueryRule } from '../types.ts';

const MAX_DEPTH = 4;

export class QueryBuilder {
    element: HTMLDivElement;
    private grid: IntelligentGrid;
    private draft: QueryGroup = emptyGroup();
    private body: HTMLDivElement;
    private json: HTMLPreElement;
    private preview: HTMLSpanElement;
    private previewTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(grid: IntelligentGrid) {
        this.grid = grid;
        const t = grid.t;
        this.body = h('div', { class: 'ig-qb-body' });
        this.json = h('pre', { class: 'ig-qb-json', tabindex: '0', 'aria-label': t('queryJson') });
        this.preview = h('span', { class: 'ig-qb-preview', 'aria-live': 'polite' });

        const copy = h('button', {
            type: 'button', class: 'ig-btn', text: t('copyJson'),
            onclick: async () => {
                try {
                    await navigator.clipboard.writeText(this.json.textContent ?? '');
                    copy.textContent = t('copied');
                } catch {
                    // clipboard blocked (insecure context): select the text so the user can copy it
                    getSelection()?.selectAllChildren(this.json);
                }
                setTimeout(() => { copy.textContent = t('copyJson'); }, 1500);
            }
        });

        this.element = h('div', { class: 'ig-qb', role: 'region', 'aria-label': t('advancedFilter'), hidden: true },
            this.body,
            h('details', { class: 'ig-qb-details' },
                h('summary', { text: t('queryJson') }),
                this.json,
                h('div', { class: 'ig-qb-json-actions' }, copy)),
            h('div', { class: 'ig-qb-footer' },
                this.preview,
                h('div', { class: 'ig-qb-actions' },
                    h('button', { type: 'button', class: 'ig-btn', text: t('clear'), onclick: () => this.clear() }),
                    h('button', { type: 'button', class: 'ig-btn', text: t('cancel'), onclick: () => this.close() }),
                    h('button', { type: 'button', class: 'ig-btn ig-btn-primary', text: t('apply'), onclick: () => this.apply() }))));

        this.element.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.close();
            } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                this.apply();
            }
        });
    }

    get isOpen(): boolean {
        return !this.element.hidden;
    }

    open(): void {
        const current = this.grid.getQuery();
        this.draft = current
            ? (current.type === 'group' ? structuredClone(current) : { ...emptyGroup(), children: [structuredClone(current)] })
            : { ...emptyGroup(), children: [this.newRule()] };
        this.element.hidden = false;
        this.render();
        this.element.querySelector<HTMLElement>('select, input, button')?.focus();
        this.grid.emit('queryBuilderOpen', {});
    }

    close(): void {
        if (!this.isOpen) return;
        this.element.hidden = true;
        clearTimeout(this.previewTimer);
        this.grid.emit('queryBuilderClose', {});
    }

    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    private apply(): void {
        this.grid.setQuery(this.draft);
        this.close();
    }

    private clear(): void {
        this.draft = { ...emptyGroup(), children: [this.newRule()] };
        this.render();
    }

    private columns(): Column[] {
        return this.grid.columns.filter(column => column.filterable);
    }

    private newRule(field?: string): QueryRule {
        const column = this.columns().find(c => c.field === field) ?? this.columns()[0];
        const rule: QueryRule = { type: 'rule', field: column?.field ?? '', op: column ? queryOperatorsFor(column)[0]! : 'eq', value: '' };
        if (column?.type === 'boolean') rule.value = true;
        return rule;
    }

    private changed(): void {
        const json = toSorlaQuery(this.draft, this.grid.queryColumns(), this.grid.locale);
        this.json.textContent = JSON.stringify(json, null, 2);
        clearTimeout(this.previewTimer);
        this.previewTimer = setTimeout(() => {
            this.preview.textContent = this.grid.t('previewRows', { count: this.grid.countQuery(this.draft) });
        }, 150);
    }

    private render(): void {
        this.body.replaceChildren(this.renderGroup(this.draft, 0, null));
        this.changed();
    }

    private renderGroup(group: QueryGroup, depth: number, parent: QueryGroup | null): HTMLElement {
        const t = this.grid.t;
        const joinButton = (join: 'and' | 'or', label: string) => h('button', {
            type: 'button',
            class: `ig-qb-join${group.join === join ? ' ig-active' : ''}`,
            'aria-pressed': String(group.join === join),
            text: label,
            onclick: () => { group.join = join; this.render(); }
        });
        const not = h('input', { type: 'checkbox', checked: !!group.not, onchange: (e: Event) => { group.not = (e.target as HTMLInputElement).checked; this.render(); } });

        const header = h('div', { class: 'ig-qb-group-header' },
            h('div', { class: 'ig-qb-joins', role: 'group', 'aria-label': t('join') }, joinButton('and', t('and')), joinButton('or', t('or'))),
            h('label', { class: 'ig-qb-not' }, not, t('not')),
            h('span', { class: 'ig-qb-spacer' }),
            h('button', { type: 'button', class: 'ig-btn ig-btn-link', text: t('addRule'), onclick: () => { group.children.push(this.newRule()); this.render(); } }),
            depth < MAX_DEPTH ? h('button', {
                type: 'button', class: 'ig-btn ig-btn-link', text: t('addGroup'),
                onclick: () => { group.children.push({ ...emptyGroup(group.join === 'and' ? 'or' : 'and'), children: [this.newRule()] }); this.render(); }
            }) : null,
            parent ? h('button', {
                type: 'button', class: 'ig-qb-remove', 'aria-label': t('removeGroup'), title: t('removeGroup'), text: '×',
                onclick: () => { parent.children.splice(parent.children.indexOf(group), 1); this.render(); }
            }) : null);

        const children = group.children.length
            ? group.children.map(child => child.type === 'group' ? this.renderGroup(child, depth + 1, group) : this.renderRule(child, group))
            : [h('p', { class: 'ig-qb-empty', text: t('queryEmpty') })];

        return h('div', { class: `ig-qb-group${group.not ? ' ig-qb-negated' : ''}`, dataset: { depth: String(depth), join: group.join } },
            header,
            h('div', { class: 'ig-qb-children' }, children));
    }

    private renderRule(rule: QueryRule, parent: QueryGroup): HTMLElement {
        const t = this.grid.t;
        const columns = this.columns();
        const column = columns.find(c => c.field === rule.field) ?? columns[0];
        if (!column) return h('div');

        const field = h('select', {
            class: 'ig-input', 'aria-label': t('field'),
            onchange: (e: Event) => {
                const next = this.newRule((e.target as HTMLSelectElement).value);
                Object.assign(rule, { field: next.field, op: next.op, value: next.value, value2: undefined, values: undefined });
                this.render();
            }
        }, columns.map(c => h('option', { value: c.field, text: c.title, selected: c.field === column.field })));

        const operators = queryOperatorsFor(column);
        const op = h('select', {
            class: 'ig-input', 'aria-label': t('operator'),
            onchange: (e: Event) => {
                const next = (e.target as HTMLSelectElement).value as QueryOperator;
                const wasList = rule.op === 'in' || rule.op === 'nin';
                rule.op = next;
                if ((next === 'in' || next === 'nin') && !wasList) rule.values = [];
                this.render();
            }
        }, operators.map(o => h('option', { value: o, text: this.operatorLabel(o, column), selected: o === rule.op })));

        const incomplete = !isCompleteRule(rule);
        return h('div', { class: `ig-qb-rule${incomplete ? ' ig-qb-incomplete' : ''}` },
            field,
            op,
            this.renderValue(rule, column),
            h('button', {
                type: 'button', class: 'ig-qb-remove', 'aria-label': t('removeRule'), title: t('removeRule'), text: '×',
                onclick: () => { parent.children.splice(parent.children.indexOf(rule), 1); this.render(); }
            }));
    }

    private operatorLabel(op: QueryOperator, column: Column): string {
        const t = this.grid.t;
        if (op === 'in' || op === 'nin') return t(`op_${op}`);
        if ((op === 'eq' || op === 'ne') && !NUMERIC_TYPES.has(column.type) && !DATE_TYPES.has(column.type) && column.type !== 'boolean') {
            return t(op === 'eq' ? 'op_equals' : 'op_notEquals');
        }
        return t(`op_${op}`);
    }

    private renderValue(rule: QueryRule, column: Column): HTMLElement | null {
        const t = this.grid.t;
        const update = (key: 'value' | 'value2') => (e: Event) => {
            rule[key] = (e.target as HTMLInputElement).value;
            this.changed();
            (e.target as HTMLElement).closest('.ig-qb-rule')?.classList.toggle('ig-qb-incomplete', !isCompleteRule(rule));
        };
        const type = DATE_TYPES.has(column.type) ? 'date' : 'text';
        const input = (key: 'value' | 'value2') => h('input', {
            class: 'ig-input', type, 'aria-label': t('value'),
            inputmode: NUMERIC_TYPES.has(column.type) ? 'decimal' : null,
            value: rule[key] === undefined || rule[key] === null ? '' : String(rule[key]),
            oninput: update(key)
        });

        if (rule.op === 'empty' || rule.op === 'notEmpty') return null;
        if (rule.op === 'between') return h('span', { class: 'ig-qb-range' }, input('value'), h('span', { text: '–' }), input('value2'));

        if (rule.op === 'in' || rule.op === 'nin') {
            const values = this.grid.distinctValues(column.field);
            const chosen = new Set(rule.values ?? []);
            const list = h('select', {
                class: 'ig-input ig-qb-values', multiple: true, size: Math.min(6, Math.max(3, values.length)), 'aria-label': t('value'),
                onchange: (e: Event) => {
                    const options = [...(e.target as HTMLSelectElement).selectedOptions];
                    rule.values = options.map(option => values[Number(option.value)]!.value);
                    this.changed();
                }
            }, values.map((v, i) => h('option', { value: String(i), text: v.value === '' ? t('blanks') : v.label, selected: chosen.has(v.value) })));
            return list;
        }

        if (column.type === 'boolean') {
            return h('select', {
                class: 'ig-input', 'aria-label': t('value'),
                onchange: (e: Event) => { rule.value = (e.target as HTMLSelectElement).value === 'true'; this.changed(); }
            }, h('option', { value: 'true', text: t('true'), selected: rule.value !== false }), h('option', { value: 'false', text: t('false'), selected: rule.value === false }));
        }

        if (column.options && (rule.op === 'eq' || rule.op === 'ne')) {
            const options = column.options;
            if (rule.value === '' && options[0]) rule.value = options[0].value;
            return h('select', {
                class: 'ig-input', 'aria-label': t('value'),
                onchange: (e: Event) => { rule.value = options[Number((e.target as HTMLSelectElement).value)]?.value; this.changed(); }
            }, options.map((o, i) => h('option', { value: String(i), text: o.label, selected: o.value === rule.value })));
        }

        return input('value');
    }
}
