import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = resolve(root, 'dist')

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

await copyFile(resolve(root, 'editor/scxml.html'), resolve(dist, 'scxml.html'))

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
