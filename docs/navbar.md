# Navbar & status bar

The navbar sits above the grid. Pass `navbar: false` to hide it.

```ts
navbar: {
    title: 'Orders',
    search: true,                 // global search box
    filters: true,                // active filter chips + "Clear filters"
    columns: true,                // show/hide columns menu
    export: ['csv', 'xlsx'],      // or true (both) / false
    add: true,                    // "Add row"; or (grid) => ({ default values })
    delete: true,                 // "Delete" for selected rows (needs selection)
    changes: true,                // "N changes" + "Discard changes" while there are unsaved changes
    query: true,                  // "Advanced filter" button: visual query builder
    items: [
        {
            label: 'Refresh',
            title: 'Reload from the server',
            position: 'left',            // 'left' | 'right' (default)
            className: 'my-button',
            disabled: grid => false,     // boolean or function, re-evaluated on every navbar render
            onClick: (grid, event) => grid.reload()
        }
    ]
}
```

Defaults: `search`, `filters`, `columns`, `changes`, `query` and `export: ['csv', 'xlsx']` on; `add`, `delete` off. See [Advanced filter](query-builder.md).

The navbar re-renders when filters, sort, data or selection change, so `disabled` functions stay current.
Buttons use the `ig-btn` class; danger buttons `ig-btn-danger`.

## Confirmation modal

**Delete** and **Discard changes** ask before acting, using a modal built into the grid. It
follows the grid theme, and focus stays inside it; for destructive actions it starts on Cancel.
Esc or a click outside cancels, and focus goes back afterwards. Turn the question off with `confirmDelete: false`.

To use your own UI (Bootstrap, SweetAlert, a design system…), pass `confirm`. It receives the
request and returns (or resolves) `true` to proceed:

```ts
new IntelligentGrid('#grid', {
    confirm: async ({ action, title, message, confirmLabel, danger }) => {
        const result = await Swal.fire({ title, text: message, icon: danger ? 'warning' : 'question', showCancelButton: true, confirmButtonText: confirmLabel });
        return result.isConfirmed;
    },
    ...
});
```

| Request field | Value |
|---|---|
| `action` | `'delete'` or `'discard'` (or your own name) |
| `title`, `message` | Translated texts (`deleteTitle` / `confirmDelete`, `discardChanges` / `confirmDiscard`) |
| `confirmLabel`, `cancelLabel` | Button texts |
| `danger` | `true` for destructive actions |

The same dialog is available for your own buttons:

```ts
items: [{
    label: 'Archive',
    onClick: async grid => {
        if (await grid.confirm({ action: 'archive', title: 'Archive orders', message: `Archive ${grid.getSelectedIds().length} order(s)?` })) archive(grid.getSelectedIds());
    }
}]
```

## Filter chips

Each filtered column shows a chip like `City: 2 ✓`, `Total: Between 100–500` or
`Product: Contains co`. The × removes that filter, "Clear filters" removes all of them and the search.

## Status bar

`statusBar: true` (default) shows `{shown} of {total} rows · {count} selected` below the grid.
In append mode `total` is what your loader returned as `total`. Change the text with the `status`
and `selected` [labels](i18n.md).
