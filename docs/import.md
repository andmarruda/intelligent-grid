# Import

The grid reads `.csv`, `.tsv`, `.txt` and `.xlsx` files without a dependency: CSV with a
standard (RFC 4180) parser, XLSX with a small zip reader on the browser's `DecompressionStream`.

```ts
input.addEventListener('change', async () => {
    const result = await grid.importFile(input.files[0]);
    console.log(result);
    // { rows: 120, fields: ['name', 'qty', 'due'], skipped: ['Color'], errors: [...], sheet: 'Sheet1' }
});

grid.importCSV('name;qty\nPen;3');                      // text
await grid.importXLSX(bytes, { sheet: 'Data' });         // Uint8Array or ArrayBuffer
grid.importTable([['name', 'qty'], ['Pen', 3]]);         // rows of cells you already have
```

Or let users do it from the navbar:

```ts
navbar: { import: true }                     // "Import" button: replaces the rows
navbar: { import: { mode: 'append' } }       // or any import options
```

The button asks for confirmation when unsaved changes would be lost, and reports the result in the
status bar ("120 row(s) imported, 2 value(s) did not fit and were left blank").

## Options

| Option | Default | |
|---|---|---|
| `mode` | `'replace'` | `'replace'` works like `setData()`; `'append'` adds the rows as one undo step |
| `header` | `true` | the first row holds titles. `false` fills the columns in order (formula columns skipped) |
| `delimiter` | detected | `,`, `;` or tab, from the first line (`.tsv` files use tab) |
| `sheet` | first sheet | `.xlsx` sheet name or 0-based index |
| `createColumns` | when the grid has no columns | add columns for titles that match none, with an inferred type |

## How values are read

- **Headers** match a column by `field` or `title`, ignoring case. Titles that match nothing are
  listed in `skipped` (or become columns with `createColumns`). Formula columns are never written:
  they recalculate.
- **Text** is parsed like typed input in the grid locale: `1.234,5` is a number in `pt-BR`,
  `31/01/2026` a date, `yes` a boolean, an option label its value. Values that do not fit their
  column are imported as blanks and listed in `errors` with their line number:

  ```ts
  { line: 3, field: 'qty', value: 'lots', error: 'Enter a valid number' }
  ```
- **XLSX** cells keep their type: numbers, booleans, text (shared, inline and rich text), and dates,
  which are numbers with a date format in Excel and come back as ISO strings. Formulas come back as
  their last calculated value. Error cells (`#N/A`) are text.
- Empty lines are skipped. A byte order mark at the start of a CSV file is removed.

The `import` event fires with the same result object.

## Standalone readers

```ts
import { parseDelimited, detectDelimiter, readXlsx } from 'intelligent-grid';

parseDelimited('a,"b,c"\n1,2');        // [['a', 'b,c'], ['1', '2']]
const sheet = await readXlsx(bytes);  // { name, rows: [['Name', 'Qty'], ['Pen', 3]] }
```

Reading `.xlsx` needs `DecompressionStream`: every current browser, and Node 18 or later.
