# Grid options

```ts
new IntelligentGrid(target: string | HTMLElement, options: GridOptions)
```

`target` is a CSS selector or an element. Its content is replaced by the grid.

| Option | Type | Default | Description |
|---|---|---|---|
| `columns` | `ColumnDefinition[]` | required | See [Columns](columns.md) |
| `data` | `object[]` | `[]` | Initial rows (copied) |
| `idField` | `string \| null` | `null` | Field used as row id; otherwise SorlaDB generates `_id` |
| `sorla` | class or instance | `window.sorla` | SorlaDB to use |
| `database` | `string` | auto | SorlaDB database name |
| `locale` | `string` | browser language | Formatting, parsing and UI language |
| `labels` | `Record<string, string>` | `{}` | Override UI texts, see [i18n](i18n.md) |
| `currency` | `string` | from locale | Default ISO currency of `currency` columns (`BRL` for pt-BR) |
| `height` | `number \| string` | `480` | Max height of the scroll area (number = px) |
| `editable` | `boolean` | `false` | Default `editable` of every column |
| `cellFormulas` | `boolean` | `true` | Users may type `=...` in editable cells |
| `names` | `Record<string, unknown>` | `{}` | Named constants for formulas (`{ TAX: 0.12 }`) |
| `functions` | `Record<string, FormulaFunction>` | `{}` | Formula functions for this grid only |
| `sort` | `{ mode }` | `{ mode: 'modifier' }` | `'modifier'`: Shift/Ctrl+click adds sort columns; `'toggle'`: every click adds |
| `initialSort` | `SortEntry[]` | `[]` | e.g. `[{ field: 'due', dir: 'asc' }]` |
| `initialFilters` | `FilterModel` | `{}` | See [filter model](sorting-filtering.md#filter-model) |
| `initialQuery` | `QueryNode \| null` | `null` | [Advanced filter](query-builder.md) applied on load |
| `selection` | `{ mode, checkbox, selectOnClick } \| false` | `{ mode: 'multiple', checkbox: true }` | See [Selection](selection.md) |
| `navbar` | `NavbarOptions \| false` | search, filters, columns, export | See [Navbar](navbar.md) |
| `statusBar` | `boolean` | `true` | "x of y rows · n selected" |
| `renderChunk` | `number` | `100` | Rows appended to the DOM per scroll step |
| `append` | `AppendOptions \| null` | `null` | Infinite scroll loader, see [Append mode](append-mode.md) |
| `rowClass` | `(row) => string` | | Extra class per row |
| `rowFormats` | `ConditionalFormat[]` | `[]` | [Conditional formats](formulas.md#conditional-formats) for whole rows |
| `exportOptions` | `{ filename, sheetName }` | `{ filename: 'export', sheetName: 'Sheet1' }` | Export defaults |
| `confirmDelete` | `boolean` | `true` | Ask before the navbar Delete and Discard changes buttons act |
| `confirm` | `(request) => boolean \| Promise<boolean>` | built-in modal | Replace the [confirmation modal](navbar.md#confirmation-modal) |
| `changeTracking` | `boolean \| { form, inputName, historyLimit }` | `true` | See [Change tracking](change-tracking.md) |
| `on` | `Record<string, handler>` | `{}` | Event handlers registered before the first render (catches `ready`) |

## Rendering model

Without `append`, all rows are in memory (in SorlaDB) and the grid appends `renderChunk` rows to
the DOM at a time as you scroll, so large data sets open instantly. Footers, exports and
`getRows('filtered')` always use every filtered row, not only the rendered ones.

Edited rows stay where they are, like in Excel. Call `grid.refresh()` to re-apply sort and filters after edits.
