# Arquitetura

```
src/
├── index.ts                 exports públicos
├── types.ts                 tipos públicos
├── core/
│   ├── store.ts             SorlaStore: o único módulo que conversa com o SorlaDB
│   ├── filters.ts           modelo de filtro → consulta do SorlaDB + predicados JS
│   ├── columns.ts           schema de coluna: padrões, formatação, interpretação, validação
│   ├── changes.ts           ChangeTracker: linhas inseridas/alteradas/excluídas e histórico
│   ├── query.ts             modelo do construtor de consultas → consulta do SorlaDB, entrada/saída JSON, descrição
│   └── events.ts            emissor de eventos (eventos "before*" canceláveis)
├── formula/
│   ├── parser.ts            tokenizador + parser de Pratt, coleta de dependências, impressão A1
│   ├── evaluator.ts         avaliação da AST, cache de compilação
│   ├── values.ts            regras de coerção e comparação do Excel, broadcasting de arrays
│   ├── functions.ts         biblioteca e registro de funções
│   ├── numfmt.ts            códigos de formato de número do Excel
│   ├── dates.ts             seriais de data do Excel
│   ├── errors.ts            FormulaError e códigos de erro
│   └── engine.ts            CalcEngine: colunas calculadas, fórmulas de célula, grafo de dependências
├── export/
│   ├── csv.ts               gerador RFC 4180
│   ├── zip.ts               gerador de ZIP sem compressão (stored) + CRC32
│   └── xlsx.ts              gerador de pasta de trabalho SpreadsheetML
├── i18n/labels.ts           textos da interface (en, pt-BR)
└── ui/
    ├── grid.ts              IntelligentGrid: estado, renderização, interação, API pública
    ├── filter-menu.ts       popover do AutoFiltro
    ├── query-builder.ts     painel do filtro avançado
    ├── modal.ts             modal de confirmação
    ├── editors.ts           editores de célula nativos
    └── dom.ts               mini fábrica de elementos (texto só via textContent)
```

## Fluxo de dados

```
setData / addRow / página do append
        │  copia as linhas, codifica valores em branco e datas
        ▼
SorlaStore.insert ──► coleção do SorlaDB (um banco de dados por grade)
        │
CalcEngine.recalculate ──► grava os valores calculados nos documentos
        │
mudança de ordenação / filtro / busca
        ▼
compileFilters ──► { consulta do SorlaDB, predicados residuais }
        ▼
SorlaStore.query ──► collection.find(query) → predicados → ordenação com o comparador do Excel
        ▼
visão (array de cópias das linhas) ──► renderizada em blocos de renderChunk linhas
```

As edições fazem o caminho inverso: editor → `parseInput` → `validateValue` → hooks/eventos →
`SorlaStore.update` → `CalcEngine.recalculate(ids, fields)` → renderiza de novo só as linhas afetadas
(ou todas as linhas renderizadas quando uma referência à coluna inteira mudou) → rodapés.

## Como o SorlaDB é usado

- **Armazenamento**: cada linha é um documento da coleção `rows` em um banco de dados por grade. `_id` é o id da linha.
- **Consultas**: os filtros de coluna e o filtro avançado são compilados para a linguagem de consulta do Sorla
  (`$eq $ne $gt $gte $lt $lte $in $nin`, `$and / $or / $nor` aninhados), combinados com `$and`.
  A comparação de texto usa `$regex` sem diferenciar maiúsculas e minúsculas. Toda subárvore que o SorlaDB consegue expressar roda como um único
  `collection.find()`; só as fórmulas, as funções `test`, a busca global (que compara com o texto
  exibido) e "≠ um dia" em colunas datetime rodam como predicados. Requer sorla-db 1.7.1+.
- **Valores calculados** são armazenados nos documentos, então o `find()` consegue filtrar por eles.
- **Inserções e exclusões** usam `insertMany` / `deleteMany`. Atualizações e ordenação ainda contornam a API, por
  desempenho e pela ordem de classificação do Excel; veja [status do SorlaDB](sorla-db.md#pendências).

## Motor de fórmulas

1. `parse` monta uma AST; `compile` a guarda em cache (2.000 fórmulas, FIFO).
2. `collectDependencies` lista as referências `[@field]` (linha) e `[field]` (coluna).
3. `CalcEngine` monta um grafo de dependências entre os campos de fórmula, ordena-o topologicamente e marca
   os ciclos com `#CIRC!`.
4. `recalculate(ids, fields)` percorre essa ordem: uma coluna é recalculada para as linhas alteradas quando
   depende de um campo alterado via `[@field]`, e para todas as linhas quando depende via `[field]`
   (ou de uma coluna que foi totalmente recalculada).
5. Os resultados são convertidos em valores armazenados (erros como a string do seu código) e gravados no SorlaDB.

Rodapés, formatações condicionais, filtros de fórmula e `grid.evaluate` usam o mesmo avaliador com um conjunto de linhas ad hoc.

## Renderização

DOM puro (`<table>` com cabeçalho e rodapé fixos), sem virtual DOM. As linhas são criadas em blocos durante
a rolagem (um `IntersectionObserver` em um sentinela, mais um listener de scroll). As edições substituem elementos
`<tr>` individuais, e as linhas mantêm a sua posição até o próximo `refresh()`, como no Excel.
Todo texto passa por `textContent`. Só `column.render` com `html: true` grava HTML.
