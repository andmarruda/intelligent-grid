/**
 * Calculation engine for the grid, the equivalent of Excel calculated table columns.
 *
 *   column formulas  {field: 'total', formula: '=[@qty]*[@price]'} computed for every row
 *   cell formulas    a user typing "=..." in an editable cell, overriding that cell only
 *
 * Results are written into the SorlaDB documents, so formula columns sort and filter like any
 * other column. Recalculation is incremental: a change only recomputes the columns that depend on
 * the changed field, for that row only unless a whole-column reference ([field]) is involved.
 */
import { compile, evaluate, toCellResult } from './evaluator.ts';
import type { EvaluationContext } from './evaluator.ts';
import type { AstNode } from './parser.ts';
import { collectDependencies } from './parser.ts';
import { ERRORS, err, isError } from './errors.ts';
import { fromCell } from './values.ts';
import { isISODate, toSerial } from './dates.ts';
import type { FormulaValue, Scalar } from './values.ts';
import { localeSeparators } from './numfmt.ts';
import type { FunctionDefinition } from './functions.ts';
import type { SorlaStore } from '../core/store.ts';
import type { Column, RowData, StoredValue } from '../types.ts';

interface DependencyNode {
    row: Set<string>;
    column: Set<string>;
}

const toStored = (value: Scalar): StoredValue => isError(value) ? value.code : value === null ? '' : value;

export class CalcEngine {
    store: SorlaStore;
    locale: string;
    names: Record<string, unknown>;
    functions: Map<string, FunctionDefinition>;
    fields = new Set<string>();
    // date columns hold ISO text; in ranges they are serial numbers, like Excel dates (MIN([due]), SUMIFS)
    private dateFields = new Set<string>();
    columnFormulas = new Map<string, string>();
    cellFormulas = new Map<string, Record<string, string>>();
    nodes = new Map<string, DependencyNode>();
    order: string[] = [];
    circular = new Set<string>();
    private columnCache = new Map<string, FormulaValue[]>();
    // row independent results for ad-hoc evaluations over every row; cleared on every data change
    private sharedMemo = new Map<AstNode, FormulaValue>();

    constructor({ store, locale = 'en-US', names = {}, functions = new Map() }: {
        store: SorlaStore;
        locale?: string;
        names?: Record<string, unknown>;
        functions?: Map<string, FunctionDefinition>;
    }) {
        this.store = store;
        this.locale = locale;
        this.names = names;
        this.functions = functions;
    }

    setColumns(columns: Column[]): void {
        this.invalidate();
        this.fields = new Set(columns.map(c => c.field));
        this.dateFields = new Set(columns.filter(c => c.type === 'date' || c.type === 'datetime').map(c => c.field));
        this.columnFormulas.clear();
        for (const column of columns) {
            if (typeof column.formula === 'string' && column.formula.trim()) {
                this.columnFormulas.set(column.field, column.formula);
            }
        }
        this.buildGraph();
    }

    private context(row: RowData | null | undefined, columnValues: (field: string) => FormulaValue[], memo?: Map<AstNode, FormulaValue>): EvaluationContext {
        return {
            memo,
            locale: this.locale,
            decimalSeparator: localeSeparators(this.locale).decimal,
            functions: this.functions,
            rowValue: field => {
                if (!this.fields.has(field) && !(row && field in row)) return err(ERRORS.REF, `Unknown column ${field}`);
                if (this.circular.has(field)) return err(ERRORS.CIRC);
                return fromCell(row?.[field]);
            },
            columnValues: field => {
                if (!this.fields.has(field)) return err(ERRORS.REF, `Unknown column ${field}`);
                if (this.circular.has(field)) return err(ERRORS.CIRC);
                return columnValues(field);
            },
            name: name => {
                const key = Object.keys(this.names).find(k => k.toUpperCase() === name.toUpperCase());
                return key === undefined ? undefined : fromCell(this.names[key]);
            }
        };
    }

    /** A value of a column range: dates of date columns become serial numbers, like Excel dates. */
    private rangeValue(field: string, value: unknown): FormulaValue {
        return this.dateFields.has(field) && typeof value === 'string' && isISODate(value) ? toSerial(value)! : fromCell(value);
    }

    private allValues = (field: string): FormulaValue[] => {
        let values = this.columnCache.get(field);
        if (!values) {
            values = this.store.values(field).map(value => this.rangeValue(field, value));
            this.columnCache.set(field, values);
        }
        return values;
    };

    /**
     * Formula fields and their dependencies, topologically ordered; cycles become #CIRC!.
     */
    private buildGraph(): void {
        const nodes = new Map<string, DependencyNode>();
        const addDeps = (field: string, formula: string) => {
            const deps = collectDependencies(compile(formula).ast);
            const node = nodes.get(field) ?? { row: new Set<string>(), column: new Set<string>() };
            deps.row.forEach(f => node.row.add(f));
            deps.column.forEach(f => node.column.add(f));
            nodes.set(field, node);
        };
        for (const [field, formula] of this.columnFormulas) addDeps(field, formula);
        for (const formulas of this.cellFormulas.values()) {
            for (const [field, formula] of Object.entries(formulas)) if (formula) addDeps(field, formula);
        }

        const pending = new Map([...nodes].map(([field, node]) => [
            field,
            new Set([...node.row, ...node.column].filter(dep => nodes.has(dep) && dep !== field))
        ]));
        // a formula that references its own column is circular too
        const selfReferencing = [...nodes].filter(([field, node]) => node.row.has(field) || node.column.has(field)).map(([field]) => field);

        const order: string[] = [];
        let progress = true;
        while (progress) {
            progress = false;
            for (const [field, deps] of pending) {
                if ([...deps].every(dep => !pending.has(dep))) {
                    order.push(field);
                    pending.delete(field);
                    progress = true;
                }
            }
        }

        this.nodes = nodes;
        this.circular = new Set([...pending.keys(), ...selfReferencing]);
        this.order = order.filter(field => !this.circular.has(field));
    }

    formulaFor(id: string, field: string): string | null {
        const own = this.cellFormulas.get(id)?.[field];
        // '' marks a typed value inside a calculated column
        if (own !== undefined) return own || null;
        return this.columnFormulas.get(field) ?? null;
    }

    /**
     * A value typed into a calculated column: the column formula skips that cell from now on
     * (Excel's "calculated column exception"). Setting a cell formula or null removes it.
     */
    setCellOverride(id: string, field: string): void {
        this.setCellFormula(id, field, '');
    }

    isFormulaField(field: string): boolean {
        return this.nodes.has(field);
    }

    /** true when some formula reads a whole column, so appending rows changes existing results */
    hasColumnReferences(): boolean {
        return this.order.some(field => (this.nodes.get(field)?.column.size ?? 0) > 0);
    }

    setCellFormula(id: string, field: string, formula: string | null): void {
        const formulas = { ...(this.cellFormulas.get(id) ?? {}) };
        if (formula !== null) formulas[field] = formula;
        else delete formulas[field];
        if (Object.keys(formulas).length) this.cellFormulas.set(id, formulas);
        else this.cellFormulas.delete(id);
        this.buildGraph();
    }

    forgetRows(ids: string[]): void {
        let changed = false;
        for (const id of ids) changed = this.cellFormulas.delete(id) || changed;
        if (changed) this.buildGraph();
    }

    reset(columns: Column[]): void {
        this.cellFormulas.clear();
        this.setColumns(columns);
    }

    private computeCell(id: string, field: string, memo: Map<AstNode, FormulaValue>): void {
        const formula = this.formulaFor(id, field);
        if (!formula) return;
        const row = this.store.get(id);
        if (!row) return;
        const value = toCellResult(evaluate(compile(formula).ast, this.context(row, this.allValues, memo)));
        this.store.writeCalculated(row, field, toStored(value));
    }

    private computeColumn(field: string, ids: string[]): void {
        // the columns this one depends on are final here (topological order), so one memo per column
        const memo = new Map<AstNode, FormulaValue>();
        for (const id of ids) this.computeCell(id, field, memo);
        this.columnCache.delete(field);
    }

    /** Forgets cached results; called whenever row values change. */
    invalidate(): void {
        this.columnCache.clear();
        this.sharedMemo.clear();
    }

    /**
     * Recomputes every formula of every row.
     */
    recalculateAll(): void {
        this.invalidate();
        const ids = this.store.ids();
        for (const field of this.circular) {
            for (const id of ids) {
                const row = this.store.get(id);
                if (row && this.formulaFor(id, field)) this.store.writeCalculated(row, field, ERRORS.CIRC);
            }
        }
        for (const field of this.order) this.computeColumn(field, ids);
        this.columnCache.clear();
    }

    /**
     * Recomputes what depends on the changed fields.
     * @param ids rows that changed (inserted, edited or removed)
     * @param fields fields that changed
     * @return 'all' when every row may have changed, 'rows' otherwise
     */
    recalculate(ids: string[], fields: string[]): 'all' | 'rows' {
        this.invalidate();
        const dirty = new Map<string, 'rows' | 'all'>(fields.map(f => [f, 'rows']));
        let scope: 'all' | 'rows' = 'rows';

        for (const field of this.order) {
            const node = this.nodes.get(field)!;
            let mode = dirty.get(field) ?? null;
            for (const dep of node.row) {
                if (dirty.has(dep) && mode !== 'all') mode = dirty.get(dep)!;
            }
            for (const dep of node.column) {
                if (dirty.has(dep)) mode = 'all';
            }
            if (!mode) continue;
            dirty.set(field, mode);
            if (mode === 'all') scope = 'all';
            this.computeColumn(field, mode === 'all' ? this.store.ids() : ids.filter(id => this.store.has(id)));
        }

        this.columnCache.clear();
        return scope;
    }

    /**
     * Evaluates an ad-hoc formula: footers, conditional formats, formula filters, grid.evaluate().
     * @param row data for [@field] references
     * @param rows rows used by [field] ranges (defaults to every row)
     */
    evaluate(formula: string, row: RowData | null = null, rows: RowData[] | null = null): Scalar {
        const cache = new Map<string, FormulaValue[]>();
        const columnValues = rows
            ? (field: string) => {
                let values = cache.get(field);
                if (!values) {
                    values = rows.map(r => this.rangeValue(field, r[field]));
                    cache.set(field, values);
                }
                return values;
            }
            : this.allValues;
        // over every row the column cache and the shared memo stay valid until the next data change
        return toCellResult(evaluate(compile(formula).ast, this.context(row, columnValues, rows ? undefined : this.sharedMemo)));
    }
}
