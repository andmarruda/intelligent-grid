# Formulas

The formula engine follows Excel: same operators and precedence, same coercion rules, same error
values, 137 functions. It works on **table structured references** instead of A1 addresses,
because grid rows move when you sort or filter.

## References

| Reference | Meaning | Excel equivalent |
|---|---|---|
| `[@price]` | value of `price` in the current row | `[@price]` |
| `[@[unit price]]` | same, for fields with spaces or symbols | `[@[unit price]]` |
| `[price]` | every value of the column (a range) | `Table1[price]` |
| `TAX` | a named constant from the `names` option | a defined name |

References use the column `field` (not the title). Unknown columns give `#REF!`, unknown names or
functions give `#NAME?`.

## Language

| | |
|---|---|
| Arithmetic | `+ - * / ^` and postfix `%` (`50%` = 0.5) |
| Text | `&` concatenates |
| Comparison | `= <> < <= > >=` (text is case-insensitive) |
| Precedence | negation > `%` > `^` > `* /` > `+ -` > `&` > comparisons. So `-2^2 = 4` and `2^3^2 = 64`, like Excel |
| Literals | `12`, `1.5`, `1e3`, `"text"` (`""` escapes a quote), `TRUE`, `FALSE`, `#N/A`, arrays `{1,2,3}` |
| Separators | `,` or `;` between arguments (`;` is what pt-BR Excel uses). Decimals always use `.` |
| Empty arguments | `IF(A,,B)`: the empty argument is blank |

**Coercion**: blank = `0` / `""` / `FALSE`; numeric text works in arithmetic (`"3"+1 = 4`); dates are
serial numbers (days since 1899-12-30), so `[@due]-[@start]` is a number of days and `[@due]+30`
is a date. ISO strings in cells are read as dates. Booleans are 1/0 in arithmetic.

**Array math** (Excel 365 style): operators work element by element on ranges, so these work:

```
=SUM([qty]*[price])
=SUMPRODUCT(([status]="open")*[total])
=COUNT(FILTER([total],[city]="Recife"))
=MAX(([city]="Recife")*[total])
```

A cell cannot hold an array: a formula whose final result is a multi-value array gives `#VALUE!`.

## Errors

| Error | Cause |
|---|---|
| `#DIV/0!` | division by zero, `AVERAGE` of nothing |
| `#VALUE!` | wrong type (`"a"+1`), invalid argument |
| `#NAME?` | unknown function or name |
| `#REF!` | unknown column |
| `#N/A` | lookup did not find the value, `NA()` |
| `#NUM!` | invalid number (`SQRT(-1)`, overflow, `IRR` not converging) |
| `#ERROR!` | syntax error in the formula |
| `#CIRC!` | circular reference between calculated columns |

Errors propagate through calculations until `IFERROR`, `IFNA` or `ISERROR` handle them. Error
cells get the `ig-error` class, sort after every value, and export as real Excel errors.

## Calculated columns

```ts
{ field: 'total', type: 'currency', formula: '=[@qty]*[@price]*(1-[@discount])' }
{ field: 'share', type: 'percent', formula: '=[@total]/SUM([total])' }
{ field: 'rank',  type: 'integer', formula: '=RANK([@total],[total])' }
```

- Results are **written into the SorlaDB documents**, so calculated columns sort, filter and export like stored ones.
- Columns may depend on each other in any order; the engine sorts them by dependency. Cycles give `#CIRC!`.
- Recalculation is **incremental**: editing `qty` recomputes only the columns depending on `qty`, for
  that row only, unless a whole-column reference (`[total]`) is involved, in which case the whole column is recomputed.
- Ranges (`[total]`) in calculated columns cover **every loaded row**, not just the filtered ones (like an Excel table).
- Calculated columns are read-only unless you give them `editable: true`.

```ts
grid.setColumnFormula('total', '=[@qty]*[@price]*1.1');   // change at runtime
```

## Cell formulas

When `cellFormulas` is on (the default) and a column is editable, typing `=...` stores a formula
for that one cell. Its value is recalculated whenever what it references changes. Typing a plain
value replaces the formula again.

```ts
grid.setCellFormula(id, 'price', '=[@cost]*1.3');
grid.getCellFormula(id, 'price');    // '=[@cost]*1.3'
grid.setCellFormula(id, 'price', null);
```

Typing a value (or a formula) into an editable **calculated** column overrides that cell only, the
equivalent of Excel's "calculated column exception". The rest of the column keeps the column formula.

Cells with a formula get the `ig-formula` class and show the formula as tooltip. When editing, the
editor shows the formula text.

## Footers

```ts
{ field: 'qty', footer: 'sum' }                      // sum | avg | average | count | counta | min | max | median
{ field: 'due', footer: '=TEXT(MIN([due]),"dd/mm/yyyy")' }
{ field: 'paid', footer: '=COUNTIF([paid],TRUE)' }
{ field: 'total', footer: (rows, column, grid) => rows.reduce((s, r) => s + (r.total ?? 0), 0) }
```

Footers aggregate the **filtered** rows, like `SUBTOTAL` in Excel, and update on every change.
Shortcut and formula footers are exported to Excel as formulas.

## Conditional formats

```ts
{
    field: 'total',
    conditionalFormats: [
        { formula: '=[@total] >= PERCENTILE([total],0.9)', className: 'top', style: { fontWeight: '600' } },
        { when: (value, row) => value < 0, className: 'loss' }
    ]
}
// whole rows
rowFormats: [{ formula: '=AND(NOT([@paid]),[@due]<TODAY())', className: 'late' }]
```

Every format whose formula returns `TRUE` (or whose `when` returns true) applies its `className`
and/or inline `style`. Formats are evaluated each time the cell renders.

## Formula filters & ad-hoc evaluation

```ts
grid.setFilter('total', { formula: '=[@total] > AVERAGE([total])' });
grid.evaluate('=SUMIFS([total],[city],"Recife")');   // over the filtered rows
grid.evaluate('=[@qty]*2', id);                      // in the context of one row
```

## Custom functions

```ts
import { IntelligentGrid, FormulaError, ERRORS } from 'intelligent-grid';

// every grid
IntelligentGrid.defineFunction('VAT', ([value, rate]) => {
    if (typeof value !== 'number') throw new FormulaError(ERRORS.VALUE);
    return value * (typeof rate === 'number' ? rate : 0.2);
});

// one grid
grid.registerFunction('DISCOUNTED', ([price]) => (price as number) * 0.9);
new IntelligentGrid('#grid', { functions: { DOUBLE: ([n]) => (n as number) * 2 }, ... });
```

- Arguments arrive evaluated: numbers, strings, booleans, `null` (blank), `FormulaError`, or arrays for ranges.
- By default an error argument short-circuits: your function is not called and the error is returned. Pass `{ errors: true }` to receive errors.
- Throw `new FormulaError(code)` to return an Excel error.
- `{ lazy: true }` receives the unevaluated AST nodes plus `evaluate(node)`, to evaluate only some arguments (like `IF`).
- Function names are case-insensitive. Grid functions take precedence over global ones.

```ts
IntelligentGrid.defineFunction('FIRSTOK', (args, ctx, evaluate) => {
    for (const arg of args) {
        const value = evaluate(arg);
        if (!(value instanceof FormulaError)) return value;
    }
    return new FormulaError(ERRORS.NA);
}, { lazy: true });
```

## Using the engine without a grid

```ts
import { compile, evaluate, parse, toExcelFormula } from 'intelligent-grid';

const { ast } = compile('=[@qty]*[@price]');
evaluate(ast, { rowValue: f => ({ qty: 2, price: 5 })[f] ?? null, columnValues: () => [] });   // 10
toExcelFormula(parse('=[@qty]*[@price]'), (field) => ({ qty: 'B2', price: 'C2' })[field]);      // 'B2*C2'
```
