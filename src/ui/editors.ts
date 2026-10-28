/**
 * Cell editors. A custom editor is an object with create(context) returning
 *   { element, getValue(), focus(), destroy?() }
 * context: { value, text, column, row, grid, commit(), cancel() }
 * getValue() may return a string (parsed with the column type rules) or a final typed value.
 */
import { h } from './dom.ts';
import type { BuiltInEditor, Column, CustomEditor } from '../types.ts';

const textInput = (type: string, extra: Record<string, string> = {}): CustomEditor => ({
    create({ text }) {
        const input = h('input', { class: 'ig-editor', type, value: text, ...extra });
        return { element: input, getValue: () => input.value, focus: () => { input.focus(); input.select(); } };
    }
});

export const EDITORS: Record<BuiltInEditor, CustomEditor> = {
    text: textInput('text'),
    number: textInput('text', { inputmode: 'decimal' }),
    date: textInput('date'),
    datetime: textInput('datetime-local'),
    textarea: {
        create({ text }) {
            const area = h('textarea', { class: 'ig-editor ig-editor-textarea', rows: 3 });
            area.value = text;
            return { element: area, getValue: () => area.value, focus: () => area.focus() };
        }
    },
    select: {
        create({ value, column }) {
            const options = column.options ?? [];
            const select = h('select', { class: 'ig-editor' },
                h('option', { value: '', text: '' }),
                options.map((option, i) => h('option', { value: String(i), text: option.label, selected: option.value === value })));
            return {
                element: select,
                // option values can be numbers/booleans, map the index back to the real value
                getValue: () => select.value === '' ? null : options[Number(select.value)]?.value,
                focus: () => select.focus()
            };
        }
    },
    checkbox: {
        create({ value }) {
            const input = h('input', { class: 'ig-editor ig-editor-checkbox', type: 'checkbox', checked: value === true });
            return { element: input, getValue: () => input.checked, focus: () => input.focus() };
        }
    }
};

export function resolveEditor(column: Column, isFormula: boolean): CustomEditor {
    if (isFormula) return EDITORS.text;
    const editor = column.editor;
    if (typeof editor === 'object' && typeof editor.create === 'function') return editor;
    if (typeof editor === 'function') return { create: editor };
    return EDITORS[editor as BuiltInEditor] ?? EDITORS.text;
}
