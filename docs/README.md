# Intelligent Grid documentation

**English** · [Português (Brasil)](pt-BR/README.md)

Intelligent Grid is an Excel-like data grid for the browser, written in TypeScript and backed by
[SorlaDB](https://sorladb.dev.br). Rows live in a SorlaDB collection, filters compile
to the Sorla query language, and a formula engine adds Excel calculations on top.

## Guides

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Install, ES module / CommonJS / browser bundle, SorlaDB setup, the first grid |
| [Grid options](options.md) | Every constructor option |
| [Columns](columns.md) | Column schema, types, formats, rendering, hidden columns |
| [Sorting & filtering](sorting-filtering.md) | Multi-column sort, AutoFilter menu, filter model, search |
| [Advanced filter](query-builder.md) | Visual query builder: nested AND / OR / NOT, SorlaDB find() JSON |
| [Editing & validation](editing.md) | Editors, parsing, validation, change hooks, keyboard, clipboard, custom editors |
| [Selection](selection.md) | Single/multiple row selection, checkboxes, bulk actions |
| [Spreadsheet features](spreadsheet.md) | Cell ranges, fill handle, undo / redo, find / replace / go to, comments, remove duplicates, shortcuts |
| [Grouping & subtotals](grouping.md) | Group rows by fields, collapse, subtotals per column |
| [Import](import.md) | CSV, TSV and XLSX files into the grid |
| [Virtualization](virtualization.md) | Large data, pinned (frozen) columns, wrapped text, row height |
| [Navbar & status bar](navbar.md) | Built-in buttons, filter chips, custom items |
| [Append mode (infinite scroll)](append-mode.md) | Loading pages from an API over fetch or a WebSocket, server-side vs local queries |
| [Server data](server-data.md) | Server-Sent Events loading in blocks, rows pushed by the server |
| [Export](export.md) | CSV and XLSX, options, formulas in Excel |
| [Change tracking](change-tracking.md) | Inserted/updated/deleted rows, history, JSON for forms, accept/reject |
| [Formulas](formulas.md) | Formula language, calculated columns, cell formulas, footers, conditional formats (data bars, color scales, icon sets), sparklines, custom functions |
| [Function reference](functions.md) | All 137 functions with signatures |
| [Number formats](number-formats.md) | Excel format codes for display, `TEXT()` and XLSX |
| [Events](events.md) | Every event, its detail and which ones can be cancelled |
| [API reference](api.md) | Every public method |
| [Theming](theming.md) | CSS variables, dark mode, state classes |
| [Internationalization](i18n.md) | Locales, input parsing, labels |
| [TypeScript](typescript.md) | Exported types and typed usage |

## Project

| Page | What it covers |
|---|---|
| [Architecture](architecture.md) | Module layout and how the grid uses SorlaDB |
| [SorlaDB status](sorla-db.md) | SorlaDB issues fixed for the grid (1.1–1.5) and the open items |
| [Development](development.md) | Scripts, build output, lint, husky hooks, tests, releasing |
| [Benchmarks](benchmarks.md) | Timings from 10 000 to 1 000 000 rows, bundle size |

Runnable examples are in [`examples/`](../examples/index.html) (`npm run demo`).
