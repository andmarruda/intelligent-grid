# Append mode (infinite scroll)

Append mode loads rows page by page from your API as the user scrolls.

```ts
const grid = new IntelligentGrid('#customers', {
    idField: 'id',
    columns,
    append: {
        pageSize: 100,          // rows per request (default 100)
        threshold: 200,         // px from the bottom that triggers the next page (default 200)
        serverSide: true,       // default true
        load: async ({ offset, limit, sort, filters, search }) => {
            const response = await fetch(`/api/customers?offset=${offset}&limit=${limit}`
                + `&sort=${encodeURIComponent(JSON.stringify(sort))}`
                + `&filters=${encodeURIComponent(JSON.stringify(filters))}`
                + `&q=${encodeURIComponent(search)}`);
            const body = await response.json();
            return { rows: body.items, total: body.total, hasMore: body.hasMore };
        }
    }
});
```

`load` resolves `{ rows, hasMore?, total? }` or just an array of rows:

- `hasMore` defaults to `rows.length >= pageSize`
- `total` feeds the status bar ("100 of 5000 rows")

## serverSide: true (default)

Sort, filters and search are **sent to `load`** and not applied locally. Changing any of them
clears the loaded rows and starts again from `offset: 0`. Responses that arrive after a change
are discarded, so out-of-order responses are safe. Your API receives the same `sort` and `filters`
models the grid uses ([filter model](sorting-filtering.md#filter-model)).

## serverSide: false

`load` is only used for paging. Sort, filters and search apply to the rows loaded so far, so the
user can keep scrolling to load more and the local view updates.

## Behavior

- Pages are inserted into the SorlaDB collection; calculated columns are computed for new rows,
  and columns using whole-column references (`[total]`) are recalculated for every loaded row.
- If the first pages do not fill the scroll area, the grid keeps loading until they do (or `hasMore` is false).
- A rejected promise emits `loadError` and stops paging (`grid.reload()` starts over).

```ts
await grid.loadMore();   // fetch the next page now
await grid.reload();     // clear and start from offset 0
grid.on('loadStart', e => spinner.show());
grid.on('loadEnd', e => console.log(e.detail.rows, e.detail.hasMore, e.detail.total));
grid.on('scrollEnd', () => console.log('everything is loaded'));
```

## Without append

When all data is in memory, the grid already renders progressively: `renderChunk` rows (100)
are added to the DOM as you scroll. Use `append` only when the data comes from an API.
