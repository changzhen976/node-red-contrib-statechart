/**
 * End-to-end check against a live Node-RED.
 *
 * Deploys a temporary Hub flow over the Admin API, drives it through HTTP,
 * asserts state/read/done behaviour and removes the flow again. It needs no
 * browser and never touches existing flows.
 *
 *   NODERED_URL=http://localhost:1880/ npm run test:e2e
 *
 * If the admin API is protected, pass ADMIN_TOKEN (Bearer token).
 */
import assert from 'node:assert/strict'

const BASE = (process.env.NODERED_URL || 'http://localhost:1880/').replace(/\/?$/, '/')
const TOKEN = process.env.ADMIN_TOKEN || ''
const PREFIX = 'e2e-sc'
const LABEL = 'E2E statechart'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function headers(extra = {}) {
  return TOKEN ? { ...extra, Authorization: `Bearer ${TOKEN}` } : extra
}

async function request(method, path, body, timeout = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${BASE}${path.replace(/^\//, '')}`, {
      method,
      headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let parsed = text
    try { parsed = JSON.parse(text) } catch {}
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 400)}`)
    return { status: response.status, body: parsed }
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`${method} ${path} timed out after ${timeout}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function waitFor(fn, label, timeout = 6000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch (err) {
      last = err
    }
    await sleep(150)
  }
  throw new Error(`timeout waiting for ${label}${last instanceof Error ? `: ${last.message}` : ''}`)
}

const readState = async () => (await request('GET', '/statechart-e2e/read')).body
const waitState = (state, cycles) => waitFor(async () => {
  const snapshot = await readState()
  if (!Array.isArray(snapshot?.states) || !snapshot.states.includes(state)) return null
  if (cycles !== undefined && snapshot.vars?.cycles !== cycles) return null
  return snapshot
}, `${state}${cycles === undefined ? '' : ` (cycles=${cycles})`}`)

const trafficSource = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="red">
  <datamodel><data id="cycles" expr="0"/></datamodel>
  <state id="red">
    <onentry><assign location="cycles" expr="cycles + 1"/></onentry>
    <transition event="next" target="green"/>
  </state>
  <state id="green"><transition event="next" target="yellow"/></state>
  <state id="yellow"><transition event="next" target="red"/></state>
</scxml>`

const finalSource = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a"><transition event="go" target="done"/></state>
  <final id="done"/>
</scxml>`

function flowNodes() {
  return [
    { id: `${PREFIX}-conf`, type: 'statechart-machine', name: 'E2E traffic', source: trafficSource, engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000 },
    { id: `${PREFIX}-hub`, type: 'statechart-hub', machine: `${PREFIX}-conf`, includeVars: true, emitInitial: true, includeInternalSends: false, stateTopic: '', eventTopic: 'statechart/{machine}/evt/{event}', wires: [[], [], []] },

    { id: `${PREFIX}-in-reset`, type: 'http in', url: '/statechart-e2e/reset', method: 'get', upload: false, wires: [[`${PREFIX}-reset`, `${PREFIX}-resp-reset`]] },
    { id: `${PREFIX}-reset`, type: 'statechart-reset', wires: [[`${PREFIX}-hub`]] },
    { id: `${PREFIX}-resp-reset`, type: 'http response', statusCode: '', headers: {}, wires: [] },

    { id: `${PREFIX}-in-next`, type: 'http in', url: '/statechart-e2e/next', method: 'get', upload: false, wires: [[`${PREFIX}-next`, `${PREFIX}-resp-next`]] },
    { id: `${PREFIX}-next`, type: 'statechart-event', event: 'next', eventSource: 'fixed', dataMode: 'none', data: '', dataKey: '', wires: [[`${PREFIX}-hub`]] },
    { id: `${PREFIX}-resp-next`, type: 'http response', statusCode: '', headers: {}, wires: [] },

    { id: `${PREFIX}-in-read`, type: 'http in', url: '/statechart-e2e/read', method: 'get', upload: false, wires: [[`${PREFIX}-read`]] },
    { id: `${PREFIX}-read`, type: 'statechart-read', machine: `${PREFIX}-conf`, mode: 'snapshot', variable: '', scope: 'none', key: '', wires: [[`${PREFIX}-resp-read`]] },
    { id: `${PREFIX}-resp-read`, type: 'http response', statusCode: '', headers: {}, wires: [] },

    { id: `${PREFIX}-final-conf`, type: 'statechart-machine', name: 'E2E final', source: finalSource, engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000 },
    { id: `${PREFIX}-final-hub`, type: 'statechart-hub', machine: `${PREFIX}-final-conf`, includeVars: true, emitInitial: true, includeInternalSends: false, stateTopic: '', eventTopic: 'statechart/{machine}/evt/{event}', wires: [[], [], [`${PREFIX}-done-store`]] },
    { id: `${PREFIX}-in-done`, type: 'http in', url: '/statechart-e2e/done', method: 'get', upload: false, wires: [[`${PREFIX}-final-go`, `${PREFIX}-resp-done`]] },
    { id: `${PREFIX}-final-go`, type: 'statechart-event', event: 'go', eventSource: 'fixed', dataMode: 'none', data: '', dataKey: '', wires: [[`${PREFIX}-final-hub`]] },
    { id: `${PREFIX}-resp-done`, type: 'http response', statusCode: '', headers: {}, wires: [] },
    { id: `${PREFIX}-done-store`, type: 'function', func: "global.set('e2eScDone', { payload: msg.payload, done: msg.done === true, states: msg.states || [], ts: Date.now() }); return null;", outputs: 0, noerr: 0, wires: [] },

    // Deliberately unconfigured hub: its startup error must reach output 3 and
    // be localized by the runtime (not the raw errors.* key).
    { id: `${PREFIX}-no-machine`, type: 'statechart-hub', machine: `${PREFIX}-missing`, includeVars: true, emitInitial: true, includeInternalSends: false, stateTopic: '', eventTopic: 'statechart/{machine}/evt/{event}', wires: [[], [], [`${PREFIX}-error-store`]] },
    { id: `${PREFIX}-error-store`, type: 'function', func: "global.set('e2eScError', { payload: msg.payload, topic: msg.topic, machine: msg.machine, ts: Date.now() }); return null;", outputs: 0, noerr: 0, wires: [] },
  ]
}

async function removeStaleFlows() {
  const { body: flows } = await request('GET', '/flows')
  for (const node of flows) {
    if (node.type === 'tab' && node.label === LABEL) {
      await request('DELETE', `/flow/${node.id}`).catch(() => {})
    }
  }
}

let flowId = null
try {
  const { body: nodeList } = await request('GET', '/nodes')
  const nodeSets = typeof nodeList === 'string' ? nodeList : JSON.stringify(nodeList)
  assert.match(nodeSets, /@changzhen976\/node-red-contrib-statechart/, 'the statechart node set must be loaded')

  await removeStaleFlows()
  const errorMark = Date.now()
  const created = await request('POST', '/flow', { label: LABEL, nodes: flowNodes() })
  flowId = created.body?.id
  assert.ok(flowId, 'POST /flow must return the new tab id')
  await sleep(400)

  const hubError = await waitFor(async () => {
    const { body } = await request('GET', '/context/global/e2eScError')
    const value = typeof body?.msg === 'string' ? JSON.parse(body.msg) : body?.msg
    return value && value.ts >= errorMark ? value : null
  }, 'hub configuration error on output 3', 8000)
  assert.equal(hubError.topic, 'statechart/error')
  assert.equal(hubError.machine, `${PREFIX}-missing`)
  assert.ok(
    typeof hubError.payload === 'string' && hubError.payload.length > 0 && !hubError.payload.startsWith('errors.'),
    `hub error must be localized, got ${JSON.stringify(hubError.payload)}`,
  )
  console.log('PASS  unconfigured hub reports a localized error on output 3')

  await waitState('red', 1)
  console.log('PASS  deployed hub starts in red (cycles=1)')

  await request('GET', '/statechart-e2e/next')
  await waitState('green')
  console.log('PASS  next -> green')

  await request('GET', '/statechart-e2e/next')
  await waitState('yellow')
  console.log('PASS  next -> yellow')

  await request('GET', '/statechart-e2e/next')
  await waitState('red', 2)
  console.log('PASS  next -> red (cycles=2)')

  await request('GET', '/statechart-e2e/reset')
  await waitState('red', 1)
  console.log('PASS  reset restarts at red (cycles=1)')

  // Clear the previous value, then wait for the fresh done event. Do not
  // compare the server timestamp with the test runner clock: the container and
  // the host can be a few hundred milliseconds apart.
  await request('DELETE', '/context/global/e2eScDone').catch(() => {})
  await request('GET', '/statechart-e2e/done')
  const done = await waitFor(async () => {
    const { body } = await request('GET', '/context/global/e2eScDone')
    const value = typeof body?.msg === 'string' ? JSON.parse(body.msg) : body?.msg
    return value && value.done === true ? value : null
  }, 'done output on hub output 3', 8000)
  assert.equal(done.payload, 'done')
  assert.deepEqual(done.states, ['done'])
  console.log('PASS  terminal state is delivered on hub output 3')

  console.log(JSON.stringify({ ok: true, flows: 2, nodes: flowNodes().length }, null, 2))
} finally {
  if (flowId) await request('DELETE', `/flow/${flowId}`).catch((err) => console.error('cleanup failed:', err.message))
  await request('DELETE', '/context/global/e2eScDone').catch(() => {})
  await request('DELETE', '/context/global/e2eScError').catch(() => {})
}
