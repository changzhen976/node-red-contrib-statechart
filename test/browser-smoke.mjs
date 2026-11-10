/**
 * Node-RED editor browser smoke test.
 *
 * Requires Firefox + geckodriver. This is intentionally separate from
 * `npm test`: the unit/runtime suite runs anywhere, this one needs a live
 * Node-RED instance and a browser.
 *
 *   GECKODRIVER=/path/to/geckodriver \
 *   NODERED_URL=http://localhost:1880/ \
 *   npm run test:browser
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const BASE = (process.env.NODERED_URL || 'http://localhost:1880/').replace(/\/?$/, '/')
const MACHINE_ID = process.env.STATECHART_MACHINE_ID || 'scxml-conf-traffic'
const GECKO = process.env.GECKODRIVER || 'geckodriver'
const PORT = Number(process.env.GECKODRIVER_PORT || 4445)
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
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`timeout waiting for ${url}`)
}

async function main() {
  let driver
  let sessionId = null
  try {
    driver = spawn(GECKO, ['--port', String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] })
    driver.on('error', (err) => { console.error(`cannot start ${GECKO}:`, err.message) })
    await waitForHttp(`${WD}/status`)

    const session = await http('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          'moz:firefoxOptions': { args: ['-headless', '--width=1600', '--height=1000'] },
        },
      },
    })
    sessionId = session.value.sessionId
    const call = (method, path, body) => http(method, `/session/${sessionId}${path}`, body)
    const execute = async (script, args = []) => (await call('POST', '/execute/sync', { script, args })).value
    const navigate = async (url) => { await call('POST', '/url', { url }) }
    const waitForSelector = async (selector, timeout = 10000) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        if (await execute(`return !!document.querySelector(arguments[0]);`, [selector])) return
        await sleep(200)
      }
      throw new Error(`timeout waiting for ${selector}`)
    }

    await navigate(BASE)
    await sleep(4000)
    await execute(`localStorage.setItem('editor-language', 'zh-CN'); location.reload(); return true`)
    await sleep(4000)

    const z = await execute(`const n = RED.nodes.node(arguments[0]); return n ? n.z : null;`, [MACHINE_ID])
    assert.ok(z, `machine ${MACHINE_ID} not found in editor`)
    await execute(`RED.workspaces.show(arguments[0]); RED.editor.editConfig("", "statechart-machine", arguments[1]); return true`, [z, MACHINE_ID])
    await waitForSelector('#scxml-states-body tr')

    const ui = await execute(`return {
      lang: RED.i18n.lang(),
      nameLabel: document.querySelector('#node-config-input-name').closest('.form-row').querySelector('label').innerText,
      buttons: Array.from(document.querySelectorAll('.scxml-editor-toolbar button')).map((b) => b.innerText),
      states: document.querySelectorAll('#scxml-states-body tr').length,
      transitions: document.querySelectorAll('#scxml-transitions-body tr').length,
      vars: document.querySelectorAll('#scxml-vars-body tr').length,
      errorVisible: !!document.querySelector('#scxml-editor-errors') && document.querySelector('#scxml-editor-errors').offsetParent !== null,
    }`)
    assert.equal(ui.lang, 'zh-CN')
    assert.match(ui.nameLabel, /名称/)
    assert.equal(await execute(`return RED.nodes.node(arguments[0])._('status.notStarted')`, [MACHINE_ID]), '未启动')
    assert.ok(ui.buttons.some((text) => text.includes('状态')))
    assert.ok(ui.states >= 1, 'expected at least one state')
    assert.ok(ui.transitions >= 1, 'expected at least one transition')
    assert.ok(ui.vars >= 1, 'expected at least one variable')
    assert.equal(ui.errorVisible, false, 'valid traffic machine should have no errors')

    await execute(`RED.sidebar.show('context'); return true`)
    await sleep(400)
    await execute(`RED.sidebar.show('scxml-monitor'); return true`)
    await sleep(400)
    const sidebarUi = await execute(`return {
      banner: Array.from(document.querySelectorAll('.red-ui-sidebar-banner-label')).filter((e) => e.offsetParent !== null).map((e) => e.innerText),
      icon: (document.querySelector('button[data-tab-id="scxml-monitor"] i') || {}).className || '',
    }`)
    assert.ok(sidebarUi.banner.includes('状态机监控'), 'sidebar banner should switch to 状态机监控')
    assert.match(sidebarUi.icon, /fa-sitemap/)

    await execute(`document.querySelector('#node-config-input-open-sidebar').click(); return true`)
    await sleep(1200)
    const monitorSrc = await execute(`return Array.from(document.querySelectorAll('iframe')).map((f) => f.src).find((src) => src.includes('/statechart/monitor')) || ''`)
    assert.match(monitorSrc, /[?&]token=/, 'sidebar monitor iframe must carry a capability token')

    await execute(`document.querySelector('#scxml-states-body .scxml-edit-actions[data-field=entry]').click(); return true`)
    await sleep(300)
    const dialog = await execute(`const d = document.querySelector('#scxml-action-dialog'); return {
      open: !!d && d.open,
      rows: document.querySelectorAll('#scxml-action-rows .scxml-action-row').length,
    }`)
    assert.equal(dialog.open, true, 'actions dialog should open')
    assert.ok(dialog.rows >= 1, 'entry action should be parsed into a row')
    await execute(`document.querySelector('#scxml-action-cancel').click(); return true`)
    await sleep(200)

    const duplicate = await execute(`const inputs = Array.from(document.querySelectorAll('#scxml-states-body [data-field=id]')); if (inputs.length < 2) return 'SKIP'; inputs[1].value = inputs[0].value; $(inputs[1]).trigger('change'); return 'DONE';`)
    if (duplicate === 'DONE') {
      await sleep(300)
      const issue = await execute(`const box = document.querySelector('#scxml-editor-errors'); return { visible: !!box && box.offsetParent !== null, text: box ? box.innerText : '' };`)
      assert.equal(issue.visible, true, 'duplicate id should display the error box')
      assert.match(issue.text, /重复/)
    }

    // Discard the unsaved editor mutation; never clicks Update/Deploy.
    await navigate(BASE)
    console.log(JSON.stringify({
      ok: true,
      lang: ui.lang,
      states: ui.states,
      transitions: ui.transitions,
      vars: ui.vars,
      actionsRows: dialog.rows,
      duplicateCheck: duplicate,
    }, null, 2))
  } finally {
    if (sessionId) await http('DELETE', `/session/${sessionId}`).catch(() => {})
    if (driver) driver.kill()
  }
}

main().catch((err) => {
  console.error('BROWSER_SMOKE_FAILED', err)
  process.exitCode = 1
})
