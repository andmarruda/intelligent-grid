import type { Column, RowData } from '../types.js';
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
export declare function columnLetter(index: number): string;
export declare function toXLSX({ columns, rows, formulaFor, sheetName, formulas, freezeHeader, autoFilter, footer }: XlsxOptions): Uint8Array<ArrayBuffer>;
/**
 * Triggers a browser download.
 */
export declare function download(data: BlobPart | Blob, filename: string, mime: string): void;
//# sourceMappingURL=xlsx.d.ts.map