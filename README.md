# Intelligent Grid

Excel-like data grid for the browser, written in TypeScript and powered by
[SorlaDB](https://github.com/sysborg/sorla-db). No runtime dependencies besides SorlaDB.

- **Multi-column sorting** by clicking headers (Shift/Ctrl+click adds columns)
- **Excel AutoFilter** (value checklist + And/Or conditions), global search, formula filters, a **visual query builder** (nested AND / OR / NOT, shows the SorlaDB `find()` JSON), and a **navbar** with filter chips, column chooser, add/delete, export and your own buttons
- **Append mode**: infinite scroll loading pages from your API
- **Editing** with typed editors, locale-aware parsing, validation, cancelable events, custom editors, copy/paste
- **Selection**: single or multiple, checkboxes, ranges, bulk actions
- **Change tracking**: inserted, updated and deleted rows plus a full history, ready to send as JSON with a form
- **CSV and real XLSX export** with typed cells, number formats and formulas kept as Excel formulas
- **Formula engine**: 137 Excel functions, structured references (`[@qty]*[@price]`), calculated columns, cell formulas, footers, conditional formats, Excel number formats

Rows live in a SorlaDB collection, filters compile to the Sorla query language, and calculated
values are stored in the documents, so they sort and filter like any other field.

## Quick start

```bash
npm install intelligent-grid sorla-db   # sorla-db 1.1+
```

```html
<link rel="stylesheet" href="node_modules/intelligent-grid/dist/intelligent-grid.css">
<script src="node_modules/sorla-db/dist/sorla.min.js"></script> <!-- registers window.sorla -->
<div id="orders"></div>
<script type="module">
  import { IntelligentGrid } from 'intelligent-grid';

  const grid = new IntelligentGrid('#orders', {
    locale: 'pt-BR',
    idField: 'id',
    editable: true,
    data: [{ id: 1, product: 'Café', qty: 2, price: 9.5 }],
    columns: [
      { field: 'product', title: 'Produto', validate: { required: true } },
      { field: 'qty', title: 'Qtd', type: 'integer', footer: 'sum' },
      { field: 'price', title: 'Preço', type: 'currency' },
      { field: 'total', title: 'Total', type: 'currency', formula: '=[@qty]*[@price]', footer: 'sum' }
    ]
  });

  grid.on('cellChange', e => api.save(e.detail.row));
</script>
```

Builds: `dist/index.js` (ES module), `dist/index.cjs` (CommonJS), `dist/intelligent-grid.min.js`
(browser global `window.IntelligentGrid`), `dist/types` (declarations).

## Documentation

The full documentation is in [`docs/`](docs/README.md).

### Getting started

- [Getting started](docs/getting-started.md): install, builds, SorlaDB setup, your first grid
- [Grid options](docs/options.md): every constructor option
- [Columns](docs/columns.md): column schema, types, formatting, custom rendering

### Features

- [Sorting & filtering](docs/sorting-filtering.md): multi-column sort, AutoFilter menu, filter model, search
- [Advanced filter](docs/query-builder.md): visual query builder with nested AND / OR / NOT, generating the SorlaDB find() JSON
- [Editing & validation](docs/editing.md): editors, parsing, validation, change hooks, keyboard, copy/paste
- [Selection](docs/selection.md): single/multiple selection, checkboxes, bulk actions
- [Navbar & status bar](docs/navbar.md): built-in buttons, filter chips, custom items
- [Append mode](docs/append-mode.md): infinite scroll from an API
- [Export](docs/export.md): CSV and XLSX
- [Change tracking](docs/change-tracking.md): inserted/updated/deleted rows, history, JSON for forms, accept/reject

### Formulas

- [Formulas](docs/formulas.md): structured references, calculated columns, cell formulas, footers, conditional formats, custom functions
- [Function reference](docs/functions.md): all 137 functions
- [Number formats](docs/number-formats.md): Excel format codes

### Reference

- [Events](docs/events.md): every event and its detail
- [API reference](docs/api.md): every public method
- [TypeScript](docs/typescript.md): exported types
- [Theming](docs/theming.md): CSS variables, dark mode, state classes
- [Internationalization](docs/i18n.md): locales, input parsing, labels

### Project

- [Architecture](docs/architecture.md): module layout and how the grid uses SorlaDB
- [SorlaDB improvements](docs/sorla-db.md): SorlaDB 1.0 issues and workarounds
- [Development](docs/development.md): scripts, build, lint, husky hooks, tests, releasing

## Examples

[`examples/`](examples/index.html) has ten runnable pages with sample data:

| Example | Shows |
|---|---|
| [basic.html](examples/basic.html) | Columns, types, data and the default navbar |
| [sorting-filtering.html](examples/sorting-filtering.html) | Multi-column sort, AutoFilter, search, formula filters |
| [query-builder.html](examples/query-builder.html) | Advanced filter: nested AND / OR / NOT, live find() JSON, run it directly in SorlaDB |
| [editing.html](examples/editing.html) | Editors, validation, cancelable events, a custom editor, paste |
| [formulas.html](examples/formulas.html) | Calculated columns, cell formulas, footers, conditional formats, custom functions |
| [infinite-scroll.html](examples/infinite-scroll.html) | Append mode with a fake paginated API |
| [change-tracking.html](examples/change-tracking.html) | Inserted/updated/deleted rows, history, saving with a form, accept/discard |
| [selection-export.html](examples/selection-export.html) | Single/multiple selection, bulk actions, CSV and XLSX |
| [theming-i18n.html](examples/theming-i18n.html) | CSS variables, dark mode, en-US vs pt-BR |
| [browser-bundle.html](examples/browser-bundle.html) | Classic `<script>` tags with `window.IntelligentGrid` |

### Running them locally

```bash
npm install
npm run demo
```

Then open **<http://localhost:5173/examples/>**. `npm run demo` builds `dist/` and starts a small
local static server. If port 5173 is taken, use `PORT=3000 npm run demo`.

> Don't open the `.html` files directly (`file://…`). Browsers block ES modules and the
> `node_modules/` paths outside a server, so the page stays blank.

### Sample data

The examples use [`examples/data.js`](examples/data.js), which generates the same sample data on
every load:

- `orders(count)`: orders with product, city, quantity, price, discount, due date, paid and status
- `customers(count)`: customers with name, city, score and join date (used by the infinite scroll example)

```js
import { orders } from './data.js';

data: orders(100),   // change to orders(5000) to try more rows
```

### Using your own data

Replace `data:` with your own array. The keys must match the columns' `field`, and dates go as
ISO strings:

```js
data: [
    { id: 1, product: 'Café', city: 'Ribeirão Preto', qty: 2, price: 9.5, due: '2026-11-03', paid: true },
    { id: 2, product: 'Bolo', city: 'Curitiba', qty: 1, price: 32, due: '2026-11-10', paid: false }
],
```

To load a JSON file placed in `examples/`:

```js
const data = await fetch('./my-data.json').then(response => response.json());
```

### Playing with the API

Every example exposes the grid as `window.grid`. Open the browser console (F12) and try:

```js
grid.getRows('filtered')
grid.setFilter('city', { values: ['Curitiba'] })
grid.evaluate('=SUM([qty])')
grid.exportXLSX()
```

After editing an example, reload the page. Run `npm run demo` again only after changing `src/`,
because the examples load the compiled `dist/`.

## Development

```bash
npm run check   # lint + typecheck + tests + build
```

Husky runs lint-staged, the type check and the build on every commit (`dist/` is committed), and
the tests before every push. See [Development](docs/development.md).

## License

MIT © Anderson Arruda
