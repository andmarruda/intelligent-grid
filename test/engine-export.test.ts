import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sorla } from './helpers.ts';
import { SorlaStore } from '../src/core/store.ts';
import { CalcEngine } from '../src/formula/engine.ts';
import { normalizeColumn, excelFormatCode } from '../src/core/columns.ts';
import { toCSV } from '../src/export/csv.ts';
import { toXLSX, columnLetter } from '../src/export/xlsx.ts';
import { crc32 } from '../src/export/zip.ts';
import type { ColumnDefinition } from '../src/types.ts';

const grid = { locale: 'en-US', editable: true, cellFormulas: true };
const definitions: ColumnDefinition[] = [
    { field: 'item' },
    { field: 'qty', type: 'integer' },
    { field: 'price', type: 'currency' },
    { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' },
    { field: 'share', type: 'percent', formula: '=[@total]/SUM([total])' },
    { field: 'label', formula: '=IF([@share]>0.5,"big","small")' }
];

function setup(defs = definitions) {
    const columns = defs.map(d => normalizeColumn(d, grid));
    const store = new SorlaStore({ sorla: Sorla });
    store.setFields(columns.map(c => c.field));
    const calc = new CalcEngine({ store, locale: 'en-US' });
    calc.setColumns(columns);
    const ids = store.insert([
        { item: 'A', qty: 2, price: 10 },
        { item: 'B', qty: 1, price: 30 },
        { item: 'C', qty: 0, price: 5 }
    ]);
    calc.recalculateAll();
    return { columns, store, calc, ids };
}

test('formula columns compute, chain and land in SorlaDB documents', () => {
    const { store, ids } = setup();
    assert.equal(store.get(ids[0])!.total, 20);
    assert.equal(store.get(ids[1])!.share, 0.6);
    assert.equal(store.get(ids[1])!.label, 'big');
    // computed values are queryable through SorlaDB like any field
    assert.deepEqual(store.query({ query: { total: { $gte: 20 } } }).map(r => r.item), ['A', 'B']);
});

test('incremental recalculation follows whole-column references', () => {
    const { store, calc, ids } = setup();
    store.update(ids[2], { qty: 10 });
    assert.equal(calc.recalculate([ids[2]], ['qty']), 'all');
    assert.equal(store.get(ids[2])!.total, 50);
    assert.equal(store.get(ids[0])!.share, 0.2);
    assert.equal(store.get(ids[2])!.label, 'small');
});

test('cell formulas override one cell, cycles become #CIRC!', () => {
    const { store, calc, ids } = setup();
    calc.setCellFormula(ids[0], 'total', '=100');
    calc.recalculate([ids[0]], ['total']);
    assert.equal(store.get(ids[0])!.total, 100);
    assert.equal(store.get(ids[1])!.total, 30);

    // a typed value in a calculated column survives recalculation
    calc.setCellOverride(ids[1], 'total');
    store.update(ids[1], { total: 7 });
    store.update(ids[1], { qty: 3 });
    calc.recalculate([ids[1]], ['qty']);
    assert.equal(store.get(ids[1])!.total, 7);
    assert.equal(calc.formulaFor(ids[1], 'total'), null);
    calc.setCellFormula(ids[1], 'total', null);
    calc.recalculate([ids[1]], ['total']);
    assert.equal(store.get(ids[1])!.total, 90);

    const loop = setup([{ field: 'a', formula: '=[@b]+1' }, { field: 'b', formula: '=[@a]+1' }, { field: 'c', formula: '=1/0' }]);
    assert.equal(loop.store.get(loop.ids[0])!.a, '#CIRC!');
    assert.equal(loop.store.get(loop.ids[0])!.c, '#DIV/0!');
});

test('ad-hoc evaluation over a subset of rows (footers)', () => {
    const { store, calc, ids } = setup();
    const visible = [store.get(ids[0])!, store.get(ids[1])!];
    assert.equal(calc.evaluate('=SUM([total])', null, visible), 50);
    assert.equal(calc.evaluate('=[@qty]>1', store.get(ids[0])!), true);
});

test('CSV escapes, keeps raw numbers and blocks formula injection', () => {
    const columns = [{ field: 'a', title: 'A' }, { field: 'b', title: 'B; "x"' }];
    const csv = toCSV([{ a: '=HYPERLINK("x")', b: 1.5 }, { a: 'line\nbreak', b: -2 }, { a: '', b: true }], columns, { delimiter: ';', decimal: ',' });
    assert.equal(csv, 'A;"B; ""x"""\r\n"\'=HYPERLINK(""x"")";1,5\r\n"line\nbreak";-2\r\n;TRUE');
});

test('XLSX package: valid zip, typed cells, translated formulas, number formats', () => {
    const { columns, store } = setup();
    const rows = store.query();
    const exported = columns.map(c => ({ ...c, numFmt: excelFormatCode(c, 'pt-BR') }));
    const bytes = toXLSX({
        columns: exported,
        rows,
        formulaFor: (row, column) => column.formula ?? null,
        footer: { total: { formula: '=SUM([total])', value: 55 } }
    });

    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(0, true), 0x04034b50);
    const text = new TextDecoder().decode(bytes);
    // entries are stored, so the XML is readable in the package
    assert.match(text, /<c r="D2" s="\d+"><f>B2\*C2<\/f><v>20<\/v><\/c>/);
    assert.match(text, /<f>D2\/SUM\(D\$2:D\$4\)<\/f>/);
    assert.match(text, /<c r="F2" s="\d+" t="str"><f>IF\(E2&gt;0\.5,&quot;big&quot;,&quot;small&quot;\)<\/f><v>small<\/v><\/c>/);
    assert.match(text, /<c r="D5" s="\d+"><f>SUM\(D\$2:D\$4\)<\/f><v>55<\/v><\/c>/);
    // en-US columns keep USD, written with the pt-BR symbol
    assert.match(text, /formatCode="&quot;US\$&quot; #,##0\.00;-&quot;US\$&quot; #,##0\.00"/);
    assert.match(text, /<autoFilter ref="A1:F4"\/>/);
    assert.equal(columnLetter(0), 'A');
    assert.equal(columnLetter(27), 'AB');
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});
