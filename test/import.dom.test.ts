import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { Sorla, setupDom } from './helpers.ts';
import { detectDelimiter, parseDelimited } from '../src/import/delimited.ts';
import { columnIndex, isDateFormat, readXlsx } from '../src/import/xlsx-read.ts';
import { crc32 } from '../src/export/zip.ts';
import type { GridOptions } from '../src/types.ts';
import type { IntelligentGrid as IntelligentGridType } from '../src/ui/grid.ts';

let IntelligentGrid: typeof IntelligentGridType;

before(async () => {
    ({ IntelligentGrid } = await setupDom());
});

function create(options: Partial<GridOptions> = {}): IntelligentGridType {
    document.body.innerHTML = '<div id="grid"></div>';
    return new IntelligentGrid('#grid', {
        sorla: Sorla, locale: 'en-US', idField: 'id', editable: true,
        columns: [{ field: 'name', title: 'Name' }, { field: 'qty', title: 'Quantity', type: 'integer' }, { field: 'when', title: 'Date', type: 'date' }, { field: 'total', type: 'number', formula: '=[@qty]*2' }],
        data: [{ id: 1, name: 'old', qty: 1 }],
        ...options
    });
}

/** A deflated zip, the way Excel writes .xlsx files. */
function deflatedZip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
        const raw = encoder.encode(text);
        const data = new Uint8Array(deflateRawSync(raw));
        const nameBytes = encoder.encode(name);
        const local = new Uint8Array(30 + nameBytes.length + data.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true);
        lv.setUint32(14, crc32(raw), true); lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true);
        lv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.length);
        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true);
        cv.setUint32(16, crc32(raw), true); cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true);
        cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);
        locals.push(local);
        centrals.push(central);
        offset += local.length;
    }
    const size = centrals.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true);
    ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + size + 22);
    let at = 0;
    for (const part of [...locals, ...centrals, end]) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

const excelFile = () => deflatedZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="Data &amp; more" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Quantity</t></si><si><t>Date</t></si><si><r><t>Ana </t></r><r><rPr/><t>&amp; Bia</t></r></si><si><t>Extra</t></si></sst>',
    'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="4"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>ignore me</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData>'
        + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="E1" t="s"><v>4</v></c></row>'
        + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" s="3"><v>12</v></c><c r="C2" s="1"><v>46023</v></c><c r="E2" t="b"><v>1</v></c></row>'
        + '<row r="4"><c r="A4" t="str"><f>A2</f><v>formula text</v></c><c r="C4" s="2"><v>46023.5</v></c><c r="D4" t="e"><v>#N/A</v></c></row>'
        + '</sheetData></worksheet>'
});

test('delimited text: quotes, doubled quotes, line breaks, BOM and delimiter detection', () => {
    assert.deepEqual(parseDelimited('a,"b,c","say ""hi"""\r\n1,"two\nlines",3\n'), [['a', 'b,c', 'say "hi"'], ['1', 'two\nlines', '3']]);
    assert.deepEqual(parseDelimited('﻿x;y\n1;2'), [['x', 'y'], ['1', '2']]);
    assert.equal(detectDelimiter('a\tb\tc\n1,2'), '\t');
    assert.equal(detectDelimiter('"a;b",c,d'), ',');
    assert.deepEqual(parseDelimited('a,,b,'), [['a', '', 'b', '']]);
    assert.deepEqual(parseDelimited(''), []);
});

test('xlsx helpers', () => {
    assert.equal(columnIndex('A1'), 0);
    assert.equal(columnIndex('AB12'), 27);
    assert.equal(isDateFormat('dd/mm/yyyy'), true);
    assert.equal(isDateFormat('#,##0.00 "days"'), false);
    assert.equal(isDateFormat('[Red]0.00'), false);
    assert.equal(isDateFormat('[h]:mm'), true);
});

test('reads a deflated Excel file: shared strings, rich text, dates, gaps, other sheets', async () => {
    const sheet = await readXlsx(excelFile(), { sheet: 'Data & more' });
    assert.equal(sheet.name, 'Data & more');
    assert.deepEqual(sheet.rows, [
        ['Name', 'Quantity', 'Date', null, 'Extra'],
        ['Ana & Bia', 12, '2026-01-01', null, true],
        [],
        ['formula text', null, '2026-01-01T12:00:00', '#N/A']
    ]);
    assert.deepEqual((await readXlsx(excelFile())).rows, [['ignore me']]);
    await assert.rejects(readXlsx(excelFile(), { sheet: 'Nope' }), /not found/);
    await assert.rejects(readXlsx(new Uint8Array(40)), /Not a zip/);
});

test('importCSV matches headers by title or field, parses values, reports errors and skipped headers', () => {
    const grid = create();
    const events: unknown[] = [];
    grid.on('import', e => events.push(e.detail));
    const result = grid.importCSV('Name;quantity;Date;Color;total\nPen;3;01/31/2026;red;99\nInk;lots;;blue;\n\n');
    assert.deepEqual(result, {
        rows: 2, fields: ['name', 'qty', 'when'], skipped: ['Color'],
        errors: [{ line: 3, field: 'qty', value: 'lots', error: 'Enter a valid number' }]
    });
    assert.deepEqual(grid.getRows().map(r => [r.name, r.qty, r.when, r.total]), [['Pen', 3, '2026-01-31', 6], ['Ink', null, null, 0]]);
    assert.equal(events.length, 1);
});

test('append mode adds rows as one undo step; header: false fills columns in order', () => {
    const grid = create();
    grid.importCSV('A,1\nB,2', { mode: 'append', header: false });
    assert.deepEqual(grid.getRows().map(r => r.name), ['old', 'A', 'B']);
    assert.ok(grid.getChanges().inserted.length === 2);
    grid.undo();
    assert.deepEqual(grid.getRows().map(r => r.name), ['old']);
});

test('importXLSX and importFile; a grid without columns creates them with inferred types', async () => {
    const grid = create();
    const result = await grid.importXLSX(excelFile(), { sheet: 1 });
    assert.equal(result.sheet, 'Data & more');
    assert.deepEqual(grid.getRows().map(r => [r.name, r.qty, r.when]), [['Ana & Bia', 12, '2026-01-01'], ['formula text', null, '2026-01-01']]);

    document.body.innerHTML = '<div id="empty"></div>';
    const empty = new IntelligentGrid('#empty', { sorla: Sorla, locale: 'en-US', columns: [] });
    const file = new Blob([excelFile()]) as Blob & { name: string };
    file.name = 'report.xlsx';
    await empty.importFile(file, { sheet: 1 });
    assert.deepEqual(empty.columns.map(c => [c.field, c.type]), [['Name', 'text'], ['Quantity', 'integer'], ['Date', 'datetime'], ['Extra', 'boolean']]);
    assert.equal(empty.getRows()[0]!.Quantity, 12);

    const csv = new Blob(['Name\tQuantity\nZed\t4']) as Blob & { name: string };
    csv.name = 'data.tsv';
    await grid.importFile(csv);
    assert.deepEqual(grid.getRows().map(r => [r.name, r.qty]), [['Zed', 4]]);
});

test('round trip: export to XLSX and import it back', async () => {
    const grid = create({ data: [{ id: 1, name: 'Pen', qty: 2, when: '2026-03-04' }, { id: 2, name: 'Book', qty: 5, when: null }] });
    const bytes = grid.exportXLSX({ download: false })!;
    const copy = create({ data: [] });
    await copy.importXLSX(bytes);
    assert.deepEqual(copy.getRows().map(r => [r.name, r.qty, r.when, r.total]), [['Pen', 2, '2026-03-04', 4], ['Book', 5, null, 10]]);
});

test('paste keeps quoted cells with line breaks from Excel in one cell', () => {
    const grid = create({ data: [{ id: 1, name: 'a', qty: 1 }, { id: 2, name: 'b', qty: 2 }] });
    grid.setRange({ id: '1', field: 'name' });
    const event = new window.Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { getData: () => '"two\nlines"\t7\nnext\t8\n' };
    grid.root.querySelector('.ig-scroll')!.dispatchEvent(event);
    assert.deepEqual(grid.getRows().map(r => [r.name, r.qty]), [['two\nlines', 7], ['next', 8]]);
});

test('navbar import button reads the chosen file and shows a notice', async () => {
    const grid = create({ navbar: { import: true }, statusBar: true });
    const input = grid.root.querySelector<HTMLInputElement>('.ig-navbar input[type="file"]')!;
    assert.equal(input.accept, '.csv,.tsv,.txt,.xlsx');
    const file = new window.File(['Name,Quantity\nA,1\nB,x'], 'rows.csv');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(grid.getRows().map(r => r.name), ['A', 'B']);
    assert.match(grid.root.querySelector('.ig-status')!.textContent!, /2 row\(s\) imported, 1 value\(s\) did not fit/);
    grid.destroy();
});
