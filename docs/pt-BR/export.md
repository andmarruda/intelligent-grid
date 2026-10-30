# Exportação

As duas exportações baixam um arquivo por padrão e também retornam o conteúdo.

```ts
grid.exportCSV();                                              // linhas filtradas, colunas visíveis
grid.exportCSV({ rows: 'selected', filename: 'selection' });
const csv = grid.exportCSV({ download: false });               // só a string
grid.exportXLSX({ rows: 'all', columns: 'all', sheetName: 'Orders' });
const bytes = grid.exportXLSX({ download: false });            // Uint8Array
```

## Opções comuns

| Opção | Padrão | Valores |
|---|---|---|
| `rows` | `'filtered'` | `'filtered'` (filtros e ordenação atuais), `'all'`, `'selected'` |
| `columns` | `'visible'` | `'visible'`, `'all'` ou um array de campos |
| `filename` | `exportOptions.filename` (`'export'`) | sem extensão |
| `download` | `true` | `false` apenas retorna o conteúdo |

## CSV

| Opção | Padrão | Descrição |
|---|---|---|
| `delimiter` | `;` em localidades com vírgula decimal (pt-BR), `,` nas demais | O que o Excel espera ao abrir o arquivo naquela localidade (locale) |
| `decimal` | o separador decimal da localidade quando o delimitador é `;` | Separador decimal dos números |
| `formatted` | `false` | Grava o texto exibido (`R$ 1.234,50`) em vez dos valores brutos |
| `bom` | `true` | BOM UTF-8 para o Excel detectar a codificação |
| `header` | `true` | Títulos das colunas na primeira linha |
| `sanitize` | `true` | Prefixa com `'` o texto que começa com `= + - @` (bloqueia injeção de fórmulas em CSV) |

Valores brutos: números como números, booleanos como `TRUE`/`FALSE`, datas em ISO, erros de fórmula como o seu código.
As aspas seguem a RFC 4180, com quebras de linha `\r\n`.

## XLSX

Uma pasta de trabalho Office Open XML de verdade, gerada sem dependências, que abre no Excel, no LibreOffice e no Google Sheets.

| Opção | Padrão | Descrição |
|---|---|---|
| `formulas` | `true` | Grava colunas calculadas, fórmulas de células e rodapés como fórmulas do Excel (com os valores em cache) |
| `footer` | `true` | Adiciona a linha de rodapé |
| `sheetName` | `exportOptions.sheetName` | No máximo 31 caracteres; caracteres inválidos são substituídos |

O que vai para o arquivo:

- **células tipadas**: números, booleanos, erros (`#DIV/0!`…), texto e datas como números seriais do Excel
- **formatos numéricos** por coluna: o código `format` da coluna, ou o padrão do tipo (`#,##0`, `0.00%`, `"R$" #,##0.00`, `dd/mm/yyyy`, …)
- uma **linha de cabeçalho** em negrito e sombreada, **congelada** abaixo do cabeçalho, com **AutoFiltro** ativado
- **larguras das colunas** vindas da grade
- **fórmulas** convertidas de referências estruturadas para A1:

| Fórmula da grade | Na planilha (linha 2) |
|---|---|
| `=[@qty]*[@price]` | `=B2*C2` |
| `=[@total]/SUM([total])` | `=D2/SUM(D$2:D$501)` |
| rodapé `sum` em `total` | `=SUM(D$2:D$501)` |

Uma fórmula que referencia uma coluna que você não exportou, ou uma constante nomeada, é gravada apenas como valor.
A pasta de trabalho pede ao Excel que recalcule ao abrir.

## beforeExport

```ts
grid.on('beforeExport', event => {
    if (event.detail.format === 'xlsx') event.detail.options.sheetName = `Orders ${new Date().toISOString().slice(0, 10)}`;
    if (!user.canExport) event.preventDefault();
});
grid.on('export', event => analytics.track('export', event.detail.format));
```

## Sem uma grade

Os geradores também são exportados:

```ts
import { toCSV, toXLSX, zip } from 'intelligent-grid';

const csv = toCSV(rows, [{ field: 'name', title: 'Name' }], { delimiter: ';' });
```
