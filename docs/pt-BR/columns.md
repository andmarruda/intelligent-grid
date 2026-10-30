# Colunas

```ts
const columns: ColumnDefinition[] = [
    { field: 'product', title: 'Product', width: 160 },
    { field: 'price', type: 'currency', currency: 'BRL', footer: 'avg' }
];
```

## Propriedades

| Propriedade | Tipo | Padrão | Descrição |
|---|---|---|---|
| `field` | `string` | obrigatório | Chave na linha. Não pode conter `.` nem `$` |
| `title` | `string` | `field` | Texto do cabeçalho |
| `type` | veja abaixo | `'text'` (`'select'` quando `options` está definido) | Tipo de dado |
| `width` / `minWidth` | `number` | automático / `60` | Pixels. Os usuários podem redimensionar, a menos que `resizable: false` |
| `align` | `'left' \| 'right' \| 'center'` | pelo tipo | Números à direita, booleanos centralizados |
| `visible` | `boolean` | `true` | Colunas ocultas continuam existindo (fórmulas, `exportCSV({ columns: 'all' })`) |
| `sortable` / `filterable` / `resizable` | `boolean` | `true` | |
| `decimals` | `number` | `0` integer, `2` currency | Casas decimais fixas na exibição e no XLSX |
| `currency` | `string` | moeda da grade | Código ISO para colunas `currency` |
| `format` | `string \| (value, row, column) => string` | | [Código de formato do Excel](number-formats.md) ou formatador |
| `options` | `Array<value \| { value, label }>` | | Valores de uma coluna `select` |
| `strict` | `boolean` | `true` | `false` permite que uma coluna select aceite valores fora de `options` |
| `editable` | `boolean \| (row, column) => boolean` | `editable` da grade | Veja [Edição](editing.md) |
| `editor` | nome de um editor nativo ou editor personalizado | pelo tipo | Veja [Edição](editing.md#editores) |
| `allowFormulas` | `boolean` | `cellFormulas` da grade | Aceita entrada `=...` nesta coluna |
| `parse` | `(input, column) => value` | | Substitui a interpretação nativa da entrada (lance um erro para rejeitar) |
| `validate` | regras, função ou um array com ambos | | Veja [Validação](editing.md#validação) |
| `beforeChange` | `(detail) => false \| value` | | Cancela ou reescreve uma alteração |
| `onChange` | `(detail) => void` | | Depois que uma alteração foi armazenada |
| `formula` | `string` | | [Coluna calculada](formulas.md#colunas-calculadas), somente leitura, a menos que `editable` esteja definido |
| `footer` | atalho, fórmula ou função | | Veja [Rodapés](formulas.md#rodapés) |
| `subtotal` | atalho, fórmula, função ou `false` | `footer` | Valor nas [linhas de grupo](grouping.md#subtotais) |
| `conditionalFormats` | `ConditionalFormat[]` | `[]` | Regras, barras de dados, escalas de cor, conjuntos de ícones: veja [Formatação condicional](formulas.md#formatação-condicional) |
| `sparkline` | `true \| { type, color, negativeColor, width, height, min, max }` | | Desenha uma lista de números como um pequeno gráfico, veja [Sparklines](formulas.md#sparklines) |
| `pinned` | `'left' \| 'right' \| null` | `null` | [Coluna fixa](virtualization.md#colunas-fixas-congeladas) |
| `wrap` | `boolean` | `false` | Quebra o texto; a linha cresce para caber |
| `render` | `(value, row, { column, grid, formatted }) => string \| Node` | | Conteúdo personalizado da célula |
| `html` | `boolean` | `false` | Permite que `render` retorne HTML (sanitize você mesmo) |
| `cellClass` | `string \| (value, row, column) => string` | | Classes extras da célula |
| `headerClass` / `tooltip` | `string` | | Classe e title do cabeçalho |

## Tipos

| Tipo | Armazenado como | Exibido (en-US) | Editor | Operadores de filtro |
|---|---|---|---|---|
| `text` | string | como está | text | texto |
| `number` | number | `1,234.5` (até 4 casas decimais, a menos que `decimals`) | text (teclado decimal) | faixa |
| `integer` | number | `1,234` | text, rejeita frações | faixa |
| `currency` | number | `$1,234.50` | text, aceita símbolos | faixa |
| `percent` | fração (`0.15`) | `15%` | text, `15` ou `15%` significam 15% | faixa |
| `date` | `'YYYY-MM-DD'` | `10/28/2026` | seletor de data nativo | faixa |
| `datetime` | `'YYYY-MM-DDTHH:mm'` | `10/28/2026, 02:30 PM` | seletor de data e hora nativo | faixa |
| `boolean` | `true` / `false` | checkbox | checkbox (alterna no lugar) | igual, em branco |
| `select` | valor da opção | rótulo da opção | dropdown | texto |

Operadores de texto: contém, não contém, igual a, diferente de, começa com, termina com, em branco, não está em branco.
Operadores de faixa: =, ≠, >, ≥, <, ≤, entre, em branco, não está em branco.

## Formatação

1. Função `format`: controle total, apenas na exibição.
2. String `format`: um [formato de número do Excel](number-formats.md), por exemplo `'#,##0.00;[Red]-#,##0.00'` ou `'dd/mm/yyyy'`. O mesmo código é gravado no arquivo XLSX.
3. Caso contrário, o padrão do tipo, usando `Intl` para o locale.

```ts
{ field: 'margin', type: 'percent', decimals: 1 },                       // 12.5%
{ field: 'revenue', type: 'number', format: '#,##0,"k"' },               // 1,500k
{ field: 'rating', type: 'integer', format: v => '★'.repeat(v ?? 0) },   // ★★★
```

## Renderização personalizada

```ts
{
    field: 'status',
    render: (value, row, { formatted }) => {
        const badge = document.createElement('span');
        badge.className = `badge badge-${value}`;
        badge.textContent = formatted;
        return badge;
    }
}
```

`render` pode retornar uma string (definida como texto) ou um nó do DOM. Com `html: true`, uma string é usada como
`innerHTML`. Escape você mesmo qualquer coisa fornecida pelo usuário.

## Alterando colunas em tempo de execução

```ts
grid.addColumn({ field: 'margin', type: 'percent', formula: '=[@profit]/[@total]' }, 3);
grid.removeColumn('margin');
grid.setColumnVisible('internal', false);
grid.setColumnFormula('total', '=[@qty]*[@price]*1.1');
grid.setColumns(newDefinitions);   // substitui tudo e recalcula as fórmulas
```
