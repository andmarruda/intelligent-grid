# Desenvolvimento

Requisitos: Node.js 22.18+ (ele executa os fontes TypeScript nativamente, então não há ts-node/tsx) e npm.

```bash
npm install      # também instala os git hooks (husky, via "prepare")
npm run demo     # build + serve os exemplos em http://localhost:5173/examples/
```

## Scripts

| Script | O que faz |
|---|---|
| `npm run build` | `scripts/build.ts`: bundles com esbuild + declarações com `tsc` em `dist/` |
| `npm run typecheck` | `tsc` em `src`/`scripts` (strict, `noUncheckedIndexedAccess`) e nos testes (`tsconfig.test.json`) |
| `npm run lint` / `lint:fix` | ESLint (typescript-eslint) no repositório |
| `npm test` | o test runner do Node em `test/**/*.test.ts` contra os fontes |
| `npm run check` | lint + typecheck + test + build, que é o que a CI ou uma versão deve rodar |
| `npm run demo` | build e depois `scripts/serve.ts` (servidor estático na porta 5173; use `PORT` para mudar) |
| `npm run test:e2e` | build e depois os testes Playwright em `e2e/` no Chromium real (`npx playwright install chromium` uma vez) |
| `npm run bench` | build e depois [`bench/run.ts`](../../bench/run.ts) no Chromium; veja [Benchmarks](benchmarks.md) |

## Saída do build

| Arquivo | Formato |
|---|---|
| `dist/index.js` (+ map) | módulo ES |
| `dist/index.cjs` (+ map) | CommonJS |
| `dist/intelligent-grid.min.js` (+ map) | IIFE minificado, `window.IntelligentGrid` |
| `dist/intelligent-grid.css`, `.min.css` | estilos |
| `dist/types/**/*.d.ts` (+ maps) | declarações |

O `exports` do `package.json` mapeia `intelligent-grid` (import/require/types), `intelligent-grid/styles.css`,
`intelligent-grid/styles.min.css` e `intelligent-grid/browser`.

O build mostra o tamanho em gzip do bundle para navegador e **falha acima do orçamento** (64 kB para o
JavaScript, 5 kB para o CSS, definidos em `scripts/build.ts`). Aumente o orçamento de propósito quando um recurso
valer a pena.

`dist/` **é commitado**: o hook de pre-commit o recompila, então o repositório no GitHub sempre tem um
build atualizado (que pode ser usado direto de uma CDN, como o endpoint de GitHub do jsDelivr).

## Git hooks (husky)

| Hook | Executa |
|---|---|
| `pre-commit` | `lint-staged` (ESLint `--fix` nos `.ts`/`.js` em stage, zero warnings), `npm run typecheck`, `npm run build`, `git add dist` |
| `pre-push` | `npm test` |

Os hooks ficam em `.husky/`. O `npm install` os ativa (`prepare: husky`). Em uma
emergência, pule-os com `git commit --no-verify` / `git push --no-verify`.

## Estilo de código

- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
  (sem enums, namespaces ou parameter properties, para que o Node consiga remover os tipos).
- Imports relativos usam a extensão `.ts`. O build os reescreve para as declarações.
- Imports só de tipos usam `import type` (exigido pelo ESLint).
- Indentação de 4 espaços, aspas simples, ponto e vírgula; siga o código ao redor.
- Tudo o que contorna a API do SorlaDB fica em `src/core/store.ts`, marcado com `SorlaDB:` e o motivo.

## Testes

| Arquivo | Cobre |
|---|---|
| `test/formula.test.ts` | parser, operadores, funções, datas, formatos numéricos, impressão em A1 |
| `test/store.test.ts` | adaptador do SorlaDB e compilação de filtros contra o sorla-db real |
| `test/engine-export.test.ts` | colunas calculadas, recálculo incremental, CSV, pacote XLSX |
| `test/grid.dom.test.ts` | a interface da grade no jsdom: renderização, ordenação, filtros, edição, seleção, exportação, modo append |
| `test/api-types.test.ts` | o uso documentado da API passa na checagem de tipos e funciona |
| `test/query.test.ts`, `test/query-builder.dom.test.ts` | modelo de filtro avançado, JSON do SorlaDB, o painel do construtor |
| `test/undo.dom.test.ts`, `test/range.dom.test.ts`, `test/fill.test.ts` | desfazer / refazer, intervalos de células, séries da alça de preenchimento |
| `test/find.dom.test.ts`, `test/group.dom.test.ts`, `test/presets.dom.test.ts` | localizar / substituir / ir para, agrupamento e subtotais, barras de dados, escalas de cor, conjuntos de ícones |
| `test/import.dom.test.ts`, `test/extras.dom.test.ts` | importação de CSV / XLSX (com um arquivo comprimido com deflate no estilo do Excel), duplicados, sparklines, comentários |
| `test/virtual.test.ts` | cálculos de layout das linhas e da janela de colunas |
| `e2e/*.spec.ts` | Playwright: virtualização com 100 000 linhas, colunas fixas, texto com quebra de linha, intervalos arrastando o mouse, auto scroll da alça de preenchimento, área de transferência real, Ctrl+F, importação por input de arquivo, linhas de grupo |

## Publicando uma versão

1. `npm version minor` (ou patch/major)
2. `npm run check`
3. `git push --follow-tags`
4. `npm publish` (`prepublishOnly` roda `npm run check` de novo)
