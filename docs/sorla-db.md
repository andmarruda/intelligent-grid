# SorlaDB status

Intelligent Grid stores its rows in [SorlaDB](https://github.com/sysborg/sorla-db) and requires
**sorla-db 1.5+**. Building the grid on 1.0.0 turned up the issues below. All of them were fixed
upstream between 1.1.0 and 1.5.0, and the sorla-db test suite grew from 45 tests (several of which
asserted nothing) to 186, including 500 random nested queries checked against a reference
implementation.

## Fixed issues and what the grid does now

| # | Issue in 1.0 | Fixed in | The grid now |
|---|---|---|---|
| 1 | `insertOne` threw on `null` values | 1.2.0 | still stores blanks as `''` on purpose: one blank value keeps every query simple; rows handed to you use `null` |
| 2 | Nested keys were not all validated | 1.2.0 | relies on SorlaDB validation |
| 3 | `cursor.sort()` always threw (circular require) | 1.2.0 | keeps its own comparator: SorlaDB follows MongoDB's order (blanks first), the grid follows Excel's (blanks last in both directions) |
| 4 | Sorting had no collation | 1.2.0 (`collation` option) | Excel comparator with `Intl.Collator` |
| 5 | Only the first operator of a field was read inside `$or` / `$and` | 1.1.0 | sends OR-joined filter conditions as `$or` |
| 6 | Nested logical operators threw | 1.1.0 | the [advanced filter](query-builder.md) runs nested queries in `find()` |
| 7 | `findOne()` threw when nothing matched | 1.2.0 (returns `null`) | keeps an id → document map for O(1) reads |
| 8 | `cursor.toArray()` threw | 1.2.0 | reads the cursor documents |
| 9 | No `updateOne` / `deleteMany` | 1.3.0 | deletes with `deleteMany`; see "Open items" for updates |
| 10 | `insertMany` printed to the console | 1.2.0 | inserts with `insertMany` (atomic, returns the ids) |
| 11 | The `validationSchema` was never stored | 1.4.0 (JSON Schema validation) | validates with its own column rules |
| 12 | `_id` uniqueness check was broken | 1.2.0 | relies on SorlaDB (duplicate ids throw) |
| 13 | `find()` deep-clones every match | open | fine up to tens of thousands of rows |
| 14 | No `$regex`, `$exists`, `skip`/`limit`, events | 1.3.0 | text filters run in `find()` as case-insensitive `$regex` |
| 15 | 1.6 MB bundle with faker; `require('sorla-db')` exported nothing | 1.2.0 (37 kB, Node and ESM entries, types) | tests `require('sorla-db')` |
| 16 | Document proxy broke on Symbol keys | 1.2.0 | not affected |

## Pending release

**1.5.1: quadratic inserts.** Every insert re-read the list of ids of the collection, so
`insertMany` of n rows took O(n²): 100 000 rows needed minutes. The fix (read the ids once per
call) is in sorla-db's `fix/insert-performance` branch, with a performance test. Until 1.5.1 is
published, large grids open slowly with sorla-db 1.5.0; see [Benchmarks](benchmarks.md).

## Open items

These are the places where [`src/core/store.ts`](../src/core/store.ts) still goes around the
library. Each one is marked `SorlaDB:` in the code.

1. **Updates are written on the document data.** `updateOne()` scans the whole collection and
   replaces the document object. That is fine for a single edit, but formula recalculation writes
   one value per row of a column, which would become quadratic, and replacing objects would
   invalidate the grid's id index. A sorla-db API for indexed, bulk writes (O(1) lookup by `_id` plus
   a `bulkWrite`) would let the grid use the public API here.
2. **Sort order.** The grid needs Excel's order: blanks last in both directions, and errors after
   values. A `sort()` option such as `{ nulls: 'last' }` would cover blanks.
3. **`find()` copies every match (#13).** Returning lazy copies, only for the documents that are
   actually read, would make large grids cheaper to filter.

## Version history used by the grid

| sorla-db | What the grid gained |
|---|---|
| 1.1.0 | nested queries: the advanced filter, OR filters in `find()` |
| 1.2.0 | `insertMany`, `require('sorla-db')`, types |
| 1.3.0 | `deleteMany`, `$regex` for text filters, change events |
| 1.4.0 | schema validation (not used by the grid yet) |
| 1.5.0 | `bindForm` for forms over the same collection (not used by the grid yet) |
