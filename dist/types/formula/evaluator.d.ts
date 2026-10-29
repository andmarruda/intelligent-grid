import type { FormulaValue } from './values.js';
import type { FunctionContext, FunctionDefinition } from './functions.js';
import { FormulaSyntaxError } from './parser.js';
import type { AstNode } from './parser.js';
export interface EvaluationContext extends FunctionContext {
    rowValue: (field: string) => FormulaValue;
    columnValues: (field: string) => FormulaValue;
    name?: (name: string) => FormulaValue | undefined;
    functions?: Map<string, FunctionDefinition>;
    /**
     * Results of row independent subexpressions, shared by every row of one calculation pass:
     * SUM([total]) in =[@total]/SUM([total]) is computed once per column instead of once per row.
     */
    memo?: Map<AstNode, FormulaValue>;
}
export declare function evaluate(node: AstNode, ctx: EvaluationContext): FormulaValue;
/**
 * Final value of a cell: arrays cannot spill inside a grid cell, a single item array is unwrapped.
 */
export declare function toCellResult(value: FormulaValue): Exclude<FormulaValue, FormulaValue[]>;
export interface CompiledFormula {
    ast: AstNode;
    error: FormulaSyntaxError | null;
}
/**
 * Parses with memoization; syntax errors compile to a node that evaluates to #ERROR!.
 */
export declare function compile(formula: string): CompiledFormula;
export declare const isFormula: (value: unknown) => boolean;
//# sourceMappingURL=evaluator.d.ts.map