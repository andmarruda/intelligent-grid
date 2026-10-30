# Primeiros passos

## Instalação

```bash
npm install intelligent-grid sorla-db
```

O `sorla-db` (1.7.1 ou mais recente) é uma peer dependency: a grade guarda as linhas no SorlaDB, e você fornece a biblioteca.

## Carregando o SorlaDB

O pacote do SorlaDB 1.0 traz um bundle para navegador que registra `window.sorla`. A grade o usa automaticamente:

```html
<script src="node_modules/sorla-db/dist/sorla.min.js"></script>
```

Você também pode passar a classe (ou uma instância) explicitamente, que é o que se faz no Node ou em testes:

```ts
new IntelligentGrid('#grid', { sorla: window.sorla, columns, data });
```

Cada grade cria seu próprio banco de dados no SorlaDB (`intelligent_grid_1`, `intelligent_grid_2`…). Use a opção `database` para escolher o nome.

## Escolha um build

| Arquivo | Use para |
|---|---|
| `dist/index.js` | ES module: bundlers (Vite, webpack, esbuild) ou `<script type="module">` |
| `dist/index.cjs` | `require()` do CommonJS |
| `dist/intelligent-grid.min.js` | Tag `<script>` clássica: registra `window.IntelligentGrid` |
| `dist/intelligent-grid.css` / `.min.css` | Estilos (obrigatórios) |
| `dist/types/` | Declarações TypeScript (detectadas automaticamente) |

```ts
// bundler / ES module
import { IntelligentGrid } from 'intelligent-grid';
import 'intelligent-grid/styles.css';
```

```html
<!-- sem bundler -->
<link rel="stylesheet" href="node_modules/intelligent-grid/dist/intelligent-grid.min.css">
<script src="node_modules/sorla-db/dist/sorla.min.js"></script>
<script src="node_modules/intelligent-grid/dist/intelligent-grid.min.js"></script>
<script>
  const grid = new IntelligentGrid('#grid', { columns: [...], data: [...] });
  // todos os outros exports ficam pendurados no global: IntelligentGrid.toCSV, IntelligentGrid.ERRORS...
</script>
```

## A primeira grade

```html
<div id="orders"></div>
```

```ts
import { IntelligentGrid } from 'intelligent-grid';

const grid = new IntelligentGrid('#orders', {
    locale: 'pt-BR',
    idField: 'id',
    editable: true,
    data: [
        { id: 1, product: 'Café', qty: 2, price: 9.5, due: '2026-11-03' },
        { id: 2, product: 'Bolo', qty: 1, price: 32, due: '2026-11-10' }
    ],
    columns: [
        { field: 'product', title: 'Produto', validate: { required: true } },
        { field: 'qty', title: 'Qtd', type: 'integer', footer: 'sum' },
        { field: 'price', title: 'Preço', type: 'currency' },
        { field: 'total', title: 'Total', type: 'currency', formula: '=[@qty]*[@price]', footer: 'sum' },
        { field: 'due', title: 'Vencimento', type: 'date' }
    ]
});

grid.on('cellChange', event => api.save(event.detail.row));
```

O que você ganha logo de cara:

- clique em um cabeçalho para ordenar, Shift+clique para ordenar por mais colunas
- o ▾ em cada cabeçalho abre o filtro no estilo do Excel
- a barra de navegação (navbar) tem busca, chips de filtro, um seletor de colunas e exportação para CSV/Excel
- `total` é uma coluna calculada; o rodapé soma as linhas filtradas
- dê um duplo clique ou comece a digitar para editar; os valores são interpretados conforme a localidade (`1.234,56` em pt-BR)

## Regras dos dados

- As linhas são **copiadas** para o SorlaDB; seus objetos nunca são modificados. Para lê-las de volta, use `grid.getRows()`.
- `idField` escolhe o campo usado como id da linha (convertido para string). Sem ele, o SorlaDB gera um UUID em `_id`.
- Toda linha entregue a você tem `_id`. Células vazias de colunas que não são de texto voltam como `null`.
- Datas são strings ISO (`'2026-10-28'`, `'2026-10-28T14:30'`). Objetos `Date` são convertidos na inserção.
- Percentuais são frações (`0.15` é 15%).
- Nomes de campos não podem conter `.` nem `$` (reservados pelo SorlaDB).

Próximo: [Colunas](columns.md) · [Opções da grade](options.md) · [Exemplos](../../examples/index.html)
