/**
 * CSV / TSV parsing (RFC 4180): quoted fields may hold delimiters, line breaks and doubled quotes.
 * Also used for clipboard text, where Excel quotes cells that contain line breaks.
 */
/** Picks the delimiter that splits the first line into the most fields: comma, semicolon or tab. */
export declare function detectDelimiter(text: string): string;
/**
 * Splits delimited text into rows of fields.
 * @param delimiter default: detected from the first line
 */
export declare function parseDelimited(text: string, delimiter?: string): string[][];
//# sourceMappingURL=delimited.d.ts.map