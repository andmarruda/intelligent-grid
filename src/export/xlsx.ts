/**
 * XLSX (Office Open XML) export without dependencies.
 *
 * Numbers, booleans, dates (as serials with a date format) and errors keep their Excel types,
 * column formats become numFmt codes, and formula columns/footers are written as real Excel
 * formulas (structured references translated to A1) together with their computed values.
 */
import { zip } from './zip.ts';
import { compile } from '../formula/evaluator.ts';
import { toExcelFormula } from '../formula/parser.ts';
import { isErrorCode } from '../formula/errors.ts';
import { toSerial } from '../formula/dates.ts';
import { DATE_TYPES } from '../core/columns.ts';
import { isBlank } from '../core/store.ts';
import type { Column, RowData } from '../types.ts';

export interface XlsxColumn extends Column {
    numFmt?: string | null;
}

export interface XlsxFooterCell {
    formula: string | null;
    value: unknown;
}

export interface XlsxOptions {
    columns: XlsxColumn[];
    rows: RowData[];
    formulaFor?: (row: RowData, column: XlsxColumn) => string | null;
    sheetName?: string;
    /** write formulas (default true), false writes values only */
    formulas?: boolean;
    freezeHeader?: boolean;
    autoFilter?: boolean;
    footer?: Record<string, XlsxFooterCell> | null;
}

const xml = (text: unknown): string => String(text)
    // characters XML 1.0 does not allow
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function columnLetter(index: number): string {
    let letters = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    return letters;
}

export function toXLSX({ columns, rows, formulaFor = () => null, sheetName = 'Sheet1', formulas = true, freezeHeader = true, autoFilter = true, footer = null }: XlsxOptions): Uint8Array<ArrayBuffer> {
    const letters = new Map(columns.map((c, i) => [c.field, columnLetter(i)]));
    const lastDataRow = rows.length + 1;

    const numFmts: string[] = [];
    const fmtId = (code: string | null | undefined): number => {
        if (!code || code === 'General') return 0;
        let index = numFmts.indexOf(code);
        if (index === -1) index = numFmts.push(code) - 1;
        return 164 + index;
    };
    // style 0 default, 1 header, then one per column (data) and one per column (footer, bold)
    const columnStyles = columns.map((c, i) => ({ data: 2 + i * 2, footer: 3 + i * 2, numFmt: fmtId(c.numFmt) }));

    const translate = (formula: string, rowNumber: number): string | null => {
        const { ast, error } = compile(formula);
        if (error) return null;
        return toExcelFormula(ast, (field, scope) => {
            const letter = letters.get(field);
            if (!letter) return null;
            return scope === 'row' ? `${letter}${rowNumber}` : `${letter}$2:${letter}$${lastDataRow}`;
        });
    };

    const cellXml = (ref: string, value: unknown, column: XlsxColumn | null, style: number, formula: string | null, rowNumber: number): string => {
        const f = formulas && formula ? translate(formula, rowNumber) : null;
        const fXml = f ? `<f>${xml(f)}</f>` : '';
        if (isBlank(value)) return fXml ? `<c r="${ref}" s="${style}">${fXml}</c>` : `<c r="${ref}" s="${style}"/>`;
        if (isErrorCode(value)) return `<c r="${ref}" s="${style}" t="e">${fXml}<v>${xml(value)}</v></c>`;
        if (typeof value === 'boolean') return `<c r="${ref}" s="${style}" t="b">${fXml}<v>${value ? 1 : 0}</v></c>`;
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}">${fXml}<v>${value}</v></c>`;
        if (column && DATE_TYPES.has(column.type)) {
            const serial = toSerial(value);
            if (serial !== null) return `<c r="${ref}" s="${style}">${fXml}<v>${serial}</v></c>`;
        }
        if (fXml) return `<c r="${ref}" s="${style}" t="str">${fXml}<v>${xml(value)}</v></c>`;
        return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    };

    const sheetRows: string[] = [];
    sheetRows.push(`<row r="1">${columns.map((c, i) => cellXml(`${columnLetter(i)}1`, c.title, null, 1, null, 1)).join('')}</row>`);
    rows.forEach((row, r) => {
        const rowNumber = r + 2;
        const cells = columns.map((c, i) => cellXml(`${columnLetter(i)}${rowNumber}`, row[c.field], c, columnStyles[i]!.data, formulaFor(row, c), rowNumber));
        sheetRows.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
    });

    if (footer) {
        const rowNumber = lastDataRow + 1;
        const cells = columns.map((c, i) => {
            const item = footer[c.field];
            if (!item) return '';
            return cellXml(`${columnLetter(i)}${rowNumber}`, item.value, c, columnStyles[i]!.footer, item.formula, rowNumber);
        }).join('');
        sheetRows.push(`<row r="${rowNumber}">${cells}</row>`);
    }

    const lastColumn = columnLetter(Math.max(columns.length - 1, 0));
    const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.round((c.width ?? 120) / 7))}" customWidth="1"/>`).join('');
    const pane = freezeHeader ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    const filter = autoFilter && columns.length ? `<autoFilter ref="A1:${lastColumn}${lastDataRow}"/>` : '';

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${sheetRows.join('')}</sheetData>${filter}</worksheet>`;

    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'];
    for (const style of columnStyles) {
        xfs.push(`<xf numFmtId="${style.numFmt}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`);
        xfs.push(`<xf numFmtId="${style.numFmt}" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`);
    }
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(code)}"/>`).join('')}</numFmts>` : ''}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF3"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;

    const safeName = xml(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
    const definedName = filter ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${safeName.replace(/'/g, "''")}'!$A$1:$${lastColumn}$${lastDataRow}</definedName></definedNames>` : '';

    return zip([
        { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
        { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>${definedName}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
        { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
        { name: 'xl/styles.xml', data: styles },
        { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ]);
}

/**
 * Triggers a browser download.
 */
export function download(data: BlobPart | Blob, filename: string, mime: string): void {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
