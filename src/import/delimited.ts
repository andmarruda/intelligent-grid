/**
 * CSV / TSV parsing (RFC 4180): quoted fields may hold delimiters, line breaks and doubled quotes.
 * Also used for clipboard text, where Excel quotes cells that contain line breaks.
 */

/** Picks the delimiter that splits the first line into the most fields: comma, semicolon or tab. */
export function detectDelimiter(text: string): string {
    const line = text.slice(0, text.search(/\r?\n|$/));
    let best = ',';
    let bestCount = 0;
    for (const candidate of [',', ';', '\t']) {
        let count = 0;
        let quoted = false;
        for (const char of line) {
            if (char === '"') quoted = !quoted;
            else if (char === candidate && !quoted) count++;
        }
        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }
    return best;
}

/**
 * Splits delimited text into rows of fields.
 * @param delimiter default: detected from the first line
 */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let i = 0;
    const length = text.length;
    while (i < length) {
        const char = text[i]!;
        if (char === '"' && field === '') {
            // quoted field: runs until a quote that is not doubled
            i++;
            while (i < length) {
                if (text[i] === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                field += text[i];
                i++;
            }
            continue;
        }
        if (char === delimiter) {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            if (char === '\r' && text[i + 1] === '\n') i++;
        } else {
            field += char;
        }
        i++;
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
