# Selection

```ts
selection: { mode: 'multiple', checkbox: true, selectOnClick: false }  // default
selection: { mode: 'single' }                                         // radio buttons
selection: false                                                      // same as { mode: 'none' }
```

| Option | Default | Description |
|---|---|---|
| `mode` | `'multiple'` | `'single'`, `'multiple'` or `'none'` |
| `checkbox` | `true` | Show a checkbox (radio in single mode) column; the header box selects every **filtered** row |
| `selectOnClick` | `false` | `true`: clicking any cell also selects its row. By default a click selects the cell, and rows are selected with the checkbox, Space or Ctrl+A |

## Mouse & keyboard

| Gesture | Multiple | Single |
|---|---|---|
| Click the checkbox | toggle the row | select this row |
| Shift + click a checkbox | select the rows from the last clicked one | |
| Space | toggle the active row; with a [cell range](spreadsheet.md#ranges), select its rows | select the active row |
| Ctrl/Cmd + A | select every filtered row (and every cell) | |

With `selectOnClick: true`, clicking a data cell works like clicking the checkbox, and Ctrl/Cmd +
click toggles. Shift + arrows and dragging select [cell ranges](spreadsheet.md#ranges), not rows.

Selection is kept across sorting and filtering (hidden rows stay selected). Deleting rows removes them from the selection.

## API

```ts
grid.select(['1', '2']);                 // replaces the selection (multiple mode keeps it with { append: true })
grid.select(['3'], { append: true });
grid.deselect(['1']);
grid.selectAll();                        // every filtered row
grid.clearSelection();
grid.getSelectedIds();                   // ['2', '3']
grid.getSelected();                      // row copies
grid.getRows('selected');                // same as getSelected()

grid.on('selectionChange', e => console.log(e.detail.ids, e.detail.rows));
```

Ids are strings (`idField` values are converted with `String()`).

## Bulk actions

```ts
navbar: {
    delete: true,   // "Delete" button, enabled when something is selected
    items: [{
        label: 'Mark as paid',
        disabled: grid => grid.getSelectedIds().length === 0,
        onClick: grid => grid.getSelectedIds().forEach(id => grid.updateRow(id, { paid: true }))
    }]
}
```

`exportCSV({ rows: 'selected' })` and `exportXLSX({ rows: 'selected' })` export only the selection.
Ctrl+C copies the selected rows as tab separated text (paste straight into Excel), unless a cell
range of more than one cell is selected: then the range is copied.
