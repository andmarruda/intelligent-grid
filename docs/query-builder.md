# Advanced filter (query builder)

The **Advanced filter** button in the navbar opens a visual query builder: users combine rules in
nested **AND / OR** groups, negate groups with **NOT**, and see the SorlaDB `find()` query being
built. Applying it filters the grid; it combines (AND) with the column filters and the search.

```
Age ≥ 30  AND  ( Name = X  OR  City is one of A, B )
```
```json
{ "$and": [
    { "age": { "$gte": 30, "$ne": "" } },
    { "$or": [ { "name": { "$eq": "X" } }, { "city": { "$in": ["A", "B"] } } ] }
] }
```

The query runs **in SorlaDB**: every part of the tree that SorlaDB can express is executed by one
`collection.find()`. It needs sorla-db 1.5+ (nested `$and` / `$or` / `$nor`, several operators per
field, `$regex`).

## In the panel

- **E / OU (And / Or)** switch how a group combines its rules; **Não (Not)** negates the whole group.
- **+ Rule** adds a rule (field, operator, value). **+ Group** adds a nested group, which starts with the opposite join. Groups nest up to 5 levels.
- Operators depend on the column type:

| Column type | Operators |
|---|---|
| text, select | equals, does not equal, is one of, is not one of, contains, does not contain, begins with, ends with, is blank, is not blank |
| number, integer, currency, percent, date, datetime | =, ≠, >, ≥, <, ≤, between, is one of, is not one of, is blank, is not blank |
| boolean | equals, is blank, is not blank |

- **Is one of / is not one of** show a list of the values present in the data (Ctrl/Cmd+click to pick several).
- The live counter shows how many rows the draft matches (together with the other filters) before you apply it.
- **find() query (JSON)** shows the query being built, with **Copy JSON**.
- **Apply** (or Enter in a value) applies, **Cancel** or Esc discards the draft, **Clear** starts over.
- Incomplete rules (no value yet) and empty groups are ignored.

An applied query shows as a readable chip in the navbar (`Age ≥ 30 AND (Name = X OR City in A, B)`),
and its × removes it. "Clear filters" removes it too.

### Equality is exact

Builder equality is SorlaDB `$eq`: `Name = X` does not match `x`. For case-insensitive matching use
**contains / begins with / ends with**, or the column filter menu, whose "equals" ignores case.

### Text matching

**contains, does not contain, begins with, ends with** become case-insensitive `$regex` conditions
(`{ "name": { "$regex": "^x", "$options": "i" } }`) and run in SorlaDB like everything else. A MongoDB
backend understands the same JSON. Special characters are escaped, so `a.b` looks for a literal dot.
On **select** columns the text is matched against the labels users see, and the query uses the
matching option values (`{ "status": { "$in": ["open"] } }`).

The only rule SorlaDB cannot express is "≠ a day" on a datetime column. The grid evaluates it, and
a group mixing it with other rules still sends every other part to `find()`.

## API

```ts
grid.setQuery({
    type: 'group', join: 'and', children: [
        { type: 'rule', field: 'age', op: 'gte', value: 30 },
        { type: 'group', join: 'or', children: [
            { type: 'rule', field: 'name', op: 'eq', value: 'X' },
            { type: 'rule', field: 'city', op: 'in', values: ['A', 'B'] }
        ] }
    ]
});

grid.getQuery();                      // the model above (null when none)
grid.toSorlaQuery();                  // the find() JSON
grid.fromSorlaQuery(savedJson);       // load a query saved earlier
grid.setQuery(null);                  // remove it
grid.toggleQueryBuilder(true);        // open the panel from your own button
```

Saving and restoring a user's query:

```ts
grid.on('queryChange', e => localStorage.setItem('orders-query', JSON.stringify(e.detail.sorlaQuery)));
const saved = localStorage.getItem('orders-query');
if (saved) grid.fromSorlaQuery(JSON.parse(saved));
```

`initialQuery` applies a query on load. `navbar: { query: false }` hides the button (the API still works).

## Model

```ts
type QueryNode = QueryRule | QueryGroup;

interface QueryGroup {
    type: 'group';
    join: 'and' | 'or';
    not?: boolean;               // NOT (...) → $nor
    children: QueryNode[];
}

interface QueryRule {
    type: 'rule';
    field: string;               // column field
    op: QueryOperator;
    value?: unknown;             // typed as shown: '30', '01/12/2026' (locale), true
    value2?: unknown;            // upper bound of "between"
    values?: unknown[];          // "in" / "nin": stored values
}

type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'nin'
    | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty';
```

How rules become SorlaDB conditions:

| Rule | find() condition |
|---|---|
| `age gte 30` | `{ age: { $gte: 30, $ne: '' } }` (range operators skip blanks) |
| `age between 20 and 40` | `{ age: { $gte: 20, $lte: 40, $ne: '' } }` |
| `name eq 'X'` | `{ name: { $eq: 'X' } }` |
| `city in ['A', 'B']` | `{ city: { $in: ['A', 'B'] } }` |
| `joined empty` | `{ joined: { $eq: '' } }` (blanks are stored as `''`) |
| `name startsWith 'x'` | `{ name: { $regex: '^x', $options: 'i' } }` |
| `name notContains 'x'` | `{ name: { $not: { $regex: 'x', $options: 'i' } } }` |
| `status contains 'abe'` (select) | `{ status: { $in: ['open'] } }` (labels matched) |
| group `or` | `{ $or: [...] }` |
| group with `not` | `{ $nor: [...] }` |

`fromSorlaQuery` reads these constructs back (`$and`, `$or`, `$nor`, `$not`, the comparison
operators, `$in`/`$nin` and the `$regex` patterns above), and throws on anything else (e.g. `$exists`).

## Server side (append mode)

With `append: { serverSide: true }`, changing the advanced filter reloads from offset 0, and
`load()` receives it both ways:

```ts
load: async ({ offset, limit, sort, filters, search, query, sorlaQuery }) => {
    // sorlaQuery is MongoDB compatible: pass it to a Mongo collection, or translate it to SQL
    const response = await fetch('/api/customers/find', { method: 'POST', body: JSON.stringify({ where: sorlaQuery, offset, limit, sort }) });
    return response.json();
}
```

Validate and whitelist fields and operators on the server: the query comes from the browser.

## Events

| Event | Detail |
|---|---|
| `queryChange` | `{ query, sorlaQuery }` |
| `queryBuilderOpen` / `queryBuilderClose` | `{}` |
