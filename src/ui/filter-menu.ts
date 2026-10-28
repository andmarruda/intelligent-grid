/**
 * Excel-like AutoFilter popover: sort, two custom conditions joined by And/Or, and a value checklist.
 */
import { h } from './dom.ts';
import { operatorsFor } from '../core/filters.ts';
import { DATE_TYPES } from '../core/columns.ts';
import type { IntelligentGrid } from './grid.ts';
import type { Column, Filter, FilterCondition, FilterOperator } from '../types.ts';

const MAX_VALUES = 1000;

export function openFilterMenu(grid: IntelligentGrid, column: Column, anchor: HTMLElement): void {
    grid.closePopover();
    const t = grid.t;
    const current: Filter = grid.getFilters()[column.field] ?? {};
    const operators = operatorsFor(column);
    const noValue = (op: string) => op === 'empty' || op === 'notEmpty';
    const inputType = DATE_TYPES.has(column.type) ? 'date' : 'text';

    const conditionRow = (condition: Partial<FilterCondition> = {}) => {
        const op = h('select', { class: 'ig-input' },
            h('option', { value: '', text: '' }),
            operators.map(o => h('option', { value: o, text: t(`op_${o}`), selected: condition.op === o })));
        const value: HTMLInputElement | HTMLSelectElement = column.type === 'boolean'
            ? h('select', { class: 'ig-input' },
                h('option', { value: 'true', text: t('true'), selected: condition.value === true }),
                h('option', { value: 'false', text: t('false'), selected: condition.value === false }))
            : h('input', { class: 'ig-input', type: inputType, value: condition.value ?? '' });
        const value2 = h('input', { class: 'ig-input', type: inputType, value: condition.value2 ?? '' });
        const sync = () => {
            value.hidden = noValue(op.value);
            value2.hidden = op.value !== 'between';
        };
        op.addEventListener('change', sync);
        sync();
        return {
            element: h('div', { class: 'ig-condition' }, op, value, value2),
            read: (): FilterCondition | null => op.value ? {
                op: op.value as FilterOperator,
                value: column.type === 'boolean' ? value.value === 'true' : value.value,
                value2: value2.value
            } : null
        };
    };

    const first = conditionRow(current.conditions?.[0]);
    const second = conditionRow(current.conditions?.[1]);
    const joinName = `ig-join-${Math.random().toString(36).slice(2)}`;
    const joinAnd = h('input', { type: 'radio', name: joinName, checked: current.join !== 'or' });
    const joinOr = h('input', { type: 'radio', name: joinName, checked: current.join === 'or' });

    const distinct = grid.distinctValues(column.field);
    const selected = new Set(Array.isArray(current.values) ? current.values : distinct.map(d => d.value));
    const search = h('input', { class: 'ig-input', type: 'search', placeholder: t('search') });
    const list = h('div', { class: 'ig-values' });
    const all = h('input', { type: 'checkbox' });

    const syncAll = () => {
        all.checked = selected.size === distinct.length;
        all.indeterminate = selected.size > 0 && selected.size < distinct.length;
    };
    const renderValues = () => {
        const needle = search.value.trim().toLocaleLowerCase(grid.locale);
        const visible = distinct.filter(d => !needle || d.label.toLocaleLowerCase(grid.locale).includes(needle)).slice(0, MAX_VALUES);
        list.replaceChildren(...visible.map(d => {
            const box = h('input', {
                type: 'checkbox',
                checked: selected.has(d.value),
                onchange: (e: Event) => {
                    if ((e.target as HTMLInputElement).checked) selected.add(d.value);
                    else selected.delete(d.value);
                    syncAll();
                }
            });
            return h('label', { class: 'ig-value' }, box, h('span', { text: d.value === '' ? t('blanks') : d.label }), h('small', { text: d.count }));
        }));
    };
    all.addEventListener('change', () => {
        if (all.checked) distinct.forEach(d => selected.add(d.value));
        else selected.clear();
        renderValues();
        syncAll();
    });
    search.addEventListener('input', renderValues);
    renderValues();
    syncAll();

    const apply = () => {
        const conditions = [first.read(), second.read()].filter((c): c is FilterCondition => c !== null);
        // developer supplied parts (formula/test) survive, the UI owns conditions and values
        const filter: Filter = { formula: current.formula, test: current.test };
        if (conditions.length) {
            filter.conditions = conditions;
            filter.join = joinOr.checked ? 'or' : 'and';
        }
        if (selected.size !== distinct.length) filter.values = [...selected];
        grid.setFilter(column.field, filter);
        grid.closePopover();
    };

    const sortButton = (dir: 'asc' | 'desc', label: string) => h('button', {
        type: 'button', class: 'ig-menu-item', text: label,
        onclick: () => {
            grid.setSort([{ field: column.field, dir }]);
            grid.closePopover();
        }
    });

    const menu = h('div', { class: 'ig-popover ig-filter-menu', role: 'dialog' },
        column.sortable ? h('div', { class: 'ig-menu-section' }, sortButton('asc', t('sortAsc')), sortButton('desc', t('sortDesc'))) : null,
        h('div', { class: 'ig-menu-section' },
            h('strong', { text: t('filter') }),
            first.element,
            h('div', { class: 'ig-join' }, h('label', {}, joinAnd, t('and')), h('label', {}, joinOr, t('or'))),
            second.element),
        h('div', { class: 'ig-menu-section' },
            search,
            h('label', { class: 'ig-value ig-value-all' }, all, h('span', { text: t('selectAll') })),
            list),
        h('div', { class: 'ig-menu-actions' },
            h('button', { type: 'button', class: 'ig-btn', text: t('clear'), onclick: () => { grid.setFilter(column.field, null); grid.closePopover(); } }),
            h('button', { type: 'button', class: 'ig-btn ig-btn-primary', text: t('apply'), onclick: apply }))
    );
    menu.addEventListener('keydown', e => {
        const target = e.target as HTMLInputElement;
        if (e.key === 'Enter' && target.tagName === 'INPUT' && target.type !== 'checkbox') apply();
    });

    grid.showPopover(menu, anchor);
}
