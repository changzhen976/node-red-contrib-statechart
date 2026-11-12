/**
 * Shared Firefox/geckodriver helpers for the browser suites.
 *
 * The suites talk to a live Node-RED over WebDriver. Two rules keep them
 * deterministic:
 *   1. every WebDriver command has its own timeout (a wedged browser fails the
 *      test instead of hanging the whole run);
 *   2. scripts never return a Node-RED promise (for example
 *      `RED.workspaces.show()`), only plain serializable values.
 */
import { spawn } from 'node:child_process'
import net from 'node:net'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const COMMAND_TIMEOUT_MS = 20000
const DRIVER_READY_TIMEOUT_MS = 15000
const SESSION_TIMEOUT_MS = 60000

async function freePort() {
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

async function request(url, options = {}, timeout = COMMAND_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }
    if (!response.ok) {
      throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${text.slice(0, 400)}`)
    }
    return body
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`WebDriver timeout after ${timeout}ms: ${options.method || 'GET'} ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function waitForDriver(url, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {
      // driver not listening yet
    }
    await sleep(150)
  }
  throw new Error(`timeout waiting for geckodriver at ${url}`)
}

/**
 * Start geckodriver, open a Firefox session and return the command helpers.
 * Call `browser.close()` in a finally block.
 */
export async function startBrowser({
  base = process.env.NODERED_URL || 'http://localhost:1880/',
  gecko = process.env.GECKODRIVER || 'geckodriver',
  port,
  headless = true,
} = {}) {
  const driverPort = port ?? await freePort()
  const webdriver = `http://127.0.0.1:${driverPort}`
  const driverLog = []
  let driver
  let sessionId = null

  const close = async () => {
    if (sessionId) {
      await request(`${webdriver}/session/${sessionId}`, { method: 'DELETE' }, 5000).catch(() => {})
      sessionId = null
    }
    if (driver && driver.exitCode === null) {
      driver.kill('SIGTERM')
      const exited = await Promise.race([
        new Promise((resolve) => driver.once('exit', () => resolve(true))),
        sleep(2000).then(() => false),
      ])
      if (!exited) driver.kill('SIGKILL')
    }
  }

  try {
    driver = spawn(gecko, ['--port', String(driverPort)], { stdio: ['ignore', 'ignore', 'pipe'] })
    driver.on('error', (err) => driverLog.push(`cannot start ${gecko}: ${err.message}`))
    driver.stderr?.on('data', (chunk) => {
      driverLog.push(String(chunk))
      if (driverLog.length > 200) driverLog.shift()
    })
    await waitForDriver(`${webdriver}/status`, DRIVER_READY_TIMEOUT_MS)

    const session = await request(`${webdriver}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: 'firefox',
            pageLoadStrategy: 'eager',
            unhandledPromptBehavior: 'accept',
            'moz:firefoxOptions': {
              args: headless ? ['-headless', '--width=1600', '--height=1000'] : ['--width=1600', '--height=1000'],
              // Node-RED marks the editor dirty during these tests; never let a
              // beforeunload prompt wedge the next WebDriver command.
              prefs: { 'dom.disable_beforeunload': true },
            },
          },
        },
      }),
    }, SESSION_TIMEOUT_MS)
    sessionId = session.value.sessionId
  } catch (err) {
    await close()
    const tail = driverLog.join('').trim().split('\n').slice(-12).join('\n')
    throw new Error(`${err.message}${tail ? `\ngeckodriver output:\n${tail}` : ''}`)
  }

  const call = (method, path, body, timeout = COMMAND_TIMEOUT_MS) => {
    if (!sessionId) throw new Error('browser session is closed')
    return request(`${webdriver}/session/${sessionId}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, timeout)
  }

  const exec = async (script, args = [], timeout = COMMAND_TIMEOUT_MS) => {
    const result = await call('POST', '/execute/sync', { script, args }, timeout)
    return result.value
  }

  const navigate = async (url) => {
    await call('POST', '/url', { url }, 60000)
    await waitFor('return document.readyState !== "loading"', `document ready at ${url}`, 20000)
  }

  const waitFor = async (script, label, timeout = 15000, args = []) => {
    const deadline = Date.now() + timeout
    let lastError
    while (Date.now() < deadline) {
      try {
        const value = await exec(script, args, Math.min(COMMAND_TIMEOUT_MS, Math.max(1000, deadline - Date.now())))
        if (value) return value
      } catch (err) {
        lastError = err
      }
      await sleep(150)
    }
    throw new Error(`timeout waiting for ${label}${lastError ? ` (last error: ${lastError.message})` : ''}`)
  }

  const waitForSelector = (selector, timeout = 15000) =>
    waitFor('return !!document.querySelector(arguments[0])', selector, timeout, [selector])

  const setEditorLanguage = async (lang = 'zh-CN') => {
    await navigate(base)
    await waitFor('return !!(window.RED && RED.nodes)', 'Node-RED editor')
    await exec(`localStorage.setItem('editor-language', arguments[0]); return true`, [lang])
    await navigate(base)
    await waitFor(`return document.documentElement.lang === arguments[0] || (window.RED && RED.i18n && RED.i18n.lang() === arguments[0])`, `editor language ${lang}`, 20000, [lang])
  }

  const openConfig = async (machineId) => {
    const workspace = await waitFor(
      'const node = RED.nodes.node(arguments[0]); return node ? node.z : null',
      `machine ${machineId}`,
      15000,
      [machineId],
    )
    let lastError
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Fire-and-forget: returning these promises to WebDriver makes the
        // command depend on workspace/editor internals finishing.
        await exec('RED.workspaces.show(arguments[0]); return true', [workspace])
        await sleep(350)
        await exec('RED.editor.editConfig("", "statechart-machine", arguments[0]); return true', [machineId], 15000)
        await waitForSelector('#node-config-input-name', 12000)
        return workspace
      } catch (err) {
        lastError = err
        await sleep(500)
      }
    }
    throw new Error(`cannot open config dialog for ${machineId}: ${lastError?.message ?? 'unknown error'}`)
  }

  const handles = async () => (await call('GET', '/window/handles')).value
  const switchWindow = (handle) => call('POST', '/window', { handle })

  return {
    base,
    call,
    exec,
    navigate,
    waitFor,
    waitForSelector,
    setEditorLanguage,
    openConfig,
    handles,
    switchWindow,
    close,
    driverLog,
  }
}
