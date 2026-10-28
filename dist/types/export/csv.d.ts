export interface CsvColumn {
    field: string;
    title: string;
}
export interface CsvOptions<C extends CsvColumn> {
    delimiter?: string;
    header?: boolean;
    formatted?: boolean;
    sanitize?: boolean;
    decimal?: string;
    lineBreak?: string;
    format?: (value: unknown, column: C, row: Record<string, unknown>) => unknown;
}
/**
 */
export declare function toCSV<C extends CsvColumn>(rows: Array<Record<string, unknown>>, columns: C[], options?: CsvOptions<C>): string;
//# sourceMappingURL=csv.d.ts.map