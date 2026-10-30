# Fórmulas

O motor de fórmulas segue o Excel: mesmos operadores e precedência, mesmas regras de coerção, mesmos valores
de erro, 137 funções. Ele trabalha com **referências estruturadas de tabela** em vez de endereços A1,
porque as linhas da grade mudam de lugar quando você ordena ou filtra.

## Referências

| Referência | Significado | Equivalente no Excel |
|---|---|---|
| `[@price]` | valor de `price` na linha atual | `[@price]` |
| `[@[unit price]]` | o mesmo, para campos com espaços ou símbolos | `[@[unit price]]` |
| `[price]` | todos os valores da coluna (um intervalo) | `Table1[price]` |
| `TAX` | uma constante nomeada da opção `names` | um nome definido |

As referências usam o `field` da coluna (não o título). Colunas desconhecidas resultam em `#REF!`; nomes ou
funções desconhecidos resultam em `#NAME?`.

## Linguagem

| | |
|---|---|
| Aritmética | `+ - * / ^` e `%` pós-fixado (`50%` = 0.5) |
| Texto | `&` concatena |
| Comparação | `= <> < <= > >=` (texto não diferencia maiúsculas de minúsculas) |
| Precedência | negação > `%` > `^` > `* /` > `+ -` > `&` > comparações. Assim, `-2^2 = 4` e `2^3^2 = 64`, como no Excel |
| Literais | `12`, `1.5`, `1e3`, `"text"` (`""` escapa uma aspa), `TRUE`, `FALSE`, `#N/A`, arrays `{1,2,3}` |
| Separadores | `,` ou `;` entre argumentos (`;` é o que o Excel em pt-BR usa). Decimais sempre usam `.` |
| Argumentos vazios | `IF(A,,B)`: o argumento vazio é tratado como em branco |

**Coerção**: em branco = `0` / `""` / `FALSE`; texto numérico funciona em aritmética (`"3"+1 = 4`); datas são
números seriais (dias desde 1899-12-30), então `[@due]-[@start]` é um número de dias e `[@due]+30`
é uma data. Strings ISO nas células são lidas como datas. Booleanos valem 1/0 em aritmética.

**Matemática de arrays** (no estilo do Excel 365): os operadores funcionam elemento a elemento sobre intervalos, então isto funciona:

```
=SUM([qty]*[price])
=SUMPRODUCT(([status]="open")*[total])
=COUNT(FILTER([total],[city]="Recife"))
=MAX(([city]="Recife")*[total])
```

Uma célula não pode conter um array: uma fórmula cujo resultado final é um array com vários valores resulta em `#VALUE!`.

## Erros

| Erro | Causa |
|---|---|
| `#DIV/0!` | divisão por zero, `AVERAGE` de nada |
| `#VALUE!` | tipo errado (`"a"+1`), argumento inválido |
| `#NAME?` | função ou nome desconhecido |
| `#REF!` | coluna desconhecida |
| `#N/A` | a busca não encontrou o valor, `NA()` |
| `#NUM!` | número inválido (`SQRT(-1)`, overflow, `IRR` que não converge) |
| `#ERROR!` | erro de sintaxe na fórmula |
| `#CIRC!` | referência circular entre colunas calculadas |

Os erros se propagam pelos cálculos até que `IFERROR`, `IFNA` ou `ISERROR` os tratem. Células com erro
recebem a classe `ig-error`, são ordenadas depois de todos os valores e são exportadas como erros reais do Excel.

## Colunas calculadas

```ts
{ field: 'total', type: 'currency', formula: '=[@qty]*[@price]*(1-[@discount])' }
{ field: 'share', type: 'percent', formula: '=[@total]/SUM([total])' }
{ field: 'rank',  type: 'integer', formula: '=RANK([@total],[total])' }
```

- Os resultados são **gravados nos documentos do SorlaDB**, então colunas calculadas são ordenadas, filtradas e exportadas como as armazenadas.
- As colunas podem depender umas das outras em qualquer ordem; o motor as ordena por dependência. Ciclos resultam em `#CIRC!`.
- O recálculo é **incremental**: editar `qty` recalcula apenas as colunas que dependem de `qty`, e só
  naquela linha, a menos que haja uma referência à coluna inteira (`[total]`); nesse caso, a coluna inteira é recalculada.
- Intervalos (`[total]`) em colunas calculadas abrangem **todas as linhas carregadas**, não só as filtradas (como em uma tabela do Excel).
- Colunas calculadas são somente leitura, a menos que você defina `editable: true`.

```ts
grid.setColumnFormula('total', '=[@qty]*[@price]*1.1');   // altera em tempo de execução
```

## Fórmulas de célula

Quando `cellFormulas` está ativado (o padrão) e uma coluna é editável, digitar `=...` armazena uma fórmula
só para aquela célula. O valor dela é recalculado sempre que algo que ela referencia muda. Digitar um valor
comum substitui a fórmula novamente.

```ts
grid.setCellFormula(id, 'price', '=[@cost]*1.3');
grid.getCellFormula(id, 'price');    // '=[@cost]*1.3'
grid.setCellFormula(id, 'price', null);
```

Digitar um valor (ou uma fórmula) em uma coluna **calculada** editável sobrescreve apenas aquela célula, o
equivalente à "exceção de coluna calculada" do Excel. O restante da coluna mantém a fórmula da coluna.

Células com fórmula recebem a classe `ig-formula` e mostram a fórmula como tooltip. Durante a edição, o
editor mostra o texto da fórmula.

## Rodapés

```ts
{ field: 'qty', footer: 'sum' }                      // sum | avg | average | count | counta | min | max | median
{ field: 'due', footer: '=TEXT(MIN([due]),"dd/mm/yyyy")' }
{ field: 'paid', footer: '=COUNTIF([paid],TRUE)' }
{ field: 'total', footer: (rows, column, grid) => rows.reduce((s, r) => s + (r.total ?? 0), 0) }
```

Os rodapés agregam as linhas **filtradas**, como o `SUBTOTAL` do Excel, e são atualizados a cada alteração.
Rodapés de atalho e de fórmula são exportados para o Excel como fórmulas.

## Formatação condicional

```ts
{
    field: 'total',
    conditionalFormats: [
        { formula: '=[@total] >= PERCENTILE([total],0.9)', className: 'top', style: { fontWeight: '600' } },
        { when: (value, row) => value < 0, className: 'loss' }
    ]
}
// linhas inteiras
rowFormats: [{ formula: '=AND(NOT([@paid]),[@due]<TODAY())', className: 'late' }]
```

Todo formato cuja fórmula retorne `TRUE` (ou cujo `when` retorne true) aplica seu `className`
e/ou seu `style` inline. Os formatos são avaliados sempre que a célula é renderizada.

### Barras de dados, escalas de cor e conjuntos de ícones

Os formatos prontos do Excel posicionam cada número entre o mínimo e o máximo da coluna nas
linhas filtradas (ou entre o `min` / `max` que você informar) e são redesenhados quando uma edição os altera:

```ts
{ field: 'sales', conditionalFormats: [{ type: 'dataBar' }] }                               // barra de 0 até o máximo
{ field: 'sales', conditionalFormats: [{ type: 'dataBar', color: '#63be7b', showValue: false }] }
{ field: 'margin', conditionalFormats: [{ type: 'colorScale' }] }                           // vermelho, amarelo, verde
{ field: 'margin', conditionalFormats: [{ type: 'colorScale', colors: ['#ffffff', '#1a73e8'], min: 0, max: 1 }] }
{ field: 'trend', conditionalFormats: [{ type: 'iconSet', icons: 'arrows' }] }              // ↓ → ↑ por terços
{ field: 'score', conditionalFormats: [{ type: 'iconSet', icons: ['😞', '😐', '🙂'], thresholds: [50, 80], thresholdType: 'number' }] }
```

| Tipo | Opções |
|---|---|
| `dataBar` | `color`, `min` (por padrão, o mínimo ou 0), `max`, `showValue` |
| `colorScale` | `colors` (duas ou mais cores hex, por padrão vermelho / amarelo / verde), `min`, `max` |
| `iconSet` | `icons` (`'arrows'`, `'traffic'`, `'flags'`, `'stars'` ou os seus próprios, do menor para o maior), `thresholds` (percentuais do intervalo, por padrão partes iguais, ou números com `thresholdType: 'number'`), `reverse`, `min`, `max`, `showValue` |

Células em branco e não numéricas não recebem formatação. Predefinições e regras podem ser misturadas na mesma lista. As
cores das barras e dos ícones vêm das [variáveis de tema](theming.md) `--ig-databar`, `--ig-cf-good`, `--ig-cf-mid` e
`--ig-cf-bad`.

## Sparklines

```ts
{ field: 'last12', sparkline: true }                                   // linha
{ field: 'last12', sparkline: { type: 'bar', negativeColor: '#d93025' } }
{ field: 'results', sparkline: { type: 'winloss' } }                   // para cima se positivo, para baixo se negativo
```

O valor é uma lista de números (`[3, 5, 2]`) ou um texto como `"3,5,2"`. Cada linha é dimensionada para o seu
próprio intervalo, a menos que você defina `min` e `max`. Sparklines são SVG inline; a exportação grava os números como
texto.

## Filtros por fórmula e avaliação avulsa

```ts
grid.setFilter('total', { formula: '=[@total] > AVERAGE([total])' });
grid.evaluate('=SUMIFS([total],[city],"Recife")');   // sobre as linhas filtradas
grid.evaluate('=[@qty]*2', id);                      // no contexto de uma linha
```

## Funções personalizadas

```ts
import { IntelligentGrid, FormulaError, ERRORS } from '@andmarruda/intelligent-grid';

// todas as grades
IntelligentGrid.defineFunction('VAT', ([value, rate]) => {
    if (typeof value !== 'number') throw new FormulaError(ERRORS.VALUE);
    return value * (typeof rate === 'number' ? rate : 0.2);
});

// uma grade
grid.registerFunction('DISCOUNTED', ([price]) => (price as number) * 0.9);
new IntelligentGrid('#grid', { functions: { DOUBLE: ([n]) => (n as number) * 2 }, ... });
```

- Os argumentos chegam já avaliados: números, strings, booleanos, `null` (em branco), `FormulaError` ou arrays para intervalos.
- Por padrão, um argumento com erro interrompe a execução: sua função não é chamada e o erro é devolvido. Passe `{ errors: true }` para receber os erros.
- Lance `new FormulaError(code)` para devolver um erro do Excel.
- `{ lazy: true }` recebe os nós da AST não avaliados mais `evaluate(node)`, para avaliar apenas alguns argumentos (como o `IF`).
- Os nomes de função não diferenciam maiúsculas de minúsculas. Funções da grade têm prioridade sobre as globais.

```ts
IntelligentGrid.defineFunction('FIRSTOK', (args, ctx, evaluate) => {
    for (const arg of args) {
        const value = evaluate(arg);
        if (!(value instanceof FormulaError)) return value;
    }
    return new FormulaError(ERRORS.NA);
}, { lazy: true });
```

## Usando o motor sem uma grade

```ts
import { compile, evaluate, parse, toExcelFormula } from '@andmarruda/intelligent-grid';

const { ast } = compile('=[@qty]*[@price]');
evaluate(ast, { rowValue: f => ({ qty: 2, price: 5 })[f] ?? null, columnValues: () => [] });   // 10
toExcelFormula(parse('=[@qty]*[@price]'), (field) => ({ qty: 'B2', price: 'C2' })[field]);      // 'B2*C2'
```
