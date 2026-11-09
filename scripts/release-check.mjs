/**
 * Pre-release gate. Does not publish.
 * `private: true` and a `-dev` version are reported as release decisions,
 * not as failures, so this can run in CI while the package is still private.
 */
import { execFileSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const required = [
  'LICENSE', 'NOTICE', 'README.md',
  'dist/scxml.js', 'dist/scxml.html',
  'dist/locales/en-US/scxml.json', 'dist/locales/zh-CN/scxml.json',
  'dist/locales/zh-CN/scxml.html',
  'examples/traffic-light.json', 'examples/demo-suite.json', 'examples/README.md',
]
const missing = []
for (const file of required) {
  try { await access(resolve(root, file)) } catch { missing.push(file) }
}

const notice = await readFile(resolve(root, 'NOTICE'), 'utf8')
if (!notice.includes('6b5cfb6')) missing.push('NOTICE: vendor commit 6b5cfb6 missing')
if (!pkg['node-red']?.nodes?.scxml) missing.push('package.json: node-red.nodes.scxml missing')
if (!pkg.engines?.node) missing.push('package.json: engines.node missing')
if (!pkg.license) missing.push('package.json: license missing')

const pack = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }))[0]
const files = pack.files.map((file) => file.path)
for (const requiredFile of ['dist/locales/zh-CN/scxml.json', 'examples/demo-suite.json', 'LICENSE', 'NOTICE']) {
  if (!files.includes(requiredFile)) missing.push(`npm pack: ${requiredFile} missing`)
}
if (files.some((file) => file.startsWith('.tmp/') || file.startsWith('test/') || file.startsWith('.opencode/'))) {
  missing.push('npm pack: development-only files included')
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
