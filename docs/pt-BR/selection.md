# Seleção

```ts
selection: { mode: 'multiple', checkbox: true, selectOnClick: false }  // padrão
selection: { mode: 'single' }                                         // botões de rádio
selection: false                                                      // o mesmo que { mode: 'none' }
```

| Opção | Padrão | Descrição |
|---|---|---|
| `mode` | `'multiple'` | `'single'`, `'multiple'` ou `'none'` |
| `checkbox` | `true` | Mostra uma coluna de checkbox (rádio no modo single); a caixa do cabeçalho seleciona todas as linhas **filtradas** |
| `selectOnClick` | `false` | `true`: clicar em qualquer célula também seleciona a linha dela. Por padrão, um clique seleciona a célula, e as linhas são selecionadas com o checkbox, com Espaço ou com Ctrl+A |

## Mouse e teclado

| Gesto | Multiple | Single |
|---|---|---|
| Clicar no checkbox | alterna a linha | seleciona esta linha |
| Shift + clique em um checkbox | seleciona as linhas a partir da última clicada | |
| Espaço | alterna a linha ativa; com um [intervalo de células](spreadsheet.md#intervalos), seleciona as linhas dele | seleciona a linha ativa |
| Ctrl/Cmd + A | seleciona todas as linhas filtradas (e todas as células) | |

Com `selectOnClick: true`, clicar em uma célula de dados funciona como clicar no checkbox, e Ctrl/Cmd +
clique alterna. Shift + setas e arrastar selecionam [intervalos de células](spreadsheet.md#intervalos), não linhas.

A seleção é mantida ao ordenar e filtrar (linhas ocultas continuam selecionadas). Excluir linhas as remove da seleção.

## API

```ts
grid.select(['1', '2']);                 // substitui a seleção (o modo multiple a mantém com { append: true })
grid.select(['3'], { append: true });
grid.deselect(['1']);
grid.selectAll();                        // todas as linhas filtradas
grid.clearSelection();
grid.getSelectedIds();                   // ['2', '3']
grid.getSelected();                      // cópias das linhas
grid.getRows('selected');                // o mesmo que getSelected()

grid.on('selectionChange', e => console.log(e.detail.ids, e.detail.rows));
```

Os ids são strings (os valores de `idField` são convertidos com `String()`).

## Ações em lote

```ts
navbar: {
    delete: true,   // botão "Delete", habilitado quando há algo selecionado
    items: [{
        label: 'Mark as paid',
        disabled: grid => grid.getSelectedIds().length === 0,
        onClick: grid => grid.getSelectedIds().forEach(id => grid.updateRow(id, { paid: true }))
    }]
}
```

`exportCSV({ rows: 'selected' })` e `exportXLSX({ rows: 'selected' })` exportam apenas a seleção.
Ctrl+C copia as linhas selecionadas como texto separado por tab (cole direto no Excel), a menos que um intervalo
de mais de uma célula esteja selecionado: nesse caso, o intervalo é copiado.
