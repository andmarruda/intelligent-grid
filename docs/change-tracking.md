# Change tracking

The grid records what was **inserted**, **updated** and **deleted** since the data was loaded, so
you can send only those changes to your backend instead of replacing everything.

It is on by default. Every edit, paste, `setCellValue`, `setCellFormula`, `updateRow`, `addRow`
and `deleteRows` is tracked.

```ts
const grid = new IntelligentGrid('#orders', { idField: 'id', editable: true, columns, data });

// ...the user edits, adds and deletes rows...

grid.hasChanges();          // true
grid.getChanges();          // { inserted, updated, deleted }
grid.getChangesJSON();      // the same, as a JSON string
grid.getHistory();          // every operation, in order
```

## The changes payload

```json
{
  "inserted": [
    { "id": "6f1c…", "row": { "_id": "6f1c…", "id": null, "product": "Cup", "qty": 1, "price": 7, "total": 7 } }
  ],
  "updated": [
    {
      "id": "1",
      "changes": { "qty": { "from": 2, "to": 4 }, "product": { "from": "Pen", "to": "Pencil" } },
      "row": { "_id": "1", "id": 1, "product": "Pencil", "qty": 4, "price": 1.5, "total": 6 }
    }
  ],
  "deleted": [
    { "id": "3", "row": { "_id": "3", "id": 3, "product": "Ink", "qty": 5, "price": 3, "total": 15 } }
  ]
}
```

| Section | Contains |
|---|---|
| `inserted` | Rows added with `addRow` (or the navbar button), with their current values |
| `updated` | Existing rows with at least one changed value: `changes` lists **only** the changed fields with `from` / `to`, `row` is the full current row |
| `deleted` | Existing rows that were removed, with their **original** values |

`id` is the grid row id: the `idField` value as a string, or a generated UUID for rows inserted
without one. `row` also contains the `idField` itself (e.g. `"id": 1`, `null` for new rows).
On the server, use `row.<idField>` to find existing records: a row inserted and saved earlier in
the same session keeps its temporary grid `id`, while `row.id` holds the database id you gave it.

The payload holds **net changes** against the original data:

- editing a value and editing it back removes it from `changes` (and the row from `updated` if nothing else changed)
- a row inserted and then deleted does not appear at all
- a row updated and then deleted appears only in `deleted`, with its original values
- editing an inserted row keeps it in `inserted`, with the new values
- **calculated columns** are not listed in `changes` (they follow from the other fields), but their values are in `row`. A value the user typed into a calculated column *is* listed
- cells holding a formula typed by the user add `"formulas": { "price": "=[@qty]*2" }` to their entry

## Sending it with a form

Give the grid a form and it keeps a hidden input with the JSON up to date, so a normal submit sends the changes:

```html
<form id="save" method="post" action="/orders/batch">
    <div id="orders"></div>
    <button type="submit">Save</button>
</form>
```
```ts
new IntelligentGrid('#orders', {
    columns, data, idField: 'id', editable: true,
    changeTracking: { form: '#save', inputName: 'changes' }   // <input type="hidden" name="changes">
});
```

Or bind later, to any number of forms:

```ts
grid.bindForm('#save', 'changes');
```

The server receives a `changes` field with the JSON string described above.

## Sending it with fetch

```ts
async function save() {
    if (!grid.hasChanges()) return;
    const response = await fetch('/api/orders/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: grid.getChangesJSON()
    });
    if (!response.ok) throw new Error('Save failed');

    const result = await response.json();
    // give inserted rows the ids the database created, then accept
    for (const { id, dbId } of result.inserted ?? []) grid.updateRow(id, { id: dbId });
    grid.acceptChanges();
}
```

## After saving: accept or reject

| Method | Effect |
|---|---|
| `acceptChanges()` | The current values become the new original. `getChanges()` is empty again and the history is cleared |
| `acceptChanges(ids)` | Only for these rows, e.g. when the server rejected some of them |
| `rejectChanges()` | Restore the original state: inserted rows are removed, deleted rows come back, updated values (and cell formulas) are reverted |
| `rejectChanges(ids)` | Only for these rows |

`setData(rows)` loads a new original and clears tracking. In [append mode](append-mode.md) with
`serverSide: true`, changing sort/filters/search reloads the rows from the server: unsaved changes
are dropped and the `changesDiscarded` event receives them, so save first or warn the user.

## History

`getHistory()` lists every operation since the last `acceptChanges()`, oldest first, even
operations that cancel each other out:

```json
[
  { "seq": 1, "type": "update", "id": "1", "field": "qty", "from": 2, "to": 4, "source": "edit", "at": "2026-10-28T15:02:11.512Z" },
  { "seq": 2, "type": "insert", "id": "6f1c…", "source": "api", "at": "2026-10-28T15:02:20.004Z" },
  { "seq": 3, "type": "update", "id": "1", "field": "qty", "from": 4, "to": 2, "source": "edit", "at": "2026-10-28T15:02:31.870Z" },
  { "seq": 4, "type": "delete", "id": "3", "source": "api", "at": "2026-10-28T15:02:40.118Z" }
]
```

`source` is `edit` (typed or toggled), `paste` or `api`. Cell formulas add `formula`.
History is limited to `historyLimit` entries (default 5000, oldest dropped). Use it for audit
trails or to show "what did I change?". Use `getChanges()` for what to save.

## On screen

| Class | Where | Default look |
|---|---|---|
| `ig-row-inserted` | `tr` of an inserted row | green bar on the left |
| `ig-row-updated` | `tr` of a row with changed values | orange bar on the left |
| `ig-cell-changed` | `td` whose value changed | light orange background, tooltip "Was: …" |

Colors come from `--ig-inserted`, `--ig-updated` and `--ig-changed-bg` ([theming](theming.md)).

The navbar shows **"N changes"** (the tooltip breaks it down) and a **Discard changes** button
while there are unsaved changes; discarding asks first with the [confirmation modal](navbar.md#confirmation-modal). Turn the badge off with `navbar: { changes: false }`.

## Events

| Event | Detail |
|---|---|
| `changes` | `{ summary: { inserted, updated, deleted, total }, hasChanges }`: after every tracked change, accept or reject |
| `changesAccept` | `{ ids }` (`null` = all) |
| `changesReject` | `{ ids }` (`null` = all) |
| `changesDiscarded` | `{ changes }`: append mode reload dropped unsaved changes |

```ts
grid.on('changes', e => { saveButton.disabled = !e.detail.hasChanges; });
window.addEventListener('beforeunload', e => { if (grid.hasChanges()) e.preventDefault(); });
```

## Options

```ts
changeTracking: true                                   // default
changeTracking: false                                  // off: getChanges() is always empty
changeTracking: { form: '#save', inputName: 'changes', historyLimit: 5000 }
```

## Applying the changes on the server

The payload maps directly to three operations. A Laravel example:

```php
public function batch(Request $request)
{
    $changes = json_decode($request->input('changes'), true);   // or $request->json()->all() with fetch

    return DB::transaction(function () use ($changes) {
        $inserted = [];
        foreach ($changes['inserted'] as $item) {
            $order = Order::create(Arr::only($item['row'], ['product', 'qty', 'price']));
            $inserted[] = ['id' => $item['id'], 'dbId' => $order->id];
        }
        foreach ($changes['updated'] as $item) {
            Order::whereKey($item['row']['id'])->update(
                Arr::only(array_map(fn ($c) => $c['to'], $item['changes']), ['product', 'qty', 'price'])
            );
        }
        Order::whereKey(array_map(fn ($item) => $item['row']['id'], $changes['deleted']))->delete();

        return ['inserted' => $inserted];
    });
}
```

Always whitelist the fields you write (`Arr::only`): the payload comes from the browser.
Calculated values such as `total` are in `row` for convenience, so recompute them on the server.
