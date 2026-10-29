# TypeScript

The package is written in TypeScript and ships declarations (`dist/types`). Everything is typed,
including column definitions, the filter model, events and formula functions.

```ts
import { IntelligentGrid } from 'intelligent-grid';
import type { ColumnDefinition, GridOptions, FilterModel, SortEntry, Row, CellChangeDetail, GridEvent, CustomEditor, FormulaFunction } from 'intelligent-grid';

interface Order {
    id: number;
    product: string;
    qty: number;
    price: number;
}

const columns: ColumnDefinition[] = [
    { field: 'product', validate: { required: true } },
    { field: 'qty', type: 'integer', footer: 'sum' },
    { field: 'price', type: 'currency' },
    { field: 'total', type: 'currency', formula: '=[@qty]*[@price]' }
];

const orders: Order[] = await api.orders();
const grid = new IntelligentGrid('#orders', { columns, data: orders as unknown as Record<string, unknown>[], idField: 'id' });

grid.on('cellChange', (event: GridEvent<CellChangeDetail>) => {
    const row = event.detail.row as (Row & Order) | null;
    if (row) api.save(row);
});

const filters: FilterModel = { qty: { conditions: [{ op: 'gte', value: 10 }] } };
grid.setFilters(filters);
```

Rows are untyped records (`Row = { _id: string; [field: string]: unknown }`) because columns,
calculated fields and `_id` are only known at runtime. Cast to your own interface where you read them.

## Main types

| Type | Description |
|---|---|
| `GridOptions` | Constructor options |
| `ColumnDefinition` / `Column` | Column as you write it / after defaults |
| `ColumnType` | `'text' \| 'number' \| 'integer' \| 'currency' \| 'percent' \| 'date' \| 'datetime' \| 'boolean' \| 'select'` |
| `Row`, `RowData` | Row records (`_id` + fields) |
| `Filter`, `FilterModel`, `FilterCondition`, `FilterOperator` | Filter model |
| `SortEntry` | `{ field, dir: 'asc' \| 'desc' }` |
| `SelectionOptions`, `NavbarOptions`, `NavbarItem`, `AppendOptions`, `AppendLoadParams`, `AppendResult` | Feature options |
| `CsvExportOptions`, `XlsxExportOptions` | Export options |
| `CellChangeDetail`, `GridEvent<T>`, `GridEventHandler` | Events |
| `CustomEditor`, `EditorContext`, `EditorInstance` | Custom editors |
| `ValidationRules`, `ValidationFunction`, `ConditionalFormat` | Column rules |
| `FormulaFunction`, `LazyFormulaFunction`, `FunctionContext`, `FormulaValue`, `AstNode`, `EvaluationContext` | Formula engine |
| `SetCellResult`, `DistinctValue` | Method results |
| `ConfirmRequest` | Confirmation modal request |
| `QueryNode`, `QueryGroup`, `QueryRule`, `QueryOperator` | Advanced filter model |
| `ChangeSet`, `InsertedRow`, `UpdatedRow`, `DeletedRow`, `FieldChange`, `ChangeSummary`, `HistoryEntry`, `ChangeTrackingOptions` | Change tracking |

Custom functions get typed arguments from the overloads of `defineFunction` / `registerFunction`:

```ts
IntelligentGrid.defineFunction('VAT', ([value]) => typeof value === 'number' ? value * 0.2 : null);
```
