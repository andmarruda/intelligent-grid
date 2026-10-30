# Benchmarks

Medido no Chromium headless (Playwright) com `npm run bench`, em um notebook (Intel Core i9-13980HX,
4 núcleos e 8 GB de RAM dedicados a uma máquina virtual WSL2), viewport de 1280 × 800.

## Cenário

[`bench/index.html`](../../bench/index.html) monta uma grade com 12 colunas: texto, um select, valores inteiros,
de moeda, de porcentagem, de data e booleanos, um `total` calculado (`=[@qty]*[@price]*(1-[@discount])`,
com soma no rodapé) e uma coluna `share` (`=[@total]/SUM([total])`) que depende de todas as linhas. Em seguida, cronometra:

| Etapa | O que faz |
|---|---|
| open | `new IntelligentGrid()` com as linhas, até a primeira renderização |
| filter | filtro numérico `qty > 25` |
| text filter | `name contains "7"` por cima do anterior (um `$regex` sem diferenciar maiúsculas de minúsculas no SorlaDB) |
| clear | remove os dois filtros |
| sort | duas colunas: `city` crescente, `total` decrescente |
| edit + recalc | um `setCellValue` em `qty`, que recalcula `total`, `SUM([total])` e todos os `share` |
| scroll | do topo até o fim, em passos; tempo médio de frame e percentil 95 |

## Resultados

| linhas | open | filter | text filter | clear | sort | edit + recalc | scroll média / p95 do frame | linhas no DOM | heap JS |
|---|---|---|---|---|---|---|---|---|---|
| 10,000 | 85 ms | 33 ms | 33 ms | 33 ms | 34 ms | 33 ms | 16.7 / 17 ms | 27 | 10 MB |
| 100,000 | 447 ms | 58 ms | 49 ms | 33 ms | 250 ms | 200 ms | 16.7 / 16.9 ms | 27 | 96 MB |
| 1,000,000 ¹ | 10.4 s | 1.4 s | — | — | 7.3 s | 3.7 s | 18.3 / 27 ms | 27 | 1.6 GB |

¹ Medido uma única vez, com o sorla-db 1.5 (o find() copiava cada resultado). As medições de 10k e 100k linhas acima usam
o sorla-db 1.7.1, em que a filtragem lê os ids sem fazer cópias: 100 000 linhas abrem em menos da metade do
tempo e com 43% menos memória. Rode `npm run bench -- 1000000` para medir de novo.

Um frame de 16.7 ms equivale a 60 fps: com até 100 000 linhas, o scroll nunca perde um frame.

## Antes e depois

O mesmo cenário, antes do trabalho voltado a grades grandes:

| linhas | etapa | antes | depois | |
|---|---|---|---|---|
| 10,000 | open | 2 519 ms | 85 ms | 30× |
| 10,000 | edit + recalc | 889 ms | 33 ms | 27× |
| 100,000 | open | 237 892 ms | 447 ms | 532× |
| 100,000 | edit + recalc | 84 477 ms | 200 ms | 422× |

Três mudanças fizeram a diferença:

1. **Memoização de fórmulas.** `SUM([total])` dentro de uma fórmula por linha era calculado de novo para cada linha,
   então uma coluna com ele era quadrática. Subexpressões que não dependem da linha agora são calculadas
   uma vez por passada de cálculo (exceto funções voláteis como `RAND()`).
2. **Inserções e leituras no SorlaDB.** `insertMany` relia a coleção para cada documento (corrigido no
   sorla-db 1.5.1), e `find()` copiava cada resultado (a 1.6.0 copia só o que é lido; a grade lê
   apenas os ids). Veja [Status do SorlaDB](sorla-db.md).
3. **Virtualização.** Só as linhas visíveis são renderizadas; veja [Virtualização](virtualization.md).

## Para onde vai o tempo com 1 000 000 de linhas

Esses números são do sorla-db 1.5, quando o `find()` ainda copiava cada documento encontrado; com a 1.7.1,
a maior parte desse tempo e dessa memória desapareceu. A ordenação com o comparador do Excel continua sendo a maior parte. A memória acompanha
as mesmas cópias. Até algumas centenas de milhares de linhas a grade continua interativa; acima disso, use
o [modo append](append-mode.md) com o servidor fazendo a filtragem.

## Tamanho do bundle

`npm run build` mostra o tamanho do bundle para navegador e falha quando ele passa do orçamento (limite):

| Arquivo | Minificado | gzip | Orçamento (gzip) |
|---|---|---|---|
| `intelligent-grid.min.js` | 169 kB | 55 kB | 64 kB |
| `intelligent-grid.min.css` | 14 kB | 3.6 kB | 5 kB |

Tudo está incluído: motor de fórmulas com 137 funções, exportação e importação XLSX, construtor de consultas,
agrupamento, localizar / substituir e o resto. As partes opcionais juntas (leitura / escrita XLSX, construtor
de consultas, barra de busca, sparklines) somam cerca de 7 kB em gzip, pouco demais para valer a pena separá-las em
arquivos carregados à parte. O SorlaDB em si é um arquivo separado de 37 kB.

## Rode você mesmo

```bash
npm run bench                 # 10k e 100k linhas
npm run bench -- 1000000      # qualquer tamanho
```

Os números dependem da máquina; compare execuções feitas na mesma máquina.
