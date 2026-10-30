# Filtro avançado (construtor de consultas)

O botão **Advanced filter** na barra de navegação (navbar) abre um construtor de consultas visual: os usuários combinam regras em
grupos **AND / OR** aninhados, negam grupos com **NOT** e acompanham a consulta `find()` do SorlaDB sendo
montada. Ao aplicá-lo, a grade é filtrada; ele se combina (AND) com os filtros de coluna e com a busca.

```
Age ≥ 30  AND  ( Name = X  OR  City is one of A, B )
```
```json
{ "$and": [
    { "age": { "$gte": 30, "$ne": "" } },
    { "$or": [ { "name": { "$eq": "X" } }, { "city": { "$in": ["A", "B"] } } ] }
] }
```

A consulta roda **no SorlaDB**: toda parte da árvore que o SorlaDB consegue expressar é executada por um único
`collection.find()`. É preciso o sorla-db 1.5+ (`$and` / `$or` / `$nor` aninhados, vários operadores por
campo, `$regex`).

## No painel

- **E / OU (And / Or)** alternam como um grupo combina suas regras; **Não (Not)** nega o grupo inteiro.
- **+ Rule** adiciona uma regra (campo, operador, valor). **+ Group** adiciona um grupo aninhado, que começa com a junção oposta. Os grupos podem ter até 5 níveis de aninhamento.
- Os operadores dependem do tipo da coluna:

| Tipo de coluna | Operadores |
|---|---|
| text, select | equals, does not equal, is one of, is not one of, contains, does not contain, begins with, ends with, is blank, is not blank |
| number, integer, currency, percent, date, datetime | =, ≠, >, ≥, <, ≤, between, is one of, is not one of, is blank, is not blank |
| boolean | equals, is blank, is not blank |

- **Is one of / is not one of** mostram uma lista dos valores presentes nos dados (Ctrl/Cmd+clique para escolher vários).
- O contador ao vivo mostra quantas linhas o rascunho encontra (junto com os outros filtros) antes de você aplicá-lo.
- **find() query (JSON)** mostra a consulta sendo montada, com **Copy JSON**.
- **Apply** (ou Enter em um valor) aplica, **Cancel** ou Esc descarta o rascunho, **Clear** recomeça do zero.
- Regras incompletas (ainda sem valor) e grupos vazios são ignorados.

Uma consulta aplicada aparece como um chip legível na barra de navegação (`Age ≥ 30 AND (Name = X OR City in A, B)`),
e o × dele a remove. "Clear filters" também a remove.

### A igualdade é exata

A igualdade do construtor é o `$eq` do SorlaDB: `Name = X` não encontra `x`. Para comparar sem diferenciar maiúsculas e minúsculas, use
**contains / begins with / ends with**, ou o menu de filtro da coluna, cujo "equals" ignora maiúsculas e minúsculas.

### Comparação de texto

**contains, does not contain, begins with, ends with** viram condições `$regex` sem diferenciar maiúsculas e minúsculas
(`{ "name": { "$regex": "^x", "$options": "i" } }`) e rodam no SorlaDB como todo o resto. Um backend
MongoDB entende o mesmo JSON. Caracteres especiais são escapados, então `a.b` procura um ponto literal.
Em colunas **select**, o texto é comparado com os rótulos que os usuários veem, e a consulta usa os
valores de opção correspondentes (`{ "status": { "$in": ["open"] } }`).

A única regra que o SorlaDB não consegue expressar é "≠ um dia" em uma coluna datetime. A grade a avalia, e
um grupo que a mistura com outras regras ainda envia todas as outras partes para o `find()`.

## API

```ts
grid.setQuery({
    type: 'group', join: 'and', children: [
        { type: 'rule', field: 'age', op: 'gte', value: 30 },
        { type: 'group', join: 'or', children: [
            { type: 'rule', field: 'name', op: 'eq', value: 'X' },
            { type: 'rule', field: 'city', op: 'in', values: ['A', 'B'] }
        ] }
    ]
});

grid.getQuery();                      // o modelo acima (null quando não há nenhum)
grid.toSorlaQuery();                  // o JSON do find()
grid.fromSorlaQuery(savedJson);       // carrega uma consulta salva antes
grid.setQuery(null);                  // remove a consulta
grid.toggleQueryBuilder(true);        // abre o painel a partir do seu próprio botão
```

Salvando e restaurando a consulta de um usuário:

```ts
grid.on('queryChange', e => localStorage.setItem('orders-query', JSON.stringify(e.detail.sorlaQuery)));
const saved = localStorage.getItem('orders-query');
if (saved) grid.fromSorlaQuery(JSON.parse(saved));
```

`initialQuery` aplica uma consulta ao carregar. `navbar: { query: false }` esconde o botão (a API continua funcionando).

## Modelo

```ts
type QueryNode = QueryRule | QueryGroup;

interface QueryGroup {
    type: 'group';
    join: 'and' | 'or';
    not?: boolean;               // NOT (...) → $nor
    children: QueryNode[];
}

interface QueryRule {
    type: 'rule';
    field: string;               // field da coluna
    op: QueryOperator;
    value?: unknown;             // como foi digitado: '30', '01/12/2026' (locale), true
    value2?: unknown;            // limite superior do "between"
    values?: unknown[];          // "in" / "nin": valores armazenados
}

type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'nin'
    | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty';
```

Como as regras viram condições do SorlaDB:

| Regra | Condição do find() |
|---|---|
| `age gte 30` | `{ age: { $gte: 30, $ne: '' } }` (operadores de intervalo ignoram valores em branco) |
| `age between 20 and 40` | `{ age: { $gte: 20, $lte: 40, $ne: '' } }` |
| `name eq 'X'` | `{ name: { $eq: 'X' } }` |
| `city in ['A', 'B']` | `{ city: { $in: ['A', 'B'] } }` |
| `joined empty` | `{ joined: { $eq: '' } }` (valores em branco são armazenados como `''`) |
| `name startsWith 'x'` | `{ name: { $regex: '^x', $options: 'i' } }` |
| `name notContains 'x'` | `{ name: { $not: { $regex: 'x', $options: 'i' } } }` |
| `status contains 'abe'` (select) | `{ status: { $in: ['open'] } }` (comparado pelos rótulos) |
| grupo `or` | `{ $or: [...] }` |
| grupo com `not` | `{ $nor: [...] }` |

`fromSorlaQuery` lê essas construções de volta (`$and`, `$or`, `$nor`, `$not`, os operadores de
comparação, `$in`/`$nin` e os padrões `$regex` acima) e lança um erro para qualquer outra coisa (por exemplo, `$exists`).

## No servidor (modo append)

Com `append: { serverSide: true }`, mudar o filtro avançado recarrega a partir do offset 0, e
`load()` o recebe das duas formas:

```ts
load: async ({ offset, limit, sort, filters, search, query, sorlaQuery }) => {
    // sorlaQuery é compatível com MongoDB: passe-a para uma coleção do Mongo ou traduza-a para SQL
    const response = await fetch('/api/customers/find', { method: 'POST', body: JSON.stringify({ where: sorlaQuery, offset, limit, sort }) });
    return response.json();
}
```

Valide e restrinja a uma lista permitida os campos e operadores no servidor: a consulta vem do navegador.

## Eventos

| Evento | Detalhe |
|---|---|
| `queryChange` | `{ query, sorlaQuery }` |
| `queryBuilderOpen` / `queryBuilderClose` | `{}` |
