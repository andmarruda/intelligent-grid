export declare class FormulaSyntaxError extends Error {
    position: number;
    constructor(message: string, position: number);
}
export type ReferenceScope = 'row' | 'column';
export type AstNode = {
    type: 'number';
    value: number;
} | {
    type: 'string';
    value: string;
} | {
    type: 'boolean';
    value: boolean;
} | {
    type: 'error';
    code: string;
} | {
    type: 'empty';
} | {
    type: 'ref';
    field: string;
    scope: ReferenceScope;
} | {
    type: 'name';
    name: string;
} | {
    type: 'call';
    name: string;
    args: AstNode[];
} | {
    type: 'unary';
    op: '-' | '+';
    arg: AstNode;
} | {
    type: 'postfix';
    op: '%';
    arg: AstNode;
} | {
    type: 'binary';
    op: string;
    left: AstNode;
    right: AstNode;
} | {
    type: 'array';
    items: AstNode[];
};
type Token = {
    type: 'number';
    value: number;
    pos: number;
} | {
    type: 'string' | 'error' | 'identifier' | 'operator' | 'separator' | '(' | ')' | '{' | '}';
    value: string;
    pos: number;
} | {
    type: 'boolean';
    value: boolean;
    pos: number;
} | {
    type: 'reference';
    value: {
        field: string;
        scope: ReferenceScope;
    };
    pos: number;
} | {
    type: 'eof';
    value: null;
    pos: number;
};
/**
 * @param source formula without the leading "="
 */
export declare function tokenize(source: string): Token[];
export declare function parse(source: string): AstNode;
export interface FormulaDependencies {
    row: Set<string>;
    column: Set<string>;
    names: Set<string>;
    functions: Set<string>;
}
/**
 * Lists everything a formula depends on.
 */
export declare function collectDependencies(ast: AstNode): FormulaDependencies;
/**
 * Prints an AST back as an Excel formula. resolveRef(field, scope) returns the A1 text for a reference,
 * or null when it cannot be expressed (the whole print then returns null).
 */
export declare function toExcelFormula(ast: AstNode, resolveRef: (field: string, scope: ReferenceScope) => string | null | undefined, resolveName?: (name: string) => string | null | undefined): string | null;
export {};
//# sourceMappingURL=parser.d.ts.map