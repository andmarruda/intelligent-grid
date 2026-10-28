/**
 * Excel-compatible formula error values.
 * Errors are values: they flow through calculations until something handles them (IFERROR, ISERROR...).
 */
export class FormulaError {
    code: string;
    message: string;

    constructor(code: string, message = '') {
        this.code = code;
        this.message = message;
    }

    toString(): string {
        return this.code;
    }
}

export const ERRORS = Object.freeze({
    DIV0: '#DIV/0!',
    VALUE: '#VALUE!',
    NAME: '#NAME?',
    REF: '#REF!',
    NA: '#N/A',
    NUM: '#NUM!',
    NULL: '#NULL!',
    CIRC: '#CIRC!',
    SYNTAX: '#ERROR!'
});

export type ErrorCode = typeof ERRORS[keyof typeof ERRORS];

const ERROR_CODES = new Set<string>(Object.values(ERRORS));

export const err = (code: string, message?: string): FormulaError => new FormulaError(code, message);

export const isError = (value: unknown): value is FormulaError => value instanceof FormulaError;

/**
 * Error codes are stored in SorlaDB documents as plain strings (class instances do not survive structuredClone),
 * this restores them when the value is read back by the engine.
 */
export const isErrorCode = (value: unknown): value is string => typeof value === 'string' && ERROR_CODES.has(value);

export const reviveError = <T>(value: T): T | FormulaError => isErrorCode(value) ? err(value) : value;
