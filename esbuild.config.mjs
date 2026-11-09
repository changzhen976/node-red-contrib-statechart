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
