# Export

Both exports download a file by default and also return the content.

```ts
grid.exportCSV();                                              // filtered rows, visible columns
grid.exportCSV({ rows: 'selected', filename: 'selection' });
const csv = grid.exportCSV({ download: false });               // just the string
grid.exportXLSX({ rows: 'all', columns: 'all', sheetName: 'Orders' });
const bytes = grid.exportXLSX({ download: false });            // Uint8Array
```

## Common options

| Option | Default | Values |
|---|---|---|
| `rows` | `'filtered'` | `'filtered'` (current filters and sort), `'all'`, `'selected'` |
| `columns` | `'visible'` | `'visible'`, `'all'`, or an array of fields |
| `filename` | `exportOptions.filename` (`'export'`) | without extension |
| `download` | `true` | `false` only returns the content |

## CSV

| Option | Default | Description |
|---|---|---|
| `delimiter` | `;` in comma-decimal locales (pt-BR), `,` otherwise | What Excel expects when opening the file in that locale |
| `decimal` | locale decimal when the delimiter is `;` | Decimal separator for numbers |
| `formatted` | `false` | Write the displayed text (`R$ 1.234,50`) instead of raw values |
| `bom` | `true` | UTF-8 BOM so Excel detects the encoding |
| `header` | `true` | Column titles as the first line |
| `sanitize` | `true` | Prefix text starting with `= + - @` with `'` (blocks CSV formula injection) |

Raw values: numbers as numbers, booleans `TRUE`/`FALSE`, dates as ISO, formula errors as their code.
Quoting follows RFC 4180, with `\r\n` line breaks.

## XLSX

A real Office Open XML workbook built without dependencies, which opens in Excel, LibreOffice and Google Sheets.

| Option | Default | Description |
|---|---|---|
| `formulas` | `true` | Write calculated columns, cell formulas and footers as Excel formulas (with cached values) |
| `footer` | `true` | Add the footer row |
| `sheetName` | `exportOptions.sheetName` | Max 31 characters, invalid characters replaced |

What ends up in the file:

- **typed cells**: numbers, booleans, errors (`#DIV/0!`…), text, and dates as Excel serials
- **number formats** per column: the column `format` code, or the type default (`#,##0`, `0.00%`, `"R$" #,##0.00`, `dd/mm/yyyy`, …)
- a bold, shaded **header row**, **frozen** under the header, with **AutoFilter** on
- **column widths** from the grid
- **formulas** translated from structured references to A1:

| Grid formula | In the sheet (row 2) |
|---|---|
| `=[@qty]*[@price]` | `=B2*C2` |
| `=[@total]/SUM([total])` | `=D2/SUM(D$2:D$501)` |
| footer `sum` on `total` | `=SUM(D$2:D$501)` |

A formula that references a column you did not export, or a named constant, is written as its value only.
The workbook asks Excel to recalculate on open.

## beforeExport

```ts
grid.on('beforeExport', event => {
    if (event.detail.format === 'xlsx') event.detail.options.sheetName = `Orders ${new Date().toISOString().slice(0, 10)}`;
    if (!user.canExport) event.preventDefault();
});
grid.on('export', event => analytics.track('export', event.detail.format));
```

## Without a grid

The writers are exported too:

```ts
import { toCSV, toXLSX, zip } from 'intelligent-grid';

const csv = toCSV(rows, [{ field: 'name', title: 'Name' }], { delimiter: ';' });
```
