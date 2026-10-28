/**
 * Builds dist/:
 *   index.js                     ES module (bundlers, <script type="module">)
 *   index.cjs                    CommonJS (require)
 *   intelligent-grid.min.js      browser bundle, registers window.IntelligentGrid
 *   intelligent-grid.css(.min)   styles
 *   types/                       .d.ts declarations
 *
 * Run with `npm run build` (Node runs this TypeScript file natively).
 */
import { build } from 'esbuild';
import type { BuildOptions } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
const banner = `/*! Intelligent Grid v${pkg.version} | MIT | https://github.com/sysborg */`;

const shared: BuildOptions = {
    entryPoints: [join(root, 'src/index.ts')],
    bundle: true,
    target: 'es2022',
    sourcemap: true,
    legalComments: 'none',
    banner: { js: banner },
    logLevel: 'warning'
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
    build({ ...shared, format: 'esm', outfile: join(dist, 'index.js') }),
    build({ ...shared, format: 'cjs', outfile: join(dist, 'index.cjs') }),
    build({
        ...shared,
        format: 'iife',
        minify: true,
        globalName: '__IntelligentGrid',
        // window.IntelligentGrid is the grid class, with every other export attached to it
        footer: { js: 'globalThis.IntelligentGrid=Object.assign(__IntelligentGrid.IntelligentGrid,__IntelligentGrid);' },
        outfile: join(dist, 'intelligent-grid.min.js')
    }),
    build({
        entryPoints: [join(root, 'styles/intelligent-grid.css')],
        minify: true,
        banner: { css: banner },
        logLevel: 'warning',
        outfile: join(dist, 'intelligent-grid.min.css')
    }),
    copyFile(join(root, 'styles/intelligent-grid.css'), join(dist, 'intelligent-grid.css'))
]);

execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.build.json')], { stdio: 'inherit' });

// declarations keep the ".ts" import specifiers of the sources; ".js" resolves to the .d.ts everywhere
async function rewriteDeclarations(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            await rewriteDeclarations(path);
        } else if (entry.name.endsWith('.d.ts')) {
            const text = await readFile(path, 'utf8');
            await writeFile(path, text.replace(/(from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\.ts\2/g, '$1$2$3.js$2'));
        }
    }
}
await rewriteDeclarations(join(dist, 'types'));

const files = await readdir(dist);
console.log(`dist/ built: ${files.filter(f => !f.endsWith('.map')).join(', ')}`);
