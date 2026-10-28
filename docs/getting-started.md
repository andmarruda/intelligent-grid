# Getting started

## Install

```bash
npm install intelligent-grid sorla-db
```

`sorla-db` is a peer dependency: the grid stores its rows in SorlaDB, and you provide the library.

## Load SorlaDB

The SorlaDB 1.0 package ships a browser bundle that registers `window.sorla`. The grid uses it automatically:

```html
<script src="node_modules/sorla-db/dist/sorla.min.js"></script>
```

You can also pass the class (or an instance) explicitly, which is what you do in Node or tests:

```ts
new IntelligentGrid('#grid', { sorla: window.sorla, columns, data });
```

Each grid creates its own SorlaDB database (`intelligent_grid_1`, `intelligent_grid_2`…). Use the `database` option to choose the name.

## Pick a build

| File | Use it for |
|---|---|
| `dist/index.js` | ES module: bundlers (Vite, webpack, esbuild) or `<script type="module">` |
| `dist/index.cjs` | CommonJS `require()` |
| `dist/intelligent-grid.min.js` | Classic `<script>` tag: registers `window.IntelligentGrid` |
| `dist/intelligent-grid.css` / `.min.css` | Styles (required) |
| `dist/types/` | TypeScript declarations (picked up automatically) |

```ts
// bundler / ES module
import { IntelligentGrid } from 'intelligent-grid';
import 'intelligent-grid/styles.css';
```

```html
<!-- no bundler -->
<link rel="stylesheet" href="node_modules/intelligent-grid/dist/intelligent-grid.min.css">
<script src="node_modules/sorla-db/dist/sorla.min.js"></script>
<script src="node_modules/intelligent-grid/dist/intelligent-grid.min.js"></script>
<script>
  const grid = new IntelligentGrid('#grid', { columns: [...], data: [...] });
  // every other export hangs off the global: IntelligentGrid.toCSV, IntelligentGrid.ERRORS...
</script>
```

## First grid

```html
<div id="orders"></div>
```

```ts
import { IntelligentGrid } from 'intelligent-grid';

const grid = new IntelligentGrid('#orders', {
    locale: 'pt-BR',
    idField: 'id',
    editable: true,
    data: [
        { id: 1, product: 'Café', qty: 2, price: 9.5, due: '2026-11-03' },
        { id: 2, product: 'Bolo', qty: 1, price: 32, due: '2026-11-10' }
    ],
    columns: [
        { field: 'product', title: 'Produto', validate: { required: true } },
        { field: 'qty', title: 'Qtd', type: 'integer', footer: 'sum' },
        { field: 'price', title: 'Preço', type: 'currency' },
        { field: 'total', title: 'Total', type: 'currency', formula: '=[@qty]*[@price]', footer: 'sum' },
        { field: 'due', title: 'Vencimento', type: 'date' }
    ]
});

grid.on('cellChange', event => api.save(event.detail.row));
```

What you get out of the box:

- click a header to sort, Shift+click to sort by more columns
- ▾ in each header opens the Excel-style filter
- the navbar has search, filter chips, a column chooser and CSV/Excel export
- `total` is a calculated column; the footer sums the filtered rows
- double-click or start typing to edit; values are parsed for the locale (`1.234,56` in pt-BR)

## Data rules

- Rows are **copied** into SorlaDB; your objects are never mutated. Read them back with `grid.getRows()`.
- `idField` picks the field used as row id (converted to string). Without it, SorlaDB generates a UUID in `_id`.
- Every row handed to you has `_id`. Blank cells of non-text columns come back as `null`.
- Dates are ISO strings (`'2026-10-28'`, `'2026-10-28T14:30'`). `Date` objects are converted on insert.
- Percents are fractions (`0.15` is 15%).
- Field names cannot contain `.` or `$` (reserved by SorlaDB).

Next: [Columns](columns.md) · [Grid options](options.md) · [Examples](../examples/index.html)
