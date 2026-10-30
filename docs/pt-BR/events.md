# Eventos

```ts
const off = grid.on('cellChange', event => { ... });   // retorna uma função para cancelar a inscrição
grid.once('ready', event => { ... });
grid.off('cellChange', handler);                       // ou grid.off('cellChange') para todos
grid.on('*', event => console.log(event.type, event.detail));
new IntelligentGrid('#grid', { on: { ready: e => ..., cellChange: e => ... }, ... });   // captura o "ready"
```

Todo handler recebe:

```ts
interface GridEvent<T> {
    type: string;
    detail: T;
    grid: IntelligentGrid;
    defaultPrevented: boolean;
    preventDefault(): void;
}
```

Os eventos marcados com ✋ são **canceláveis** com `event.preventDefault()`, e o `detail` deles pode ser
modificado antes de a grade usá-lo. Um handler que lança um erro é registrado com `console.error` e não
impede os outros handlers.

## Ciclo de vida e dados

| Evento | Detalhe |
|---|---|
| `ready` | `{}`: primeira renderização concluída (registre-o pela opção `on`) |
| `render` | `{ rows }`: após cada consulta/nova renderização (ordenação, filtro, busca, refresh) |
| `dataChange` | `{ reason: 'setData' }` |
| `destroy` | `{}` |

## Edição

| Evento | Detalhe |
|---|---|
| `beforeCellEdit` ✋ | `{ id, field, value, row, column }`: cancele para manter a célula somente leitura desta vez |
| `cellEditStart` | `{ id, field, value, row, column }` |
| `cellEditCancel` | `{ id, field }`: Esc pressionado |
| `beforeCellChange` ✋ | `{ id, field, value, oldValue, row, column, source, formula? }`: reescreva `detail.value` para armazenar outra coisa |
| `cellChange` | `{ id, field, value, oldValue, row, source, formula? }`: `source` é `'edit'`, `'paste'`, `'fill'` ou `'api'` |
| `validationError` | `{ id, field, value, error, message }`: `error` é a chave da regra (`'min:0'`), `message` o texto traduzido |
| `formulaError` | `{ id, field, formula, error }`: uma fórmula de célula produziu um erro |
| `copy` | `{ text }` |
| `paste` | `{ text, results: [{ id, field, ok, error? }] }` |
| `fill` | `{ direction, count, written, range }`: a [alça de preenchimento](spreadsheet.md#alça-de-preenchimento) ou `fill()` |
| `replace` | `{ text, replacement, replaced }` |
| `undo` / `redo` | `{ label, changes }` |
| `commentChange` | `{ id, field, text, oldText }` |

## Linhas

| Evento | Detalhe |
|---|---|
| `beforeRowAdd` ✋ | `{ row }`: modifique `detail.row` para mudar os valores inseridos |
| `rowAdd` | `{ id, row }` |
| `rowsAdd` | `{ ids }`: de `addRows()` e das importações em modo append (sem `beforeRowAdd` por linha) |
| `rowChange` | `{ id, row, previous }`: de `updateRow()` |
| `beforeRowDelete` ✋ | `{ ids, rows }`: modifique `detail.ids` para excluir menos linhas (roda depois da confirmação da barra de navegação) |
| `rowDelete` | `{ ids, rows }` |

## Interação

| Evento | Detalhe |
|---|---|
| `rowClick` / `rowDblClick` | `{ id, row, event }` |
| `cellClick` | `{ id, field, value, row, event }` |
| `activeCellChange` | `{ id, field }` |
| `rangeChange` | `{ from, to, rows, fields }` ou `null`: o [intervalo de células](spreadsheet.md#intervalos) |
| `selectionChange` | `{ ids, rows }` |
| `sortChange` | `{ sort }` |
| `filterChange` | `{ field, filter, filters }` (`field` é null depois de `setFilters`) |
| `searchChange` | `{ search }` |
| `queryChange` | `{ query, sorlaQuery }`: o [filtro avançado](query-builder.md) mudou |
| `queryBuilderOpen` / `queryBuilderClose` | `{}` |
| `columnResize` | `{ field, width }` |
| `columnVisibilityChange` | `{ field, visible }` |
| `columnPin` | `{ field, side }` |
| `groupChange` | `{ groupBy }` |
| `groupToggle` | `{ key, collapsed }` |

## Rastreamento de alterações

| Evento | Detalhe |
|---|---|
| `changes` | `{ summary: { inserted, updated, deleted, total }, hasChanges }` |
| `changesAccept` / `changesReject` | `{ ids }` (`null` = todas as linhas) |
| `changesDiscarded` | `{ changes }`: uma recarga do modo append descartou alterações não salvas |

Veja [Rastreamento de alterações](change-tracking.md).

## Exportação e modo append

| Evento | Detalhe |
|---|---|
| `beforeExport` ✋ | `{ format: 'csv' \| 'xlsx', options }`: as options podem ser alteradas |
| `export` | `{ format, options }` |
| `import` | `{ rows, fields, skipped, errors, sheet? }`, veja [Importação](import.md) |
| `importError` | `{ error }`: a importação da barra de navegação não conseguiu ler o arquivo |
| `loadStart` | `{ offset, limit, sort, filters, search, query, sorlaQuery }` |
| `loadEnd` | o mesmo, mais `{ rows, hasMore, total }` |
| `loadError` | o mesmo, mais `{ error }` |
| `scrollEnd` | `{}`: rolou até o fim sem mais nada para carregar |
| `serverChange` | `{ inserted, updated, removed }`: de `applyServerChanges`, pushes via WebSocket e blocos SSE |
| `streamEnd` | o estado final do stream `{ loaded, total, blocks, errors, ... }` |
| `streamError` | `{ error }` |

## Hooks de coluna vs eventos

Para lógica por coluna, os hooks de coluna costumam ser mais simples que os eventos:

```ts
{ field: 'status', beforeChange: ({ value, row }) => value === 'done' && !row?.paid ? false : value,
  onChange: ({ id, value }) => api.updateStatus(id, value) }
```

`beforeChange` roda antes do evento `beforeCellChange`, e `onChange` antes do `cellChange`.
