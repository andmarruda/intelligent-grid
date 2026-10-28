/**
 * Excel date serials (1900 date system): integer part = days since 1899-12-30, fraction = time of day.
 * Grid rows keep dates as ISO strings ('2026-10-28' or '2026-10-28T14:30'), formulas work with serials.
 */
const MS_PER_DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

export interface DateParts {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    weekday: number;
}

export function isISODate(value: unknown): value is string {
    return typeof value === 'string' && ISO_DATE.test(value);
}

export function partsToSerial(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): number {
    return (Date.UTC(year, month - 1, day, hours, minutes, seconds) - EPOCH) / MS_PER_DAY;
}

/**
 * Converts ISO strings and Date objects to a serial, returns null when it is not a date.
 */
export function toSerial(value: unknown): number | null {
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return partsToSerial(value.getFullYear(), value.getMonth() + 1, value.getDate(),
            value.getHours(), value.getMinutes(), value.getSeconds());
    }

    if (typeof value === 'number') return value;

    if (typeof value === 'string') {
        const match = ISO_DATE.exec(value);
        if (!match) return null;
        const [y, m, d, h = 0, mi = 0, s = 0] = match.slice(1).map(part => part === undefined ? undefined : Number(part));
        return partsToSerial(y!, m!, d!, h, mi, s);
    }

    return null;
}

export function serialToParts(serial: number): DateParts {
    // round to the second to avoid 23:59:59.999 artifacts from floating point
    const ms = Math.round((serial * MS_PER_DAY) / 1000) * 1000 + EPOCH;
    const date = new Date(ms);
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hours: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        seconds: date.getUTCSeconds(),
        weekday: date.getUTCDay()
    };
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

export function serialToISO(serial: number, withTime = false): string {
    const p = serialToParts(serial);
    const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
    return withTime ? `${date}T${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}` : date;
}

export function todaySerial(): number {
    return Math.floor(toSerial(new Date())!);
}

export function nowSerial(): number {
    return toSerial(new Date())!;
}
