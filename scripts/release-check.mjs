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
  'dist/editor/index.html', 'dist/editor/main.js', 'dist/editor/main.css',
  'dist/locales/en-US/statechart.json', 'dist/locales/zh-CN/statechart.json',
  'dist/locales/zh-CN/statechart.html',
  'dist/icons/statechart.svg',
  'examples/traffic-light.json', 'examples/demo-suite.json', 'examples/internal-events.json', 'examples/README.md',
]
const missing = []
for (const file of required) {
  try { await access(resolve(root, file)) } catch { missing.push(file) }
}

const editorIndex = await readFile(resolve(root, 'dist/editor/index.html'), 'utf8')
if (editorIndex.includes('scxmljs-creator')) {
  missing.push('dist/editor/index.html: old product title still present')
}
if (!editorIndex.includes('main.js') || !editorIndex.includes('main.css')) {
  missing.push('dist/editor/index.html: main.js/main.css references missing')
}
const notice = await readFile(resolve(root, 'NOTICE'), 'utf8')
if (!notice.includes('statechart-kit')) missing.push('NOTICE: statechart-kit attribution missing')
if (!pkg['node-red']?.nodes?.statechart) missing.push('package.json: node-red.nodes.statechart missing')
if (!pkg.engines?.node) missing.push('package.json: engines.node missing')
if (!pkg.license) missing.push('package.json: license missing')
if (pkg.name.startsWith('@') && pkg.publishConfig?.access !== 'public') {
  missing.push('package.json: scoped package must set publishConfig.access=public')
}

const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }))[0]
const files = pack.files.map((file) => file.path)
for (const requiredFile of ['dist/editor/index.html', 'dist/editor/main.js', 'dist/locales/zh-CN/statechart.json', 'dist/icons/statechart.svg', 'examples/demo-suite.json', 'examples/internal-events.json', 'LICENSE', 'NOTICE']) {
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

// The standalone editor must not advertise the donor project, and neither the
// editor nor the node form may explain donor-only features (globals registry,
// MQTT bridge, server clock, system events) that this package does not ship.
const DONOR_TEXT = [
  'scxmljs-creator',
  'gv_ 为全局变量前缀',
  'mqv_ 表示 MQTT',
  'ge_/mqe_ 为事件前缀',
  '开头时绑定全局变量',
  'sys. 为系统保留前缀',
]
for (const entry of await readdir(resolve(root, 'dist/editor'), { recursive: true })) {
  if (!/\.(js|mjs|css|html|json)$/.test(entry)) continue
  const text = await readFile(resolve(root, 'dist/editor', entry), 'utf8').catch(() => '')
  for (const needle of DONOR_TEXT) {
    if (text.includes(needle)) missing.push(`dist/editor/${entry}: donor naming copy still present ("${needle}")`)
  }
}

const nodeForm = await readFile(resolve(root, 'dist/statechart.html'), 'utf8')
for (const needle of ['gv_', 'mqv_']) {
  if (nodeForm.includes(needle)) missing.push(`dist/statechart.html: donor variable prefix "${needle}" still present`)
}

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
