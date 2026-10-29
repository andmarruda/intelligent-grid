# Architecture

```
src/
├── index.ts                 public exports
├── types.ts                 public types
├── core/
│   ├── store.ts             SorlaStore: the only module that talks to SorlaDB
│   ├── filters.ts           filter model → SorlaDB query + JS predicates
│   ├── columns.ts           column schema: defaults, formatting, parsing, validation
│   ├── changes.ts           ChangeTracker: inserted/updated/deleted rows and history
│   ├── query.ts             query builder model → SorlaDB query, JSON in/out, description
│   └── events.ts            event emitter (cancelable "before*" events)
├── formula/
│   ├── parser.ts            tokenizer + Pratt parser, dependency collection, A1 printer
│   ├── evaluator.ts         AST evaluation, compile cache
│   ├── values.ts            Excel coercion and comparison rules, array broadcasting
│   ├── functions.ts         function library and registry
│   ├── numfmt.ts            Excel number format codes
│   ├── dates.ts             Excel date serials
│   ├── errors.ts            FormulaError and error codes
│   └── engine.ts            CalcEngine: calculated columns, cell formulas, dependency graph
├── export/
│   ├── csv.ts               RFC 4180 writer
│   ├── zip.ts               stored ZIP writer + CRC32
│   └── xlsx.ts              SpreadsheetML workbook writer
├── i18n/labels.ts           UI texts (en, pt-BR)
└── ui/
    ├── grid.ts              IntelligentGrid: state, rendering, interaction, public API
    ├── filter-menu.ts       AutoFilter popover
    ├── query-builder.ts     advanced filter panel
    ├── modal.ts             confirmation modal
    ├── editors.ts           built-in cell editors
    └── dom.ts               tiny element factory (text only through textContent)
```

## Data flow

```
setData / addRow / append page
        │  copies rows, encodes blanks and dates
        ▼
SorlaStore.insert ──► SorlaDB collection (one database per grid)
        │
CalcEngine.recalculate ──► writes calculated values into the documents
        │
sort / filter / search change
        ▼
compileFilters ──► { SorlaDB query, residual predicates }
        ▼
SorlaStore.query ──► collection.find(query) → predicates → Excel comparator sort
        ▼
view (array of row copies) ──► rendered in chunks of renderChunk rows
```

Edits go the other way: editor → `parseInput` → `validateValue` → hooks/events →
`SorlaStore.update` → `CalcEngine.recalculate(ids, fields)` → re-render only the affected rows
(or every rendered row when a whole-column reference changed) → footers.

## How SorlaDB is used

- **Storage**: every row is a document of collection `rows` in a database per grid. `_id` is the row id.
- **Queries**: column filters and the advanced filter compile to the Sorla query language
  (`$eq $ne $gt $gte $lt $lte $in $nin`, nested `$and / $or / $nor`), combined with `$and`.
  Text matching uses case-insensitive `$regex`. Every subtree SorlaDB can express runs as one
  `collection.find()`; only formulas, `test` functions, the global search (it matches the displayed
  text) and "≠ a day" on datetime columns run as predicates. Requires sorla-db 1.5+.
- **Calculated values** are stored in the documents, so `find()` can filter on them.
- **Inserts and deletes** use `insertMany` / `deleteMany`. Updates and sorting still go around the API, for
  performance and Excel's sort order; see [SorlaDB status](sorla-db.md#open-items).

## Formula engine

1. `parse` builds an AST; `compile` caches it (2,000 formulas, FIFO).
2. `collectDependencies` lists `[@field]` (row) and `[field]` (column) references.
3. `CalcEngine` builds a dependency graph over formula fields, orders it topologically and marks
   cycles `#CIRC!`.
4. `recalculate(ids, fields)` walks the order: a column is recomputed for the changed rows when it
   depends on a changed field through `[@field]`, and for every row when it depends through `[field]`
   (or on a column that was fully recomputed).
5. Results are converted to stored values (errors as their code string) and written into SorlaDB.

Footers, conditional formats, formula filters and `grid.evaluate` use the same evaluator with an ad-hoc row set.

## Rendering

Plain DOM (`<table>` with sticky header and footer), no virtual DOM. Rows are created in chunks while
scrolling (an `IntersectionObserver` on a sentinel, plus a scroll listener). Edits replace single
`<tr>` elements, and rows keep their position until the next `refresh()`, like in Excel.
All text goes through `textContent`. Only `column.render` with `html: true` writes HTML.
