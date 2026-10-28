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
- Anything that works around SorlaDB goes in `src/core/store.ts`, marked `SorlaDB 1.0 workaround`.

## Tests

| File | Covers |
|---|---|
| `test/formula.test.ts` | parser, operators, functions, dates, number formats, A1 printing |
| `test/store.test.ts` | SorlaDB adapter and filter compilation against the real sorla-db |
| `test/engine-export.test.ts` | calculated columns, incremental recalculation, CSV, XLSX package |
| `test/grid.dom.test.ts` | the grid UI in jsdom: rendering, sorting, filters, editing, selection, export, append mode |
| `test/api-types.test.ts` | documented API usage type-checks and works |

## Releasing

1. `npm version minor` (or patch/major)
2. `npm run check`
3. `git push --follow-tags`
4. `npm publish` (`prepublishOnly` runs `npm run check` again)
