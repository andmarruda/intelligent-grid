# SorlaDB improvements

Intelligent Grid stores its rows in [SorlaDB](https://github.com/sysborg/sorla-db). While building it
on 1.0.0, these issues came up. **sorla-db 1.1.0 fixed #5 and #6** (nested logical operators and several
operators per field), with a recursive query matcher and a test suite that went from 45 to 104 tests,
including 500 random nested queries checked against a reference implementation. The grid requires 1.1+.
The remaining issues are worked around in [`src/core/store.ts`](../src/core/store.ts), each marked
`SorlaDB 1.0 workaround`, and are tracked in sorla-db as `it.failing` tests.

| # | Issue | Where (sorla-db) | Grid workaround |
|---|---|---|---|
| 1 | `insertOne` throws on `null` values: `_validateKeys` recurses into `typeof null === 'object'` and calls `Object.keys(null)` | `src/query_language/manipulation.js` `_validateKeys` | blanks are stored as `''` |
| 2 | `_validateKeys` returns after the first object/array value, so later keys are never validated | same | none needed |
| 3 | `cursor.sort()` always throws `documents is not a constructor`: `cursor.js` and `document.js` require each other, so `documents` is `{}` inside `cursor.js` | `src/documents/cursor.js` | sorting happens in the adapter |
| 4 | `cursor.sort()` compares with `<` / `>` only: no locale collation, case-sensitive, inconsistent order with blanks or mixed types | same | Excel comparator (`compareCells`) |
| 5 | ~~Inside `$or` / `$and`, only the first operator of `{ a: { $gte: 1, $lte: 5 } }` was read~~ | **fixed in 1.1.0** | OR conditions now run in `find()` |
| 6 | ~~Nested logical operators (`$and: [{ $or: [...] }]`) threw~~ | **fixed in 1.1.0** | the [advanced filter](query-builder.md) runs nested queries in `find()` |
| 7 | `findOne()` and `cursor.first()` throw when nothing matches | `query.js`, `cursor.js` | the adapter keeps an id → document map |
| 8 | `cursor.toArray()` throws (`structuredClone` of a Proxy) | `cursor.js` | reads `doc._data` |
| 9 | No `updateOne/updateMany/deleteOne/deleteMany/drop`, and the document proxy rejects writes from outside the library | `manipulation.js`, `document.js` | writes `doc._data`, splices `collection.all` |
| 10 | `insertMany` calls `console.info` on every call | `manipulation.js` | uses `insertOne` |
| 11 | The `validationSchema` setter checks an undefined variable (`schemaValidation`), so schemas are never stored | `manipulation.js` | the grid validates itself |
| 12 | The `_id` uniqueness loop compares `document._id` instead of the generated key | `manipulation.js` `insertOne` | the adapter rejects duplicate ids |
| 13 | `find()` deep-clones every matching document on every query | `query.js` `_deepFind` | fine up to tens of thousands of rows |
| 14 | No `$regex` / case-insensitive match, `$exists`, `skip` / `limit`, indexes or change events | | text filters run as predicates; paging lives in the grid |
| 15 | The npm `main` is a 1.6 MB browserify bundle that includes `faker` (from `src/helper.js`), and `require('sorla-db')` exports nothing in Node | `index.js`, `package.json` | tests load `sorla-db/src/sorla.js` |
| 16 | The document proxy `get` trap calls `prop.indexOf` and breaks on Symbol keys (`console.log`, spreading, `String(doc)`) | `document.js` | the adapter never touches the proxies directly |

## Reproduction

```js
const Sorla = require('sorla-db/src/sorla.js');
const s = new Sorla(); s.useDb('t'); s.db.createCollection('c');
s.db.c.insertOne({ a: 2 }); s.db.c.insertOne({ a: 1 });

s.db.c.find({}).sort({ a: 1 });                              // TypeError: documents is not a constructor
s.db.c.insertOne({ a: null });                               // TypeError: Cannot convert undefined or null to object
s.db.c.findOne({ a: 99 });                                   // TypeError: Cannot read properties of undefined (reading '_data')
s.db.c.find({}).toArray();                                   // DataCloneError: #<documents> could not be cloned
```

## Suggested order

1. **#1, #3, #9**: unblock nulls, sorting and updates/deletes (#5/#6 done in 1.1.0).
2. **#14**: `$regex` with an `i` option, `skip`/`limit`, a `sort` with a collation option.
3. **#15**: publish an ES module / CommonJS build without `faker`.

With 1 and 2 in place most of `store.ts` reduces to direct SorlaDB calls: `updateOne`, `deleteMany`,
`find(query).sort(...)`, and text filters as `$regex`.
