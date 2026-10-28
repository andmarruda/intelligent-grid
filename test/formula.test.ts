import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, toCellResult } from '../src/formula/evaluator.ts';
import { parse, toExcelFormula, collectDependencies } from '../src/formula/parser.ts';
import { fromCell } from '../src/formula/values.ts';
import { err, isError } from '../src/formula/errors.ts';
import { formatValue } from '../src/formula/numfmt.ts';
import { toSerial } from '../src/formula/dates.ts';

const rows = [
    { product: 'Coffee', qty: 2, price: 10, category: 'drink', date: '2026-01-15' },
    { product: 'Tea', qty: 5, price: 4, category: 'drink', date: '2026-02-01' },
    { product: 'Cake', qty: 1, price: 25, category: 'food', date: '2026-03-10' },
    { product: 'Bread', qty: null, price: 6, category: 'food', date: '2026-03-31' }
];

function run(formula: string, row: Record<string, unknown> = rows[0], extra = {}) {
    const ctx = {
        locale: 'en-US',
        rowValue: (field: string) => field in row ? fromCell(row[field]) : err('#REF!'),
        columnValues: (field: string) => rows.map(r => fromCell((r as Record<string, unknown>)[field])),
        name: (name: string) => (({ TAX: 0.1 }) as Record<string, number>)[name],
        ...extra
    };
    const value = toCellResult(evaluate(compile(formula).ast, ctx));
    return isError(value) ? value.code : value;
}

test('operators follow Excel precedence', () => {
    assert.equal(run('=1+2*3'), 7);
    assert.equal(run('=-2^2'), 4);
    assert.equal(run('=2^3^2'), 64);
    assert.equal(run('=50%*10'), 5);
    assert.equal(run('="a"&1+1'), 'a2');
    assert.equal(run('=1+1=2'), true);
    assert.equal(run('=(1+2)*3'), 9);
});

test('structured references', () => {
    assert.equal(run('=[@qty]*[@price]'), 20);
    assert.equal(run('=[@[price]]*(1+TAX)'), 11);
    assert.equal(run('=SUM([price])'), 45);
    assert.equal(run('=SUM([qty]*[price])'), 2 * 10 + 5 * 4 + 25);
    assert.equal(run('=[@price]/SUM([price])'), 10 / 45);
});

test('errors propagate and can be handled', () => {
    assert.equal(run('=1/0'), '#DIV/0!');
    assert.equal(run('=IFERROR(1/0;"x")'), 'x');
    assert.equal(run('=ISERROR([@price]/0)'), true);
    assert.equal(run('=FOO(1)'), '#NAME?');
    assert.equal(run('="a"+1'), '#VALUE!');
    assert.equal(run('=1+'), '#ERROR!');
    assert.equal(run('=[@missing]'), '#REF!');
});

test('aggregates and conditional aggregates', () => {
    assert.equal(run('=AVERAGE([price])'), 11.25);
    assert.equal(run('=COUNT([qty])'), 3);
    assert.equal(run('=COUNTA([qty])'), 3);
    assert.equal(run('=COUNTBLANK([qty])'), 1);
    assert.equal(run('=SUMIF([category],"drink",[price])'), 14);
    assert.equal(run('=COUNTIF([price],">5")'), 3);
    assert.equal(run('=SUMIFS([price],[category],"food",[price],">10")'), 25);
    assert.equal(run('=COUNTIF([product],"c*")'), 2);
    assert.equal(run('=MAXIFS([price],[category],"drink")'), 10);
    assert.equal(run('=MEDIAN([price])'), 8);
    assert.equal(run('=SUBTOTAL(9,[price])'), 45);
    assert.equal(run('=SUMPRODUCT([qty],[price])'), 65);
});

test('logical and text functions', () => {
    assert.equal(run('=IF([@qty]>1,"many","one")'), 'many');
    assert.equal(run('=IFS([@price]>20,"high",[@price]>5,"mid",TRUE,"low")'), 'mid');
    assert.equal(run('=AND(TRUE,[@qty]>1)'), true);
    assert.equal(run('=SWITCH([@category],"food","F","drink","D","?")'), 'D');
    assert.equal(run('=UPPER(LEFT([@product],3))'), 'COF');
    assert.equal(run('=TEXTJOIN(", ",TRUE,[product])'), 'Coffee, Tea, Cake, Bread');
    assert.equal(run('=SUBSTITUTE("a-b-c","-","+",2)'), 'a-b+c');
    assert.equal(run('=PROPER("joão da silva")'), 'João Da Silva');
    assert.equal(run('=TRIM("  a   b ")'), 'a b');
    assert.equal(run('=SEARCH("f*e","Coffee")'), 3);
});

test('lookups', () => {
    assert.equal(run('=XLOOKUP("cake",[product],[price])'), 25);
    assert.equal(run('=XLOOKUP("x",[product],[price],"none")'), 'none');
    assert.equal(run('=XLOOKUP(7,[price],[product],,-1)'), 'Bread');
    assert.equal(run('=XLOOKUP(7,[price],[product],,1)'), 'Coffee');
    assert.equal(run('=MATCH("Tea",[product],0)'), 2);
    assert.equal(run('=INDEX([product],3)'), 'Cake');
    assert.equal(run('=COUNT(FILTER([price],[category]="food"))'), 2);
    assert.equal(run('=ROWS(UNIQUE([category]))'), 2);
});

test('dates use Excel serials', () => {
    assert.equal(run('=DATE(2026,1,15)'), toSerial('2026-01-15'));
    assert.equal(run('=YEAR([@date])'), 2026);
    assert.equal(run('=DAYS("2026-03-31",[@date])'), 75);
    assert.equal(run('=[@date]+1>[@date]'), true);
    assert.equal(run('=TEXT(EOMONTH([@date],1),"yyyy-mm-dd")'), '2026-02-28');
    assert.equal(run('=TEXT(EDATE("2026-01-31",1),"dd/mm/yyyy")'), '28/02/2026');
    assert.equal(run('=DATEDIF("2020-05-10","2026-03-01","Y")'), 5);
    assert.equal(run('=NETWORKDAYS("2026-10-26","2026-11-01")'), 5);
});

test('math and financial', () => {
    assert.equal(run('=ROUND(2.5,0)'), 3);
    assert.equal(run('=ROUND(-2.5,0)'), -3);
    assert.equal(run('=ROUND(1.005,2)'), 1.01);
    assert.equal(run('=ROUNDUP(1.21,1)'), 1.3);
    assert.equal(run('=MOD(-3,2)'), 1);
    assert.equal(run('=CEILING(4.1,0.5)'), 4.5);
    assert.equal(Number((run('=PMT(0.01,12,1000)') as number).toFixed(2)), -88.85);
    assert.equal(Number((run('=IRR({-100,60,60})') as number).toFixed(4)), 0.1307);
});

test('number formats', () => {
    assert.equal(formatValue(1234.5, '#,##0.00', 'en-US'), '1,234.50');
    assert.equal(formatValue(1234.5, '#,##0.00', 'pt-BR'), '1.234,50');
    assert.equal(formatValue(-5, '#,##0;(#,##0)', 'en-US'), '(5)');
    assert.equal(formatValue(0.256, '0.0%', 'en-US'), '25.6%');
    assert.equal(formatValue(99.9, '"R$" #,##0.00', 'pt-BR'), 'R$ 99,90');
    assert.equal(formatValue(1500000, '#,##0,"k"', 'en-US'), '1,500k');
    assert.equal(formatValue('2026-10-28T14:05:09', 'dd/mm/yyyy hh:mm:ss', 'pt-BR'), '28/10/2026 14:05:09');
    assert.equal(formatValue('2026-10-28T14:05', 'h:mm AM/PM', 'en-US'), '2:05 PM');
    assert.equal(formatValue('2026-10-28', 'mmmm yyyy', 'en-US'), 'October 2026');
    assert.equal(formatValue('abc', '0;0;0;"[" @ "]"', 'en-US'), '[ abc ]');
});

test('parser round-trips to Excel A1 formulas', () => {
    const ast = parse('=[@qty]*[@[price]]/SUM([price])-(1+2)');
    const deps = collectDependencies(ast);
    assert.deepEqual([...deps.row].sort(), ['price', 'qty']);
    assert.deepEqual([...deps.column], ['price']);
    const columns: Record<string, string> = { qty: 'B', price: 'C' };
    const printed = toExcelFormula(ast, (field, scope) => scope === 'row' ? `${columns[field]}2` : `${columns[field]}$2:${columns[field]}$5`);
    assert.equal(printed, 'B2*C2/SUM(C$2:C$5)-(1+2)');
    assert.equal(toExcelFormula(parse('=1-(2-3)'), () => 'A1'), '1-(2-3)');
    assert.equal(toExcelFormula(parse('=[@missing]'), () => null), null);
});
