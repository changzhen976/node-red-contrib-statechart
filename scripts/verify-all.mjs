/**
 * Local verification gate.
 * Browser suites need a live Node-RED + geckodriver; set STATECHART_BROWSER=1.
 * Node 22.9 is run through `npx node@22.9.0` unless NODE22_BIN is provided.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tests = readdirSync(resolve(root, 'test')).filter((f) => f.endsWith('.test.cjs')).map((f) => `test/${f}`)
const run = (label, command, args, env = {}) => {
  console.log(`\n▶ ${label}`)
  execFileSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
}

run('typecheck', 'npm', ['run', 'typecheck'])
run('runtime tests (current Node)', 'npm', ['test'])
const node22 = process.env.NODE22_BIN || 'node@22.9.0'
run('runtime tests (Node 22.9)', 'npx', ['-y', node22, '--test', ...tests])
run('kit dependency check', 'node', ['scripts/check-kit.mjs'])
run('release package check', 'node', ['scripts/release-check.mjs'])

if (process.env.STATECHART_BROWSER === '1') {
  run('browser: tray editor + monitor', 'npm', ['run', 'test:browser'])
  run('browser: standalone editor', 'npm', ['run', 'test:p4'])
} else {
  console.log('\nℹ browser suites skipped; set STATECHART_BROWSER=1 and GECKODRIVER/NODERED_URL to run them')
}

if (process.env.STATECHART_E2E === '1') {
  run('server: deployed hub flow', 'npm', ['run', 'test:e2e'])
} else {
  console.log('ℹ server E2E skipped; set STATECHART_E2E=1 and NODERED_URL to deploy a temporary flow')
}

console.log('\nverify:all passed')
