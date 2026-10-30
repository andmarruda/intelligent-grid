# Opções da grade

```ts
new IntelligentGrid(target: string | HTMLElement, options: GridOptions)
```

`target` é um seletor CSS ou um elemento. O conteúdo dele é substituído pela grade.

| Opção | Tipo | Padrão | Descrição |
|---|---|---|---|
| `columns` | `ColumnDefinition[]` | obrigatório | Veja [Colunas](columns.md) |
| `data` | `object[]` | `[]` | Linhas iniciais (copiadas) |
| `idField` | `string \| null` | `null` | Campo usado como id da linha; caso contrário, o SorlaDB gera um `_id` |
| `sorla` | classe ou instância | `window.sorla` | SorlaDB a ser usado |
| `database` | `string` | automático | Nome do banco de dados do SorlaDB |
| `locale` | `string` | idioma do navegador | Formatação, interpretação de entradas e idioma da interface |
| `labels` | `Record<string, string>` | `{}` | Sobrescreve textos da interface; veja [i18n](i18n.md) |
| `currency` | `string` | da localidade | Moeda ISO padrão das colunas `currency` (`BRL` para pt-BR) |
| `height` | `number \| string` | `480` | Altura máxima da área de scroll (número = px) |
| `editable` | `boolean` | `false` | Valor padrão de `editable` para todas as colunas |
| `cellFormulas` | `boolean` | `true` | Os usuários podem digitar `=...` em células editáveis |
| `names` | `Record<string, unknown>` | `{}` | Constantes nomeadas para fórmulas (`{ TAX: 0.12 }`) |
| `functions` | `Record<string, FormulaFunction>` | `{}` | Funções de fórmula só desta grade |
| `sort` | `{ mode }` | `{ mode: 'modifier' }` | `'modifier'`: Shift/Ctrl+clique adiciona colunas à ordenação; `'toggle'`: todo clique adiciona |
| `initialSort` | `SortEntry[]` | `[]` | por exemplo, `[{ field: 'due', dir: 'asc' }]` |
| `initialFilters` | `FilterModel` | `{}` | Veja [modelo de filtro](sorting-filtering.md#modelo-de-filtro) |
| `initialQuery` | `QueryNode \| null` | `null` | [Filtro avançado](query-builder.md) aplicado ao carregar |
| `selection` | `{ mode, checkbox, selectOnClick } \| false` | `{ mode: 'multiple', checkbox: true, selectOnClick: false }` | Veja [Seleção](selection.md) |
| `navbar` | `NavbarOptions \| false` | busca, filtros, colunas, exportação | Veja [Barra de navegação](navbar.md) |
| `statusBar` | `boolean` | `true` | "x of y rows · n selected" |
| `rowHeight` | `number \| null` | medida | Altura da linha em px; veja [Virtualização](virtualization.md) |
| `overscan` | `number` | `8` | Linhas renderizadas acima e abaixo da viewport |
| `virtualColumns` | `number` | `40` | Acima dessa quantidade de colunas, só as visíveis são renderizadas |
| `undoLimit` | `number` | `100` | Passos de desfazer guardados; veja [desfazer e refazer](spreadsheet.md#desfazer-e-refazer) |
| `find` | `boolean` | `true` | Barra de localizar / substituir / ir para com Ctrl+F, Ctrl+H, Ctrl+G |
| `groupBy` | `string[]` | `[]` | [Agrupa](grouping.md) as linhas por esses campos |
| `groupsCollapsed` | `boolean` | `false` | Os grupos começam recolhidos |
| `comments` | `CellComment[]` | `[]` | [Comentários de célula](spreadsheet.md#comentários) ao carregar |
| `renderChunk` | `number` | | Ignorado (as linhas são virtualizadas) |
| `append` | `AppendOptions \| null` | `null` | Scroll infinito: `{ load }` ou `{ socket }`; veja [Modo append](append-mode.md) |
| `rowClass` | `(row) => string` | | Classe extra por linha |
| `rowFormats` | `ConditionalFormat[]` | `[]` | [Formatos condicionais](formulas.md#formatação-condicional) para linhas inteiras |
| `exportOptions` | `{ filename, sheetName }` | `{ filename: 'export', sheetName: 'Sheet1' }` | Padrões da exportação |
| `confirmDelete` | `boolean` | `true` | Pergunta antes que os botões Delete e Discard changes da barra de navegação ajam |
| `confirm` | `(request) => boolean \| Promise<boolean>` | modal embutido | Substitui o [modal de confirmação](navbar.md#modal-de-confirmação) |
| `changeTracking` | `boolean \| { form, inputName, historyLimit }` | `true` | Veja [Rastreamento de alterações](change-tracking.md) |
| `on` | `Record<string, handler>` | `{}` | Handlers de eventos registrados antes da primeira renderização (captura o `ready`) |

## Modelo de renderização

Sem `append`, todas as linhas ficam na memória (no SorlaDB) e a grade adiciona `renderChunk` linhas por vez ao
DOM conforme você rola, então grandes conjuntos de dados abrem instantaneamente. Rodapés, exportações e
`getRows('filtered')` sempre usam todas as linhas filtradas, não só as renderizadas.

As linhas editadas ficam onde estão, como no Excel. Chame `grid.refresh()` para reaplicar a ordenação e os filtros depois das edições.
