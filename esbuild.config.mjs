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
  outfile: resolve(dist, 'statechart.js'),
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
const editorHtml = (await readFile(resolve(root, 'editor/statechart.html'), 'utf8'))
  .replace('<!-- SCXML_CORE_INLINE -->', `<script>${editorCoreJs}</script>`)
await writeFile(resolve(dist, 'statechart.html'), editorHtml)
await cp(resolve(root, 'editor/locales'), resolve(dist, 'locales'), { recursive: true })
await cp(resolve(root, 'assets/icons'), resolve(dist, 'icons'), { recursive: true })
// P4 standalone editor build (generated from ../scxml-creator).
await cp(resolve(root, 'editor-app'), resolve(dist, 'editor-app'), { recursive: true })
// The donor SPA title still carries the old product name, and its Node-RED bar
// floats over the editor. Override both in dist without hand-editing the
// generated editor-app directory.
const editorAppIndexPath = resolve(dist, 'editor-app/index.html')
const editorAppIndex = await readFile(editorAppIndexPath, 'utf8')
const standaloneOverrideCss = `<style>
/* statechart: dock the Node-RED bar and reserve its height */
html, body { height: 100% !important; }
#app {
  height: calc(100vh - 44px) !important;
  height: calc(100dvh - 44px) !important;
}
#scxml-nodered-bar {
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  max-width: none !important;
  height: 44px;
  box-sizing: border-box;
  padding: 6px 12px !important;
  border-radius: 0 !important;
  border-width: 1px 0 0 !important;
  box-shadow: none !important;
  flex-wrap: nowrap;
  overflow: hidden;
}
#scxml-nodered-bar > span:first-of-type {
  flex: 1;
  min-width: 0;
  max-width: none !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 720px) {
  #scxml-nodered-bar strong { display: none !important; }
}
@media (prefers-color-scheme: dark) {
  #scxml-nodered-bar {
    background: #0f172a !important;
    color: #e2e8f0 !important;
    border-color: #334155 !important;
  }
}
/* The donor "exit edit" control navigates to a gallery that does not exist in
   Node-RED mode; the docked bar already provides "Close". */
.toolbar .exit-btn { display: none !important; }
</style>`
await writeFile(
  editorAppIndexPath,
  editorAppIndex
    .replace(/<title>.*?<\/title>/, '<title>State chart editor — Node-RED</title>')
    .replace('</head>', `${standaloneOverrideCss}</head>`),
)

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
