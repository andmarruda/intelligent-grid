# Virtualization, pinned columns and wrapped text

Only the rows (and, with many columns, the columns) in view are in the DOM: about 30 rows whether
the grid holds 10 000 or 1 000 000. Scrolling stays at 60 fps up to 100 000 rows; see
[Benchmarks](benchmarks.md).

## Rows

Spacer rows above and below the visible window keep the scroll size of every row. Rows that stay in
view while scrolling are reused, and an editor that scrolls out of view commits its value (or is
cancelled when the value is invalid).

| Option | Default | |
|---|---|---|
| `rowHeight` | measured | Row height in pixels. Measured from the first row when not set (it follows your CSS) |
| `overscan` | `8` | Extra rows rendered above and below the viewport |
| `height` | `480` | Height of the scroll area |

```ts
grid.scrollToRow(5000);   // position in the filtered and sorted rows
```

`renderChunk` from earlier versions is ignored.

## Columns

With more than `virtualColumns` (default 40) visible columns, only the columns in view (plus a few
on each side) are rendered; spacer cells keep the width of the others. Set `virtualColumns: Infinity`
to always render every column.

## Pinned (frozen) columns

```ts
columns: [
    { field: 'id', pinned: 'left' },
    { field: 'name', pinned: 'left' },
    ...
    { field: 'total', pinned: 'right' }
]
grid.pinColumn('city', 'left');   // 'left', 'right' or null; emits columnPin { field, side }
```

Pinned columns stay in place while scrolling sideways (with a shadow on their inner edge), keep
their order, and are never virtualized. The header row and the footer row are always sticky.

## Wrapped text and row height

```ts
{ field: 'notes', wrap: true }
```

Wrapped cells break lines and their row grows to fit. Rows are measured as they render, so the scroll
size stays exact even when only some rows are tall.

## Zebra rows

Alternate rows use the `ig-row-alt` class (by position in the list, not in the DOM), so the stripes
stay put while scrolling. Style them with `--ig-row-alt`.
