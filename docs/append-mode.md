# Append mode (infinite scroll)

Append mode loads rows page by page from your API as the user scrolls. Rows already loaded stay:
scrolling back up does not request them again, and edits on them are kept while more pages arrive.

The pages can come over `fetch` (below), or over a [WebSocket](#websocket) that also carries changes
pushed by the server. To load everything at once in blocks instead of paging, see
[Server data](server-data.md#server-sent-events-loading-in-blocks).

```ts
const grid = new IntelligentGrid('#customers', {
    idField: 'id',
    columns,
    append: {
        pageSize: 100,          // rows per request (default 100)
        threshold: 200,         // px from the bottom that triggers the next page (default 200)
        serverSide: true,       // default true
        load: async ({ offset, limit, sort, where, search }) => {
            const query = new URLSearchParams({ offset, limit, sort: JSON.stringify(sort), where: JSON.stringify(where), search });
            const response = await fetch(`/api/customers?${query}`);
            return response.json();   // { rows, hasMore, total }
        }
    }
});
```

`load` receives:

| Parameter | |
|---|---|
| `offset`, `limit` | the page |
| `sort` | `[{ field, dir }]` |
| `where` | column filters and the advanced filter together, as one SorlaDB / MongoDB `find()` query |
| `search` | the text of the search box |
| `filters`, `query`, `sorlaQuery` | the same parts separately: the grid's [filter model](sorting-filtering.md#filter-model), the [advanced filter](query-builder.md) model and its JSON |

`where` is the easiest one to use on the server: run it as is with sorla-db or MongoDB
(`collection.find(where)`). Text conditions are case-insensitive `$regex`; blanks are `''`. Formula
filters and the search cannot be expressed in it and are left out.

`load` resolves `{ rows, hasMore?, total? }` or just an array of rows:

- `hasMore` defaults to `rows.length >= pageSize`
- `total` feeds the status bar ("100 of 5000 rows")

## serverSide: true (default)

Sort, filters, search and the [advanced filter](query-builder.md) (`query` model and `sorlaQuery`
JSON) are **sent to `load`** and not applied locally. Changing any of them
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

## WebSocket

With sorla-db 1.7+, one connection can carry every page and the changes other users make:

```ts
const socket = sorla.connect('wss://api.example.com/orders');   // reconnects, pings, queues requests
const grid = new IntelligentGrid('#orders', {
    idField: 'id',
    columns,
    append: { pageSize: 100, socket }   // instead of load
});
```

Each page is a request on the socket, `{ type: 'load', id, offset, limit, sort, where, search, ... }`,
and the server answers `{ type: 'reply', id, rows, hasMore, total }`. Rows the server pushes on the
same connection (`{ type: 'rows', rows }`, `{ type: 'delete', ids }`) are applied with
[`applyServerChanges`](server-data.md#applyserverchanges): the row updates in place, and fields the
user is editing keep the user's value. See the
[sorla-db protocol](https://github.com/sysborg/sorla-db#websocket-pages-and-live-changes) and
[`examples/websocket.html`](../examples/websocket.html).

`socket` accepts anything with `load(params)` and `on('push', listener)`, so you can wrap your own
connection the same way.

## Without append

When all data is in memory the grid is [virtualized](virtualization.md): only the rows in view are
rendered. Use `append` when the data comes from an API page by page.
