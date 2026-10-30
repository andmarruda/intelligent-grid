# Barra de navegação (navbar) e barra de status

A barra de navegação fica acima da grade. Passe `navbar: false` para escondê-la.

```ts
navbar: {
    title: 'Orders',
    search: true,                 // caixa de busca global
    filters: true,                // chips dos filtros ativos + "Clear filters"
    columns: true,                // menu para mostrar/esconder colunas
    export: ['csv', 'xlsx'],      // ou true (ambos) / false
    add: true,                    // "Add row"; ou (grid) => ({ valores padrão })
    delete: true,                 // "Delete" para as linhas selecionadas (precisa de seleção)
    changes: true,                // "N changes" + "Discard changes" enquanto houver alterações não salvas
    query: true,                  // botão "Advanced filter": construtor visual de consultas
    undo: true,                   // botões de desfazer / refazer, quando algo é editável
    import: false,                // botão "Import" para .csv / .tsv / .xlsx, ou opções de importação
    items: [
        {
            label: 'Refresh',
            title: 'Reload from the server',
            position: 'left',            // 'left' | 'right' (padrão)
            className: 'my-button',
            disabled: grid => false,     // boolean ou função, reavaliada a cada renderização da navbar
            onClick: (grid, event) => grid.reload()
        }
    ]
}
```

Padrões: `search`, `filters`, `columns`, `changes`, `query`, `undo` e `export: ['csv', 'xlsx']` ligados; `add`, `delete`, `import` desligados. Veja [Filtro avançado](query-builder.md) e [Importação](import.md).

A barra de navegação é renderizada de novo quando filtros, ordenação, dados ou seleção mudam, então as funções `disabled` ficam sempre atualizadas.
Os botões usam a classe `ig-btn`; botões de perigo, `ig-btn-danger`.

## Modal de confirmação

**Delete** e **Discard changes** pedem confirmação antes de agir, usando um modal embutido na grade. Ele
segue o tema da grade, e o foco fica preso dentro dele; em ações destrutivas, o foco começa em Cancel.
Esc ou um clique fora cancela, e o foco volta para onde estava depois. Desligue a pergunta com `confirmDelete: false`.

Para usar a sua própria interface (Bootstrap, SweetAlert, um design system…), passe `confirm`. Ele recebe a
solicitação e retorna (ou resolve) `true` para prosseguir:

```ts
new IntelligentGrid('#grid', {
    confirm: async ({ action, title, message, confirmLabel, danger }) => {
        const result = await Swal.fire({ title, text: message, icon: danger ? 'warning' : 'question', showCancelButton: true, confirmButtonText: confirmLabel });
        return result.isConfirmed;
    },
    ...
});
```

| Campo da solicitação | Valor |
|---|---|
| `action` | `'delete'`, `'discard'` ou `'import'` (ou um nome seu) |
| `title`, `message` | Textos traduzidos (`deleteTitle` / `confirmDelete`, `discardChanges` / `confirmDiscard`) |
| `confirmLabel`, `cancelLabel` | Textos dos botões |
| `danger` | `true` para ações destrutivas |

O mesmo diálogo está disponível para os seus próprios botões:

```ts
items: [{
    label: 'Archive',
    onClick: async grid => {
        if (await grid.confirm({ action: 'archive', title: 'Archive orders', message: `Archive ${grid.getSelectedIds().length} order(s)?` })) archive(grid.getSelectedIds());
    }
}]
```

## Chips de filtro

Cada coluna filtrada mostra um chip como `City: 2 ✓`, `Total: Between 100–500` ou
`Product: Contains co`. O × remove aquele filtro; "Clear filters" remove todos eles e também a busca.

## Barra de status

`statusBar: true` (padrão) mostra `{shown} of {total} rows · {count} selected` abaixo da grade.
No modo append, `total` é o que o seu loader retornou como `total`. Mude o texto com os [rótulos](i18n.md) `status`
e `selected`.
