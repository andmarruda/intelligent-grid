// Usage exactly as written in docs/formulas.md and docs/editing.md: must type-check and work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FormulaError, ERRORS, compile, evaluate, parse, toExcelFormula } from '../src/index.ts';
import { IntelligentGrid } from '../src/ui/grid.ts';
import type { CustomEditor, ColumnDefinition } from '../src/types.ts';

test('custom functions as documented', () => {
    IntelligentGrid.defineFunction('VAT', ([value, rate]) => {
        if (typeof value !== 'number') throw new FormulaError(ERRORS.VALUE);
        return value * (typeof rate === 'number' ? rate : 0.2);
    });
    IntelligentGrid.defineFunction('FIRSTOK', (args, ctx, evaluate) => {
        for (const arg of args) {
            const value = evaluate(arg);
            if (!(value instanceof FormulaError)) return value;
        }
        return new FormulaError(ERRORS.NA);
    }, { lazy: true });

    const ctx = { rowValue: () => null, columnValues: () => [] };
    assert.equal(evaluate(compile('=VAT(100)').ast, ctx), 20);
    assert.equal(evaluate(compile('=FIRSTOK(1/0,"x")').ast, ctx), 'x');
    assert.equal((evaluate(compile('=VAT("a")').ast, ctx) as FormulaError).code, '#VALUE!');
});

test('engine without a grid as documented', () => {
    const { ast } = compile('=[@qty]*[@price]');
    const row: Record<string, number> = { qty: 2, price: 5 };
    assert.equal(evaluate(ast, { rowValue: f => row[f] ?? null, columnValues: () => [] }), 10);
    const cells: Record<string, string> = { qty: 'B2', price: 'C2' };
    assert.equal(toExcelFormula(parse('=[@qty]*[@price]'), field => cells[field]), 'B2*C2');
});

test('custom editor and column definitions type-check', () => {
    const ratingEditor: CustomEditor = {
        create({ value }) {
            const element = { value: String(value ?? 3) } as unknown as HTMLInputElement;
            return { element, getValue: () => Number(element.value), focus: () => {} };
        }
    };
    const columns: ColumnDefinition[] = [
        { field: 'rating', type: 'integer', editor: ratingEditor, format: v => '★'.repeat(Number(v ?? 0)) },
        { field: 'notes', editor: 'textarea', editable: row => row?.status !== 'done' },
        { field: 'qty', type: 'integer', validate: [{ min: 1 }, value => Number(value) % 1 === 0 || 'Whole units only'] }
    ];
    assert.equal(columns.length, 3);
});
