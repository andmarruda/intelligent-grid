# API reference

All ids are strings. "Row" values returned to you are copies: changing them does not change the grid.

## Construction

| Member | Description |
|---|---|
| `new IntelligentGrid(target, options)` | See [options](options.md) |
| `IntelligentGrid.defineFunction(name, fn, options?)` | Global formula function, see [custom functions](formulas.md#custom-functions) |
| `grid.destroy()` | Removes the DOM, listeners and data |

## Properties

| Property | Description |
|---|---|
| `grid.root` | Root `.ig` element |
| `grid.columns` | Normalized columns (read only; use the column methods to change them) |
| `grid.visibleColumns` | Visible columns in order |
| `grid.locale` | Resolved locale |
| `grid.selectionMode` | `'single' \| 'multiple' \| 'none'` |
| `grid.store` | The `SorlaStore` (SorlaDB adapter), see [architecture](architecture.md) |
| `grid.calc` | The `CalcEngine` |
| `grid.options` | Resolved options |
| `grid.t(key, params)` | Translate a UI label |

## Data

| Method | Returns | Description |
|---|---|---|
| `setData(rows)` | `void` | Replace every row (clears selection and cell formulas) |
| `getRows(scope = 'all')` | `Row[]` | `'all'` (insertion order), `'filtered'` (as displayed: filtered and sorted), `'selected'` |
| `getRow(id)` | `Row \| null` | |
| `addRow(row?, { position: 'start' \| 'end' })` | `string \| null` | New id; `null` when `beforeRowAdd` was cancelled |
| `updateRow(id, patch)` | `boolean` | Writes fields directly (no parsing/validation), recalculates, emits `rowChange` |
| `deleteRows(ids)` | `string[]` | Ids actually removed |
| `setCellValue(id, field, value, { source })` | `{ ok, error? }` | Full edit pipeline. `source: 'edit'` also parses text |
| `setCellFormula(id, field, formula \| null)` | `{ ok, error? }` | Cell formula; `null` removes it |
| `getCellFormula(id, field)` | `string \| null` | Cell or column formula |
| `evaluate(formula, id?)` | value | Over the filtered rows, or in the context of row `id`. Errors come back as their code |
| `refresh()` | `void` | Re-run the query (filters, search, sort) and re-render |

## Change tracking

| Method | Returns | Description |
|---|---|---|
| `getChanges()` | `ChangeSet` | `{ inserted, updated, deleted }` net changes, see [Change tracking](change-tracking.md) |
| `getChangesJSON(space?)` | `string` | The same as JSON |
| `getChangeSummary()` | `{ inserted, updated, deleted, total }` | Counts |
| `hasChanges()` | `boolean` | |
| `getHistory()` | `HistoryEntry[]` | Every operation since the last accept |
| `acceptChanges(ids?)` | `void` | Current values become the original |
| `rejectChanges(ids?)` | `void` | Restore the original values/rows |
| `bindForm(form, name = 'changes')` | `HTMLInputElement` | Hidden input with the JSON, kept current |

## Sorting, filtering, search

| Method | Description |
|---|---|
| `getSort()` / `setSort(sort)` | `[{ field, dir }]`, `[]` clears |
| `toggleSort(field, additive?)` | Header-click behavior |
| `getFilters()` | Current filter model |
| `setFilter(field, filter \| null)` | One column |
| `setFilters(model)` | Replace every filter |
| `clearFilters()` | Filters and search |
| `setSearch(text)` | Global search |

## Selection

| Method | Description |
|---|---|
| `select(ids, { append })` | |
| `deselect(ids)` | |
| `selectAll()` | Every filtered row (multiple mode) |
| `clearSelection()` | |
| `getSelected()` / `getSelectedIds()` | |

## Columns

| Method | Description |
|---|---|
| `getColumn(field)` | Normalized column |
| `setColumns(definitions)` | Replace all |
| `addColumn(definition, index?)` / `removeColumn(field)` | |
| `setColumnVisible(field, visible)` | |
| `setColumnFormula(field, formula \| null)` | Change a calculated column |
| `registerFunction(name, fn, options?)` | Formula function for this grid |

## Editing

| Method | Description |
|---|---|
| `startEdit(id, field, initialText?)` | Open the editor; `false` if not editable or cancelled |

## Dialogs

| Method | Returns | Description |
|---|---|---|
| `confirm({ action, message, title?, confirmLabel?, cancelLabel?, danger? })` | `Promise<boolean>` | Built-in confirmation modal (or the `confirm` option), see [Navbar](navbar.md#confirmation-modal) |

## Export

| Method | Returns |
|---|---|
| `exportCSV(options?)` | `string \| null` (`null` when `beforeExport` was cancelled) |
| `exportXLSX(options?)` | `Uint8Array \| null` |

See [Export](export.md) for the options.

## Append mode

| Method | Description |
|---|---|
| `loadMore()` | `Promise<void>`: next page (no-op while loading or when `hasMore` is false) |
| `reload()` | Clear and load from offset 0 (`refresh()` without append) |

## Events

`on(type, handler)` (returns `off`), `once`, `off`, `emit`. See [Events](events.md).

## Standalone exports

```ts
import {
    IntelligentGrid,                       // also the default export
    SorlaStore, compareCells,              // SorlaDB adapter
    ChangeTracker,                         // change tracking
    compileFilters, operatorsFor,          // filter model → SorlaDB query
    TYPES, formatCell, parseInput, validateValue, excelFormatCode,
    CalcEngine, compile, evaluate, isFormula, parse, toExcelFormula, collectDependencies,
    defineFunction, defineLazyFunction, listFunctions, formatValue,
    FormulaError, ERRORS,
    toCSV, toXLSX, zip
} from 'intelligent-grid';
```
