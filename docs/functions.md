# Function reference

137 functions (aliases included). Arguments in `[brackets]` are optional. "range" means a column
reference such as `[total]`, an array literal `{1,2,3}` or the result of an array function.
Names follow Excel and behave like it, including the edge cases listed below.

`listFunctions()` returns every registered name, custom ones included.

## Math

| Function | Syntax | Notes |
|---|---|---|
| SUM | `SUM(value1, ...)` | Ranges skip text, booleans and blanks; direct arguments are coerced |
| PRODUCT | `PRODUCT(value1, ...)` | |
| ABS / SIGN / INT | `ABS(n)` | `INT` rounds down (`INT(-1.5) = -2`) |
| TRUNC | `TRUNC(n, [digits])` | Toward zero |
| ROUND | `ROUND(n, [digits])` | Half away from zero (`ROUND(-2.5) = -3`, `ROUND(1.005,2) = 1.01`) |
| ROUNDUP / ROUNDDOWN | `ROUNDUP(n, [digits])` | Away from / toward zero; negative digits round to tens, hundreds… |
| MROUND | `MROUND(n, multiple)` | |
| CEILING / CEILING.MATH | `CEILING(n, [significance])` | |
| FLOOR / FLOOR.MATH | `FLOOR(n, [significance])` | |
| MOD | `MOD(n, divisor)` | Result has the sign of the divisor (`MOD(-3,2) = 1`) |
| POWER / SQRT / EXP | `POWER(n, p)` | `SQRT` of a negative is `#NUM!` |
| LN / LOG / LOG10 | `LOG(n, [base=10])` | |
| PI | `PI()` | |
| RAND / RANDBETWEEN | `RANDBETWEEN(low, high)` | Recomputed on every recalculation |
| SUMPRODUCT | `SUMPRODUCT(range1, [range2], ...)` | Non-numbers count as 0 |
| SUBTOTAL | `SUBTOTAL(fn, range, ...)` | `fn` 1–11 / 101–111: AVERAGE COUNT COUNTA MAX MIN PRODUCT STDEV.S STDEV.P SUM VAR.S VAR.P |

## Statistics

| Function | Syntax | Notes |
|---|---|---|
| AVERAGE | `AVERAGE(value1, ...)` | `#DIV/0!` when there are no numbers |
| MIN / MAX | `MIN(value1, ...)` | 0 when there are no numbers |
| COUNT | `COUNT(value1, ...)` | Numbers in ranges; numeric text and booleans as direct arguments |
| COUNTA | `COUNTA(value1, ...)` | Non-blank values (errors included) |
| COUNTBLANK | `COUNTBLANK(range)` | |
| MEDIAN | `MEDIAN(value1, ...)` | |
| MODE / MODE.SNGL | `MODE(value1, ...)` | `#N/A` when nothing repeats |
| STDEV / STDEV.S, STDEVP / STDEV.P | `STDEV.S(value1, ...)` | Sample / population |
| VAR / VAR.S, VARP / VAR.P | `VAR.S(value1, ...)` | Sample / population |
| LARGE / SMALL | `LARGE(range, k)` | |
| RANK / RANK.EQ | `RANK(n, range, [order=0])` | 0 = descending |
| PERCENTILE / PERCENTILE.INC | `PERCENTILE(range, k)` | Linear interpolation, `k` in 0..1 |
| QUARTILE / QUARTILE.INC | `QUARTILE(range, q)` | `q` 0..4 |

## Conditional aggregation

| Function | Syntax |
|---|---|
| SUMIF | `SUMIF(range, criteria, [sum_range])` |
| SUMIFS | `SUMIFS(sum_range, range1, criteria1, ...)` |
| COUNTIF | `COUNTIF(range, criteria)` |
| COUNTIFS | `COUNTIFS(range1, criteria1, ...)` |
| AVERAGEIF | `AVERAGEIF(range, criteria, [average_range])` |
| AVERAGEIFS | `AVERAGEIFS(average_range, range1, criteria1, ...)` |
| MAXIFS / MINIFS | `MAXIFS(max_range, range1, criteria1, ...)` |

Criteria are Excel criteria: `5`, `">5"`, `"<=2026-12-31"`, `"<>done"`, `"="` (blank), `"<>"`
(not blank), `TRUE`, and text with wildcards: `*` any characters, `?` one character, `~` escapes.
Text matching is case-insensitive.

## Logical

| Function | Syntax | Notes |
|---|---|---|
| IF | `IF(test, [then], [else])` | Only the chosen branch is evaluated |
| IFS | `IFS(test1, value1, test2, value2, ...)` | `#N/A` when nothing matches; use `TRUE` as the last test for a default |
| IFERROR | `IFERROR(value, fallback)` | |
| IFNA | `IFNA(value, fallback)` | Only catches `#N/A` |
| SWITCH | `SWITCH(expr, case1, value1, ..., [default])` | |
| CHOOSE | `CHOOSE(index, value1, value2, ...)` | |
| AND / OR / XOR | `AND(test1, ...)` | Ranges: only booleans and numbers count |
| NOT | `NOT(test)` | |
| TRUE / FALSE | `TRUE()` | Also literals `TRUE` / `FALSE` |

## Information

| Function | Syntax |
|---|---|
| ISBLANK, ISNUMBER, ISTEXT, ISNONTEXT, ISLOGICAL | `ISNUMBER(value)` |
| ISERROR, ISERR, ISNA | `ISERROR(value)`: ISERR excludes `#N/A` |
| ISEVEN, ISODD | `ISEVEN(n)` |
| NA | `NA()` returns `#N/A` |
| N | `N(value)`: number, 1 for TRUE, otherwise 0 |

## Text

| Function | Syntax | Notes |
|---|---|---|
| CONCAT | `CONCAT(value1, ...)` | Accepts ranges |
| CONCATENATE | `CONCATENATE(value1, ...)` | |
| TEXTJOIN | `TEXTJOIN(delimiter, ignore_empty, value1, ...)` | |
| LEFT / RIGHT | `LEFT(text, [count=1])` | |
| MID | `MID(text, start, count)` | 1-based |
| LEN, UPPER, LOWER | `LEN(text)` | |
| PROPER | `PROPER(text)` | Unicode aware (`joão` → `João`) |
| TRIM | `TRIM(text)` | Also collapses inner spaces |
| SUBSTITUTE | `SUBSTITUTE(text, old, new, [instance])` | |
| REPLACE | `REPLACE(text, start, count, new)` | |
| FIND | `FIND(search, text, [start])` | Case-sensitive, `#VALUE!` when missing |
| SEARCH | `SEARCH(search, text, [start])` | Case-insensitive, wildcards |
| REPT | `REPT(text, times)` | |
| EXACT | `EXACT(a, b)` | Case-sensitive comparison |
| CHAR / CODE | `CHAR(n)` | |
| TEXTBEFORE / TEXTAFTER | `TEXTBEFORE(text, delimiter)` | `#N/A` when missing |
| TEXT | `TEXT(value, format)` | [Excel format codes](number-formats.md), locale aware |
| VALUE | `VALUE(text)` | Accepts the grid locale (`"1.234,5"` in pt-BR) |
| NUMBERVALUE | `NUMBERVALUE(text, [decimal], [group])` | |

Numbers turned into text (`"a"&1.5`) use the locale decimal separator, like Excel.

## Date & time

Dates are Excel serials. Cell values in ISO format (`'2026-10-28'`) are converted automatically.
Format results with a `date` column type or `TEXT()`.

| Function | Syntax | Notes |
|---|---|---|
| TODAY / NOW | `TODAY()` | |
| DATE | `DATE(year, month, day)` | Overflow rolls over (`DATE(2026,13,1)` = 2027-01-01) |
| TIME | `TIME(h, m, s)` | Fraction of a day |
| DATEVALUE | `DATEVALUE(text)` | ISO or `dd/mm/yyyy` (`mm/dd/yyyy` in en-US) |
| YEAR, MONTH, DAY, HOUR, MINUTE, SECOND | `YEAR(date)` | |
| WEEKDAY | `WEEKDAY(date, [type=1])` | 1: Sun=1…Sat=7, 2: Mon=1…Sun=7, 3: Mon=0…Sun=6 |
| EDATE | `EDATE(start, months)` | Clamps to the month end (Jan 31 + 1 → Feb 28) |
| EOMONTH | `EOMONTH(start, months)` | |
| DAYS | `DAYS(end, start)` | |
| DATEDIF | `DATEDIF(start, end, unit)` | Units `Y M D YM MD YD` |
| NETWORKDAYS | `NETWORKDAYS(start, end, [holidays])` | Mon–Fri |
| WORKDAY | `WORKDAY(start, days, [holidays])` | |

## Financial

| Function | Syntax |
|---|---|
| PMT | `PMT(rate, nper, pv, [fv=0], [type=0])` |
| FV | `FV(rate, nper, pmt, [pv=0], [type=0])` |
| PV | `PV(rate, nper, pmt, [fv=0], [type=0])` |
| NPV | `NPV(rate, value1, ...)` |
| IRR | `IRR(values, [guess=0.1])`: Newton's method, `#NUM!` if it does not converge |

## Lookup & arrays

| Function | Syntax | Notes |
|---|---|---|
| XLOOKUP | `XLOOKUP(value, lookup_range, return_range, [if_not_found], [match_mode=0], [search_mode=1])` | match_mode 0 exact, -1 exact or next smaller, 1 exact or next larger, 2 wildcard; search_mode -1 searches from the end |
| MATCH | `MATCH(value, range, [type=1])` | 0 exact (wildcards allowed), 1 largest ≤ (sorted asc), -1 smallest ≥ (sorted desc) |
| INDEX | `INDEX(range, position)` | 1-based, `#REF!` out of range |
| ROWS | `ROWS(range)` | Number of items |
| FILTER | `FILTER(range, include, [if_empty])` | `include` is a boolean range |
| UNIQUE | `UNIQUE(range)` | |
| SORT | `SORT(range, , [order=1])` | -1 descending |

Example: look up a value in another column of the same grid:

```
=XLOOKUP([@manager_id], [id], [name], "—")
```

`VLOOKUP`/`HLOOKUP` are not included: grids have no 2-D ranges, use `XLOOKUP` (Excel recommends it too).
