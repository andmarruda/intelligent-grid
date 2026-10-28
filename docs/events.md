# Events

```ts
const off = grid.on('cellChange', event => { ... });   // returns an unsubscribe function
grid.once('ready', event => { ... });
grid.off('cellChange', handler);                       // or grid.off('cellChange') for all
grid.on('*', event => console.log(event.type, event.detail));
new IntelligentGrid('#grid', { on: { ready: e => ..., cellChange: e => ... }, ... });   // catches "ready"
```

Every handler receives:

```ts
interface GridEvent<T> {
    type: string;
    detail: T;
    grid: IntelligentGrid;
    defaultPrevented: boolean;
    preventDefault(): void;
}
```

Events marked ✋ are **cancelable** with `event.preventDefault()`, and their `detail` can be
modified before the grid uses it. A handler that throws is logged with `console.error` and does
not stop the other handlers.

## Lifecycle & data

| Event | Detail |
|---|---|
| `ready` | `{}`: first render done (register it through the `on` option) |
| `render` | `{ rows }`: after every query/re-render (sort, filter, search, refresh) |
| `dataChange` | `{ reason: 'setData' }` |
| `destroy` | `{}` |

## Editing

| Event | Detail |
|---|---|
| `beforeCellEdit` ✋ | `{ id, field, value, row, column }`: cancel to keep the cell read-only this time |
| `cellEditStart` | `{ id, field, value, row, column }` |
| `cellEditCancel` | `{ id, field }`: Esc pressed |
| `beforeCellChange` ✋ | `{ id, field, value, oldValue, row, column, source, formula? }`: rewrite `detail.value` to store something else |
| `cellChange` | `{ id, field, value, oldValue, row, source, formula? }`: `source` is `'edit'`, `'paste'` or `'api'` |
| `validationError` | `{ id, field, value, error, message }`: `error` is the rule key (`'min:0'`), `message` the translated text |
| `formulaError` | `{ id, field, formula, error }`: a cell formula produced an error |
| `copy` | `{ text }` |
| `paste` | `{ text, results: [{ id, field, ok, error? }] }` |

## Rows

| Event | Detail |
|---|---|
| `beforeRowAdd` ✋ | `{ row }`: modify `detail.row` to change the inserted values |
| `rowAdd` | `{ id, row }` |
| `rowChange` | `{ id, row, previous }`: from `updateRow()` |
| `beforeRowDelete` ✋ | `{ ids, rows }`: modify `detail.ids` to delete fewer rows (runs after the navbar confirmation) |
| `rowDelete` | `{ ids, rows }` |

## Interaction

| Event | Detail |
|---|---|
| `rowClick` / `rowDblClick` | `{ id, row, event }` |
| `cellClick` | `{ id, field, value, row, event }` |
| `activeCellChange` | `{ id, field }` |
| `selectionChange` | `{ ids, rows }` |
| `sortChange` | `{ sort }` |
| `filterChange` | `{ field, filter, filters }` (`field` is null after `setFilters`) |
| `searchChange` | `{ search }` |
| `columnResize` | `{ field, width }` |
| `columnVisibilityChange` | `{ field, visible }` |

## Change tracking

| Event | Detail |
|---|---|
| `changes` | `{ summary: { inserted, updated, deleted, total }, hasChanges }` |
| `changesAccept` / `changesReject` | `{ ids }` (`null` = all rows) |
| `changesDiscarded` | `{ changes }`: an append mode reload dropped unsaved changes |

See [Change tracking](change-tracking.md).

## Export & append mode

| Event | Detail |
|---|---|
| `beforeExport` ✋ | `{ format: 'csv' \| 'xlsx', options }`: options are writable |
| `export` | `{ format, options }` |
| `loadStart` | `{ offset, limit, sort, filters, search }` |
| `loadEnd` | same plus `{ rows, hasMore, total }` |
| `loadError` | same plus `{ error }` |
| `scrollEnd` | `{}`: scrolled to the end with nothing left to load |

## Column hooks vs events

For per-column logic, column hooks are often simpler than events:

```ts
{ field: 'status', beforeChange: ({ value, row }) => value === 'done' && !row?.paid ? false : value,
  onChange: ({ id, value }) => api.updateStatus(id, value) }
```

`beforeChange` runs before the `beforeCellChange` event, and `onChange` before `cellChange`.
