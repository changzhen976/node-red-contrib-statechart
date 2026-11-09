import { build } from 'esbuild'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = resolve(root, 'dist')

// Clean previous hashed assets so npm pack does not include stale chunks.
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/nodes/index.ts')],
  outfile: resolve(dist, 'scxml.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
  external: ['@tinyactors/scxmljs', '@tinyactors/scxmljs/trusted', '@xmldom/xmldom'],
})

// Bundle the pure core for the Node-RED editor form. It is inlined below so
// the editor never needs a bare ESM import or a second HTTP route.
const editorCore = await build({
  entryPoints: [resolve(root, 'src/editor/core-bridge.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
})
const editorCoreJs = editorCore.outputFiles[0].text
const editorHtml = (await readFile(resolve(root, 'editor/scxml.html'), 'utf8'))
  .replace('<!-- SCXML_CORE_INLINE -->', `<script>${editorCoreJs}</script>`)
await writeFile(resolve(dist, 'scxml.html'), editorHtml)
await cp(resolve(root, 'editor/locales'), resolve(dist, 'locales'), { recursive: true })
// P4 standalone editor build (generated from ../scxml-creator).
await cp(resolve(root, 'editor-app'), resolve(dist, 'editor-app'), { recursive: true })

// Browser bundle for the P2.5 read-only monitor page.
await build({
  entryPoints: { view: resolve(root, 'src/monitor/view-entry.ts') },
  outdir: resolve(dist, 'monitor'),
  entryNames: 'view',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
})

for (const file of ['index.html', 'monitor.js', 'monitor.css']) {
  await copyFile(resolve(root, 'monitor', file), resolve(dist, 'monitor', file))
}
