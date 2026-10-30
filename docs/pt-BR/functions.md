# Referência de funções

137 funções (incluindo aliases). Argumentos entre `[colchetes]` são opcionais. "range" significa uma referência
de coluna como `[total]`, um array literal `{1,2,3}` ou o resultado de uma função de array.
Os nomes seguem o Excel e se comportam como nele, incluindo os casos extremos listados abaixo.

`listFunctions()` retorna todos os nomes registrados, incluindo os personalizados.

## Matemática

| Função | Sintaxe | Observações |
|---|---|---|
| SUM | `SUM(value1, ...)` | Intervalos ignoram texto, booleanos e células em branco; argumentos diretos passam por coerção |
| PRODUCT | `PRODUCT(value1, ...)` | |
| ABS / SIGN / INT | `ABS(n)` | `INT` arredonda para baixo (`INT(-1.5) = -2`) |
| TRUNC | `TRUNC(n, [digits])` | Em direção a zero |
| ROUND | `ROUND(n, [digits])` | Metade se afasta de zero (`ROUND(-2.5) = -3`, `ROUND(1.005,2) = 1.01`) |
| ROUNDUP / ROUNDDOWN | `ROUNDUP(n, [digits])` | Afastando-se de / em direção a zero; dígitos negativos arredondam para dezenas, centenas… |
| MROUND | `MROUND(n, multiple)` | |
| CEILING / CEILING.MATH | `CEILING(n, [significance])` | |
| FLOOR / FLOOR.MATH | `FLOOR(n, [significance])` | |
| MOD | `MOD(n, divisor)` | O resultado tem o sinal do divisor (`MOD(-3,2) = 1`) |
| POWER / SQRT / EXP | `POWER(n, p)` | `SQRT` de um número negativo é `#NUM!` |
| LN / LOG / LOG10 | `LOG(n, [base=10])` | |
| PI | `PI()` | |
| RAND / RANDBETWEEN | `RANDBETWEEN(low, high)` | Recalculada a cada recálculo |
| SUMPRODUCT | `SUMPRODUCT(range1, [range2], ...)` | Valores não numéricos contam como 0 |
| SUBTOTAL | `SUBTOTAL(fn, range, ...)` | `fn` 1–11 / 101–111: AVERAGE COUNT COUNTA MAX MIN PRODUCT STDEV.S STDEV.P SUM VAR.S VAR.P |

## Estatística

| Função | Sintaxe | Observações |
|---|---|---|
| AVERAGE | `AVERAGE(value1, ...)` | `#DIV/0!` quando não há números |
| MIN / MAX | `MIN(value1, ...)` | 0 quando não há números |
| COUNT | `COUNT(value1, ...)` | Números em intervalos; texto numérico e booleanos como argumentos diretos |
| COUNTA | `COUNTA(value1, ...)` | Valores não vazios (incluindo erros) |
| COUNTBLANK | `COUNTBLANK(range)` | |
| MEDIAN | `MEDIAN(value1, ...)` | |
| MODE / MODE.SNGL | `MODE(value1, ...)` | `#N/A` quando nada se repete |
| STDEV / STDEV.S, STDEVP / STDEV.P | `STDEV.S(value1, ...)` | Amostra / população |
| VAR / VAR.S, VARP / VAR.P | `VAR.S(value1, ...)` | Amostra / população |
| LARGE / SMALL | `LARGE(range, k)` | |
| RANK / RANK.EQ | `RANK(n, range, [order=0])` | 0 = decrescente |
| PERCENTILE / PERCENTILE.INC | `PERCENTILE(range, k)` | Interpolação linear, `k` em 0..1 |
| QUARTILE / QUARTILE.INC | `QUARTILE(range, q)` | `q` 0..4 |

## Agregação condicional

| Função | Sintaxe |
|---|---|
| SUMIF | `SUMIF(range, criteria, [sum_range])` |
| SUMIFS | `SUMIFS(sum_range, range1, criteria1, ...)` |
| COUNTIF | `COUNTIF(range, criteria)` |
| COUNTIFS | `COUNTIFS(range1, criteria1, ...)` |
| AVERAGEIF | `AVERAGEIF(range, criteria, [average_range])` |
| AVERAGEIFS | `AVERAGEIFS(average_range, range1, criteria1, ...)` |
| MAXIFS / MINIFS | `MAXIFS(max_range, range1, criteria1, ...)` |

Os critérios são critérios do Excel: `5`, `">5"`, `"<=2026-12-31"`, `"<>done"`, `"="` (em branco), `"<>"`
(não em branco), `TRUE`, e texto com curingas: `*` quaisquer caracteres, `?` um caractere, `~` escapa.
A comparação de texto não diferencia maiúsculas de minúsculas.

## Lógicas

| Função | Sintaxe | Observações |
|---|---|---|
| IF | `IF(test, [then], [else])` | Apenas o ramo escolhido é avaliado |
| IFS | `IFS(test1, value1, test2, value2, ...)` | `#N/A` quando nada corresponde; use `TRUE` como último teste para ter um padrão |
| IFERROR | `IFERROR(value, fallback)` | |
| IFNA | `IFNA(value, fallback)` | Captura apenas `#N/A` |
| SWITCH | `SWITCH(expr, case1, value1, ..., [default])` | |
| CHOOSE | `CHOOSE(index, value1, value2, ...)` | |
| AND / OR / XOR | `AND(test1, ...)` | Em intervalos, só booleanos e números contam |
| NOT | `NOT(test)` | |
| TRUE / FALSE | `TRUE()` | Também existem os literais `TRUE` / `FALSE` |

## Informação

| Função | Sintaxe |
|---|---|
| ISBLANK, ISNUMBER, ISTEXT, ISNONTEXT, ISLOGICAL | `ISNUMBER(value)` |
| ISERROR, ISERR, ISNA | `ISERROR(value)`: ISERR exclui `#N/A` |
| ISEVEN, ISODD | `ISEVEN(n)` |
| NA | `NA()` retorna `#N/A` |
| N | `N(value)`: o número, 1 para TRUE, caso contrário 0 |

## Texto

| Função | Sintaxe | Observações |
|---|---|---|
| CONCAT | `CONCAT(value1, ...)` | Aceita intervalos |
| CONCATENATE | `CONCATENATE(value1, ...)` | |
| TEXTJOIN | `TEXTJOIN(delimiter, ignore_empty, value1, ...)` | |
| LEFT / RIGHT | `LEFT(text, [count=1])` | |
| MID | `MID(text, start, count)` | Começa em 1 |
| LEN, UPPER, LOWER | `LEN(text)` | |
| PROPER | `PROPER(text)` | Compatível com Unicode (`joão` → `João`) |
| TRIM | `TRIM(text)` | Também reduz espaços internos repetidos |
| SUBSTITUTE | `SUBSTITUTE(text, old, new, [instance])` | |
| REPLACE | `REPLACE(text, start, count, new)` | |
| FIND | `FIND(search, text, [start])` | Diferencia maiúsculas de minúsculas, `#VALUE!` quando não encontra |
| SEARCH | `SEARCH(search, text, [start])` | Não diferencia maiúsculas de minúsculas, aceita curingas |
| REPT | `REPT(text, times)` | |
| EXACT | `EXACT(a, b)` | Comparação que diferencia maiúsculas de minúsculas |
| CHAR / CODE | `CHAR(n)` | |
| TEXTBEFORE / TEXTAFTER | `TEXTBEFORE(text, delimiter)` | `#N/A` quando não encontra |
| TEXT | `TEXT(value, format)` | [Códigos de formato do Excel](number-formats.md), respeita a localidade |
| VALUE | `VALUE(text)` | Aceita a localidade da grade (`"1.234,5"` em pt-BR) |
| NUMBERVALUE | `NUMBERVALUE(text, [decimal], [group])` | |

Números convertidos em texto (`"a"&1.5`) usam o separador decimal da localidade, como no Excel.

## Data e hora

As datas são seriais do Excel. Valores de células em formato ISO (`'2026-10-28'`) são convertidos automaticamente.
Formate os resultados com o tipo de coluna `date` ou com `TEXT()`.

| Função | Sintaxe | Observações |
|---|---|---|
| TODAY / NOW | `TODAY()` | |
| DATE | `DATE(year, month, day)` | Valores excedentes passam para o período seguinte (`DATE(2026,13,1)` = 2027-01-01) |
| TIME | `TIME(h, m, s)` | Fração de um dia |
| DATEVALUE | `DATEVALUE(text)` | ISO ou `dd/mm/yyyy` (`mm/dd/yyyy` em en-US) |
| YEAR, MONTH, DAY, HOUR, MINUTE, SECOND | `YEAR(date)` | |
| WEEKDAY | `WEEKDAY(date, [type=1])` | 1: Dom=1…Sáb=7, 2: Seg=1…Dom=7, 3: Seg=0…Dom=6 |
| EDATE | `EDATE(start, months)` | Limita ao fim do mês (31 de jan + 1 → 28 de fev) |
| EOMONTH | `EOMONTH(start, months)` | |
| DAYS | `DAYS(end, start)` | |
| DATEDIF | `DATEDIF(start, end, unit)` | Unidades `Y M D YM MD YD` |
| NETWORKDAYS | `NETWORKDAYS(start, end, [holidays])` | Seg–Sex |
| WORKDAY | `WORKDAY(start, days, [holidays])` | |

## Financeiras

| Função | Sintaxe |
|---|---|
| PMT | `PMT(rate, nper, pv, [fv=0], [type=0])` |
| FV | `FV(rate, nper, pmt, [pv=0], [type=0])` |
| PV | `PV(rate, nper, pmt, [fv=0], [type=0])` |
| NPV | `NPV(rate, value1, ...)` |
| IRR | `IRR(values, [guess=0.1])`: método de Newton, `#NUM!` se não convergir |

## Busca e arrays

| Função | Sintaxe | Observações |
|---|---|---|
| XLOOKUP | `XLOOKUP(value, lookup_range, return_range, [if_not_found], [match_mode=0], [search_mode=1])` | match_mode 0 exato, -1 exato ou o próximo menor, 1 exato ou o próximo maior, 2 curinga; search_mode -1 busca a partir do fim |
| MATCH | `MATCH(value, range, [type=1])` | 0 exato (curingas permitidos), 1 o maior ≤ (ordenado de forma crescente), -1 o menor ≥ (ordenado de forma decrescente) |
| INDEX | `INDEX(range, position)` | Começa em 1, `#REF!` fora do intervalo |
| ROWS | `ROWS(range)` | Quantidade de itens |
| FILTER | `FILTER(range, include, [if_empty])` | `include` é um intervalo de booleanos |
| UNIQUE | `UNIQUE(range)` | |
| SORT | `SORT(range, , [order=1])` | -1 decrescente |

Exemplo: buscar um valor em outra coluna da mesma grade:

```
=XLOOKUP([@manager_id], [id], [name], "—")
```

`VLOOKUP`/`HLOOKUP` não estão incluídas: as grades não têm intervalos 2-D, então use `XLOOKUP` (o próprio Excel também a recomenda).
