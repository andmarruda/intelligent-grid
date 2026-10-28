# Number formats

Intelligent Grid understands Excel number format codes. The same code formats the cell on screen,
works in `TEXT()`, and is written into the XLSX file, so the grid and Excel show the same thing.

```ts
{ field: 'amount', type: 'number', format: '#,##0.00;[Red]-#,##0.00' }
{ field: 'due', type: 'date', format: 'dddd, dd mmmm yyyy' }
```
```
=TEXT([@due], "mmm/yy")
```

## Numbers

| Code | 1234.5 (en-US) | 1234.5 (pt-BR) |
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

- `0` shows a digit or zero, `#` a digit if present, `?` behaves like `#`.
- `,` in the integer part groups thousands; trailing `,` divide by 1000.
- `%` multiplies by 100.
- Separators follow the grid locale, like Excel does.
- Text in `"quotes"` or after `\` is literal; `_x` adds a space; `*x` is ignored.
- Colors and conditions in brackets (`[Red]`, `[>100]`) are accepted and ignored on screen (Excel still applies them in the XLSX).

## Sections

`positive;negative;zero;text`. With a negative section the sign is not added automatically:

| Code | 5 | -5 | 0 | "abc" |
|---|---|---|---|---|
| `#,##0;(#,##0);"-";"[" @ "]"` | 5 | (5) | - | [ abc ] |

## Dates and times

Values can be ISO strings, `Date` objects or Excel serials.

| Code | 2026-10-28T14:05:09 (en-US) | pt-BR |
|---|---|---|
| `dd/mm/yyyy` | 28/10/2026 | 28/10/2026 |
| `yyyy-mm-dd` | 2026-10-28 | 2026-10-28 |
| `d/m/yy` | 28/10/26 | 28/10/26 |
| `mmm yyyy` | Oct 2026 | out 2026 |
| `mmmm` | October | outubro |
| `ddd` / `dddd` | Wed / Wednesday | qua / quarta-feira |
| `hh:mm:ss` | 14:05:09 | 14:05:09 |
| `h:mm AM/PM` | 2:05 PM | 2:05 PM |

`m`/`mm` means minutes right after `h`/`hh` or right before `s`, otherwise months (same rule as Excel).
Month and weekday names come from the locale.
