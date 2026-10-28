# Selection

```ts
selection: { mode: 'multiple', checkbox: true, selectOnClick: true }   // default
selection: { mode: 'single' }                                         // radio buttons
selection: false                                                      // same as { mode: 'none' }
```

| Option | Default | Description |
|---|---|---|
| `mode` | `'multiple'` | `'single'`, `'multiple'` or `'none'` |
| `checkbox` | `true` | Show a checkbox (radio in single mode) column; the header box selects every **filtered** row |
| `selectOnClick` | `true` | Clicking anywhere on a row selects it; `false` = only the checkbox column |

## Mouse & keyboard

| Gesture | Multiple | Single |
|---|---|---|
| Click | select only this row | select this row |
| Ctrl/Cmd + click, or click the checkbox | toggle the row | select this row |
| Shift + click | select the range from the last clicked row | |
| Shift + arrows | extend the selection | |
| Space | toggle the active row | select the active row |
| Ctrl/Cmd + A | select every filtered row | |

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
Ctrl+C copies the selected rows as tab separated text (paste straight into Excel).
