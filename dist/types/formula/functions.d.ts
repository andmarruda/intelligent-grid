import type { FormulaValue, TextContext } from './values.js';
import type { AstNode } from './parser.js';
export interface FunctionContext extends TextContext {
    locale?: string;
}
/** Function result; undefined is read as blank. */
export type FunctionResult = FormulaValue | undefined;
export type FormulaFunction = (args: FormulaValue[], ctx: FunctionContext) => FunctionResult;
/** evaluate() reads a missing argument as blank. */
export type LazyFormulaFunction = (args: AstNode[], ctx: FunctionContext, evaluate: (node: AstNode | undefined) => FormulaValue) => FunctionResult;
export interface FunctionOptions {
    lazy?: boolean;
    errors?: boolean;
}
export interface FunctionDefinition {
    fn: FormulaFunction | LazyFormulaFunction;
    lazy: boolean;
    errors: boolean;
}
export declare function defineFunction(name: string, fn: FormulaFunction, options?: FunctionOptions): void;
export declare function defineLazyFunction(name: string, fn: LazyFormulaFunction): void;
export declare function getFunction(name: string): FunctionDefinition | undefined;
export declare function listFunctions(): string[];
/**
 * Excel criteria for COUNTIF/SUMIF...: 5, ">5", "<>done", "a*", "=".
 */
export declare function compileCriteria(criteria: FormulaValue | undefined): (value: FormulaValue | undefined) => boolean;
export declare function parseLocaleNumber(text: string, locale?: string): number;
//# sourceMappingURL=functions.d.ts.map