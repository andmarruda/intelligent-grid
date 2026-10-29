# Server data

Ways to get rows from a backend into the grid, besides `setData()`:

| Need | Use |
|---|---|
| Page by page as the user scrolls, over HTTP | [append mode](append-mode.md) with `load` and `fetch` |
| Page by page over one connection, with live changes from other users | [append mode](append-mode.md#websocket) with `socket` |
| Every row, in blocks, with progress | [`loadStream()`](#server-sent-events-loading-in-blocks) (Server-Sent Events) |
| Changes your own code receives (polling, a message bus) | [`applyServerChanges()`](#applyserverchanges) |

WebSocket and Server-Sent Events are alternatives to `fetch`, not replacements. They need
sorla-db 1.7.1 or later.

## Server-Sent Events: loading in blocks

```ts
const stream = grid.loadStream('/api/orders/stream', {
    headers: { Authorization: `Bearer ${token}` },
    onProgress: ({ loaded, total }) => (bar.value = total ? loaded / total : 0)
});
const state = await stream.done;   // { loaded, total, blocks, errors, ... }
stream.close();                    // stops early
```

The server sends the rows in named events (the [sorla-db stream protocol](https://github.com/sysborg/sorla-db#server-sent-events-many-rows-in-blocks)):

```
event: meta
data: {"total": 100000}

id: 1
event: rows
data: [{"id": 1, ...}, ... 5000 rows ...]

event: end
data: {}
```

- Rows show up as each block arrives; the user can scroll, sort and filter while it loads. Sorting
  and filters are applied again a few times per second and once more at the end.
- The status bar shows "Loading 20,000 of 100,000 rows…".
- After a dropped connection the client reconnects with `Last-Event-ID`, so the server can continue
  with the next block. A row sent twice updates the row instead of duplicating it.
- `delete` events (`[ids]`) remove rows. `ops` events are not supported by the grid.
- `replace: false` adds to the current rows instead of replacing them.
- Rows from the stream are not unsaved changes and cannot be undone.
- Options: `transport` (`'fetch'`, default, or `'eventsource'`), `headers`, `method`, `body`,
  `credentials`, `withCredentials`, `retry`, `maxRetries`, `lastEventId`, `onProgress`, `onError`.

Events: `streamEnd` (the final state) and `streamError` (`{ error }`).

A Node example of the endpoint is in [`scripts/demo-api.ts`](../scripts/demo-api.ts)
(`/api/orders/stream`): it waits for `drain` when the browser reads slower than the server writes.

## applyServerChanges

```ts
grid.applyServerChanges({ rows: [{ id: 7, qty: 3 }, { id: 9001, name: 'New', qty: 1 }] });
grid.applyServerChanges({ type: 'delete', ids: [12, 13] });
// → { inserted: ['9001'], updated: ['7'], removed: ['12', '13'] }
```

- A row whose id exists is updated with the fields it has; the others are added.
- Server changes are **not** unsaved changes ([change tracking](change-tracking.md)) and cannot be
  undone.
- A field the user changed and did not save keeps the user's value. The other fields of that row
  follow the server, and the server values become their originals, so they are not reported as
  changes of the user.
- Calculated columns are recalculated; new rows follow the local sort and filters.
- Emits `serverChange` with the same result.

## Try it

`npm run demo` starts a backend with 100 000 orders kept in a sorla-db collection on the server:

| Example | Shows |
|---|---|
| [fetch-pages.html](../examples/fetch-pages.html) | pages over HTTP that add to the grid; filters sent as `where` |
| [websocket.html](../examples/websocket.html) | pages over a WebSocket, rows changed by "another user" every 3 s |
| [sse-stream.html](../examples/sse-stream.html) | 100 000 rows in blocks of 5 000, with progress |
