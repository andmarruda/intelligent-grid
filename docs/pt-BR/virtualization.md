# Virtualização, colunas fixas e texto com quebra de linha

Só as linhas (e, quando há muitas colunas, as colunas) visíveis ficam no DOM: cerca de 30 linhas, quer
a grade tenha 10 000 ou 1 000 000. O scroll se mantém a 60 fps com até 100 000 linhas; veja
[Benchmarks](benchmarks.md).

## Linhas

Linhas espaçadoras acima e abaixo da janela visível preservam o tamanho de scroll de todas as linhas. As linhas que continuam
visíveis durante o scroll são reaproveitadas, e um editor que sai da área visível confirma o seu valor (ou é
cancelado quando o valor é inválido).

| Opção | Padrão | |
|---|---|---|
| `rowHeight` | medida | Altura da linha em pixels. Quando não definida, é medida a partir da primeira linha (segue o seu CSS) |
| `overscan` | `8` | Linhas extras renderizadas acima e abaixo da viewport |
| `height` | `480` | Altura da área de scroll |

```ts
grid.scrollToRow(5000);   // posição nas linhas filtradas e ordenadas
```

O `renderChunk` de versões anteriores é ignorado.

## Colunas

Com mais de `virtualColumns` (padrão 40) colunas visíveis, só as colunas na área visível (mais algumas
de cada lado) são renderizadas; células espaçadoras preservam a largura das demais. Defina `virtualColumns: Infinity`
para sempre renderizar todas as colunas.

## Colunas fixas (congeladas)

```ts
columns: [
    { field: 'id', pinned: 'left' },
    { field: 'name', pinned: 'left' },
    ...
    { field: 'total', pinned: 'right' }
]
grid.pinColumn('city', 'left');   // 'left', 'right' ou null; emite columnPin { field, side }
```

As colunas fixas ficam no lugar durante o scroll lateral (com uma sombra na borda interna), mantêm
a sua ordem e nunca são virtualizadas. A linha de cabeçalho e a linha de rodapé são sempre fixas (sticky).

## Texto com quebra de linha e altura da linha

```ts
{ field: 'notes', wrap: true }
```

Células com quebra de linha quebram o texto, e a linha cresce para caber o conteúdo. As linhas são medidas conforme são renderizadas, então o tamanho
de scroll continua exato mesmo quando só algumas linhas são altas.

## Linhas zebradas

Linhas alternadas usam a classe `ig-row-alt` (pela posição na lista, não no DOM), então as listras
ficam no lugar durante o scroll. Estilize-as com `--ig-row-alt`.
