# Recursos de planilha

Intervalos de células, a alça de preenchimento, desfazer / refazer, localizar / substituir / ir para, comentários e remoção de duplicadas.
Todos seguem a visão filtrada e ordenada, do jeito que você a vê.

## Referência de teclado

| Ação | Teclas |
|---|---|
| Mover a célula ativa | setas, Tab / Shift+Tab |
| Pular para a borda dos dados | Ctrl/Cmd + seta |
| Estender o intervalo | Shift + seta, Shift + Ctrl/Cmd + seta, Shift + clique ou arrastar |
| Selecionar todas as células (e todas as linhas) | Ctrl/Cmd + A |
| Copiar o intervalo / colar a partir do canto superior esquerdo | Ctrl/Cmd + C / Ctrl/Cmd + V |
| Limpar o intervalo | Delete / Backspace |
| Preencher para baixo / para a direita (copia a primeira linha / coluna do intervalo) | Ctrl/Cmd + D / Ctrl/Cmd + R |
| Desfazer / refazer | Ctrl/Cmd + Z / Ctrl/Cmd + Y ou Ctrl/Cmd + Shift + Z |
| Localizar / substituir / ir para | Ctrl/Cmd + F / Ctrl/Cmd + H / Ctrl/Cmd + G |
| Editar o comentário da célula ativa | Shift + F2 |
| Selecionar as linhas do intervalo | Espaço |

Os atalhos funcionam enquanto a grade tem o foco; em qualquer outro lugar da página, Ctrl+F continua abrindo a
busca do próprio navegador.

## Intervalos

Arraste sobre as células, use Shift+clique ou Shift+setas. A célula ativa é a âncora (ela mantém o contorno
grosso); o intervalo fica colorido, com uma borda ao redor e uma alça de preenchimento no canto.

```ts
grid.setRange({ id: '1', field: 'name' }, { id: '5', field: 'price' });
grid.getRange();        // { from, to, rows: ['1', ..., '5'], fields: ['name', 'qty', 'price'] }
grid.getRangeValues();  // [['Pen', 2, 1.5], ...] valores armazenados
grid.clearRange();      // apaga as células editáveis, em um passo de desfazer; retorna a quantidade
grid.on('rangeChange', e => console.log(e.detail));   // mesmo formato de getRange(), ou null
```

- **Copiar** grava o intervalo como texto separado por tabulações, do jeito que é exibido, então ele cola direto no Excel.
- **Colar** começa na célula superior esquerda do intervalo. Um único valor colado sobre um intervalo preenche
  todas as células dele, como no Excel. Células copiadas do Excel que contêm quebras de linha ficam em uma única célula.
- Colar, limpar, preencher e substituir contam, cada um, como **um passo de desfazer**.

Clicar em uma célula de dados seleciona a célula, não a linha: as linhas são selecionadas com a coluna de checkbox,
com Espaço ou com Ctrl+A. Defina `selection: { selectOnClick: true }` para selecionar linhas a partir de qualquer célula (o
comportamento padrão anterior). Veja [Seleção](selection.md).

## Alça de preenchimento

Arraste o quadradinho no canto do intervalo para baixo, para cima, para a esquerda ou para a direita. Manter o ponteiro além
da borda da grade continua rolando e estendendo. Dê um duplo clique na alça para preencher até a última
linha.

| Origem | Resultado |
|---|---|
| Um número | copiado: `7` → `7, 7, 7` |
| Dois ou mais números com passo constante | continuados: `1, 2` → `3, 4`; `10, 8` → `6, 4` |
| Datas | uma data soma um dia; duas continuam o seu passo (`Jan 1, Jan 8` → `Jan 15`) |
| Texto terminado em número | o número continua: `Item 1` → `Item 2`, `A001` → `A002` |
| Qualquer outra coisa | o bloco se repete: `x, y` → `x, y, x` |

Preencher para cima ou para a esquerda executa a série de trás para frente. Colunas de fórmula e células somente leitura são ignoradas.

```ts
grid.fill('down', 10);     // como arrastar a alça por 10 linhas; retorna as células gravadas
grid.fillCopy('right');    // Ctrl+R: copia a primeira coluna do intervalo para as demais
grid.on('fill', e => console.log(e.detail));   // { direction, count, written, range }
```

As regras de série também são exportadas: `fillSeries(source, count, type)` e
`fillSeriesBackward(source, count, type)`.

## Desfazer e refazer

Cada ação do usuário é um passo: uma edição, uma colagem, um preenchimento, uma substituição, adicionar ou excluir linhas. A
barra de navegação tem os botões ↶ ↷ (`navbar.undo`, exibidos quando há algo editável).

```ts
grid.undo();                 // false quando não há nada para desfazer
grid.redo();
grid.canUndo(); grid.canRedo();
grid.batch(() => {           // agrupa as suas próprias alterações em um passo
    grid.setCellValue('1', 'qty', 3);
    grid.setCellValue('2', 'qty', 4);
}, 'restock');
grid.clearUndo();
grid.on('undo', e => console.log(e.detail.label));   // também 'redo'
```

`undoLimit` (padrão 100) define quantos passos são guardados. `setData()` e as recargas do modo append limpam
o histórico. Desfazer também atualiza o [rastreamento de alterações](change-tracking.md): desfazer uma edição faz a linha
voltar a ficar sem alterações.

## Localizar, substituir e ir para

Ctrl+F abre uma barra acima da grade. As ocorrências ficam destacadas, Enter / Shift+Enter percorrem cada uma
(começando na célula ativa e voltando ao início no fim), e a ocorrência atual vira a célula ativa,
rolada até ficar visível. **Match case** e **Whole cell** restringem a busca. Esc fecha a barra.

Ctrl+H adiciona uma linha de substituição: **Replace** troca a ocorrência atual e passa para a próxima,
**Replace all** troca todas as ocorrências em um único passo de desfazer. A substituição trabalha sobre o que você digitaria na
célula (`1200`, não `$1,200.00`), e o resultado é interpretado como uma entrada digitada.

Ctrl+G vai para um número de linha, opcionalmente com o título ou o field de uma coluna: `120`, `120 Price`, `120, price`.

```ts
grid.find('paul', { matchCase: false, wholeCell: false, fields: ['name'] });   // [{ id, field }]
grid.replace('Paul', 'Paulo', { wholeCell: true });                            // células alteradas
grid.goTo(120);  grid.goTo('120 Price');                                       // false se não existir
grid.openFind('replace');  grid.closeFind();
grid.highlightCells([{ id: '1', field: 'name' }]);                              // as suas próprias marcações
```

Localizar busca no texto exibido das linhas filtradas, incluindo linhas em [grupos](grouping.md)
recolhidos (ir até uma delas abre o seu grupo). Desative a barra com `find: false`; o Ctrl+F
fica então com o navegador.

## Comentários

Um comentário é uma anotação em uma célula: uma marca vermelha no canto, o texto ao passar o mouse e um editor com Shift+F2
(Ctrl+Enter salva, Esc cancela).

```ts
new IntelligentGrid('#grid', { comments: [{ id: '1', field: 'city', text: 'Check the address' }], ... });
grid.setComment('2', 'name', 'Duplicate?');   // pode ser desfeito; null ou '' o remove
grid.getComment('2', 'name');
grid.getComments();                           // [{ id, field, text }] das linhas existentes
grid.editComment('2', 'name');                // abre o editor
grid.on('commentChange', e => save(e.detail)); // { id, field, text, oldText }
```

Os comentários são guardados pelo id da linha, então eles acompanham a linha ao ordenar, filtrar e recarregar com
os mesmos ids. Eles não fazem parte do rastreamento de alterações e não são exportados.

## Remover duplicadas

```ts
grid.findDuplicates({ fields: ['name', 'city'] });     // ids que repetem uma linha anterior
grid.removeDuplicates({ fields: ['name', 'city'] });   // exclui essas linhas, em um passo de desfazer
```

| Opção | Padrão | |
|---|---|---|
| `fields` | todas as colunas visíveis que não são fórmula | colunas que precisam coincidir todas |
| `matchCase` | `false` | `"Ana"` e `"ana "` são iguais (o texto é aparado), como no Excel |
| `scope` | `'filtered'` | `'all'` verifica todas as linhas, na ordem de inserção |

A primeira linha de cada conjunto, na ordem exibida, é mantida. `removeDuplicates` não pede
confirmação; chame `grid.confirm()` antes, se você quiser uma.
