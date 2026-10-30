# Ordenação e filtros

## Ordenação

- Clique em um cabeçalho: crescente → decrescente → sem ordenação.
- **Shift / Ctrl / Cmd + clique** adiciona a coluna à ordenação atual, para você ordenar por várias colunas. O cabeçalho mostra ▲/▼ e, com mais de uma coluna, o número de prioridade.
- `sort: { mode: 'toggle' }` faz com que todo clique seja cumulativo (sem precisar de tecla modificadora).
- O menu de filtro (▾) também tem "Sort ascending / descending".

A ordem segue o Excel: números < texto < booleanos < erros. O texto usa a ordenação do locale (sem diferenciar maiúsculas, minúsculas e acentos, e reconhecendo números, então `item 2` vem antes de `item 10`). **Valores em branco sempre ficam por último**, nas duas direções.

```ts
grid.setSort([{ field: 'city', dir: 'asc' }, { field: 'total', dir: 'desc' }]);
grid.toggleSort('qty', /* cumulativo */ true);
grid.getSort();   // [{ field: 'city', dir: 'asc' }, ...]
grid.setSort([]); // limpa
```

Colunas calculadas são ordenadas como qualquer outra coluna: os valores delas ficam armazenados no SorlaDB.

## O menu de filtro

O botão ▾ abre um popover no estilo do AutoFiltro do Excel:

1. botões de ordenação
2. duas condições unidas por **And / Or** (os operadores dependem do tipo da coluna). Digitar um valor sem
   escolher um operador usa **contains** para texto e **equals** para números e datas
3. uma checklist de valores com busca, contagens, "(Select all)" e "(Blanks)". Como no Excel, ela lista os valores que sobram depois dos filtros das *outras* colunas

Os filtros ativos aparecem como chips na barra de navegação, e o ▾ vira ⧩.

## Modelo de filtro

```ts
interface Filter {
    values?: unknown[];                                   // checklist, '' = em branco
    conditions?: { op: FilterOperator; value?: unknown; value2?: unknown }[];
    join?: 'and' | 'or';                                  // padrão 'and'
    formula?: string;                                     // precisa resultar em TRUE
    test?: (value: unknown, row: RowData) => boolean;     // o seu próprio predicado
}
type FilterModel = Record<string /* field */, Filter>;
```

Todas as partes de um filtro precisam ser atendidas, e todas as colunas filtradas também.

```ts
grid.setFilter('status', { values: ['open', ''] });                                    // open ou em branco
grid.setFilter('total', { conditions: [{ op: 'between', value: 100, value2: 500 }] });
grid.setFilter('name', { join: 'or', conditions: [{ op: 'startsWith', value: 'a' }, { op: 'endsWith', value: 'z' }] });
grid.setFilter('due', { conditions: [{ op: 'lt', value: '2026-12-01' }] });             // ISO ou texto no formato do locale (01/12/2026 em pt-BR)
grid.setFilter('total', { formula: '=[@total] > AVERAGE([total])' });                  // fórmulas enxergam todas as linhas
grid.setFilter('city', { test: value => String(value).length > 8 });

grid.setFilter('status', null);   // remove um
grid.setFilters({ ... });         // substitui todos
grid.clearFilters();              // filtros e busca
grid.getFilters();
```

| Operadores | Aplica-se a |
|---|---|
| `contains` `notContains` `equals` `notEquals` `startsWith` `endsWith` | text, select (sem diferenciar maiúsculas e minúsculas; select compara com o rótulo ou com o valor) |
| `eq` `ne` `gt` `gte` `lt` `lte` `between` | number, integer, currency, percent, date, datetime |
| `eq` | boolean (`value: true/false`) |
| `empty` `notEmpty` | todos os tipos |

Regras que vale a pena conhecer:

- Operadores de intervalo ignoram células em branco (`< 10` não encontra valores em branco); `ne` os mantém.
- Operandos de porcentagem são digitados como exibidos: `15` significa 15%.
- Em colunas `datetime`, um operando de data significa o dia inteiro (`eq '2026-10-28'` encontra qualquer horário daquele dia).

## Busca global

A caixa de busca da barra de navegação (ou `grid.setSearch(text)`) mantém as linhas em que o texto **exibido** de alguma coluna
**visível** contém o termo buscado, ignorando maiúsculas e minúsculas. Ela tem um debounce de 200 ms.

## Como isso roda no SorlaDB

Os filtros são compilados para uma consulta do SorlaDB sempre que a linguagem de consulta do Sorla consegue expressá-los: checklists
viram `$in`, intervalos viram `$gt/$gte/$lt/$lte` mais `$ne: ''` para ignorar valores em branco, valores em branco viram `$eq: ''`, booleanos
e valores de select viram `$eq`, e condições unidas por **Or** viram `$or`. Várias colunas filtradas são
combinadas com `$and`. Operadores de texto viram condições `$regex` sem diferenciar maiúsculas e minúsculas e, em colunas select,
comparam com os rótulos e enviam os valores correspondentes como `$in` / `$nin`. Apenas fórmulas, funções `test`
e a busca global (que compara com o texto exibido) rodam como predicados JavaScript.

Para lógica AND / OR / NOT aninhada entre colunas, use o [filtro avançado](query-builder.md). Veja [arquitetura](architecture.md)
e [status do SorlaDB](sorla-db.md).

No [modo append](append-mode.md) com `serverSide: true`, a ordenação, os filtros e a busca vão para o seu loader.
