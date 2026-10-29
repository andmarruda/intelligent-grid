# Grouping and subtotals

```ts
new IntelligentGrid('#grid', {
    groupBy: ['region', 'city'],      // outermost first
    columns: [
        { field: 'city' },
        { field: 'region' },
        { field: 'sales', type: 'currency', footer: 'sum' },              // subtotal: sum, like the footer
        { field: 'orders', type: 'integer', footer: 'sum', subtotal: 'count' },
        { field: 'note', subtotal: false }
    ],
    ...
});
```

Each group gets a row with the column title, the value, the number of rows, and a subtotal under
every column that has one. Click a group row to collapse or expand it.

```
▾ Region: South (3)                    $60.00
    ▾ City: Curitiba (1)               $20.00
        Curitiba   South               $20.00
    ▾ City: Porto Alegre (2)           $40.00
        ...
▸ Region: (blank) (1)                   $1.00
```

## Subtotals

`subtotal` takes the same values as [`footer`](formulas.md#footers): a shortcut (`'sum'`, `'avg'`,
`'count'`, `'counta'`, `'min'`, `'max'`, `'median'`), a formula such as `'=SUM([sales])*0.9'`, or a
function `(rows, column, grid) => value`. It is computed over the rows of the group. Without
`subtotal`, the column's `footer` is used; `subtotal: false` shows nothing. The footer row still
totals every filtered row.

The first visible column holds the group label, so a subtotal in that column is not shown.

## Order

Groups are sorted by their values (ascending, blanks last). Sorting by a grouped field changes the
direction of its groups; sorting by other fields orders the rows inside each group. Filters and the
search apply before grouping, so the counts and subtotals follow them.

Editing a grouped field moves the row to its new group right away; editing other values updates the
subtotals.

## API

```ts
grid.setGroupBy(['region']);      // [] or null ungroups
grid.getGroupBy();                // ['region']
grid.getGroups();                 // [{ key, level, field, value, count, collapsed }] in display order
grid.toggleGroup(key);            // or toggleGroup(key, true / false) to open / close
grid.expandGroups();
grid.collapseGroups();

grid.on('groupChange', e => e.detail.groupBy);
grid.on('groupToggle', e => console.log(e.detail.key, e.detail.collapsed));
```

`groupsCollapsed: true` starts with every group closed (groups that appear later, after a filter or
new data, start closed too). Keys are opaque strings; take them from `getGroups()`.

## With other features

- Rows in collapsed groups are hidden, not removed: `getRows('filtered')`, export, copy of a range,
  find and remove duplicates still include them. Arrow keys skip them; going to one
  (find, `goTo`, `scrollToRow`) opens its group.
- The body stays [virtualized](virtualization.md): 100 000 rows in 100 groups group in about 40 ms.
- XLSX export writes the rows without group rows.
