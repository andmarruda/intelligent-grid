/**
 * Excel-compatible formula error values.
 * Errors are values: they flow through calculations until something handles them (IFERROR, ISERROR...).
 */
export declare class FormulaError {
    code: string;
    message: string;
    constructor(code: string, message?: string);
    toString(): string;
}
export declare const ERRORS: Readonly<{
    DIV0: "#DIV/0!";
    VALUE: "#VALUE!";
    NAME: "#NAME?";
    REF: "#REF!";
    NA: "#N/A";
    NUM: "#NUM!";
    NULL: "#NULL!";
    CIRC: "#CIRC!";
    SYNTAX: "#ERROR!";
}>;
export type ErrorCode = typeof ERRORS[keyof typeof ERRORS];
export declare const err: (code: string, message?: string) => FormulaError;
export declare const isError: (value: unknown) => value is FormulaError;
/**
 * Error codes are stored in SorlaDB documents as plain strings (class instances do not survive structuredClone),
 * this restores them when the value is read back by the engine.
 */
export declare const isErrorCode: (value: unknown) => value is string;
export declare const reviveError: <T>(value: T) => T | FormulaError;
//# sourceMappingURL=errors.d.ts.map