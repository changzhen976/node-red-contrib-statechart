/**
 * Guard the `statechart-kit` dependency.
 *
 * The kit is a devDependency that is bundled into `dist/`; the published package
 * must never require it at runtime. This check makes a stale or accidentally
 * runtime-declared kit fail early, before the build/test gate.
 */
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_VERSION = '0.13.1'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const failures = []
const notes = []

function fail (message) {
  failures.push(message)
}

const hostPkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const declared = hostPkg.devDependencies?.['statechart-kit']
if (!declared) fail('package.json: statechart-kit missing from devDependencies')
if (hostPkg.dependencies?.['statechart-kit']) {
  fail('package.json: statechart-kit must not be a runtime dependency (bundle it instead)')
}

let kitRoot = null
try {
  kitRoot = dirname(require.resolve('statechart-kit/package.json'))
} catch (err) {
  fail(`cannot resolve statechart-kit/package.json: ${err instanceof Error ? err.message : String(err)}`)
}

if (kitRoot) {
  const kit = JSON.parse(await readFile(resolve(kitRoot, 'package.json'), 'utf8'))
  if (kit.version !== EXPECTED_VERSION) {
    fail(`statechart-kit version ${kit.version} != expected ${EXPECTED_VERSION} (update guard + changelog)`)
  }
  notes.push(`kit ${kit.version} at ${kitRoot}`)

  const required = [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/engine.js',
    'dist/engine.d.ts',
    'dist/vue.js',
    'dist/vue/style.css',
  ]
  for (const file of required) {
    try {
      await stat(resolve(kitRoot, file))
    } catch {
      fail(`statechart-kit dist file missing: ${file} (run npm run build in the kit)`)
    }
  }

  // A file: dependency is edited in place; make sure its dist is not stale.
  // Registry installs have no src/, so the stat() calls fall through.
  const pairs = [
    ['src/core/model.ts', 'dist/index.js'],
    ['src/engine/session-runner.ts', 'dist/engine.js'],
    ['src/vue/index.ts', 'dist/vue.js'],
  ]
  for (const [src, dist] of pairs) {
    try {
      const [s, d] = await Promise.all([stat(resolve(kitRoot, src)), stat(resolve(kitRoot, dist))])
      if (d.mtimeMs < s.mtimeMs) {
        fail(`statechart-kit dist is stale for ${src}; run npm run build in the kit`)
      }
    } catch {
      // Missing files are reported above; do not duplicate.
    }
  }

  // The published Node-RED bundle must inline the kit, not require it at runtime.
  const bundle = resolve(root, 'dist/statechart.js')
  try {
    const js = await readFile(bundle, 'utf8')
    if (/require\(\s*["']statechart-kit/.test(js)) {
      fail('dist/statechart.js requires statechart-kit at runtime; bundle it instead')
    }
  } catch {
    notes.push('dist/statechart.js not built yet (skipped bundle check)')
  }
}

if (failures.length) {
  console.error('kit check failed:')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log(`kit ok: ${notes.join('; ')}`)
