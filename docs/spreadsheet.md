# Spreadsheet features

Cell ranges, the fill handle, undo / redo, find / replace / go to, comments and duplicate removal.
They all follow the filtered and sorted view, the way you see it.

## Keyboard reference

| Action | Keys |
|---|---|
| Move the active cell | arrows, Tab / Shift+Tab |
| Jump to the edge of the data | Ctrl/Cmd + arrow |
| Extend the range | Shift + arrow, Shift + Ctrl/Cmd + arrow, Shift + click, or drag |
| Select every cell (and every row) | Ctrl/Cmd + A |
| Copy the range / paste from its top left corner | Ctrl/Cmd + C / Ctrl/Cmd + V |
| Clear the range | Delete / Backspace |
| Fill down / right (copy the first row / column of the range) | Ctrl/Cmd + D / Ctrl/Cmd + R |
| Undo / redo | Ctrl/Cmd + Z / Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z |
| Find / replace / go to | Ctrl/Cmd + F / Ctrl/Cmd + H / Ctrl/Cmd + G |
| Edit the comment of the active cell | Shift + F2 |
| Select the rows of the range | Space |

The shortcuts work while the grid has focus; elsewhere on the page, Ctrl+F still opens the browser's
own find.

## Ranges

Drag over cells, Shift+click, or Shift+arrows. The active cell is the anchor (it keeps the thick
outline); the range is tinted with a border around it and a fill handle on its corner.

```ts
grid.setRange({ id: '1', field: 'name' }, { id: '5', field: 'price' });
grid.getRange();        // { from, to, rows: ['1', ..., '5'], fields: ['name', 'qty', 'price'] }
grid.getRangeValues();  // [['Pen', 2, 1.5], ...] stored values
grid.clearRange();      // blanks the editable cells, one undo step; returns the count
grid.on('rangeChange', e => console.log(e.detail));   // same shape as getRange(), or null
```

- **Copy** writes the range as tab separated text, as displayed, so it pastes straight into Excel.
- **Paste** starts at the top left cell of the range. A single value pasted over a range fills
  every cell of it, like Excel. Cells copied from Excel that contain line breaks stay in one cell.
- Paste, clear, fill and replace each count as **one undo step**.

Clicking a data cell selects the cell, not the row: rows are selected with the checkbox column,
Space, or Ctrl+A. Set `selection: { selectOnClick: true }` to select rows from any cell (the
previous default). See [Selection](selection.md).

## Fill handle

Drag the small square on the corner of the range, down, up, left or right. Holding the pointer past
the edge of the grid keeps scrolling and extending. Double-click the handle to fill down to the last
row.

| Source | Result |
|---|---|
| One number | copied: `7` → `7, 7, 7` |
| Two or more numbers with a constant step | continued: `1, 2` → `3, 4`; `10, 8` → `6, 4` |
| Dates | one date adds a day; two continue their step (`Jan 1, Jan 8` → `Jan 15`) |
| Text ending in a number | the number continues: `Item 1` → `Item 2`, `A001` → `A002` |
| Anything else | the block repeats: `x, y` → `x, y, x` |

Filling up or left runs the series backwards. Formula columns and read-only cells are skipped.

```ts
grid.fill('down', 10);     // like dragging the handle 10 rows; returns the cells written
grid.fillCopy('right');    // Ctrl+R: copy the first column of the range into the rest
grid.on('fill', e => console.log(e.detail));   // { direction, count, written, range }
```

The series rules are also exported: `fillSeries(source, count, type)` and
`fillSeriesBackward(source, count, type)`.

## Undo and redo

Every user action is one step: an edit, a paste, a fill, a replace, adding or deleting rows. The
navbar has ↶ ↷ buttons (`navbar.undo`, shown when something is editable).

```ts
grid.undo();                 // false when there is nothing to undo
grid.redo();
grid.canUndo(); grid.canRedo();
grid.batch(() => {           // group your own changes into one step
    grid.setCellValue('1', 'qty', 3);
    grid.setCellValue('2', 'qty', 4);
}, 'restock');
grid.clearUndo();
grid.on('undo', e => console.log(e.detail.label));   // also 'redo'
```

`undoLimit` (default 100) sets how many steps are kept. `setData()` and append mode reloads clear
the history. Undo also updates [change tracking](change-tracking.md): undoing an edit makes the row
unchanged again.

## Find, replace and go to

Ctrl+F opens a bar above the grid. Matches are highlighted, Enter / Shift+Enter walk through them
(starting at the active cell, wrapping around), and the current match becomes the active cell,
scrolled into view. **Match case** and **Whole cell** narrow the search. Esc closes the bar.

Ctrl+H adds a replace row: **Replace** changes the current match and moves to the next one,
**Replace all** changes every match as one undo step. Replacing works on what you would type in the
cell (`1200`, not `$1,200.00`), and the result is parsed like typed input.

Ctrl+G goes to a row number, optionally with a column title or field: `120`, `120 Price`, `120, price`.

```ts
grid.find('paul', { matchCase: false, wholeCell: false, fields: ['name'] });   // [{ id, field }]
grid.replace('Paul', 'Paulo', { wholeCell: true });                            // cells changed
grid.goTo(120);  grid.goTo('120 Price');                                       // false if missing
grid.openFind('replace');  grid.closeFind();
grid.highlightCells([{ id: '1', field: 'name' }]);                              // your own marks
```

Find searches the displayed text of the filtered rows, including rows in collapsed
[groups](grouping.md) (going to one opens its group). Turn the bar off with `find: false`; Ctrl+F
is then left to the browser.

## Comments

A comment is a note on a cell: a red corner mark, the text on hover, and an editor on Shift+F2
(Ctrl+Enter saves, Esc cancels).

```ts
new IntelligentGrid('#grid', { comments: [{ id: '1', field: 'city', text: 'Check the address' }], ... });
grid.setComment('2', 'name', 'Duplicate?');   // undoable; null or '' removes it
grid.getComment('2', 'name');
grid.getComments();                           // [{ id, field, text }] of existing rows
grid.editComment('2', 'name');                // open the editor
grid.on('commentChange', e => save(e.detail)); // { id, field, text, oldText }
```

Comments are kept by row id, so they stay with their row through sorting, filtering and reloads with
the same ids. They are not part of change tracking and are not exported.

## Remove duplicates

```ts
grid.findDuplicates({ fields: ['name', 'city'] });     // ids that repeat an earlier row
grid.removeDuplicates({ fields: ['name', 'city'] });   // deletes them, one undo step
```

| Option | Default | |
|---|---|---|
| `fields` | every visible column that is not a formula | columns that must all match |
| `matchCase` | `false` | `"Ana"` and `"ana "` are the same (text is trimmed), like Excel |
| `scope` | `'filtered'` | `'all'` checks every row, in insertion order |

The first row of each set, in the order shown, is kept. `removeDuplicates` does not ask for
confirmation; call `grid.confirm()` first if you want one.
