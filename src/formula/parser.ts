/**
 * Tokenizer and Pratt parser for the Excel-like formula language.
 *
 * Grid formulas use Excel table structured references instead of A1 addresses, because rows move
 * when the grid is sorted or filtered:
 *   [@price]          value of the column "price" in the current row
 *   [@[unit price]]   same, for names with spaces or symbols
 *   [price]           every value of the column "price" (a range, like Table1[price] in Excel)
 *
 * Arguments may be separated by "," or ";" (the separator used by pt-BR Excel). Decimals always use ".".
 */
import { ERRORS } from './errors.ts';

export class FormulaSyntaxError extends Error {
    position: number;

    constructor(message: string, position: number) {
        super(`${message} (at ${position})`);
        this.position = position;
    }
}

export type ReferenceScope = 'row' | 'column';

export type AstNode =
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'boolean'; value: boolean }
    | { type: 'error'; code: string }
    | { type: 'empty' }
    | { type: 'ref'; field: string; scope: ReferenceScope }
    | { type: 'name'; name: string }
    | { type: 'call'; name: string; args: AstNode[] }
    | { type: 'unary'; op: '-' | '+'; arg: AstNode }
    | { type: 'postfix'; op: '%'; arg: AstNode }
    | { type: 'binary'; op: string; left: AstNode; right: AstNode }
    | { type: 'array'; items: AstNode[] };

type Token =
    | { type: 'number'; value: number; pos: number }
    | { type: 'string' | 'error' | 'identifier' | 'operator' | 'separator' | '(' | ')' | '{' | '}'; value: string; pos: number }
    | { type: 'boolean'; value: boolean; pos: number }
    | { type: 'reference'; value: { field: string; scope: ReferenceScope }; pos: number }
    | { type: 'eof'; value: null; pos: number };

const ERROR_LITERALS = Object.values(ERRORS).sort((a, b) => b.length - a.length);
const OPERATORS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%'];

/**
 * @param source formula without the leading "="
 */
export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < source.length) {
        const ch = source[i]!;

        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        const start = i;

        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
            const match = /^(\d*\.?\d+|\d+\.)(e[+-]?\d+)?/i.exec(source.slice(i))!;
            tokens.push({ type: 'number', value: Number(match[0]), pos: start });
            i += match[0].length;
            continue;
        }

        if (ch === '"') {
            let value = '';
            i++;
            while (true) {
                if (i >= source.length) throw new FormulaSyntaxError('Unterminated string', start);
                if (source[i] === '"') {
                    if (source[i + 1] === '"') {
                        value += '"';
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                value += source[i++];
            }
            tokens.push({ type: 'string', value, pos: start });
            continue;
        }

        if (ch === '[') {
            const { value, end } = readReference(source, i);
            tokens.push({ type: 'reference', value, pos: start });
            i = end;
            continue;
        }

        if (ch === '#') {
            const literal = ERROR_LITERALS.find(code => source.slice(i, i + code.length).toUpperCase() === code);
            if (!literal) throw new FormulaSyntaxError('Unknown error literal', start);
            tokens.push({ type: 'error', value: literal, pos: start });
            i += literal.length;
            continue;
        }

        if (/[A-Za-z_À-ɏ]/.test(ch)) {
            const word = /^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*/.exec(source.slice(i))![0];
            const upper = word.toUpperCase();
            i += word.length;
            if ((upper === 'TRUE' || upper === 'FALSE') && source[i] !== '(') {
                tokens.push({ type: 'boolean', value: upper === 'TRUE', pos: start });
            } else {
                tokens.push({ type: 'identifier', value: word, pos: start });
            }
            continue;
        }

        const op = OPERATORS.find(candidate => source.startsWith(candidate, i));
        if (op) {
            tokens.push({ type: 'operator', value: op, pos: start });
            i += op.length;
            continue;
        }

        if (ch === '(' || ch === ')' || ch === '{' || ch === '}') {
            tokens.push({ type: ch, value: ch, pos: start });
            i++;
            continue;
        }

        if (ch === ',' || ch === ';') {
            tokens.push({ type: 'separator', value: ch, pos: start });
            i++;
            continue;
        }

        throw new FormulaSyntaxError(`Unexpected character "${ch}"`, start);
    }

    tokens.push({ type: 'eof', value: null, pos: source.length });
    return tokens;
}

function readReference(source: string, start: number): { value: { field: string; scope: ReferenceScope }; end: number } {
    let i = start + 1;
    let scope: ReferenceScope = 'column';

    if (source[i] === '@') {
        scope = 'row';
        i++;
    }

    let field: string;
    if (source[i] === '[') {
        const close = source.indexOf(']]', i);
        if (close === -1) throw new FormulaSyntaxError('Unterminated reference', start);
        field = source.slice(i + 1, close);
        i = close + 2;
    } else {
        const close = source.indexOf(']', i);
        if (close === -1) throw new FormulaSyntaxError('Unterminated reference', start);
        field = source.slice(i, close);
        i = close + 1;
    }

    field = field.trim();
    if (!field) throw new FormulaSyntaxError('Empty reference', start);

    return { value: { field, scope }, end: i };
}

// binding powers follow Excel precedence: comparison < & < + - < * / < ^ < % < negation
const INFIX: Record<string, number> = {
    '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
    '&': 2,
    '+': 3, '-': 3,
    '*': 4, '/': 4,
    '^': 5
};
const POSTFIX_PERCENT = 6;
const PREFIX = 7;

export function parse(source: string): AstNode {
    const text = String(source).replace(/^\s*=/, '');
    const tokens = tokenize(text);
    let index = 0;

    const peek = (): Token => tokens[index]!;
    const next = (): Token => tokens[index++]!;
    const expect = (type: Token['type']): Token => {
        const token = next();
        if (token.type !== type) throw new FormulaSyntaxError(`Expected "${type}"`, token.pos);
        return token;
    };

    function parseExpression(minBp: number): AstNode {
        let left = parsePrefix();

        while (true) {
            const token = peek();
            if (token.type !== 'operator') break;

            if (token.value === '%') {
                if (POSTFIX_PERCENT < minBp) break;
                next();
                left = { type: 'postfix', op: '%', arg: left };
                continue;
            }

            const bp = INFIX[token.value];
            // all Excel binary operators are left associative (2^3^2 = 64)
            if (bp === undefined || bp <= minBp) break;
            next();
            const right = parseExpression(bp);
            left = { type: 'binary', op: token.value, left, right };
        }

        return left;
    }

    function parsePrefix(): AstNode {
        const token = next();

        switch (token.type) {
            case 'number': return { type: 'number', value: token.value };
            case 'string': return { type: 'string', value: token.value };
            case 'boolean': return { type: 'boolean', value: token.value };
            case 'error': return { type: 'error', code: token.value };
            case 'reference': return { type: 'ref', field: token.value.field, scope: token.value.scope };
            case 'identifier':
                if (peek().type === '(') return parseCall(token.value);
                return { type: 'name', name: token.value };
            case '(': {
                const expr = parseExpression(0);
                expect(')');
                return expr;
            }
            case '{': return parseArray();
            case 'operator':
                if (token.value === '-' || token.value === '+') {
                    return { type: 'unary', op: token.value, arg: parseExpression(PREFIX) };
                }
                break;
        }

        throw new FormulaSyntaxError(token.type === 'eof' ? 'Unexpected end of formula' : `Unexpected "${String(token.value)}"`, token.pos);
    }

    function parseCall(name: string): AstNode {
        expect('(');
        const args: AstNode[] = [];

        if (peek().type === ')') {
            next();
            return { type: 'call', name: name.toUpperCase(), args };
        }

        while (true) {
            const token = peek();
            if (token.type === 'separator' || token.type === ')') {
                args.push({ type: 'empty' });
            } else {
                args.push(parseExpression(0));
            }

            const after = next();
            if (after.type === ')') break;
            if (after.type !== 'separator') throw new FormulaSyntaxError('Expected "," or ")"', after.pos);
        }

        return { type: 'call', name: name.toUpperCase(), args };
    }

    // {1,2,3} is a row, {1;2;3} a column; both evaluate to a flat array in the grid
    function parseArray(): AstNode {
        const items: AstNode[] = [];
        if (peek().type === '}') {
            next();
            return { type: 'array', items };
        }
        while (true) {
            items.push(parseExpression(0));
            const after = next();
            if (after.type === '}') break;
            if (after.type !== 'separator') throw new FormulaSyntaxError('Expected "," or "}"', after.pos);
        }
        return { type: 'array', items };
    }

    const ast = parseExpression(0);
    const last = peek();
    if (last.type !== 'eof') throw new FormulaSyntaxError(`Unexpected "${String(last.value)}"`, last.pos);
    return ast;
}

export interface FormulaDependencies {
    row: Set<string>;
    column: Set<string>;
    names: Set<string>;
    functions: Set<string>;
}

/**
 * Lists everything a formula depends on.
 */
export function collectDependencies(ast: AstNode): FormulaDependencies {
    const deps: FormulaDependencies = { row: new Set(), column: new Set(), names: new Set(), functions: new Set() };

    (function walk(node: AstNode): void {
        switch (node.type) {
            case 'ref':
                deps[node.scope].add(node.field);
                break;
            case 'name':
                deps.names.add(node.name);
                break;
            case 'call':
                deps.functions.add(node.name);
                node.args.forEach(walk);
                break;
            case 'unary':
            case 'postfix':
                walk(node.arg);
                break;
            case 'binary':
                walk(node.left);
                walk(node.right);
                break;
            case 'array':
                node.items.forEach(walk);
                break;
        }
    })(ast);

    return deps;
}

/**
 * Prints an AST back as an Excel formula. resolveRef(field, scope) returns the A1 text for a reference,
 * or null when it cannot be expressed (the whole print then returns null).
 */
export function toExcelFormula(
    ast: AstNode,
    resolveRef: (field: string, scope: ReferenceScope) => string | null | undefined,
    resolveName: (name: string) => string | null | undefined = () => null
): string | null {
    let failed = false;

    const print = (node: AstNode, parentBp = 0): string => {
        switch (node.type) {
            case 'number': return String(node.value);
            case 'string': return `"${node.value.replace(/"/g, '""')}"`;
            case 'boolean': return node.value ? 'TRUE' : 'FALSE';
            case 'error': return node.code;
            case 'empty': return '';
            case 'ref': {
                const a1 = resolveRef(node.field, node.scope);
                if (a1 === null || a1 === undefined) failed = true;
                return a1 ?? '';
            }
            case 'name': {
                const value = resolveName(node.name);
                if (value === null || value === undefined) failed = true;
                return value ?? '';
            }
            case 'call': return `${node.name}(${node.args.map(arg => print(arg)).join(',')})`;
            case 'unary': return `${node.op}${print(node.arg, PREFIX)}`;
            case 'postfix': return `${print(node.arg, POSTFIX_PERCENT)}%`;
            case 'array': return `{${node.items.map(item => print(item)).join(',')}}`;
            case 'binary': {
                const bp = INFIX[node.op]!;
                const text = `${print(node.left, bp - 1)}${node.op}${print(node.right, bp)}`;
                return bp <= parentBp ? `(${text})` : text;
            }
        }
    };

    const result = print(ast);
    return failed ? null : result;
}
