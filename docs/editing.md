# Editing & validation

Enable editing grid-wide with `editable: true` or per column. `editable` can be a function:

```ts
{ field: 'notes', editable: row => row?.status !== 'done' }
```

Calculated columns (`formula`) are read-only unless you set `editable` on them. Editing one then
creates a cell formula or value for that row only.

## Keyboard & mouse

| Action | Keys |
|---|---|
| Move the active cell | arrows, Tab / Shift+Tab, Ctrl/Cmd+arrow to the edge of the data |
| Start editing | double-click, Enter, F2, or just start typing (replaces the content, like Excel) |
| Commit | Enter (moves down), Shift+Enter (up), Tab / Shift+Tab (sideways), clicking elsewhere |
| Cancel | Esc |
| Clear a cell or a range | Delete / Backspace (one undo step) |
| New line in a textarea editor | Shift+Enter or Alt+Enter |
| Toggle a boolean | click the checkbox |
| Copy | Ctrl/Cmd+C: the cell range, the selected rows (tab separated, as displayed) or the active cell |
| Paste | Ctrl/Cmd+V: a tab separated block from the top left of the range; one value fills the whole range |
| Undo / redo | Ctrl/Cmd+Z, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z |

Ranges, the fill handle, find / replace and the rest of the shortcuts are in
[Spreadsheet features](spreadsheet.md).

## The change pipeline

Every change goes through the same steps: typing, pasting, `setCellValue` and checkbox toggles alike.

1. **Formula?** If the text starts with `=` and the column allows formulas, it becomes a [cell formula](formulas.md#cell-formulas).
2. **Parse** (edits and pastes): text → typed value using the column type and locale, or `column.parse`.
3. **Validate**: `column.validate` rules.
4. **`column.beforeChange(detail)`**: return `false` to cancel or a new value to store instead.
5. **`beforeCellChange` event**: `preventDefault()` cancels; you can rewrite `event.detail.value`.
6. Store in SorlaDB, recalculate dependent formulas, re-render the affected rows and footers.
7. **`column.onChange(detail)`** and the **`cellChange` event**.

A value that fails steps 2–3 keeps the editor open, marks the cell red with the message as tooltip
and emits `validationError`.

`setCellValue(id, field, value)` from code skips parsing (pass typed values) but still validates
and fires events. Pass `{ source: 'edit' }` to parse text as if typed. `updateRow(id, patch)`
writes several fields directly, with no validation and no `cell*` events (it emits `rowChange`).

## Parsing

| Type | Accepts |
|---|---|
| number types | locale numbers (`1.234,56` pt-BR, `1,234.56` en-US), currency symbols, `%`, `1.5` in a comma locale |
| `integer` | whole numbers only |
| `percent` | `15` and `15%` both store `0.15` |
| `date` / `datetime` | ISO, or `dd/mm/yyyy` (`mm/dd/yyyy` in en-US) with optional `hh:mm`; impossible dates are rejected |
| `boolean` | true/false, 1/0, yes/no, sim/não, x |
| `select` | option value or label (case-insensitive) |
| empty text | blank (`null`) |

## Validation

```ts
validate: { required: true, min: 0, max: 100, minLength: 2, maxLength: 40, pattern: '^[A-Z]', message: 'Custom message' }
validate: (value, row, column) => value !== 13 || 'Unlucky number'      // true / undefined = valid, false / string = invalid
validate: [{ required: true }, (value, row) => value <= row.limit || 'Over the limit']
```

`min` / `max` compare numbers, or dates when given ISO strings (`min: '2026-01-01'`). Blank values
skip every rule except `required`. Built-in messages are translated (see [i18n](i18n.md)).

## Editors

Built-in: `text`, `number`, `date`, `datetime`, `select`, `checkbox`, `textarea`. The default comes
from the type. A custom editor is an object with `create(context)`:

```ts
const ratingEditor: CustomEditor = {
    create({ value, text, column, row, grid, commit, cancel }) {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '1';
        input.max = '5';
        input.value = String(value ?? 3);
        input.className = 'ig-editor';
        return {
            element: input,
            getValue: () => Number(input.value),   // a typed value skips parsing; a string is parsed
            focus: () => input.focus(),
            destroy: () => {}                       // optional cleanup
        };
    }
};

{ field: 'rating', type: 'integer', editor: ratingEditor }
```

The grid wires Enter/Tab/Esc on `element`. Call `commit()` / `cancel()` yourself for editors with
their own buttons. A plain function `(context) => EditorInstance` works too.

## Rows

```ts
const id = grid.addRow({ product: 'New', qty: 1 }, { position: 'start' });  // beforeRowAdd / rowAdd
grid.updateRow(id, { qty: 2, price: 10 });                                  // rowChange
grid.deleteRows(grid.getSelectedIds());                                     // beforeRowDelete / rowDelete
grid.setData(rows);                                                         // replace everything (dataChange)
```

The navbar can show **Add row** (`navbar.add: true` or a function returning default values) and
**Delete** (deletes the selected rows after a [confirmation modal](navbar.md#confirmation-modal), unless `confirmDelete: false`).
