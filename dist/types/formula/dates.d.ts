export interface DateParts {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    weekday: number;
}
export declare function isISODate(value: unknown): value is string;
export declare function partsToSerial(year: number, month: number, day: number, hours?: number, minutes?: number, seconds?: number): number;
/**
 * Converts ISO strings and Date objects to a serial, returns null when it is not a date.
 */
export declare function toSerial(value: unknown): number | null;
export declare function serialToParts(serial: number): DateParts;
export declare function serialToISO(serial: number, withTime?: boolean): string;
export declare function todaySerial(): number;
export declare function nowSerial(): number;
//# sourceMappingURL=dates.d.ts.map