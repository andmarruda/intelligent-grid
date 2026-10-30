# Sorting & filtering

## Sorting

- Click a header: ascending → descending → no sort.
- **Shift / Ctrl / Cmd + click** adds the column to the current sort, so you can sort by several columns. The header shows ▲/▼ and, with more than one column, the priority number.
- `sort: { mode: 'toggle' }` makes every click additive (no modifier needed).
- The filter menu (▾) also has "Sort ascending / descending".

The order follows Excel: numbers < text < booleans < errors. Text uses locale collation (case and accent insensitive, numeric aware, so `item 2` sorts before `item 10`). **Blanks always go last**, in both directions.

```ts
grid.setSort([{ field: 'city', dir: 'asc' }, { field: 'total', dir: 'desc' }]);
grid.toggleSort('qty', /* additive */ true);
grid.getSort();   // [{ field: 'city', dir: 'asc' }, ...]
grid.setSort([]); // clear
```

Calculated columns sort like any other column: their values are stored in SorlaDB.

## The filter menu

The ▾ button opens an Excel AutoFilter popover:

1. sort buttons
2. two conditions joined by **And / Or** (operators depend on the column type). Typing a value without
   choosing an operator uses **contains** for text and **equals** for numbers and dates
3. a value checklist with search, counts, "(Select all)" and "(Blanks)". Like Excel, it lists the values left by the *other* columns' filters

Active filters show as chips in the navbar, and the ▾ turns into ⧩.

## Filter model

```ts
interface Filter {
    values?: unknown[];                                   // checklist, '' = blanks
    conditions?: { op: FilterOperator; value?: unknown; value2?: unknown }[];
    join?: 'and' | 'or';                                  // default 'and'
    formula?: string;                                     // must evaluate to TRUE
    test?: (value: unknown, row: RowData) => boolean;     // your own predicate
}
type FilterModel = Record<string /* field */, Filter>;
```

All the parts of one filter must match, and all filtered columns must match.

```ts
grid.setFilter('status', { values: ['open', ''] });                                    // open or blank
grid.setFilter('total', { conditions: [{ op: 'between', value: 100, value2: 500 }] });
grid.setFilter('name', { join: 'or', conditions: [{ op: 'startsWith', value: 'a' }, { op: 'endsWith', value: 'z' }] });
grid.setFilter('due', { conditions: [{ op: 'lt', value: '2026-12-01' }] });             // ISO or locale text (01/12/2026 in pt-BR)
grid.setFilter('total', { formula: '=[@total] > AVERAGE([total])' });                  // formulas see every row
grid.setFilter('city', { test: value => String(value).length > 8 });

grid.setFilter('status', null);   // remove one
grid.setFilters({ ... });         // replace all
grid.clearFilters();              // filters and search
grid.getFilters();
```

| Operators | Applies to |
|---|---|
| `contains` `notContains` `equals` `notEquals` `startsWith` `endsWith` | text, select (case-insensitive; select matches the label or the value) |
| `eq` `ne` `gt` `gte` `lt` `lte` `between` | number, integer, currency, percent, date, datetime |
| `eq` | boolean (`value: true/false`) |
| `empty` `notEmpty` | every type |

Rules worth knowing:

- Range operators skip blank cells (`< 10` does not match blanks); `ne` keeps them.
- Percent operands are typed as shown: `15` means 15%.
- On `datetime` columns a date operand means the whole day (`eq '2026-10-28'` matches any time that day).

## Global search

The navbar search box (or `grid.setSearch(text)`) keeps rows where any **visible** column's
**displayed** text contains the search, ignoring case. It is debounced by 200 ms.

## How it runs on SorlaDB

Filters compile to a SorlaDB query wherever the Sorla query language can express them: checklists
become `$in`, ranges `$gt/$gte/$lt/$lte` plus `$ne: ''` to skip blanks, blanks `$eq: ''`, booleans
and select values `$eq`, and conditions joined by **Or** become `$or`. Several filtered columns are
combined with `$and`. Text operators become case-insensitive `$regex` conditions, and on select columns
they match the labels and send the matching values as `$in` / `$nin`. Only formulas, `test` functions
and the global search (it matches the displayed text) run as JavaScript predicates.

For nested AND / OR / NOT logic across columns, use the [advanced filter](query-builder.md). See [architecture](architecture.md)
and [SorlaDB status](sorla-db.md).

In [append mode](append-mode.md) with `serverSide: true`, sort, filters and search go to your loader instead.
