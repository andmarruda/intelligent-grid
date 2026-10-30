# Rastreamento de alterações

A grade registra o que foi **inserido**, **atualizado** e **excluído** desde que os dados foram carregados, para que
você possa enviar ao seu backend apenas essas alterações, em vez de substituir tudo.

Ele vem ativado por padrão. Toda edição, colagem, `setCellValue`, `setCellFormula`, `updateRow`, `addRow`
e `deleteRows` é rastreada.

```ts
const grid = new IntelligentGrid('#orders', { idField: 'id', editable: true, columns, data });

// ...o usuário edita, adiciona e exclui linhas...

grid.hasChanges();          // true
grid.getChanges();          // { inserted, updated, deleted }
grid.getChangesJSON();      // o mesmo, como string JSON
grid.getHistory();          // todas as operações, em ordem
```

## O payload de alterações

```json
{
  "inserted": [
    { "id": "6f1c…", "row": { "_id": "6f1c…", "id": null, "product": "Cup", "qty": 1, "price": 7, "total": 7 } }
  ],
  "updated": [
    {
      "id": "1",
      "changes": { "qty": { "from": 2, "to": 4 }, "product": { "from": "Pen", "to": "Pencil" } },
      "row": { "_id": "1", "id": 1, "product": "Pencil", "qty": 4, "price": 1.5, "total": 6 }
    }
  ],
  "deleted": [
    { "id": "3", "row": { "_id": "3", "id": 3, "product": "Ink", "qty": 5, "price": 3, "total": 15 } }
  ]
}
```

| Seção | Contém |
|---|---|
| `inserted` | Linhas adicionadas com `addRow` (ou pelo botão da barra de navegação), com seus valores atuais |
| `updated` | Linhas existentes com pelo menos um valor alterado: `changes` lista **apenas** os campos alterados, com `from` / `to`, e `row` é a linha atual completa |
| `deleted` | Linhas existentes que foram removidas, com seus valores **originais** |

`id` é o id da linha na grade: o valor do `idField` como string, ou um UUID gerado para linhas inseridas
sem ele. `row` também contém o próprio `idField` (por exemplo, `"id": 1`, `null` para linhas novas).
No servidor, use `row.<idField>` para encontrar registros existentes: uma linha inserida e salva antes na
mesma sessão mantém seu `id` temporário da grade, enquanto `row.id` guarda o id do banco de dados que você atribuiu a ela.

O payload contém as **alterações líquidas** em relação aos dados originais:

- editar um valor e depois voltar ao valor anterior o remove de `changes` (e remove a linha de `updated` se nada mais mudou)
- uma linha inserida e depois excluída não aparece em lugar nenhum
- uma linha atualizada e depois excluída aparece apenas em `deleted`, com seus valores originais
- editar uma linha inserida a mantém em `inserted`, com os novos valores
- **colunas calculadas** não são listadas em `changes` (elas derivam dos outros campos), mas seus valores estão em `row`. Um valor que o usuário digitou em uma coluna calculada *é* listado
- células com uma fórmula digitada pelo usuário adicionam `"formulas": { "price": "=[@qty]*2" }` à sua entrada

## Enviando com um formulário

Passe um formulário para a grade e ela mantém atualizado um input oculto com o JSON, para que um submit normal envie as alterações:

```html
<form id="save" method="post" action="/orders/batch">
    <div id="orders"></div>
    <button type="submit">Save</button>
</form>
```
```ts
new IntelligentGrid('#orders', {
    columns, data, idField: 'id', editable: true,
    changeTracking: { form: '#save', inputName: 'changes' }   // <input type="hidden" name="changes">
});
```

Ou vincule depois, a quantos formulários quiser:

```ts
grid.bindForm('#save', 'changes');
```

O servidor recebe um campo `changes` com a string JSON descrita acima.

## Enviando com fetch

```ts
async function save() {
    if (!grid.hasChanges()) return;
    const response = await fetch('/api/orders/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: grid.getChangesJSON()
    });
    if (!response.ok) throw new Error('Save failed');

    const result = await response.json();
    // atribui às linhas inseridas os ids criados pelo banco de dados e depois aceita
    for (const { id, dbId } of result.inserted ?? []) grid.updateRow(id, { id: dbId });
    grid.acceptChanges();
}
```

## Depois de salvar: aceitar ou rejeitar

| Método | Efeito |
|---|---|
| `acceptChanges()` | Os valores atuais passam a ser o novo original. `getChanges()` volta a ficar vazio e o histórico é limpo |
| `acceptChanges(ids)` | Apenas para essas linhas, por exemplo quando o servidor rejeitou algumas delas |
| `rejectChanges()` | Restaura o estado original: linhas inseridas são removidas, linhas excluídas voltam e valores atualizados (e fórmulas de célula) são revertidos |
| `rejectChanges(ids)` | Apenas para essas linhas |

`setData(rows)` carrega um novo original e limpa o rastreamento. No [modo append](append-mode.md) com
`serverSide: true`, alterar a ordenação/filtros/busca recarrega as linhas do servidor: as alterações não salvas
são descartadas e o evento `changesDiscarded` as recebe, então salve antes ou avise o usuário.

## Histórico

`getHistory()` lista todas as operações desde o último `acceptChanges()`, da mais antiga para a mais recente, inclusive
operações que se anulam:

```json
[
  { "seq": 1, "type": "update", "id": "1", "field": "qty", "from": 2, "to": 4, "source": "edit", "at": "2026-10-28T15:02:11.512Z" },
  { "seq": 2, "type": "insert", "id": "6f1c…", "source": "api", "at": "2026-10-28T15:02:20.004Z" },
  { "seq": 3, "type": "update", "id": "1", "field": "qty", "from": 4, "to": 2, "source": "edit", "at": "2026-10-28T15:02:31.870Z" },
  { "seq": 4, "type": "delete", "id": "3", "source": "api", "at": "2026-10-28T15:02:40.118Z" }
]
```

`source` é `edit` (digitado ou alternado), `paste` ou `api`. Fórmulas de célula adicionam `formula`.
O histórico é limitado a `historyLimit` entradas (padrão 5000, as mais antigas são descartadas). Use-o para trilhas
de auditoria ou para mostrar "o que eu alterei?". Use `getChanges()` para saber o que salvar.

## Na tela

| Classe | Onde | Aparência padrão |
|---|---|---|
| `ig-row-inserted` | `tr` de uma linha inserida | barra verde à esquerda |
| `ig-row-updated` | `tr` de uma linha com valores alterados | barra laranja à esquerda |
| `ig-cell-changed` | `td` cujo valor mudou | fundo laranja-claro, tooltip "Was: …" |

As cores vêm de `--ig-inserted`, `--ig-updated` e `--ig-changed-bg` ([temas](theming.md)).

A barra de navegação mostra **"N changes"** (o tooltip detalha a contagem) e um botão **Discard changes**
enquanto houver alterações não salvas; ao descartar, ela pede confirmação antes com o [modal de confirmação](navbar.md#modal-de-confirmação). Desative o indicador com `navbar: { changes: false }`.

## Eventos

| Evento | Detalhe |
|---|---|
| `changes` | `{ summary: { inserted, updated, deleted, total }, hasChanges }`: após toda alteração rastreada, accept ou reject |
| `changesAccept` | `{ ids }` (`null` = todas) |
| `changesReject` | `{ ids }` (`null` = todas) |
| `changesDiscarded` | `{ changes }`: uma recarga do modo append descartou alterações não salvas |

```ts
grid.on('changes', e => { saveButton.disabled = !e.detail.hasChanges; });
window.addEventListener('beforeunload', e => { if (grid.hasChanges()) e.preventDefault(); });
```

## Opções

```ts
changeTracking: true                                   // padrão
changeTracking: false                                  // desativado: getChanges() fica sempre vazio
changeTracking: { form: '#save', inputName: 'changes', historyLimit: 5000 }
```

## Aplicando as alterações no servidor

O payload corresponde diretamente a três operações. Um exemplo em Laravel:

```php
public function batch(Request $request)
{
    $changes = json_decode($request->input('changes'), true);   // ou $request->json()->all() com fetch

    return DB::transaction(function () use ($changes) {
        $inserted = [];
        foreach ($changes['inserted'] as $item) {
            $order = Order::create(Arr::only($item['row'], ['product', 'qty', 'price']));
            $inserted[] = ['id' => $item['id'], 'dbId' => $order->id];
        }
        foreach ($changes['updated'] as $item) {
            Order::whereKey($item['row']['id'])->update(
                Arr::only(array_map(fn ($c) => $c['to'], $item['changes']), ['product', 'qty', 'price'])
            );
        }
        Order::whereKey(array_map(fn ($item) => $item['row']['id'], $changes['deleted']))->delete();

        return ['inserted' => $inserted];
    });
}
```

Sempre use uma lista de campos permitidos ao gravar (`Arr::only`): o payload vem do navegador.
Valores calculados como `total` estão em `row` por conveniência, então recalcule-os no servidor.
