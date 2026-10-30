# Status do SorlaDB

O Intelligent Grid guarda as suas linhas no [SorlaDB](https://github.com/sysborg/sorla-db) e exige o
**sorla-db 1.7.1+**. Construir a grade sobre a 1.0.0 revelou os problemas abaixo. Todos foram corrigidos
no projeto original entre a 1.1.0 e a 1.7.1, e a suíte de testes do sorla-db cresceu de 45 testes (vários dos quais
não verificavam nada) para 227, incluindo 500 consultas aninhadas aleatórias conferidas contra uma implementação
de referência.

## Problemas corrigidos e o que a grade faz agora

| # | Problema na 1.0 | Corrigido em | A grade agora |
|---|---|---|---|
| 1 | `insertOne` lançava erro com valores `null` | 1.2.0 | continua guardando vazios como `''` de propósito: um único valor vazio mantém todas as consultas simples; as linhas entregues a você usam `null` |
| 2 | Nem todas as chaves aninhadas eram validadas | 1.2.0 | confia na validação do SorlaDB |
| 3 | `cursor.sort()` sempre lançava erro (require circular) | 1.2.0 | mantém o seu próprio comparador: o SorlaDB segue a ordem do MongoDB (vazios primeiro), a grade segue a do Excel (vazios por último nas duas direções) |
| 4 | A ordenação não tinha collation | 1.2.0 (opção `collation`) | comparador do Excel com `Intl.Collator` |
| 5 | Só o primeiro operador de um campo era lido dentro de `$or` / `$and` | 1.1.0 | envia condições de filtro unidas por OU como `$or` |
| 6 | Operadores lógicos aninhados lançavam erro | 1.1.0 | o [filtro avançado](query-builder.md) executa consultas aninhadas no `find()` |
| 7 | `findOne()` lançava erro quando nada correspondia | 1.2.0 (retorna `null`) | mantém um mapa id → documento para leituras O(1) |
| 8 | `cursor.toArray()` lançava erro | 1.2.0 | lê os documentos do cursor |
| 9 | Não havia `updateOne` / `deleteMany` | 1.3.0, indexado na 1.6.0 | edita com `updateOne` por `_id`, exclui com `deleteMany` |
| 10 | `insertMany` imprimia no console | 1.2.0 | insere com `insertMany` (atômico, retorna os ids) |
| 11 | O `validationSchema` nunca era guardado | 1.4.0 (validação com JSON Schema) | valida com as suas próprias regras de coluna |
| 12 | A checagem de unicidade do `_id` estava quebrada | 1.2.0 | confia no SorlaDB (ids duplicados lançam erro) |
| 13 | `find()` faz deep clone de cada resultado | 1.6.0 (copia só o que é lido) | filtra com `find(query).ids()`: nenhuma cópia |
| 14 | Não havia `$regex`, `$exists`, `skip`/`limit` nem eventos | 1.3.0 | filtros de texto rodam no `find()` como `$regex` sem diferenciar maiúsculas de minúsculas |
| 15 | Bundle de 1.6 MB com faker; `require('sorla-db')` não exportava nada | 1.2.0 (37 kB, entradas para Node e ESM, tipos) | testa `require('sorla-db')` |
| 16 | O proxy de documentos quebrava com chaves Symbol | 1.2.0 | não é afetada |

## Pendências

Estes são os pontos em que [`src/core/store.ts`](../../src/core/store.ts) ainda contorna a
biblioteca. Cada um está marcado com `SorlaDB:` no código.

1. **Os valores calculados são gravados nos dados do documento.** As edições passam por `updateOne()`, mas
   o recálculo de fórmulas grava um valor por linha de uma coluna (100 000 para uma coluna inteira), e
   copiar cada documento para isso acrescentaria cerca de 2 ms a cada 1 000 linhas. Os valores calculados são derivados
   dos outros campos, então pular o evento de alteração para eles não perde nada de que a grade precise.
2. **O mapa de ids lê os documentos guardados no cursor** (`find({ _id })._data`) para acompanhar o novo
   objeto que o `updateOne()` guarda. Uma leitura pública de "documento guardado por id" eliminaria isso.
3. **Ordem de ordenação.** A grade mantém o seu próprio comparador: erros (`#N/A`) ficam depois dos valores e a
   grade guarda vazios como `''`, que o `sort({ nulls })` não trata como vazio.

## Histórico de versões usado pela grade

| sorla-db | O que a grade ganhou |
|---|---|
| 1.1.0 | consultas aninhadas: o filtro avançado, filtros OU no `find()` |
| 1.2.0 | `insertMany`, `require('sorla-db')`, tipos |
| 1.3.0 | `deleteMany`, `$regex` para filtros de texto, eventos de alteração |
| 1.4.0 | validação de schema (ainda não usada pela grade) |
| 1.5.0 | `bindForm` para formulários sobre a mesma coleção (ainda não usado pela grade) |
| 1.5.1 | inserções lineares: 100 000 linhas abrem em menos de um segundo |
| 1.6.0 | índice de `_id` e `updateOne` para edições, `find().ids()` para filtros sem cópias, o cliente WebSocket por trás de `append.socket` |
| 1.7.0 | consultas em tempo real com `watch()` (ainda não usado pela grade) |
| 1.7.1 | `sorla.stream({ apply })` por trás de `loadStream()`, atualizações mais rápidas |
