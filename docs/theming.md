# Theming

Include `dist/intelligent-grid.css` (or `intelligent-grid/styles.css`). Everything is driven by
CSS custom properties on `.ig`, so a theme is a handful of variables:

```css
.ig.brand {
    --ig-accent: #7c3aed;
    --ig-active: #7c3aed;
    --ig-header-bg: #f3e8ff;
    --ig-selected: #ede9fe;
    --ig-radius: 12px;
    --ig-row-height: 40px;
}
```
```ts
grid.root.classList.add('brand');
```

## Variables

| Variable | Used for |
|---|---|
| `--ig-font` | Font stack |
| `--ig-bg` / `--ig-fg` / `--ig-muted` | Background, text, secondary text |
| `--ig-border` | Grid lines and borders |
| `--ig-header-bg` | Header and footer background |
| `--ig-row-alt` / `--ig-hover` / `--ig-selected` | Zebra rows, hover, selected rows |
| `--ig-active` | Active cell outline and editor border |
| `--ig-accent` / `--ig-accent-fg` | Primary buttons, sort indicators, active filters |
| `--ig-danger` | Delete button, validation errors |
| `--ig-error-bg` | Formula error cells |
| `--ig-formula` | Text of cells holding a formula |
| `--ig-negative` | Negative numbers |
| `--ig-inserted` / `--ig-updated` / `--ig-changed-bg` | [Change tracking](change-tracking.md) marks |
| `--ig-radius` | Corner radius |
| `--ig-row-height` | Row height |
| `--ig-shadow` | Popover shadow |

## Dark mode

The stylesheet follows `prefers-color-scheme: dark`. Add the `ig-light` class to the root
(`grid.root.classList.add('ig-light')`) to keep a grid light on dark systems. To theme the dark
palette, redefine the variables inside your own `@media (prefers-color-scheme: dark)` block.

## State classes

| Class | Element | When |
|---|---|---|
| `ig-row`, `ig-selected` | `tr` | every row / selected rows |
| `ig-cell`, `ig-type-<type>`, `ig-align-<align>` | `td` | every cell |
| `ig-active` | `td` | the active (keyboard) cell |
| `ig-editing` | `td` | while the editor is open |
| `ig-invalid` | `td` | rejected value (tooltip has the message) |
| `ig-error` | `td` | the value is a formula error |
| `ig-formula` | `td` | cell or column formula (tooltip has the formula) |
| `ig-negative` | `td` | negative number |
| `ig-readonly` | `td` | not editable |
| `ig-row-inserted`, `ig-row-updated` | `tr` | unsaved inserted / changed row |
| `ig-cell-changed` | `td` | value differs from the original |
| `ig-sortable`, `ig-sorted` | `th` | |
| `ig-footer` | `tfoot tr` | footer row |
| `ig-is-loading` | `.ig` | append mode request in flight |
| `ig-modal-backdrop`, `ig-modal`, `ig-modal-title`, `ig-modal-message`, `ig-modal-actions` | confirmation modal | |

Plus your own: `rowClass`, `column.cellClass`, `column.headerClass`, and `className` in
[conditional formats](formulas.md#conditional-formats).

## Layout

- `height` sets the max height of the scroll area; the header (and footer) stick while scrolling.
- Column widths come from `width`, can be dragged, and emit `columnResize` (save them to restore later).
- Below 600px the navbar stacks vertically.
