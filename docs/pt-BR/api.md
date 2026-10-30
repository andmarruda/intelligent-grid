# Referência da API

Todos os ids são strings. Os valores de "linha" (Row) devolvidos a você são cópias: alterá-los não altera a grade.

## Construção

| Membro | Descrição |
|---|---|
| `new IntelligentGrid(target, options)` | Veja as [opções](options.md) |
| `IntelligentGrid.defineFunction(name, fn, options?)` | Função de fórmula global, veja [funções personalizadas](formulas.md#funções-personalizadas) |
| `grid.destroy()` | Remove o DOM, os listeners e os dados |

## Propriedades

| Propriedade | Descrição |
|---|---|
| `grid.root` | Elemento raiz `.ig` |
| `grid.columns` | Colunas normalizadas (somente leitura; use os métodos de coluna para alterá-las) |
| `grid.visibleColumns` | Colunas visíveis, em ordem |
| `grid.locale` | Localidade (locale) resolvida |
| `grid.selectionMode` | `'single' \| 'multiple' \| 'none'` |
| `grid.store` | O `SorlaStore` (adaptador do SorlaDB), veja a [arquitetura](architecture.md) |
| `grid.calc` | O `CalcEngine` |
| `grid.options` | Opções resolvidas |
| `grid.t(key, params)` | Traduz um rótulo da interface |

## Dados

| Método | Retorna | Descrição |
|---|---|---|
| `setData(rows)` | `void` | Substitui todas as linhas (limpa a seleção e as fórmulas de célula) |
| `getRows(scope = 'all')` | `Row[]` | `'all'` (ordem de inserção), `'filtered'` (como exibidas: filtradas e ordenadas), `'selected'` |
| `getRow(id)` | `Row \| null` | |
| `addRow(row?, { position: 'start' \| 'end' })` | `string \| null` | Novo id; `null` quando `beforeRowAdd` foi cancelado |
| `updateRow(id, patch)` | `boolean` | Grava os campos diretamente (sem parsing/validação), recalcula, emite `rowChange` |
| `addRows(rows)` | `string[]` | Várias linhas no final, uma renderização e um passo de desfazer |
| `deleteRows(ids)` | `string[]` | Ids efetivamente removidos |
| `setCellValue(id, field, value, { source })` | `{ ok, error? }` | Pipeline completo de edição. `source: 'edit'` também interpreta texto |
| `setCellFormula(id, field, formula \| null)` | `{ ok, error? }` | Fórmula de célula; `null` a remove |
| `getCellFormula(id, field)` | `string \| null` | Fórmula da célula ou da coluna |
| `evaluate(formula, id?)` | valor | Sobre as linhas filtradas, ou no contexto da linha `id`. Erros voltam como seu código |
| `refresh()` | `void` | Executa a consulta de novo (filtros, busca, ordenação) e renderiza novamente |
| `scrollToRow(index)` | `void` | Rola até que uma linha das linhas filtradas fique visível |

## Desfazer e refazer

| Método | Retorna | Descrição |
|---|---|---|
| `undo()` / `redo()` | `boolean` | `false` quando não há nada para desfazer / refazer |
| `canUndo()` / `canRedo()` | `boolean` | |
| `batch(fn, label?)` | o resultado de `fn` | As alterações feitas dentro dele formam um único passo de desfazer |
| `clearUndo()` | `void` | |

## Intervalos, preenchimento, localizar, comentários, duplicatas

Veja [Recursos de planilha](spreadsheet.md).

| Método | Retorna | Descrição |
|---|---|---|
| `getActiveCell()` | `{ id, field } \| null` | |
| `getRange()` | `{ from, to, rows, fields } \| null` | |
| `setRange(from, to?)` | `void` | `from` passa a ser a célula ativa |
| `getRangeValues()` | `unknown[][]` | |
| `clearRange()` | `number` | Células limpas |
| `fill(direction, count)` | `number` | Como a alça de preenchimento |
| `fillCopy('down' \| 'right')` | `number` | Ctrl+D / Ctrl+R |
| `find(text, options?)` | `{ id, field }[]` | Ocorrências na ordem de exibição |
| `replace(text, replacement, options?)` | `number` | Células alteradas |
| `goTo(row, field?)` | `boolean` | Número da linha (começando em 1) ou texto como `'120 Price'` |
| `openFind(mode?)` / `closeFind()` | `void` | `'find'`, `'replace'` ou `'goto'` |
| `highlightCells(cells)` | `void` | Marca células como ocorrências de busca |
| `indexOfCell(cell)` | `number` | Posição na ordem de leitura, -1 quando não está visível |
| `focus()` | `void` | Leva o foco do teclado para a grade |
| `getComment(id, field)` / `setComment(id, field, text \| null)` | | |
| `getComments()` | `CellComment[]` | |
| `editComment(id, field)` | `void` | Abre o editor de comentários |
| `findDuplicates(options?)` / `removeDuplicates(options?)` | `string[]` | Ids duplicados / ids removidos |

## Agrupamento

Veja [Agrupamento e subtotais](grouping.md).

| Método | Descrição |
|---|---|
| `setGroupBy(fields \| null)` / `getGroupBy()` | |
| `getGroups()` | `{ key, level, field, value, count, collapsed }[]` |
| `toggleGroup(key, open?)` | |
| `expandGroups()` / `collapseGroups()` | |

## Importação

Veja [Importação](import.md).

| Método | Retorna |
|---|---|
| `importFile(file, options?)` | `Promise<ImportResult>` |
| `importCSV(text, options?)` | `ImportResult` |
| `importXLSX(bytes, options?)` | `Promise<ImportResult>` |
| `importTable(rows, options?)` | `ImportResult` |

## Rastreamento de alterações

| Método | Retorna | Descrição |
|---|---|---|
| `getChanges()` | `ChangeSet` | Alterações líquidas `{ inserted, updated, deleted }`, veja [Rastreamento de alterações](change-tracking.md) |
| `getChangesJSON(space?)` | `string` | O mesmo, em JSON |
| `getChangeSummary()` | `{ inserted, updated, deleted, total }` | Contagens |
| `hasChanges()` | `boolean` | |
| `getHistory()` | `HistoryEntry[]` | Todas as operações desde o último accept |
| `acceptChanges(ids?)` | `void` | Os valores atuais passam a ser os originais |
| `rejectChanges(ids?)` | `void` | Restaura os valores/linhas originais |
| `bindForm(form, name = 'changes')` | `HTMLInputElement` | Input oculto com o JSON, sempre atualizado |

## Ordenação, filtros, busca

| Método | Descrição |
|---|---|
| `getSort()` / `setSort(sort)` | `[{ field, dir }]`, `[]` limpa |
| `toggleSort(field, additive?)` | Comportamento do clique no cabeçalho |
| `getFilters()` | Modelo de filtros atual |
| `setFilter(field, filter \| null)` | Uma coluna |
| `setFilters(model)` | Substitui todos os filtros |
| `clearFilters()` | Filtros de coluna, busca e o filtro avançado |
| `setSearch(text)` | Busca global |
| `getQuery()` / `setQuery(node \| null)` | Modelo do [filtro avançado](query-builder.md) |
| `toSorlaQuery()` / `fromSorlaQuery(json)` | O filtro avançado como JSON do SorlaDB / MongoDB, e o caminho inverso |
| `toggleQueryBuilder(open?)` | Abre / fecha o painel do construtor de consultas |

## Seleção

| Método | Descrição |
|---|---|
| `select(ids, { append })` | |
| `deselect(ids)` | |
| `selectAll()` | Todas as linhas filtradas (modo múltiplo) |
| `clearSelection()` | |
| `getSelected()` / `getSelectedIds()` | |

## Colunas

| Método | Descrição |
|---|---|
| `getColumn(field)` | Coluna normalizada |
| `setColumns(definitions)` | Substitui todas |
| `addColumn(definition, index?)` / `removeColumn(field)` | |
| `setColumnVisible(field, visible)` | |
| `setColumnFormula(field, formula \| null)` | Altera uma coluna calculada |
| `pinColumn(field, 'left' \| 'right' \| null)` | [Congela](virtualization.md#colunas-fixas-congeladas) uma coluna |
| `registerFunction(name, fn, options?)` | Função de fórmula para esta grade |

## Edição

| Método | Descrição |
|---|---|
| `startEdit(id, field, initialText?)` | Abre o editor; `false` se não for editável ou se for cancelado |

## Diálogos

| Método | Retorna | Descrição |
|---|---|---|
| `confirm({ action, message, title?, confirmLabel?, cancelLabel?, danger? })` | `Promise<boolean>` | Modal de confirmação embutido (ou a opção `confirm`), veja [Barra de navegação](navbar.md#modal-de-confirmação) |

## Exportação

| Método | Retorna |
|---|---|
| `exportCSV(options?)` | `string \| null` (`null` quando `beforeExport` foi cancelado) |
| `exportXLSX(options?)` | `Uint8Array \| null` |

Veja [Exportação](export.md) para as opções.

## Modo append e dados do servidor

| Método | Descrição |
|---|---|
| `applyServerChanges({ rows?, ids?, type? }, { refresh? })` | Linhas e exclusões vindas do servidor: não são alterações não salvas e não podem ser desfeitas, veja [Dados do servidor](server-data.md) |
| `loadStream(url, options?)` | Linhas de um endpoint de Server-Sent Events, em blocos; retorna `{ done, state, close() }` |
| `loadMore()` | `Promise<void>`: próxima página (não faz nada enquanto está carregando ou quando `hasMore` é false) |
| `reload()` | Limpa e carrega a partir do offset 0 (`refresh()` sem append) |

## Eventos

`on(type, handler)` (retorna `off`), `once`, `off`, `emit`. Veja [Eventos](events.md).

## Exports independentes

```ts
import {
    IntelligentGrid,                       // também é o export default
    SorlaStore, compareCells,              // adaptador do SorlaDB
    ChangeTracker,                         // rastreamento de alterações
    compileFilters, operatorsFor,          // modelo de filtros → consulta do SorlaDB
    compileQuery, toSorlaQuery, fromSorlaQuery, describeQuery, normalizeQuery,   // modelo do construtor de consultas
    TYPES, formatCell, parseInput, validateValue, excelFormatCode,
    CalcEngine, compile, evaluate, isFormula, parse, toExcelFormula, collectDependencies,
    defineFunction, defineLazyFunction, listFunctions, formatValue,
    FormulaError, ERRORS,
    toCSV, toXLSX, zip,
    parseDelimited, detectDelimiter, readXlsx,                       // importação
    UndoStack, fillSeries, fillSeriesBackward,                       // utilitários de planilha
    columnStats, scaleColor, iconFor, ICON_SETS, sparkline, sparklineValues,
    RowLayout, columnWindow                                          // cálculos da virtualização
} from '@andmarruda/intelligent-grid';
```
