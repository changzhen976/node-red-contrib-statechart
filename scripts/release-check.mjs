/**
 * Pre-release gate. Does not publish.
 * `private: true` and a `-dev` version are reported as release decisions,
 * not as failures, so this can run in CI while the package is still private.
 */
import { execFileSync } from 'node:child_process'
import { access, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const required = [
  'LICENSE', 'NOTICE', 'README.md', 'README.en.md',
  'dist/statechart.js', 'dist/statechart.html',
  'dist/editor-app/index.html', 'dist/editor-app/assets',
  'dist/locales/en-US/statechart.json', 'dist/locales/zh-CN/statechart.json',
  'dist/locales/zh-CN/statechart.html',
  'dist/icons/statechart.svg',
  'examples/traffic-light.json', 'examples/demo-suite.json', 'examples/README.md',
]
const missing = []
for (const file of required) {
  try { await access(resolve(root, file)) } catch { missing.push(file) }
}

const editorIndex = await readFile(resolve(root, 'dist/editor-app/index.html'), 'utf8')
if (editorIndex.includes('scxmljs-creator')) {
  missing.push('dist/editor-app/index.html: old product title still present')
}
if (!editorIndex.includes('dock the Node-RED bar')) {
  missing.push('dist/editor-app/index.html: standalone bar layout override missing')
}
if (!editorIndex.includes('.toolbar .exit-btn')) {
  missing.push('dist/editor-app/index.html: standalone exit button hide rule missing')
}
const notice = await readFile(resolve(root, 'NOTICE'), 'utf8')
if (!notice.includes('6b5cfb6')) missing.push('NOTICE: vendor commit 6b5cfb6 missing')
if (!pkg['node-red']?.nodes?.statechart) missing.push('package.json: node-red.nodes.statechart missing')
if (!pkg.engines?.node) missing.push('package.json: engines.node missing')
if (!pkg.license) missing.push('package.json: license missing')
if (pkg.name.startsWith('@') && pkg.publishConfig?.access !== 'public') {
  missing.push('package.json: scoped package must set publishConfig.access=public')
}

const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }))[0]
const files = pack.files.map((file) => file.path)
for (const requiredFile of ['dist/editor-app/index.html', 'dist/locales/zh-CN/statechart.json', 'dist/icons/statechart.svg', 'examples/demo-suite.json', 'LICENSE', 'NOTICE']) {
  if (!files.includes(requiredFile)) missing.push(`npm pack: ${requiredFile} missing`)
}
if (files.some((file) => file.startsWith('.tmp/') || file.startsWith('test/') || file.startsWith('.opencode/'))) {
  missing.push('npm pack: development-only files included')
}

// Internal hostnames and paths must never ship in the published artefacts.
// The needles are assembled from parts so this guard does not itself spell out
// the hostname it looks for.
const INTERNAL_HOSTNAMES = ['home' + 'assistant', 'debian' + '-dev']
const leaked = []
for (const entry of await readdir(resolve(root, 'dist'), { recursive: true })) {
  if (!/\.(js|mjs|cjs|html|css|json|map)$/.test(entry)) continue
  const text = await readFile(resolve(root, 'dist', entry), 'utf8').catch(() => '')
  for (const needle of INTERNAL_HOSTNAMES) {
    if (text.includes(needle)) leaked.push(`dist/${entry}: contains an internal hostname`)
  }
}
missing.push(...leaked)

console.log(JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  private: pkg.private === true,
  node: pkg.engines?.node,
  nodeRed: pkg['node-red']?.version,
  tarball: pack.filename,
  packageSize: pack.size,
  unpackedSize: pack.unpackedSize,
  files: files.length,
  required: missing.length === 0 ? 'ok' : 'missing',
  decisions: [
    ...(pkg.private === true ? ['package.json private=true: remove only with release approval'] : []),
    ...(String(pkg.version).includes('-dev') ? ['version is a development version: bump before publishing'] : []),
  ],
}, null, 2))

if (missing.length) {
  console.error('release check failed:', missing)
  process.exit(1)
}
console.log('release check passed (publish not performed)')
