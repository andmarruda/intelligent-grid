# Formatos numéricos

O Intelligent Grid entende os códigos de formato numérico do Excel. O mesmo código formata a célula na tela,
funciona em `TEXT()` e é gravado no arquivo XLSX, então a grade e o Excel mostram a mesma coisa.

```ts
{ field: 'amount', type: 'number', format: '#,##0.00;[Red]-#,##0.00' }
{ field: 'due', type: 'date', format: 'dddd, dd mmmm yyyy' }
```
```
=TEXT([@due], "mmm/yy")
```

## Números

| Código | 1234.5 (en-US) | 1234.5 (pt-BR) |
|---|---|---|
| `0` | 1235 | 1235 |
| `0.00` | 1234.50 | 1234,50 |
| `#,##0` | 1,235 | 1.235 |
| `#,##0.00` | 1,234.50 | 1.234,50 |
| `#,##0.##` | 1,234.5 | 1.234,5 |
| `0%` (0.256) | 26% | 26% |
| `0.0%` (0.256) | 25.6% | 25,6% |
| `#,##0,"k"` (1500000) | 1,500k | 1.500k |
| `"R$" #,##0.00` | R$ 1,234.50 | R$ 1.234,50 |
| `[$€-407] #,##0.00` | € 1,234.50 | € 1.234,50 |
| `#,##0;(#,##0)` (-5) | (5) | (5) |

- `0` mostra um dígito ou zero, `#` mostra um dígito se houver, `?` se comporta como `#`.
- `,` na parte inteira agrupa os milhares; `,` no final dividem por 1000.
- `%` multiplica por 100.
- Os separadores seguem a localidade (locale) da grade, assim como o Excel faz.
- Texto entre `"quotes"` ou depois de `\` é literal; `_x` adiciona um espaço; `*x` é ignorado.
- Cores e condições entre colchetes (`[Red]`, `[>100]`) são aceitas e ignoradas na tela (o Excel continua aplicando-as no XLSX).

## Seções

`positive;negative;zero;text`. Com uma seção para negativos, o sinal não é adicionado automaticamente:

| Código | 5 | -5 | 0 | "abc" |
|---|---|---|---|---|
| `#,##0;(#,##0);"-";"[" @ "]"` | 5 | (5) | - | [ abc ] |

## Datas e horas

Os valores podem ser strings ISO, objetos `Date` ou números seriais do Excel.

| Código | 2026-10-28T14:05:09 (en-US) | pt-BR |
|---|---|---|
| `dd/mm/yyyy` | 28/10/2026 | 28/10/2026 |
| `yyyy-mm-dd` | 2026-10-28 | 2026-10-28 |
| `d/m/yy` | 28/10/26 | 28/10/26 |
| `mmm yyyy` | Oct 2026 | out 2026 |
| `mmmm` | October | outubro |
| `ddd` / `dddd` | Wed / Wednesday | qua / quarta-feira |
| `hh:mm:ss` | 14:05:09 | 14:05:09 |
| `h:mm AM/PM` | 2:05 PM | 2:05 PM |

`m`/`mm` significa minutos logo depois de `h`/`hh` ou logo antes de `s`; caso contrário, meses (a mesma regra do Excel).
Os nomes dos meses e dos dias da semana vêm da localidade.
