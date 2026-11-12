/**
 * Run the live suites against a throwaway Node-RED instance.
 *
 * Creates `.tmp/live-nodered/`, links this repo in as a node module, imports the
 * editor fixture plus the cascade example, then runs:
 *   - test/browser-smoke.mjs
 *   - test/browser-p4.mjs
 *   - test/e2e-server.mjs
 *   - scripts/test-cascade.mjs
 *
 * Usage:
 *   GECKODRIVER=/path/to/geckodriver npm run test:live
 *
 * Options:
 *   --port <n>   fixed port (default: a free port)
 *   --keep       keep the temporary user directory after a successful run
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const keep = args.includes('--keep')
const portArg = args.indexOf('--port')
const fixedPort = portArg >= 0 ? Number(args[portArg + 1]) : null
const userDir = path.join(root, '.tmp', 'live-nodered')
const logPath = path.join(userDir, 'node-red.log')
const nodeRedBin = path.join(root, 'node_modules', '.bin', 'node-red')
const gecko = process.env.GECKODRIVER || 'geckodriver'

async function freePort() {
  if (fixedPort) return fixedPort
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function run(label, command, commandArgs, env) {
  console.log(`\n▶ ${label}`)
  execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
}

async function waitFor(url, child, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Node-RED exited with code ${child.exitCode}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`timeout waiting for ${url}`)
}

async function readLog() {
  try { return await fs.readFile(logPath, 'utf8') } catch { return '' }
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ])
  if (!exited) child.kill('SIGKILL')
}

const port = await freePort()
const base = `http://127.0.0.1:${port}/`
let child = null
let failed = true

try {
  if (!existsSync(nodeRedBin)) throw new Error('node-red is not installed; run npm ci --include=dev')

  await fs.rm(userDir, { recursive: true, force: true })
  await fs.mkdir(path.join(userDir, 'node_modules', '@changzhen976'), { recursive: true })

  const fixture = JSON.parse(await fs.readFile(path.join(root, 'test', 'fixtures', 'editor-traffic.json'), 'utf8'))
  const cascade = JSON.parse(await fs.readFile(path.join(root, 'examples', 'cascade-test.json'), 'utf8'))
  await fs.writeFile(path.join(userDir, 'flows.json'), JSON.stringify([...fixture, ...cascade], null, 2))
  await fs.writeFile(path.join(userDir, 'settings.js'), `module.exports = {
  uiPort: ${port},
  flowFile: 'flows.json',
  logging: { console: { level: 'warn', metrics: false, audit: false } },
  editorTheme: { projects: { enabled: false } },
  functionExternalModules: false,
}
`)
  await fs.symlink(root, path.join(userDir, 'node_modules', '@changzhen976', 'node-red-contrib-statechart'), 'dir')

  // Make sure the linked package has an up-to-date dist before Node-RED loads it.
  run('build', 'npm', ['run', 'build'])

  const log = await fs.open(logPath, 'w')
  child = spawn(nodeRedBin, ['--userDir', userDir, '-p', String(port), '--no-telemetry'], {
    cwd: root,
    stdio: ['ignore', log.fd, log.fd],
    env: { ...process.env, NODE_ENV: 'test' },
  })
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`Node-RED exited with code ${code}`)))
    waitFor(`${base}statechart/token`, child).then(resolve, reject)
  })
  console.log(`Node-RED ready at ${base}`)
  const liveEnv = { NODERED_URL: base, CASCADE_BASE: base, GECKODRIVER: gecko }

  run('browser: tray editor + monitor', 'node', ['test/browser-smoke.mjs'], liveEnv)
  run('browser: standalone editor', 'node', ['test/browser-p4.mjs'], liveEnv)
  run('server: deployed hub flow', 'node', ['test/e2e-server.mjs'], liveEnv)
  run('cascade example', 'node', ['scripts/test-cascade.mjs'], liveEnv)
  failed = false
} catch (err) {
  console.error('\nLIVE TEST FAILED:', err instanceof Error ? err.message : err)
  const tail = (await readLog()).trim().split('\n').slice(-40).join('\n')
  if (tail) console.error(`\nNode-RED log (${logPath}):\n${tail}`)
  process.exitCode = 1
} finally {
  await stop(child)
  if (!failed && !keep) {
    await fs.rm(userDir, { recursive: true, force: true }).catch(() => {})
  } else if (!failed && keep) {
    console.log(`kept ${userDir}`)
  }
}
