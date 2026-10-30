# Agrupamento e subtotais

```ts
new IntelligentGrid('#grid', {
    groupBy: ['region', 'city'],      // o mais externo primeiro
    columns: [
        { field: 'city' },
        { field: 'region' },
        { field: 'sales', type: 'currency', footer: 'sum' },              // subtotal: soma, como o rodapé
        { field: 'orders', type: 'integer', footer: 'sum', subtotal: 'count' },
        { field: 'note', subtotal: false }
    ],
    ...
});
```

Cada grupo ganha uma linha com o título da coluna, o valor, o número de linhas e um subtotal abaixo
de cada coluna que tiver um. Clique em uma linha de grupo para recolhê-la ou expandi-la.

```
▾ Region: South (3)                    $60.00
    ▾ City: Curitiba (1)               $20.00
        Curitiba   South               $20.00
    ▾ City: Porto Alegre (2)           $40.00
        ...
▸ Region: (blank) (1)                   $1.00
```

## Subtotais

`subtotal` aceita os mesmos valores que [`footer`](formulas.md#rodapés): um atalho (`'sum'`, `'avg'`,
`'count'`, `'counta'`, `'min'`, `'max'`, `'median'`), uma fórmula como `'=SUM([sales])*0.9'` ou uma
função `(rows, column, grid) => value`. Ele é calculado sobre as linhas do grupo. Sem
`subtotal`, é usado o `footer` da coluna; `subtotal: false` não mostra nada. A linha de rodapé continua
totalizando todas as linhas filtradas.

A primeira coluna visível contém o rótulo do grupo, então um subtotal nessa coluna não é exibido.

## Ordem

Os grupos são ordenados pelos seus valores (crescente, vazios por último). Ordenar por um campo agrupado muda a
direção dos seus grupos; ordenar por outros campos ordena as linhas dentro de cada grupo. Os filtros e a
busca são aplicados antes do agrupamento, então as contagens e os subtotais acompanham esses filtros.

Editar um campo agrupado move a linha para o seu novo grupo na hora; editar outros valores atualiza os
subtotais.

## API

```ts
grid.setGroupBy(['region']);      // [] ou null desagrupa
grid.getGroupBy();                // ['region']
grid.getGroups();                 // [{ key, level, field, value, count, collapsed }] na ordem de exibição
grid.toggleGroup(key);            // ou toggleGroup(key, true / false) para abrir / fechar
grid.expandGroups();
grid.collapseGroups();

grid.on('groupChange', e => e.detail.groupBy);
grid.on('groupToggle', e => console.log(e.detail.key, e.detail.collapsed));
```

`groupsCollapsed: true` começa com todos os grupos fechados (grupos que aparecem depois, após um filtro ou
novos dados, também começam fechados). As chaves são strings opacas; pegue-as em `getGroups()`.

## Com outros recursos

- Linhas em grupos recolhidos ficam ocultas, não removidas: `getRows('filtered')`, a exportação, a cópia de um intervalo,
  a busca e a remoção de duplicados continuam incluindo essas linhas. As setas do teclado as pulam; ir até uma delas
  (busca, `goTo`, `scrollToRow`) abre o seu grupo.
- O corpo continua [virtualizado](virtualization.md): 100 000 linhas em 100 grupos são agrupadas em cerca de 40 ms.
- A exportação XLSX grava as linhas sem as linhas de grupo.
