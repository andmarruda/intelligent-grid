# Columns

```ts
const columns: ColumnDefinition[] = [
    { field: 'product', title: 'Product', width: 160 },
    { field: 'price', type: 'currency', currency: 'BRL', footer: 'avg' }
];
```

## Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `field` | `string` | required | Key in the row. Cannot contain `.` or `$` |
| `title` | `string` | `field` | Header text |
| `type` | see below | `'text'` (`'select'` when `options` is set) | Data type |
| `width` / `minWidth` | `number` | auto / `60` | Pixels. Users can resize unless `resizable: false` |
| `align` | `'left' \| 'right' \| 'center'` | by type | Numbers right, booleans centered |
| `visible` | `boolean` | `true` | Hidden columns still exist (formulas, `exportCSV({ columns: 'all' })`) |
| `sortable` / `filterable` / `resizable` | `boolean` | `true` | |
| `decimals` | `number` | `0` integer, `2` currency | Fixed decimals for display and XLSX |
| `currency` | `string` | grid currency | ISO code for `currency` columns |
| `format` | `string \| (value, row, column) => string` | | [Excel format code](number-formats.md) or formatter |
| `options` | `Array<value \| { value, label }>` | | Values of a `select` column |
| `strict` | `boolean` | `true` | `false` lets a select column accept values outside `options` |
| `editable` | `boolean \| (row, column) => boolean` | grid `editable` | See [Editing](editing.md) |
| `editor` | built-in name or custom editor | by type | See [Editing](editing.md#editors) |
| `allowFormulas` | `boolean` | grid `cellFormulas` | Accept `=...` input in this column |
| `parse` | `(input, column) => value` | | Replaces built-in input parsing (throw to reject) |
| `validate` | rules, function, or an array of both | | See [Validation](editing.md#validation) |
| `beforeChange` | `(detail) => false \| value` | | Cancel or rewrite a change |
| `onChange` | `(detail) => void` | | After a change was stored |
| `formula` | `string` | | [Calculated column](formulas.md#calculated-columns), read-only unless `editable` is set |
| `footer` | shortcut, formula or function | | See [Footers](formulas.md#footers) |
| `subtotal` | shortcut, formula, function or `false` | `footer` | Value on [group rows](grouping.md#subtotals) |
| `conditionalFormats` | `ConditionalFormat[]` | `[]` | Rules, data bars, color scales, icon sets: see [Conditional formats](formulas.md#conditional-formats) |
| `sparkline` | `true \| { type, color, negativeColor, width, height, min, max }` | | Draw a list of numbers as a small chart, see [Sparklines](formulas.md#sparklines) |
| `pinned` | `'left' \| 'right' \| null` | `null` | [Frozen column](virtualization.md#pinned-frozen-columns) |
| `wrap` | `boolean` | `false` | Wrap text; the row grows to fit |
| `render` | `(value, row, { column, grid, formatted }) => string \| Node` | | Custom cell content |
| `html` | `boolean` | `false` | Let `render` return HTML (sanitize it yourself) |
| `cellClass` | `string \| (value, row, column) => string` | | Extra cell classes |
| `headerClass` / `tooltip` | `string` | | Header class and title |

## Types

| Type | Stored as | Displayed (en-US) | Editor | Filter operators |
|---|---|---|---|---|
| `text` | string | as is | text | text |
| `number` | number | `1,234.5` (up to 4 decimals unless `decimals`) | text (decimal keyboard) | range |
| `integer` | number | `1,234` | text, rejects fractions | range |
| `currency` | number | `$1,234.50` | text, accepts symbols | range |
| `percent` | fraction (`0.15`) | `15%` | text, `15` or `15%` both mean 15% | range |
| `date` | `'YYYY-MM-DD'` | `10/28/2026` | native date picker | range |
| `datetime` | `'YYYY-MM-DDTHH:mm'` | `10/28/2026, 02:30 PM` | native datetime picker | range |
| `boolean` | `true` / `false` | checkbox | checkbox (toggles in place) | equals, blank |
| `select` | option value | option label | dropdown | text |

Text operators: contains, does not contain, equals, does not equal, begins with, ends with, blank, not blank.
Range operators: =, ≠, >, ≥, <, ≤, between, blank, not blank.

## Formatting

1. `format` function: full control, display only.
2. `format` string: an [Excel number format](number-formats.md), e.g. `'#,##0.00;[Red]-#,##0.00'` or `'dd/mm/yyyy'`. The same code is written into the XLSX file.
3. Otherwise the type's default, using `Intl` for the locale.

```ts
{ field: 'margin', type: 'percent', decimals: 1 },                       // 12.5%
{ field: 'revenue', type: 'number', format: '#,##0,"k"' },               // 1,500k
{ field: 'rating', type: 'integer', format: v => '★'.repeat(v ?? 0) },   // ★★★
```

## Custom rendering

```ts
{
    field: 'status',
    render: (value, row, { formatted }) => {
        const badge = document.createElement('span');
        badge.className = `badge badge-${value}`;
        badge.textContent = formatted;
        return badge;
    }
}
```

`render` may return a string (set as text) or a DOM node. With `html: true` a string is used as
`innerHTML`. Escape anything user-provided yourself.

## Changing columns at runtime

```ts
grid.addColumn({ field: 'margin', type: 'percent', formula: '=[@profit]/[@total]' }, 3);
grid.removeColumn('margin');
grid.setColumnVisible('internal', false);
grid.setColumnFormula('total', '=[@qty]*[@price]*1.1');
grid.setColumns(newDefinitions);   // replaces everything, recalculates formulas
```
