# React, Vue, Svelte and Angular

Intelligent Grid is plain TypeScript with no framework inside, so it runs anywhere. For React, Vue, Svelte
and Angular there are ready-made components, published from
[intelligent-grid-wrappers](https://github.com/andmarruda/intelligent-grid-wrappers):

| Package | Framework | Component |
|---|---|---|
| [`@andmarruda/intelligent-grid-react`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-react) | React 19+ | `<IntelligentGrid />` |
| [`@andmarruda/intelligent-grid-vue`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-vue) | Vue 3.5+ | `<IntelligentGrid />` |
| [`@andmarruda/intelligent-grid-svelte`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-svelte) | Svelte 5+ | `<IntelligentGrid />` |
| [`@andmarruda/intelligent-grid-angular`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-angular) | Angular 20+ | `<intelligent-grid />` |

Each one is a thin layer over the `IntelligentGrid` class: every option, event and method on these pages
works the same way.

## How they behave

All four follow the same rules:

- **`columns`** and **`data`** are reactive by reference. Passing a new array calls `grid.setColumns()` or
  `grid.setData()`; mutating the array in place does nothing. `setData()` resets edits, undo and selection,
  so do not feed the grid's own edits back into `data`: the grid already has them
  ([change tracking](change-tracking.md) collects them for saving).
- **`options`** carries every other [grid option](options.md) (`sorla`, `idField`, `editable`, `locale`,
  `navbar`...). It is read once, when the grid is created; remount the component to apply new options.
- **Events**: every [event](events.md) is forwarded (`onCellChange` in React and Svelte, `@cell-change` in
  Vue, `(cellChange)` or `(gridEvent)` in Angular).
- **The instance** is exposed for the [API](api.md): `undo()`, `exportXLSX()`, `getChanges()`,
  `setFilter()`...
- Unmounting the component calls `grid.destroy()`.

Every package needs the core, SorlaDB and the stylesheet:

```bash
npm install @andmarruda/intelligent-grid sorla-db
```

```js
import '@andmarruda/intelligent-grid/styles.css';
```

## React

```bash
npm install @andmarruda/intelligent-grid-react
```

```tsx
import { useRef } from 'react';
import { IntelligentGrid } from '@andmarruda/intelligent-grid-react';
import type { IntelligentGrid as Grid, ColumnDefinition } from '@andmarruda/intelligent-grid';
import '@andmarruda/intelligent-grid/styles.css';
import sorla from 'sorla-db';

const columns: ColumnDefinition[] = [
    { field: 'product', title: 'Product' },
    { field: 'qty', type: 'integer' },
    { field: 'price', type: 'currency' },
    { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
];
const options = { sorla, idField: 'id', editable: true, height: 480 };

export function Orders({ rows }: { rows: Record<string, unknown>[] }) {
    const grid = useRef<Grid>(null);
    return (
        <>
            <button onClick={() => grid.current?.undo()}>Undo</button>
            <IntelligentGrid ref={grid} columns={columns} data={rows} options={options}
                onCellChange={e => save(e.detail)} />
        </>
    );
}
```

Event props are `on` + the event name (`onReady`, `onSelectionChange`, `onRowClick`...). They can change on
every render without recreating the grid. Keep `columns` and `options` stable (module constants, `useMemo`
or state). The component works under `StrictMode`.

## Vue

```bash
npm install @andmarruda/intelligent-grid-vue
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { IntelligentGrid } from '@andmarruda/intelligent-grid-vue';
import type { ColumnDefinition } from '@andmarruda/intelligent-grid';
import '@andmarruda/intelligent-grid/styles.css';
import sorla from 'sorla-db';

const columns: ColumnDefinition[] = [
    { field: 'product', title: 'Product' },
    { field: 'qty', type: 'integer' },
    { field: 'price', type: 'currency' },
    { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
];
const options = { sorla, idField: 'id', editable: true, height: 480 };
const rows = ref(await fetch('/api/orders').then(r => r.json()));
const table = ref<InstanceType<typeof IntelligentGrid>>();
</script>

<template>
    <button @click="table?.grid?.undo()">Undo</button>
    <IntelligentGrid ref="table" :columns="columns" :data="rows" :options="options"
        @cell-change="e => save(e.detail)" />
</template>
```

Every event is emitted with the `GridEvent` as payload. The instance is exposed as `grid` on the
template ref.

## Svelte

```bash
npm install @andmarruda/intelligent-grid-svelte
```

```svelte
<script lang="ts">
    import { IntelligentGrid } from '@andmarruda/intelligent-grid-svelte';
    import type { IntelligentGrid as Grid, ColumnDefinition } from '@andmarruda/intelligent-grid';
    import '@andmarruda/intelligent-grid/styles.css';
    import sorla from 'sorla-db';

    let { rows } = $props();
    let grid: Grid | null = $state(null);

    const columns: ColumnDefinition[] = [
        { field: 'product', title: 'Product' },
        { field: 'qty', type: 'integer' },
        { field: 'price', type: 'currency' },
        { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
    ];
    const options = { sorla, idField: 'id', editable: true, height: 480 };
</script>

<button onclick={() => grid?.undo()}>Undo</button>
<IntelligentGrid bind:grid {columns} data={rows} {options} onCellChange={e => save(e.detail)} />
```

Events are callback props, as in React. Wrap the component in `{#key}` to recreate it with new `options`.

## Angular

```bash
npm install @andmarruda/intelligent-grid-angular
```

Add `node_modules/@andmarruda/intelligent-grid/dist/intelligent-grid.css` to `styles` in `angular.json`.

```ts
import { Component, signal, viewChild } from '@angular/core';
import { IntelligentGridComponent } from '@andmarruda/intelligent-grid-angular';
import type { GridEvent } from '@andmarruda/intelligent-grid';
import sorla from 'sorla-db';

@Component({
    selector: 'app-orders',
    imports: [IntelligentGridComponent],
    template: `
        <button (click)="table()?.grid?.undo()">Undo</button>
        <intelligent-grid [columns]="columns" [data]="rows()" [options]="options"
            (cellChange)="save($event)" />
    `
})
export class OrdersComponent {
    readonly table = viewChild(IntelligentGridComponent);
    readonly rows = signal<Record<string, unknown>[]>([]);
    readonly columns = [
        { field: 'product', title: 'Product' },
        { field: 'qty', type: 'integer' as const },
        { field: 'price', type: 'currency' as const },
        { field: 'total', type: 'currency' as const, formula: '=[@qty]*[@price]' }
    ];
    readonly options = { sorla, idField: 'id', editable: true, height: 480 };

    save(event: GridEvent) { /* event.detail: { id, field, value, oldValue, row } */ }
}
```

A standalone component, with or without zone.js. The most used events have their own outputs (`ready`,
`cellChange`, `rowChange`, `rowClick`, `rowDblClick`, `selectionChange`, `dataChange`, `changes`); every
event also goes through `(gridEvent)`, so check `event.type`.

## Other frameworks

Anything that gives you a DOM element works with the class directly: create the grid when the element is
mounted and call `destroy()` when it goes away.

```js
const grid = new IntelligentGrid(element, { sorla, columns, data });
// later
grid.destroy();
```

Next: [Getting started](getting-started.md) · [Grid options](options.md) · [Events](events.md)
