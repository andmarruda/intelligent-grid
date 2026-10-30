# TypeScript

O pacote é escrito em TypeScript e inclui as declarações (`dist/types`). Tudo é tipado,
inclusive as definições de coluna, o modelo de filtro, os eventos e as funções de fórmula.

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

As linhas são registros sem tipo (`Row = { _id: string; [field: string]: unknown }`) porque as colunas,
os campos calculados e o `_id` só são conhecidos em tempo de execução. Faça o cast para a sua própria interface onde você os lê.

## Tipos principais

| Tipo | Descrição |
|---|---|
| `GridOptions` | Opções do construtor |
| `ColumnDefinition` / `Column` | A coluna como você a escreve / depois de aplicados os padrões |
| `ColumnType` | `'text' \| 'number' \| 'integer' \| 'currency' \| 'percent' \| 'date' \| 'datetime' \| 'boolean' \| 'select'` |
| `Row`, `RowData` | Registros de linha (`_id` + campos) |
| `Filter`, `FilterModel`, `FilterCondition`, `FilterOperator` | Modelo de filtro |
| `SortEntry` | `{ field, dir: 'asc' \| 'desc' }` |
| `SelectionOptions`, `NavbarOptions`, `NavbarItem`, `AppendOptions`, `AppendLoadParams`, `AppendResult` | Opções de recursos |
| `CsvExportOptions`, `XlsxExportOptions` | Opções de exportação |
| `CellChangeDetail`, `GridEvent<T>`, `GridEventHandler` | Eventos |
| `CustomEditor`, `EditorContext`, `EditorInstance` | Editores personalizados |
| `ValidationRules`, `ValidationFunction`, `ConditionalFormat` | Regras de coluna |
| `FormulaFunction`, `LazyFormulaFunction`, `FunctionContext`, `FormulaValue`, `AstNode`, `EvaluationContext` | Motor de fórmulas |
| `SetCellResult`, `DistinctValue` | Resultados de métodos |
| `ConfirmRequest` | Solicitação do modal de confirmação |
| `QueryNode`, `QueryGroup`, `QueryRule`, `QueryOperator` | Modelo do filtro avançado |
| `ChangeSet`, `InsertedRow`, `UpdatedRow`, `DeletedRow`, `FieldChange`, `ChangeSummary`, `HistoryEntry`, `ChangeTrackingOptions` | Rastreamento de alterações |

As funções personalizadas recebem argumentos tipados a partir das sobrecargas de `defineFunction` / `registerFunction`:

```ts
IntelligentGrid.defineFunction('VAT', ([value]) => typeof value === 'number' ? value * 0.2 : null);
```
