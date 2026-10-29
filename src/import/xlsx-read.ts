/**
 * Reads the cells of an .xlsx sheet: numbers, text (shared and inline), booleans, errors, and dates
 * (numbers with a date format, returned as ISO strings). Formulas come back as their cached value.
 */
import { listZip, readZipText } from './unzip.ts';
import { serialToISO } from '../formula/dates.ts';

export type SheetValue = string | number | boolean | null;

export interface XlsxSheet {
    name: string;
    /** Cells by row, from A1; missing cells are null. */
    rows: SheetValue[][];
}

export interface ReadXlsxOptions {
    /** Sheet name or 0-based index (default the first sheet). */
    sheet?: string | number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export const unescapeXml = (text: string): string => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] === '#') return String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return ENTITIES[code] ?? match;
});

const attribute = (tag: string, name: string): string | null => {
    const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return match ? unescapeXml(match[1]!) : null;
};

/** Text of every <t> inside a fragment (rich text runs are joined, phonetic runs skipped). */
function textOf(fragment: string): string {
    let text = '';
    for (const match of fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) text += unescapeXml(match[1] ?? '');
    return text;
}

/** 0-based column index of a reference such as "AB12". */
export function columnIndex(reference: string): number {
    let index = 0;
    for (const char of reference) {
        const code = char.charCodeAt(0);
        if (code < 65 || code > 90) break;
        index = index * 26 + code - 64;
    }
    return index - 1;
}

/** Built-in number formats that are dates or times. */
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Whether a number format code shows a date or time (ignoring text in quotes, brackets and escapes). */
export function isDateFormat(code: string): boolean {
    const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
}

/** Style index → whether it formats numbers as dates (and with a time). */
function dateStyles(styles: string): Array<'date' | 'datetime' | null> {
    const custom = new Map<number, string>();
    for (const match of styles.matchAll(/<numFmt\b[^>]*>/g)) {
        custom.set(Number(attribute(match[0], 'numFmtId')), attribute(match[0], 'formatCode') ?? '');
    }
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
    return [...xfs.matchAll(/<xf\b[^>]*>/g)].map(match => {
        const id = Number(attribute(match[0], 'numFmtId') ?? 0);
        const code = custom.get(id);
        const isDate = code !== undefined ? isDateFormat(code) : DATE_FORMAT_IDS.has(id);
        if (!isDate) return null;
        const withTime = code !== undefined ? /[hs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) : id === 22 || id >= 18 && id <= 21 || id >= 45;
        return withTime ? 'datetime' : 'date';
    });
}

export async function readXlsx(input: Uint8Array | ArrayBuffer, { sheet = 0 }: ReadXlsxOptions = {}): Promise<XlsxSheet> {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const entries = listZip(bytes);
    const read = async (name: string) => {
        const entry = entries.get(name);
        return entry ? readZipText(bytes, entry) : null;
    };

    const workbook = await read('xl/workbook.xml');
    if (!workbook) throw new Error('Not an .xlsx file (xl/workbook.xml is missing)');
    const relations = (await read('xl/_rels/workbook.xml.rels')) ?? '';
    const targets = new Map([...relations.matchAll(/<Relationship\b[^>]*>/g)].map(m => [attribute(m[0], 'Id'), attribute(m[0], 'Target')]));
    const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: attribute(m[0], 'name') ?? '', target: targets.get(attribute(m[0], 'r:id')) ?? null }));
    const chosen = typeof sheet === 'number' ? sheets[sheet] : sheets.find(s => s.name === sheet);
    if (!chosen?.target) throw new Error(`Sheet ${JSON.stringify(sheet)} not found`);
    const path = chosen.target.startsWith('/') ? chosen.target.slice(1) : `xl/${chosen.target.replace(/^\.\//, '')}`;
    const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(workbook);

    const shared = [...((await read('xl/sharedStrings.xml')) ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]!));
    const styles = dateStyles((await read('xl/styles.xml')) ?? '');
    const xml = await read(path);
    if (xml === null) throw new Error(`Sheet file ${path} is missing`);

    const rows: SheetValue[][] = [];
    for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const rowNumber = Number(attribute(rowMatch[1]!, 'r') ?? rows.length + 1);
        const cells: SheetValue[] = [];
        let next = 0;
        for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const tag = cellMatch[1]!;
            const body = cellMatch[2] ?? '';
            const reference = attribute(tag, 'r');
            const index = reference ? columnIndex(reference) : next;
            next = index + 1;
            const type = attribute(tag, 't') ?? 'n';
            const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
            let value: SheetValue = null;
            if (type === 'inlineStr') value = textOf(body);
            else if (raw === undefined) value = null;
            else if (type === 's') value = shared[Number(raw)] ?? '';
            else if (type === 'str' || type === 'e') value = unescapeXml(raw);
            else if (type === 'b') value = raw === '1';
            else {
                const number = Number(raw);
                const kind = styles[Number(attribute(tag, 's') ?? 0)];
                value = kind && Number.isFinite(number) ? serialToISO(number + (date1904 ? 1462 : 0), kind === 'datetime') : number;
            }
            while (cells.length < index) cells.push(null);
            cells[index] = value;
        }
        while (rows.length < rowNumber - 1) rows.push([]);
        rows[rowNumber - 1] = cells;
    }
    return { name: chosen.name, rows };
}
