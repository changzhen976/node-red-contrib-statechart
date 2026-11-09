/**
 * P4 standalone-editor smoke test.
 * Requires Firefox + geckodriver and a live Node-RED (same env as test:browser).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const BASE = (process.env.NODERED_URL || 'http://localhost:1880/').replace(/\/?$/, '/')
const MACHINE_ID = process.env.SCXML_MACHINE_ID || 'scxml-conf-traffic'
const GECKO = process.env.GECKODRIVER || 'geckodriver'
const PORT = Number(process.env.GECKODRIVER_PORT || 4446)
const WD = `http://127.0.0.1:${PORT}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function http(method, path, body) {
  const res = await fetch(WD + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`)
  return json
}
async function waitForHttp(url, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { const r = await fetch(url); if (r.ok) return } catch {}
    await sleep(200)
  }
  throw new Error(`timeout waiting for ${url}`)
}

async function main() {
  let driver
  let sessionId = null
  try {
    driver = spawn(GECKO, ['--port', String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] })
    driver.on('error', (err) => console.error(`cannot start ${GECKO}:`, err.message))
    await waitForHttp(`${WD}/status`)
    const session = await http('POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless', '--width=1600', '--height=1000'] } } },
    })
    sessionId = session.value.sessionId
    const call = (method, path, body) => http(method, `/session/${sessionId}${path}`, body)
    const execute = async (script, args = []) => (await call('POST', '/execute/sync', { script, args })).value
    const waitFor = async (fn, label, timeout = 12000) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        if (await execute(fn)) return
        await sleep(200)
      }
      throw new Error(`timeout waiting for ${label}`)
    }

    await call('POST', '/url', { url: BASE })
    await sleep(5000)
    await execute(`localStorage.setItem('editor-language', 'zh-CN'); location.reload(); return true`)
    await sleep(5000)
    const z = await execute(`const n = RED.nodes.node(arguments[0]); return n ? n.z : null;`, [MACHINE_ID])
    assert.ok(z, `machine ${MACHINE_ID} not found`)
    await execute(`RED.workspaces.show(arguments[0]); RED.editor.editConfig("", "scxml-machine", arguments[1]); return true`, [z, MACHINE_ID])
    await waitFor(`return !!document.querySelector('#node-config-input-open-full-editor');`, 'full editor button')

    const parentHandle = (await call('GET', '/window')).value
    await execute(`document.querySelector('#node-config-input-open-full-editor').click(); return true`)
    await sleep(5000)
    const handles = (await call('GET', '/window/handles')).value
    assert.ok(handles.length >= 2, 'standalone editor window did not open')
    const childHandle = handles.find((h) => h !== parentHandle)
    await call('POST', '/window', { handle: childHandle, name: 'p4' })
    await sleep(2500)

    const child = await execute(`return {
      bar: !!document.querySelector('#scxml-nodered-bar'),
      hash: location.hash,
      text: (document.body.innerText || '').slice(0, 500),
      title: document.title,
      machineSelect: (() => {
        const select = document.querySelector('#scxml-nodered-machine');
        return select ? { visible: select.offsetParent !== null, options: Array.from(select.options).map((o) => o.textContent) } : null;
      })(),
    }`)
    assert.equal(child.bar, true, 'Node-RED bridge bar missing')
    assert.equal(child.hash, '#/editor')
    assert.match(child.text, /red/)
    assert.match(child.text, /green/)
    assert.ok(child.machineSelect && child.machineSelect.options.length >= 2, 'expected the multi-machine selector')
    await execute(`location.hash = '#/gallery'; return true`)
    await sleep(500)
    const locked = await execute(`return location.hash`)
    assert.equal(locked, '#/editor', 'standalone page should stay on the editor view')

    const save = await execute(`const bar = document.querySelector('#scxml-nodered-bar'); const btn = bar && bar.querySelectorAll('button')[0]; if (!btn) return 'NO_BUTTON'; btn.click(); return 'CLICKED';`)
    assert.equal(save, 'CLICKED')
    await sleep(1000)

    await call('POST', '/window', { handle: parentHandle, name: 'nodered' })
    await sleep(500)
    const parent = await execute(`const n = RED.nodes.node(arguments[0]); let doc = null; try { doc = JSON.parse(n.doc) } catch {}; return { docLen: n.doc ? n.doc.length : 0, states: doc && doc.states ? doc.states.length : 0 };`, [MACHINE_ID])
    assert.ok(parent.docLen > 0, 'parent node.doc was not updated by P4 save')
    assert.ok(parent.states >= 3, 'parent node.doc does not contain the loaded states')

    console.log(JSON.stringify({ ok: true, childHash: child.hash, machineOptions: child.machineSelect.options, parentDocLen: parent.docLen, parentStates: parent.states }, null, 2))
    await call('DELETE', `/session/${sessionId}`).catch(() => {})
    sessionId = null
  } finally {
    if (sessionId) await http('DELETE', `/session/${sessionId}`).catch(() => {})
    if (driver) driver.kill()
  }
}

main().catch((err) => {
  console.error('BROWSER_P4_FAILED', err)
  process.exitCode = 1
})
