/**
 * Subset of Excel number format codes, used by TEXT(), column "format" and the XLSX export
 * (the same code string is written as the cell numFmt, so the grid and Excel display the same thing).
 *
 * Supported: General, 0 # ? . , % "literals" \x [Red]-like colors (ignored) [$R$-416] currency,
 * up to four sections (positive;negative;zero;text), @ text placeholder,
 * dates/times yyyy yy mmmm mmm mm m dddd ddd dd d hh h mm ss AM/PM.
 */
import { serialToParts, toSerial } from './dates.ts';
import { formatGeneral } from './values.ts';

interface FormatToken {
    literal?: string;
    code?: string;
}

const separatorsCache = new Map<string, { group: string; decimal: string }>();

export function localeSeparators(locale: string): { group: string; decimal: string } {
    let separators = separatorsCache.get(locale);
    if (!separators) {
        const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
        separators = {
            group: parts.find(p => p.type === 'group')?.value ?? ',',
            decimal: parts.find(p => p.type === 'decimal')?.value ?? '.'
        };
        separatorsCache.set(locale, separators);
    }
    return separators;
}

function splitSections(code: string): string[] {
    const sections: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i]!;
        if (ch === '"') quoted = !quoted;
        if (ch === '\\' && !quoted) {
            current += ch + (code[i + 1] ?? '');
            i++;
            continue;
        }
        if (ch === ';' && !quoted) {
            sections.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    sections.push(current);
    return sections;
}

/**
 * Splits a section in literal and code tokens, resolving quotes, escapes and bracket tokens.
 */
function lex(section: string): FormatToken[] {
    const tokens: FormatToken[] = [];
    for (let i = 0; i < section.length; i++) {
        const ch = section[i]!;
        if (ch === '"') {
            const end = section.indexOf('"', i + 1);
            tokens.push({ literal: section.slice(i + 1, end === -1 ? undefined : end) });
            i = end === -1 ? section.length : end;
        } else if (ch === '\\') {
            tokens.push({ literal: section[i + 1] ?? '' });
            i++;
        } else if (ch === '[') {
            const end = section.indexOf(']', i);
            const inner = section.slice(i + 1, end);
            // [$R$-416] => currency symbol, [Red] / [>100] => ignored
            if (inner.startsWith('$')) tokens.push({ literal: inner.slice(1).split('-')[0] });
            i = end === -1 ? section.length : end;
        } else if (ch === '_' || ch === '*') {
            // padding directives, keep a space for "_"
            if (ch === '_') tokens.push({ literal: ' ' });
            i++;
        } else {
            tokens.push({ code: ch });
        }
    }
    return tokens;
}

const codeText = (tokens: FormatToken[]): string => tokens.map(t => t.code ?? '').join('');

export function isDateFormat(code: string | null | undefined): boolean {
    if (!code || /^general$/i.test(code)) return false;
    const text = codeText(lex(splitSections(code)[0]!));
    return /[ydhs]/i.test(text) || (/m/i.test(text) && !/[0#?]/.test(text));
}

function formatDate(serial: number, tokens: FormatToken[], locale: string): string {
    const p = serialToParts(serial);
    const text = codeText(tokens);
    const hasAmPm = /AM\/PM|A\/P/i.test(text);
    const monthName = (style: 'long' | 'short') => new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' })
        .format(new Date(Date.UTC(2000, p.month - 1, 1)));
    const dayName = (style: 'long' | 'short') => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' })
        .format(new Date(Date.UTC(2000, 0, 2 + p.weekday)));
    const pad = (n: number) => String(n).padStart(2, '0');

    // merge consecutive code chars into runs so "yyyy" / "mm" are read as one token
    const codes: FormatToken[] = [];
    for (const token of tokens) {
        if (token.literal !== undefined) {
            codes.push(token);
            continue;
        }
        const prev = codes[codes.length - 1];
        if (prev?.code && prev.code[0]!.toLowerCase() === token.code!.toLowerCase() && /[ymdhs]/i.test(token.code!)) {
            prev.code += token.code;
        } else {
            codes.push({ code: token.code });
        }
    }

    let out = '';
    let lastWasHour = false;
    for (let i = 0; i < codes.length; i++) {
        const token = codes[i]!;
        if (token.literal !== undefined) {
            out += token.literal;
            continue;
        }
        const run = token.code!;
        const lower = run.toLowerCase();
        const rest = () => codes.slice(i).map(t => t.code ?? t.literal).join('');

        if (lower[0] === 'y') {
            out += run.length <= 2 ? pad(p.year % 100) : String(p.year);
        } else if (lower[0] === 'm') {
            // "m" right after an hour or before seconds means minutes
            const nextCode = codes.slice(i + 1).find(t => t.code && /[a-z]/i.test(t.code));
            const isMinute = lastWasHour || nextCode?.code?.[0]?.toLowerCase() === 's';
            if (isMinute) out += run.length >= 2 ? pad(p.minutes) : String(p.minutes);
            else if (run.length >= 4) out += monthName('long');
            else if (run.length === 3) out += monthName('short').replace('.', '');
            else out += run.length === 2 ? pad(p.month) : String(p.month);
        } else if (lower[0] === 'd') {
            if (run.length >= 4) out += dayName('long');
            else if (run.length === 3) out += dayName('short').replace('.', '');
            else out += run.length === 2 ? pad(p.day) : String(p.day);
        } else if (lower[0] === 'h') {
            let hours = p.hours;
            if (hasAmPm) hours = hours % 12 || 12;
            out += run.length >= 2 ? pad(hours) : String(hours);
            lastWasHour = true;
            continue;
        } else if (lower[0] === 's') {
            out += run.length >= 2 ? pad(p.seconds) : String(p.seconds);
        } else if (lower === 'a' && /^AM\/PM/i.test(rest())) {
            out += p.hours < 12 ? 'AM' : 'PM';
            i += 4;
        } else if (lower === 'a' && /^A\/P/i.test(rest())) {
            out += p.hours < 12 ? 'A' : 'P';
            i += 2;
        } else {
            out += run;
        }
        if (/[a-z]/i.test(run)) lastWasHour = false;
    }

    return out;
}

function roundTo(number: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(number * factor * (1 + Number.EPSILON)) / factor;
}

function formatNumber(value: number, tokens: FormatToken[], locale: string, signed: boolean): string {
    const { group, decimal } = localeSeparators(locale);
    const text = codeText(tokens);
    const percent = (text.match(/%/g) ?? []).length;
    let number = value * Math.pow(100, percent);

    const first = tokens.findIndex(t => t.code && /[0#?]/.test(t.code));
    if (first === -1) {
        return tokens.map(t => t.literal ?? (t.code === '@' ? '' : t.code)).join('');
    }
    let last = first;
    tokens.forEach((t, i) => {
        if (t.code && /[0#?.,]/.test(t.code) && i > first) last = i;
    });

    const pattern = codeText(tokens.slice(first, last + 1));
    const [intPattern = '', decPattern = ''] = pattern.split('.');
    const useGrouping = intPattern.includes(',');
    // trailing commas scale by thousands (#,##0, => thousands)
    const scaleCommas = (intPattern.match(/,+$/) ?? [''])[0].length;
    number = number / Math.pow(1000, scaleCommas);

    const minInt = (intPattern.match(/0/g) ?? []).length;
    const maxDec = (decPattern.match(/[0#?]/g) ?? []).length;
    const minDec = (decPattern.match(/0/g) ?? []).length;

    const negative = number < 0;
    const fixed = roundTo(Math.abs(number), maxDec).toFixed(maxDec);
    let [intPart = '', decPart = ''] = fixed.split('.');
    while (decPart.length > minDec && decPart.endsWith('0')) decPart = decPart.slice(0, -1);
    if (intPart === '0' && minInt === 0) intPart = '';
    intPart = intPart.padStart(minInt, '0');
    if (useGrouping) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);

    const numeric = intPart + (decPart ? decimal + decPart : (decPattern.includes('0') ? decimal : ''));
    const prefix = tokens.slice(0, first).map(t => t.literal ?? t.code).join('');
    const suffix = tokens.slice(last + 1).map(t => t.literal ?? t.code).join('');
    const sign = signed && negative && Number(fixed) !== 0 ? '-' : '';
    return sign + prefix + numeric + suffix;
}

/**
 * @param value number, ISO date string, text or boolean
 * @param code Excel format code
 */
export function formatValue(value: unknown, code: string | null | undefined, locale = 'en-US'): string {
    if (value === null || value === undefined) return '';
    if (!code || /^general$/i.test(code)) {
        if (typeof value === 'number') return formatGeneral(value, localeSeparators(locale).decimal);
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        return String(value);
    }

    const sections = splitSections(code);

    if (typeof value !== 'number') {
        const serial = isDateFormat(code) ? toSerial(value) : null;
        if (serial === null) {
            const textSection = sections[3] ?? (sections.length === 1 && sections[0]!.includes('@') ? sections[0] : null);
            if (!textSection) return typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value);
            return lex(textSection).map(t => t.literal ?? (t.code === '@' ? String(value) : t.code)).join('');
        }
        value = serial;
    }

    const number = value as number;
    let section = sections[0]!;
    let signed = true;
    if (number < 0 && sections[1] !== undefined && sections[1] !== '') {
        section = sections[1];
        signed = false;
    } else if (number === 0 && sections[2] !== undefined && sections[2] !== '') {
        section = sections[2];
    }

    const tokens = lex(section);
    if (isDateFormat(section)) return formatDate(number, tokens, locale);
    return formatNumber(signed ? number : Math.abs(number), tokens, locale, signed);
}
