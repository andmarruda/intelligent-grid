# Dados do servidor

Formas de levar linhas de um backend para a grade, além de `setData()`:

| Necessidade | Use |
|---|---|
| Página por página conforme o usuário rola, via HTTP | [modo append](append-mode.md) com `load` e `fetch` |
| Página por página em uma única conexão, com alterações de outros usuários em tempo real | [modo append](append-mode.md#websocket) com `socket` |
| Todas as linhas, em blocos, com progresso | [`loadStream()`](#server-sent-events-carregando-em-blocos) (Server-Sent Events) |
| Alterações que o seu próprio código recebe (polling, um barramento de mensagens) | [`applyServerChanges()`](#applyserverchanges) |

WebSocket e Server-Sent Events são alternativas ao `fetch`, não substitutos. Eles exigem
o sorla-db 1.7.1 ou posterior.

## Server-Sent Events: carregando em blocos

```ts
const stream = grid.loadStream('/api/orders/stream', {
    headers: { Authorization: `Bearer ${token}` },
    onProgress: ({ loaded, total }) => (bar.value = total ? loaded / total : 0)
});
const state = await stream.done;   // { loaded, total, blocks, errors, ... }
stream.close();                    // interrompe antes do fim
```

O servidor envia as linhas em eventos nomeados (o [protocolo de stream do sorla-db](https://github.com/sysborg/sorla-db#server-sent-events-many-rows-in-blocks)):

```
event: meta
data: {"total": 100000}

id: 1
event: rows
data: [{"id": 1, ...}, ... 5000 rows ...]

event: end
data: {}
```

- As linhas aparecem à medida que cada bloco chega; o usuário pode rolar, ordenar e filtrar enquanto carrega. A ordenação
  e os filtros são reaplicados algumas vezes por segundo e mais uma vez no final.
- A barra de status mostra "Loading 20,000 of 100,000 rows…".
- Depois de uma queda de conexão, o cliente se reconecta com `Last-Event-ID`, para que o servidor possa continuar
  a partir do próximo bloco. Uma linha enviada duas vezes atualiza a linha em vez de duplicá-la.
- Eventos `delete` (`[ids]`) removem linhas. Eventos `ops` não são suportados pela grade.
- `replace: false` adiciona às linhas atuais em vez de substituí-las.
- Linhas vindas do stream não são alterações não salvas e não podem ser desfeitas.
- Opções: `transport` (`'fetch'`, padrão, ou `'eventsource'`), `headers`, `method`, `body`,
  `credentials`, `withCredentials`, `retry`, `maxRetries`, `lastEventId`, `onProgress`, `onError`.

Eventos: `streamEnd` (o estado final) e `streamError` (`{ error }`).

Um exemplo do endpoint em Node está em [`scripts/demo-api.ts`](../../scripts/demo-api.ts)
(`/api/orders/stream`): ele espera o `drain` quando o navegador lê mais devagar do que o servidor escreve.

## applyServerChanges

```ts
grid.applyServerChanges({ rows: [{ id: 7, qty: 3 }, { id: 9001, name: 'New', qty: 1 }] });
grid.applyServerChanges({ type: 'delete', ids: [12, 13] });
// → { inserted: ['9001'], updated: ['7'], removed: ['12', '13'] }
```

- Uma linha cujo id já existe é atualizada com os campos que ela traz; as demais são adicionadas.
- Alterações do servidor **não** são alterações não salvas ([rastreamento de alterações](change-tracking.md)) e não podem ser
  desfeitas.
- Um campo que o usuário alterou e não salvou mantém o valor do usuário. Os outros campos dessa linha
  seguem o servidor, e os valores do servidor passam a ser os originais deles, então não são reportados como
  alterações do usuário.
- As colunas calculadas são recalculadas; as linhas novas seguem a ordenação e os filtros locais.
- Emite `serverChange` com o mesmo resultado.

## Experimente

`npm run demo` inicia um backend com 100 000 pedidos guardados em uma coleção do sorla-db no servidor:

| Exemplo | Mostra |
|---|---|
| [fetch-pages.html](../../examples/fetch-pages.html) | páginas via HTTP que são adicionadas à grade; filtros enviados como `where` |
| [websocket.html](../../examples/websocket.html) | páginas via WebSocket, com linhas alteradas por "outro usuário" a cada 3 s |
| [sse-stream.html](../../examples/sse-stream.html) | 100 000 linhas em blocos de 5 000, com progresso |
