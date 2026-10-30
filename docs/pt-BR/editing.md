# Edição e validação

Habilite a edição na grade toda com `editable: true` ou por coluna. `editable` pode ser uma função:

```ts
{ field: 'notes', editable: row => row?.status !== 'done' }
```

Colunas calculadas (`formula`) são somente leitura, a menos que você defina `editable` nelas. Editar uma delas então
cria uma fórmula de célula ou um valor apenas para aquela linha.

## Teclado e mouse

| Ação | Teclas |
|---|---|
| Mover a célula ativa | setas, Tab / Shift+Tab, Ctrl/Cmd+seta até a borda dos dados |
| Começar a editar | duplo clique, Enter, F2 ou simplesmente começar a digitar (substitui o conteúdo, como no Excel) |
| Confirmar | Enter (desce), Shift+Enter (sobe), Tab / Shift+Tab (para os lados), clicar em outro lugar |
| Cancelar | Esc |
| Limpar uma célula ou um intervalo | Delete / Backspace (um passo de desfazer) |
| Nova linha em um editor textarea | Shift+Enter ou Alt+Enter |
| Alternar um booleano | clicar no checkbox |
| Copiar | Ctrl/Cmd+C: o intervalo de células, as linhas selecionadas (separadas por tabulação, como exibidas) ou a célula ativa |
| Colar | Ctrl/Cmd+V: um bloco separado por tabulações a partir do canto superior esquerdo do intervalo; um único valor preenche o intervalo inteiro |
| Desfazer / refazer | Ctrl/Cmd+Z, Ctrl/Cmd+Y ou Ctrl/Cmd+Shift+Z |

Intervalos, a alça de preenchimento, localizar / substituir e o restante dos atalhos estão em
[Recursos de planilha](spreadsheet.md).

## O pipeline de alterações

Toda alteração passa pelas mesmas etapas: digitação, colagem, `setCellValue` e cliques em checkbox, tudo igual.

1. **Fórmula?** Se o texto começa com `=` e a coluna permite fórmulas, ele vira uma [fórmula de célula](formulas.md#fórmulas-de-célula).
2. **Interpretação** (edições e colagens): texto → valor tipado usando o tipo da coluna e o locale, ou `column.parse`.
3. **Validação**: regras de `column.validate`.
4. **`column.beforeChange(detail)`**: retorne `false` para cancelar ou um novo valor para armazenar no lugar.
5. **Evento `beforeCellChange`**: `preventDefault()` cancela; você pode reescrever `event.detail.value`.
6. Armazena no SorlaDB, recalcula as fórmulas dependentes e renderiza de novo as linhas e os rodapés afetados.
7. **`column.onChange(detail)`** e o **evento `cellChange`**.

Um valor que falha nas etapas 2–3 mantém o editor aberto, marca a célula em vermelho com a mensagem como tooltip
e emite `validationError`.

`setCellValue(id, field, value)` chamado pelo código pula a interpretação (passe valores tipados), mas ainda valida
e dispara eventos. Passe `{ source: 'edit' }` para interpretar o texto como se tivesse sido digitado. `updateRow(id, patch)`
grava vários campos diretamente, sem validação e sem eventos `cell*` (ele emite `rowChange`).

## Interpretação

| Tipo | Aceita |
|---|---|
| tipos numéricos | números no formato do locale (`1.234,56` pt-BR, `1,234.56` en-US), símbolos de moeda, `%`, `1.5` em um locale com vírgula |
| `integer` | apenas números inteiros |
| `percent` | `15` e `15%` armazenam `0.15` |
| `date` / `datetime` | ISO, ou `dd/mm/yyyy` (`mm/dd/yyyy` em en-US) com `hh:mm` opcional; datas impossíveis são rejeitadas |
| `boolean` | true/false, 1/0, yes/no, sim/não, x |
| `select` | valor ou rótulo da opção (sem diferenciar maiúsculas e minúsculas) |
| texto vazio | em branco (`null`) |

## Validação

```ts
validate: { required: true, min: 0, max: 100, minLength: 2, maxLength: 40, pattern: '^[A-Z]', message: 'Custom message' }
validate: (value, row, column) => value !== 13 || 'Unlucky number'      // true / undefined = válido, false / string = inválido
validate: [{ required: true }, (value, row) => value <= row.limit || 'Over the limit']
```

`min` / `max` comparam números, ou datas quando recebem strings ISO (`min: '2026-01-01'`). Valores em branco
pulam todas as regras, exceto `required`. As mensagens nativas são traduzidas (veja [i18n](i18n.md)).

## Editores

Nativos: `text`, `number`, `date`, `datetime`, `select`, `checkbox`, `textarea`. O padrão vem
do tipo. Um editor personalizado é um objeto com `create(context)`:

```ts
const ratingEditor: CustomEditor = {
    create({ value, text, column, row, grid, commit, cancel }) {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '1';
        input.max = '5';
        input.value = String(value ?? 3);
        input.className = 'ig-editor';
        return {
            element: input,
            getValue: () => Number(input.value),   // um valor tipado pula a interpretação; uma string é interpretada
            focus: () => input.focus(),
            destroy: () => {}                       // limpeza opcional
        };
    }
};

{ field: 'rating', type: 'integer', editor: ratingEditor }
```

A grade liga Enter/Tab/Esc no `element`. Chame `commit()` / `cancel()` você mesmo em editores com
botões próprios. Uma função simples `(context) => EditorInstance` também funciona.

## Linhas

```ts
const id = grid.addRow({ product: 'New', qty: 1 }, { position: 'start' });  // beforeRowAdd / rowAdd
grid.updateRow(id, { qty: 2, price: 10 });                                  // rowChange
grid.deleteRows(grid.getSelectedIds());                                     // beforeRowDelete / rowDelete
grid.setData(rows);                                                         // substitui tudo (dataChange)
```

A barra de navegação pode mostrar **Add row** (`navbar.add: true` ou uma função que retorna valores padrão) e
**Delete** (exclui as linhas selecionadas depois de um [modal de confirmação](navbar.md#modal-de-confirmação), a menos que `confirmDelete: false`).
