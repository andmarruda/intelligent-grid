export declare function localeSeparators(locale: string): {
    group: string;
    decimal: string;
};
export declare function isDateFormat(code: string | null | undefined): boolean;
/**
 * @param value number, ISO date string, text or boolean
 * @param code Excel format code
 */
export declare function formatValue(value: unknown, code: string | null | undefined, locale?: string): string;
//# sourceMappingURL=numfmt.d.ts.map