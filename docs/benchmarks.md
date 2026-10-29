# Benchmarks

Measured in headless Chromium (Playwright) with `npm run bench`, on a laptop (Intel Core i9-13980HX,
4 cores and 8 GB of RAM given to a WSL2 virtual machine), viewport 1280 × 800.

## Scenario

[`bench/index.html`](../bench/index.html) builds a grid with 12 columns: text, a select, integer,
currency, percent, date and boolean values, a calculated `total` (`=[@qty]*[@price]*(1-[@discount])`,
footer sum) and a `share` column (`=[@total]/SUM([total])`) that depends on every row. Then it times:

| Step | What it does |
|---|---|
| open | `new IntelligentGrid()` with the rows, until the first render |
| filter | number filter `qty > 25` |
| text filter | `name contains "7"` on top of it (a case-insensitive `$regex` in SorlaDB) |
| clear | remove both filters |
| sort | two columns: `city` ascending, `total` descending |
| edit + recalc | one `setCellValue` on `qty`, which recalculates `total`, `SUM([total])` and every `share` |
| scroll | from the top to the bottom in steps; average and 95th percentile frame time |

## Results

| rows | open | filter | text filter | clear | sort | edit + recalc | scroll avg / p95 frame | DOM rows | JS heap |
|---|---|---|---|---|---|---|---|---|---|
| 10,000 | 85 ms | 33 ms | 33 ms | 33 ms | 34 ms | 33 ms | 16.7 / 17 ms | 27 | 10 MB |
| 100,000 | 447 ms | 58 ms | 49 ms | 33 ms | 250 ms | 200 ms | 16.7 / 16.9 ms | 27 | 96 MB |
| 1,000,000 ¹ | 10.4 s | 1.4 s | — | — | 7.3 s | 3.7 s | 18.3 / 27 ms | 27 | 1.6 GB |

¹ Measured once, with sorla-db 1.5 (find() copied every match). The 10k and 100k rows above use
sorla-db 1.7.1, where filtering reads ids without copies: 100 000 rows open in less than half the
time and with 43% less memory. Run `npm run bench -- 1000000` to measure again.

A 16.7 ms frame is 60 fps: up to 100 000 rows scrolling never drops a frame.

## Before and after

The same scenario, before the work on large grids:

| rows | step | before | after | |
|---|---|---|---|---|
| 10,000 | open | 2 519 ms | 85 ms | 30× |
| 10,000 | edit + recalc | 889 ms | 33 ms | 27× |
| 100,000 | open | 237 892 ms | 447 ms | 532× |
| 100,000 | edit + recalc | 84 477 ms | 200 ms | 422× |

Three changes made the difference:

1. **Formula memoization.** `SUM([total])` inside a per-row formula was computed again for each row,
   so a column with it was quadratic. Sub-expressions that do not depend on the row are now computed
   once per calculation pass (volatile functions like `RAND()` excepted).
2. **SorlaDB inserts and reads.** `insertMany` re-read the collection for every document (fixed in
   sorla-db 1.5.1), and `find()` copied every match (1.6.0 copies only what is read; the grid reads
   only ids). See [SorlaDB status](sorla-db.md).
3. **Virtualization.** Only the rows in view are rendered, see [Virtualization](virtualization.md).

## Where the time goes at 1 000 000 rows

These numbers are from sorla-db 1.5, when `find()` still copied every matching document; with 1.7.1
most of that time and memory is gone. Sorting with the Excel comparator remains the largest part. Memory follows
the same copies. Up to a few hundred thousand rows the grid stays interactive; beyond that, use
[append mode](append-mode.md) with the server doing the filtering.

## Bundle size

`npm run build` prints the size of the browser bundle and fails when it is over its budget:

| File | Minified | gzip | Budget (gzip) |
|---|---|---|---|
| `intelligent-grid.min.js` | 169 kB | 55 kB | 64 kB |
| `intelligent-grid.min.css` | 14 kB | 3.6 kB | 5 kB |

Everything is included: formula engine with 137 functions, XLSX export and import, query builder,
grouping, find / replace and the rest. The optional parts together (XLSX read / write, query
builder, find bar, sparklines) are about 7 kB gzip, too little to be worth splitting into
separately loaded files. SorlaDB itself is a separate 37 kB file.

## Run it yourself

```bash
npm run bench                 # 10k and 100k rows
npm run bench -- 1000000      # any sizes
```

Numbers depend on the machine; compare runs on the same one.
