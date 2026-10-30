# Importação

A grade lê arquivos `.csv`, `.tsv`, `.txt` e `.xlsx` sem nenhuma dependência: CSV com um parser
padrão (RFC 4180), XLSX com um pequeno leitor de zip sobre o `DecompressionStream` do navegador.

```ts
input.addEventListener('change', async () => {
    const result = await grid.importFile(input.files[0]);
    console.log(result);
    // { rows: 120, fields: ['name', 'qty', 'due'], skipped: ['Color'], errors: [...], sheet: 'Sheet1' }
});

grid.importCSV('name;qty\nPen;3');                      // texto
await grid.importXLSX(bytes, { sheet: 'Data' });         // Uint8Array ou ArrayBuffer
grid.importTable([['name', 'qty'], ['Pen', 3]]);         // linhas de células que você já tem
```

Ou deixe os usuários fazerem isso pela barra de navegação:

```ts
navbar: { import: true }                     // botão "Import": substitui as linhas
navbar: { import: { mode: 'append' } }       // ou quaisquer opções de importação
```

O botão pede confirmação quando alterações não salvas seriam perdidas e informa o resultado na
barra de status ("120 row(s) imported, 2 value(s) did not fit and were left blank").

## Opções

| Opção | Padrão | |
|---|---|---|
| `mode` | `'replace'` | `'replace'` funciona como `setData()`; `'append'` adiciona as linhas como um único passo de desfazer |
| `header` | `true` | a primeira linha contém os títulos. `false` preenche as colunas em ordem (pulando as colunas de fórmula) |
| `delimiter` | detectado | `,`, `;` ou tab, a partir da primeira linha (arquivos `.tsv` usam tab) |
| `sheet` | primeira planilha | nome da planilha do `.xlsx` ou índice começando em 0 |
| `createColumns` | quando a grade não tem colunas | adiciona colunas para os títulos que não correspondem a nenhuma, com um tipo inferido |

## Como os valores são lidos

- **Cabeçalhos** correspondem a uma coluna pelo `field` ou pelo `title`, sem diferenciar maiúsculas de minúsculas. Títulos que não correspondem a nada são
  listados em `skipped` (ou viram colunas com `createColumns`). Colunas de fórmula nunca são gravadas:
  elas são recalculadas.
- **Texto** é interpretado como uma entrada digitada na localidade da grade: `1.234,5` é um número em `pt-BR`,
  `31/01/2026` uma data, `yes` um booleano, o rótulo de uma opção o seu valor. Valores que não cabem na
  coluna são importados como vazios e listados em `errors` com o número da linha:

  ```ts
  { line: 3, field: 'qty', value: 'lots', error: 'Enter a valid number' }
  ```
- Células de **XLSX** mantêm o tipo: números, booleanos, texto (compartilhado, inline e rich text) e datas,
  que no Excel são números com formato de data e voltam como strings ISO. Fórmulas voltam como
  o último valor calculado. Células de erro (`#N/A`) viram texto.
- Linhas vazias são puladas. Um byte order mark no início de um arquivo CSV é removido.

O evento `import` é disparado com o mesmo objeto de resultado.

## Leitores independentes

```ts
import { parseDelimited, detectDelimiter, readXlsx } from '@andmarruda/intelligent-grid';

parseDelimited('a,"b,c"\n1,2');        // [['a', 'b,c'], ['1', '2']]
const sheet = await readXlsx(bytes);  // { name, rows: [['Name', 'Qty'], ['Pen', 3]] }
```

Ler `.xlsx` exige `DecompressionStream`: todos os navegadores atuais e o Node 18 ou posterior.
