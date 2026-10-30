# SorlaDB status

Intelligent Grid stores its rows in [SorlaDB](https://sorladb.dev.br) and requires
**sorla-db 1.7.1+**. Building the grid on 1.0.0 turned up the issues below. All of them were fixed
upstream between 1.1.0 and 1.7.1, and the sorla-db test suite grew from 45 tests (several of which
asserted nothing) to 227, including 500 random nested queries checked against a reference
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
| 9 | No `updateOne` / `deleteMany` | 1.3.0, indexed in 1.6.0 | edits with `updateOne` by `_id`, deletes with `deleteMany` |
| 10 | `insertMany` printed to the console | 1.2.0 | inserts with `insertMany` (atomic, returns the ids) |
| 11 | The `validationSchema` was never stored | 1.4.0 (JSON Schema validation) | validates with its own column rules |
| 12 | `_id` uniqueness check was broken | 1.2.0 | relies on SorlaDB (duplicate ids throw) |
| 13 | `find()` deep-clones every match | 1.6.0 (copies only what is read) | filters with `find(query).ids()`: no copies at all |
| 14 | No `$regex`, `$exists`, `skip`/`limit`, events | 1.3.0 | text filters run in `find()` as case-insensitive `$regex` |
| 15 | 1.6 MB bundle with faker; `require('sorla-db')` exported nothing | 1.2.0 (37 kB, Node and ESM entries, types) | tests `require('sorla-db')` |
| 16 | Document proxy broke on Symbol keys | 1.2.0 | not affected |

## Open items

These are the places where [`src/core/store.ts`](../src/core/store.ts) still goes around the
library. Each one is marked `SorlaDB:` in the code.

1. **Calculated values are written on the document data.** Edits go through `updateOne()`, but
   formula recalculation writes one value per row of a column (100 000 for a full column), and
   copying each document for that would add about 2 ms per 1 000 rows. Calculated values are derived
   from the other fields, so skipping the change event for them loses nothing the grid needs.
2. **The id map reads the cursor's stored documents** (`find({ _id })._data`) to follow the new
   object `updateOne()` stores. A public "stored document by id" read would remove that.
3. **Sort order.** The grid keeps its own comparator: errors (`#N/A`) sort after values and the
   grid stores blanks as `''`, which `sort({ nulls })` does not treat as blank.

## Version history used by the grid

| sorla-db | What the grid gained |
|---|---|
| 1.1.0 | nested queries: the advanced filter, OR filters in `find()` |
| 1.2.0 | `insertMany`, `require('sorla-db')`, types |
| 1.3.0 | `deleteMany`, `$regex` for text filters, change events |
| 1.4.0 | schema validation (not used by the grid yet) |
| 1.5.0 | `bindForm` for forms over the same collection (not used by the grid yet) |
| 1.5.1 | linear inserts: 100 000 rows open in under a second |
| 1.6.0 | `_id` index and `updateOne` for edits, `find().ids()` for filters without copies, the WebSocket client behind `append.socket` |
| 1.7.0 | `watch()` live queries (not used by the grid yet) |
| 1.7.1 | `sorla.stream({ apply })` behind `loadStream()`, faster updates |
