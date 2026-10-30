# Modo append (scroll infinito)

O modo append carrega as linhas página por página da sua API conforme o usuário rola. As linhas já carregadas permanecem:
rolar de volta para cima não as solicita de novo, e as edições feitas nelas são mantidas enquanto chegam mais páginas.

As páginas podem vir via `fetch` (abaixo) ou via um [WebSocket](#websocket) que também transporta as alterações
enviadas pelo servidor. Para carregar tudo de uma vez em blocos em vez de paginar, veja
[Dados do servidor](server-data.md#server-sent-events-carregando-em-blocos).

```ts
const grid = new IntelligentGrid('#customers', {
    idField: 'id',
    columns,
    append: {
        pageSize: 100,          // linhas por requisição (padrão 100)
        threshold: 200,         // px a partir do fim que disparam a próxima página (padrão 200)
        serverSide: true,       // padrão true
        load: async ({ offset, limit, sort, where, search }) => {
            const query = new URLSearchParams({ offset, limit, sort: JSON.stringify(sort), where: JSON.stringify(where), search });
            const response = await fetch(`/api/customers?${query}`);
            return response.json();   // { rows, hasMore, total }
        }
    }
});
```

`load` recebe:

| Parâmetro | |
|---|---|
| `offset`, `limit` | a página |
| `sort` | `[{ field, dir }]` |
| `where` | os filtros de coluna e o filtro avançado juntos, como uma única consulta `find()` do SorlaDB / MongoDB |
| `search` | o texto da caixa de busca |
| `filters`, `query`, `sorlaQuery` | as mesmas partes separadas: o [modelo de filtro](sorting-filtering.md#modelo-de-filtro) da grade, o modelo do [filtro avançado](query-builder.md) e o JSON dele |

`where` é o mais fácil de usar no servidor: execute-o como está com o sorla-db ou o MongoDB
(`collection.find(where)`). Condições de texto são `$regex` sem diferenciar maiúsculas e minúsculas; valores em branco são `''`. Filtros
de fórmula e a busca não podem ser expressos nele e ficam de fora.

`load` resolve `{ rows, hasMore?, total? }` ou apenas um array de linhas:

- `hasMore` tem como padrão `rows.length >= pageSize`
- `total` alimenta a barra de status ("100 of 5000 rows")

## serverSide: true (padrão)

Ordenação, filtros, busca e o [filtro avançado](query-builder.md) (o modelo `query` e o JSON
`sorlaQuery`) são **enviados para o `load`** e não são aplicados localmente. Mudar qualquer um deles
limpa as linhas carregadas e recomeça a partir de `offset: 0`. Respostas que chegam depois de uma mudança
são descartadas, então respostas fora de ordem não causam problema. Sua API recebe os mesmos modelos `sort` e `filters`
que a grade usa ([modelo de filtro](sorting-filtering.md#modelo-de-filtro)).

## serverSide: false

`load` é usado apenas para paginar. Ordenação, filtros e busca se aplicam às linhas carregadas até o momento, então o
usuário pode continuar rolando para carregar mais e a visão local é atualizada.

## Comportamento

- As páginas são inseridas na coleção do SorlaDB; as colunas calculadas são computadas para as novas linhas,
  e as colunas que usam referências à coluna inteira (`[total]`) são recalculadas para todas as linhas carregadas.
- Se as primeiras páginas não preenchem a área de rolagem, a grade continua carregando até preencher (ou até `hasMore` ser false).
- Uma promise rejeitada emite `loadError` e interrompe a paginação (`grid.reload()` recomeça do zero).

```ts
await grid.loadMore();   // busca a próxima página agora
await grid.reload();     // limpa e recomeça a partir do offset 0
grid.on('loadStart', e => spinner.show());
grid.on('loadEnd', e => console.log(e.detail.rows, e.detail.hasMore, e.detail.total));
grid.on('scrollEnd', () => console.log('everything is loaded'));
```

## WebSocket

Com o sorla-db 1.7+, uma única conexão pode transportar todas as páginas e as alterações que outros usuários fazem:

```ts
const socket = sorla.connect('wss://api.example.com/orders');   // reconecta, envia pings, enfileira requisições
const grid = new IntelligentGrid('#orders', {
    idField: 'id',
    columns,
    append: { pageSize: 100, socket }   // no lugar de load
});
```

Cada página é uma requisição no socket, `{ type: 'load', id, offset, limit, sort, where, search, ... }`,
e o servidor responde `{ type: 'reply', id, rows, hasMore, total }`. As linhas que o servidor envia pela
mesma conexão (`{ type: 'rows', rows }`, `{ type: 'delete', ids }`) são aplicadas com
[`applyServerChanges`](server-data.md#applyserverchanges): a linha é atualizada no lugar, e os campos que o
usuário está editando mantêm o valor do usuário. Veja o
[protocolo do sorla-db](https://github.com/sysborg/sorla-db#websocket-pages-and-live-changes) e
[`examples/websocket.html`](../../examples/websocket.html).

`socket` aceita qualquer coisa que tenha `load(params)` e `on('push', listener)`, então você pode encapsular a sua própria
conexão do mesmo jeito.

## Sem append

Quando todos os dados estão em memória, a grade é [virtualizada](virtualization.md): só as linhas visíveis são
renderizadas. Use `append` quando os dados vêm de uma API página por página.
