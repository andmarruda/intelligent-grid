# Development

Requirements: Node.js 22.18+ (it runs the TypeScript sources natively, so there's no ts-node/tsx) and npm.

```bash
npm install      # also installs the git hooks (husky, through "prepare")
npm run demo     # build + serve the examples at http://localhost:5173/examples/
```

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | `scripts/build.ts`: esbuild bundles + `tsc` declarations into `dist/` |
| `npm run typecheck` | `tsc` on `src`/`scripts` (strict, `noUncheckedIndexedAccess`) and on the tests (`tsconfig.test.json`) |
| `npm run lint` / `lint:fix` | ESLint (typescript-eslint) over the repo |
| `npm test` | Node's test runner on `test/**/*.test.ts` against the sources |
| `npm run check` | lint + typecheck + test + build, which is what CI or a release should run |
| `npm run demo` | build, then `scripts/serve.ts` (static server on port 5173, `PORT` to change) |
| `npm run test:e2e` | build, then the Playwright tests in `e2e/` in real Chromium (`npx playwright install chromium` once) |
| `npm run bench` | build, then [`bench/run.ts`](../bench/run.ts) in Chromium; see [Benchmarks](benchmarks.md) |

## Build output

| File | Format |
|---|---|
| `dist/index.js` (+ map) | ES module |
| `dist/index.cjs` (+ map) | CommonJS |
| `dist/intelligent-grid.min.js` (+ map) | minified IIFE, `window.IntelligentGrid` |
| `dist/intelligent-grid.css`, `.min.css` | styles |
| `dist/types/**/*.d.ts` (+ maps) | declarations |

`package.json` `exports` maps `intelligent-grid` (import/require/types), `intelligent-grid/styles.css`,
`intelligent-grid/styles.min.css` and `intelligent-grid/browser`.

The build prints the gzip size of the browser bundle and **fails above its budget** (64 kB for the
JavaScript, 5 kB for the CSS, set in `scripts/build.ts`). Raise the budget on purpose when a feature
is worth it.

`dist/` **is committed**: the pre-commit hook rebuilds it, so the GitHub repository always has an
up-to-date build (usable straight from a CDN such as jsDelivr's GitHub endpoint).

## Git hooks (husky)

| Hook | Runs |
|---|---|
| `pre-commit` | `lint-staged` (ESLint `--fix` on staged `.ts`/`.js`, zero warnings), `npm run typecheck`, `npm run build`, `git add dist` |
| `pre-push` | `npm test` |

The hooks live in `.husky/`. `npm install` activates them (`prepare: husky`). Skip them in an
emergency with `git commit --no-verify` / `git push --no-verify`.

## Code style

- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`
  (no enums, namespaces or parameter properties, so Node can strip the types).
- Relative imports use the `.ts` extension. The build rewrites them for the declarations.
- Type-only imports use `import type` (enforced by ESLint).
- 4-space indentation, single quotes, semicolons; follow the surrounding code.
- Anything that goes around the SorlaDB API lives in `src/core/store.ts`, marked `SorlaDB:` with the reason.

## Tests

| File | Covers |
|---|---|
| `test/formula.test.ts` | parser, operators, functions, dates, number formats, A1 printing |
| `test/store.test.ts` | SorlaDB adapter and filter compilation against the real sorla-db |
| `test/engine-export.test.ts` | calculated columns, incremental recalculation, CSV, XLSX package |
| `test/grid.dom.test.ts` | the grid UI in jsdom: rendering, sorting, filters, editing, selection, export, append mode |
| `test/api-types.test.ts` | documented API usage type-checks and works |
| `test/query.test.ts`, `test/query-builder.dom.test.ts` | advanced filter model, SorlaDB JSON, the builder panel |
| `test/undo.dom.test.ts`, `test/range.dom.test.ts`, `test/fill.test.ts` | undo / redo, cell ranges, fill handle series |
| `test/find.dom.test.ts`, `test/group.dom.test.ts`, `test/presets.dom.test.ts` | find / replace / go to, grouping and subtotals, data bars, color scales, icon sets |
| `test/import.dom.test.ts`, `test/extras.dom.test.ts` | CSV / XLSX import (with an Excel-style deflated file), duplicates, sparklines, comments |
| `test/virtual.test.ts` | row layout and column window math |
| `e2e/*.spec.ts` | Playwright: virtualization with 100 000 rows, pinned columns, wrapped text, mouse drag ranges, fill handle auto scroll, real clipboard, Ctrl+F, file input import, group rows |

## Releasing

1. `npm version minor` (or patch/major)
2. `npm run check`
3. `git push --follow-tags`
4. `npm publish` (`prepublishOnly` runs `npm run check` again)
