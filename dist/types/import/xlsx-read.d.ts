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
export declare const unescapeXml: (text: string) => string;
/** 0-based column index of a reference such as "AB12". */
export declare function columnIndex(reference: string): number;
/** Whether a number format code shows a date or time (ignoring text in quotes, brackets and escapes). */
export declare function isDateFormat(code: string): boolean;
export declare function readXlsx(input: Uint8Array | ArrayBuffer, { sheet }?: ReadXlsxOptions): Promise<XlsxSheet>;
//# sourceMappingURL=xlsx-read.d.ts.map