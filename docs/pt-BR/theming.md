# Temas

Inclua `dist/intelligent-grid.css` (ou `intelligent-grid/styles.css`). Tudo é controlado por
propriedades personalizadas do CSS em `.ig`, então um tema é só um punhado de variáveis:

```css
.ig.brand {
    --ig-accent: #7c3aed;
    --ig-active: #7c3aed;
    --ig-header-bg: #f3e8ff;
    --ig-selected: #ede9fe;
    --ig-radius: 12px;
    --ig-row-height: 40px;
}
```
```ts
grid.root.classList.add('brand');
```

## Variáveis

| Variável | Usada para |
|---|---|
| `--ig-font` | Pilha de fontes |
| `--ig-bg` / `--ig-fg` / `--ig-muted` | Fundo, texto, texto secundário |
| `--ig-border` | Linhas da grade e bordas |
| `--ig-header-bg` | Fundo do cabeçalho e do rodapé |
| `--ig-row-alt` / `--ig-hover` / `--ig-selected` | Linhas zebradas, hover, linhas selecionadas |
| `--ig-active` | Contorno da célula ativa e borda do editor |
| `--ig-accent` / `--ig-accent-fg` | Botões principais, indicadores de ordenação, filtros ativos |
| `--ig-danger` | Botão de excluir, erros de validação |
| `--ig-error-bg` | Células com erro de fórmula |
| `--ig-formula` | Texto das células que contêm uma fórmula |
| `--ig-negative` | Números negativos |
| `--ig-inserted` / `--ig-updated` / `--ig-changed-bg` | Marcações do [rastreamento de alterações](change-tracking.md) |
| `--ig-radius` | Raio dos cantos |
| `--ig-row-height` | Altura da linha |
| `--ig-shadow` | Sombra dos popovers |
| `--ig-range-bg` | Cor de um intervalo de células selecionado e das células de destino da alça de preenchimento |
| `--ig-find-bg` | Células encontradas pelo localizar |
| `--ig-databar` / `--ig-cf-good` / `--ig-cf-mid` / `--ig-cf-bad` | Cores das barras de dados e dos conjuntos de ícones |
| `--ig-comment` | Marca de comentário no canto |

## Modo escuro

A folha de estilos segue `prefers-color-scheme: dark`. Adicione a classe `ig-light` à raiz
(`grid.root.classList.add('ig-light')`) para manter uma grade clara em sistemas escuros. Para personalizar a paleta
escura, redefina as variáveis dentro do seu próprio bloco `@media (prefers-color-scheme: dark)`.

## Classes de estado

| Classe | Elemento | Quando |
|---|---|---|
| `ig-row`, `ig-selected` | `tr` | todas as linhas / linhas selecionadas |
| `ig-cell`, `ig-type-<type>`, `ig-align-<align>` | `td` | todas as células |
| `ig-active` | `td` | a célula ativa (do teclado) |
| `ig-editing` | `td` | enquanto o editor está aberto |
| `ig-invalid` | `td` | valor rejeitado (o tooltip traz a mensagem) |
| `ig-error` | `td` | o valor é um erro de fórmula |
| `ig-formula` | `td` | fórmula de célula ou de coluna (o tooltip traz a fórmula) |
| `ig-negative` | `td` | número negativo |
| `ig-readonly` | `td` | não editável |
| `ig-row-inserted`, `ig-row-updated` | `tr` | linha inserida / alterada não salva |
| `ig-cell-changed` | `td` | o valor é diferente do original |
| `ig-sortable`, `ig-sorted` | `th` | |
| `ig-footer` | `tfoot tr` | linha de rodapé |
| `ig-row-alt` | `tr` | linhas alternadas (zebra) |
| `ig-in-range`, `ig-range-top` / `-bottom` / `-left` / `-right` | `td` | intervalo de células e suas bordas |
| `ig-fill-handle` | `span` na célula do canto | alça de preenchimento; `ig-fill-target` nas células sendo preenchidas |
| `ig-find-match` | `td` | ocorrências do localizar |
| `ig-has-comment` | `td` | célula com comentário; `ig-comment-tip`, `ig-comment-editor` para o tooltip e o editor |
| `ig-group-row`, `ig-group-level-<n>`, `ig-group-collapsed` | `tr` | [linhas de grupo](grouping.md) |
| `ig-databar`, `ig-cf-icon-good` / `-mid` / `-bad` | `td` / `i` | predefinições de formatação condicional |
| `ig-sparkline-cell`, `ig-sparkline-line` / `-bar` / `-winloss` | `td` / `svg` | sparklines |
| `ig-pinned`, `ig-pinned-left` / `-right`, `ig-pinned-left-edge` / `-right-edge` | `td`, `th` | colunas fixas |
| `ig-wrap` | `td` | texto com quebra de linha |
| `ig-dragging` | `.ig` | enquanto um intervalo ou a alça de preenchimento é arrastado |
| `ig-find` | barra de localizar | |
| `ig-is-loading` | `.ig` | requisição do modo append em andamento |
| `ig-modal-backdrop`, `ig-modal`, `ig-modal-title`, `ig-modal-message`, `ig-modal-actions` | modal de confirmação | |
| `ig-qb`, `ig-qb-group` (`data-join`, `ig-qb-negated`), `ig-qb-rule` (`ig-qb-incomplete`), `ig-qb-json`, `ig-chip-query` | filtro avançado | |

Além das suas próprias: `rowClass`, `column.cellClass`, `column.headerClass` e `className` nas
[formatações condicionais](formulas.md#formatação-condicional).

## Layout

- `height` define a altura máxima da área de rolagem; o cabeçalho (e o rodapé) ficam fixos durante a rolagem.
- As larguras das colunas vêm de `width`, podem ser arrastadas e emitem `columnResize` (salve-as para restaurar depois).
- Abaixo de 600px, a barra de navegação fica empilhada na vertical.
