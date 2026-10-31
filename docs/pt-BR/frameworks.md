# React, Vue, Svelte e Angular

O Intelligent Grid é TypeScript puro, sem framework dentro, então funciona em qualquer lugar. Para React,
Vue, Svelte e Angular existem componentes prontos, publicados a partir de
[intelligent-grid-wrappers](https://github.com/andmarruda/intelligent-grid-wrappers):

| Pacote | Framework | Componente |
|---|---|---|
| [`@andmarruda/intelligent-grid-react`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-react) | React 19+ | `<IntelligentGrid />` |
| [`@andmarruda/intelligent-grid-vue`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-vue) | Vue 3.5+ | `<IntelligentGrid />` |
| [`@andmarruda/intelligent-grid-svelte`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-svelte) | Svelte 5+ | `<IntelligentGrid />` |
| [`@andmarruda/intelligent-grid-angular`](https://www.npmjs.com/package/@andmarruda/intelligent-grid-angular) | Angular 20+ | `<intelligent-grid />` |

Cada um é uma camada fina sobre a classe `IntelligentGrid`: todas as opções, eventos e métodos destas
páginas funcionam do mesmo jeito.

## Como se comportam

Os quatro seguem as mesmas regras:

- **`columns`** e **`data`** são reativos por referência. Passar um array novo chama `grid.setColumns()` ou
  `grid.setData()`; alterar o array no lugar não faz nada. O `setData()` zera edições, desfazer e seleção,
  então não devolva as edições da grade para `data`: a grade já as tem (o
  [rastreamento de alterações](change-tracking.md) as reúne para salvar).
- **`options`** leva todas as outras [opções da grade](options.md) (`sorla`, `idField`, `editable`,
  `locale`, `navbar`...). É lido uma vez, quando a grade é criada; remonte o componente para aplicar
  opções novas.
- **Eventos**: todo [evento](events.md) é repassado (`onCellChange` em React e Svelte, `@cell-change` em
  Vue, `(cellChange)` ou `(gridEvent)` em Angular).
- **A instância** fica exposta para a [API](api.md): `undo()`, `exportXLSX()`, `getChanges()`,
  `setFilter()`...
- Desmontar o componente chama `grid.destroy()`.

Todo pacote precisa do core, do SorlaDB e da folha de estilos:

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
    { field: 'product', title: 'Produto' },
    { field: 'qty', title: 'Qtd', type: 'integer' },
    { field: 'price', title: 'Preço', type: 'currency' },
    { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
];
const options = { sorla, idField: 'id', editable: true, height: 480 };

export function Pedidos({ rows }: { rows: Record<string, unknown>[] }) {
    const grid = useRef<Grid>(null);
    return (
        <>
            <button onClick={() => grid.current?.undo()}>Desfazer</button>
            <IntelligentGrid ref={grid} columns={columns} data={rows} options={options}
                onCellChange={e => salvar(e.detail)} />
        </>
    );
}
```

As props de evento são `on` + o nome do evento (`onReady`, `onSelectionChange`, `onRowClick`...). Elas podem
mudar a cada render sem recriar a grade. Mantenha `columns` e `options` estáveis (constantes do módulo,
`useMemo` ou estado). O componente funciona com `StrictMode`.

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
    { field: 'product', title: 'Produto' },
    { field: 'qty', title: 'Qtd', type: 'integer' },
    { field: 'price', title: 'Preço', type: 'currency' },
    { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
];
const options = { sorla, idField: 'id', editable: true, height: 480 };
const rows = ref(await fetch('/api/pedidos').then(r => r.json()));
const tabela = ref<InstanceType<typeof IntelligentGrid>>();
</script>

<template>
    <button @click="tabela?.grid?.undo()">Desfazer</button>
    <IntelligentGrid ref="tabela" :columns="columns" :data="rows" :options="options"
        @cell-change="e => salvar(e.detail)" />
</template>
```

Todo evento é emitido com o `GridEvent` como payload. A instância fica exposta como `grid` na template ref.

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
        { field: 'product', title: 'Produto' },
        { field: 'qty', title: 'Qtd', type: 'integer' },
        { field: 'price', title: 'Preço', type: 'currency' },
        { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
    ];
    const options = { sorla, idField: 'id', editable: true, height: 480 };
</script>

<button onclick={() => grid?.undo()}>Desfazer</button>
<IntelligentGrid bind:grid {columns} data={rows} {options} onCellChange={e => salvar(e.detail)} />
```

Os eventos são props de callback, como no React. Envolva o componente em `{#key}` para recriá-lo com
`options` novas.

## Angular

```bash
npm install @andmarruda/intelligent-grid-angular
```

Adicione `node_modules/@andmarruda/intelligent-grid/dist/intelligent-grid.css` em `styles` no `angular.json`.

```ts
import { Component, signal, viewChild } from '@angular/core';
import { IntelligentGridComponent } from '@andmarruda/intelligent-grid-angular';
import type { GridEvent } from '@andmarruda/intelligent-grid';
import sorla from 'sorla-db';

@Component({
    selector: 'app-pedidos',
    imports: [IntelligentGridComponent],
    template: `
        <button (click)="tabela()?.grid?.undo()">Desfazer</button>
        <intelligent-grid [columns]="columns" [data]="rows()" [options]="options"
            (cellChange)="salvar($event)" />
    `
})
export class PedidosComponent {
    readonly tabela = viewChild(IntelligentGridComponent);
    readonly rows = signal<Record<string, unknown>[]>([]);
    readonly columns = [
        { field: 'product', title: 'Produto' },
        { field: 'qty', title: 'Qtd', type: 'integer' as const },
        { field: 'price', title: 'Preço', type: 'currency' as const },
        { field: 'total', type: 'currency' as const, formula: '=[@qty]*[@price]' }
    ];
    readonly options = { sorla, idField: 'id', editable: true, height: 480 };

    salvar(event: GridEvent) { /* event.detail: { id, field, value, oldValue, row } */ }
}
```

Componente standalone, com ou sem zone.js. Os eventos mais usados têm outputs próprios (`ready`,
`cellChange`, `rowChange`, `rowClick`, `rowDblClick`, `selectionChange`, `dataChange`, `changes`); todos os
eventos também passam por `(gridEvent)`, então confira `event.type`.

## Outros frameworks

Qualquer framework que te dê um elemento do DOM funciona com a classe diretamente: crie a grade quando o
elemento for montado e chame `destroy()` quando ele sair.

```js
const grid = new IntelligentGrid(element, { sorla, columns, data });
// depois
grid.destroy();
```

Próximo: [Primeiros passos](getting-started.md) · [Opções da grade](options.md) · [Eventos](events.md)
