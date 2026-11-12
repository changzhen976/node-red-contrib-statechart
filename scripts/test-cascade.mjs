#!/usr/bin/env node
/**
 * End-to-end check for examples/cascade-test.json.
 *
 * Requires a running Node-RED with the cascade tab deployed:
 *   CASCADE_BASE=http://homeassistant:1880 npm run test:cascade
 *
 * The check drives the inject nodes over the admin API and reads the
 * state that the flow records in global context.
 */
import assert from 'node:assert/strict'

const BASE = (process.env.CASCADE_BASE || 'http://localhost:1880').replace(/\/$/, '')
const PREFIX = 'cascade-inj-'

const results = []

async function inject(name) {
  const res = await fetch(`${BASE}/inject/${PREFIX}${name}`, { method: 'POST' })
  assert.equal(res.status, 200, `inject ${name}: HTTP ${res.status}`)
}

async function readContext(key) {
  const res = await fetch(`${BASE}/context/global/${key}`)
  assert.equal(res.status, 200, `context ${key}: HTTP ${res.status}`)
  const body = await res.json()
  if (body.format === 'undefined') return null
  if (typeof body.msg === 'string') {
    try { return JSON.parse(body.msg) } catch { return body.msg }
  }
  return body.msg
}

const states = async (key) => (await readContext(key))?.states ?? []
const events = async () => (await readContext('scxml_events')) ?? []

async function waitFor(fn, description, timeout = 8000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch (err) {
      last = err
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  throw new Error(`timeout waiting for ${description}; last=${JSON.stringify(last)}`)
}

async function waitStates(key, expected, timeout = 8000) {
  return waitFor(async () => {
    const current = await states(key)
    return expected.every((s) => current.includes(s)) ? current : null
  }, `${key} ⊇ ${expected.join('+')}`, timeout)
}

async function markEvents() {
  // The flow keeps the last 300 events; use a timestamp, not the array length,
  // so the mark stays valid after the ring buffer is full.
  return Date.now()
}

async function waitEvent(name, mark, timeout = 8000) {
  return waitFor(async () => {
    const list = (await events()).filter((e) => Number(e.ts) >= mark)
    return list.some((e) => e.event === name) ? list : null
  }, `event ${name}`, timeout)
}

async function run(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (err) {
    results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) })
    console.log(`FAIL  ${name}: ${err instanceof Error ? err.message : err}`)
  }
}

async function doInject(names, pause = 350) {
  for (const name of names) {
    await inject(name)
    await new Promise((r) => setTimeout(r, pause))
  }
}

async function resetAll() {
  await doInject(['sup-reset', 'cell-reset', 'job-reset-cmd'], 250)
  await waitStates('scxml_Cell', ['offline'])
  await waitStates('scxml_Supervisor', ['booting'])
  await waitStates('scxml_Job', ['empty'])
}

async function startAll() {
  await resetAll()
  await doInject(['sys-ready'], 250)
  await waitStates('scxml_Supervisor', ['idle'])
  const mark = await markEvents()
  await doInject(['cmd-start'], 700)
  await waitStates('scxml_Cell', ['running', 'power', 'off', 'conveyor', 'idle', 'safety', 'clear'])
  await waitStates('scxml_Supervisor', ['running', 'normal'])
  await waitStates('scxml_Job', ['active', 'processing', 'p', 'work', 'step1', 'quality', 'checking'])
  return mark
}

await run('reset states', async () => {
  await resetAll()
})

await run('happy path cascade', async () => {
  const mark = await startAll()
  await doInject(['job-step', 'job-step', 'quality-ok'], 450)
  await waitStates('scxml_Job', ['empty'])
  await waitStates('scxml_Supervisor', ['idle'])
  await waitStates('scxml_Cell', ['offline'])
  await waitEvent('job.finished', mark)
  await waitEvent('cell.stopped', mark)
})

await run('stop cleans active job', async () => {
  const mark = await startAll()
  await doInject(['cmd-stop'], 700)
  await waitStates('scxml_Cell', ['offline'])
  await waitStates('scxml_Supervisor', ['idle'])
  await waitStates('scxml_Job', ['empty'])
  await waitEvent('job.aborted', mark)
})

await run('shallow history', async () => {
  await startAll()
  await doInject(['power-on', 'conveyor-start'], 300)
  await waitStates('scxml_Cell', ['running', 'power', 'on', 'conveyor', 'moving'])
  await doInject(['cell-pause'])
  await waitStates('scxml_Cell', ['paused'])
  await doInject(['cell-resume-shallow'])
  await waitStates('scxml_Cell', ['running', 'power', 'off', 'conveyor', 'idle', 'safety', 'clear'])
})

await run('deep history', async () => {
  await startAll()
  await doInject(['power-on', 'conveyor-start'], 300)
  await doInject(['cell-pause'])
  await waitStates('scxml_Cell', ['paused'])
  await doInject(['cell-resume-deep'])
  await waitStates('scxml_Cell', ['running', 'power', 'on', 'conveyor', 'moving', 'safety', 'clear'])
})

await run('parallel region fault', async () => {
  await startAll()
  await doInject(['power-on', 'conveyor-start'])
  await doInject(['conveyor-fault'])
  await waitStates('scxml_Cell', ['running', 'power', 'on', 'conveyor', 'fault', 'safety', 'clear'])
  await doInject(['conveyor-reset'])
  await waitStates('scxml_Cell', ['running', 'power', 'on', 'conveyor', 'idle'])
})

await run('overheat guard + deep resume', async () => {
  await startAll()
  await doInject(['power-on', 'conveyor-start'])
  const mark = await markEvents()
  await doInject(['temp-85'], 600)
  await waitStates('scxml_Cell', ['overheat'])
  await waitStates('scxml_Supervisor', ['running', 'degraded'])
  await waitEvent('cell.overheat', mark)
  await doInject(['temp-55'], 600)
  await waitStates('scxml_Cell', ['running', 'power', 'on', 'conveyor', 'moving', 'safety', 'clear'])
  await waitStates('scxml_Supervisor', ['running', 'normal'])
})

await run('estop cascade', async () => {
  await startAll()
  const mark = await markEvents()
  await doInject(['safety-estop'], 700)
  await waitStates('scxml_Cell', ['offline'])
  await waitStates('scxml_Supervisor', ['fault'])
  await waitEvent('cell.estop', mark)
})

await run('restart while Cell running', async () => {
  await startAll()
  await doInject(['sup-reset'])
  await waitStates('scxml_Supervisor', ['booting'])
  await doInject(['sys-ready'])
  await waitStates('scxml_Supervisor', ['idle'])
  await doInject(['cmd-start'], 700)
  await waitStates('scxml_Supervisor', ['running', 'normal'])
  await waitStates('scxml_Cell', ['running', 'power', 'off', 'conveyor', 'idle'])
  await waitStates('scxml_Job', ['active', 'processing', 'p'])
})

await run('start timeout', async () => {
  await startAll()
  // Keep the Cell from re-announcing ready so the Supervisor times out.
  await doInject(['cell-pause'])
  await waitStates('scxml_Cell', ['paused'])
  await doInject(['sup-reset'])
  await waitStates('scxml_Supervisor', ['booting'])
  await doInject(['sys-ready'])
  await waitStates('scxml_Supervisor', ['idle'])
  const mark = await markEvents()
  await doInject(['cmd-start'], 500)
  await waitStates('scxml_Supervisor', ['starting'])
  await waitStates('scxml_Supervisor', ['fault'], 7500)
  await waitEvent('timeout.start', mark)
  await waitStates('scxml_Cell', ['offline'])
})

await run('invalid job guard', async () => {
  await resetAll()
  const mark = await markEvents()
  await doInject(['job-create-invalid'], 400)
  await waitStates('scxml_Job', ['rejected'])
  await waitEvent('job.rejected', mark)
  await doInject(['job-reset'])
  await waitStates('scxml_Job', ['empty'])
})

await run('start guard', async () => {
  await resetAll()
  await doInject(['sys-ready'])
  await doInject(['sup-set-celltemp'], 300)
  await doInject(['cmd-start'], 500)
  await waitStates('scxml_Supervisor', ['idle'])
  await waitStates('scxml_Cell', ['offline'])
})

await run('job deep history', async () => {
  await startAll()
  await doInject(['job-step'], 400)
  await waitStates('scxml_Job', ['active', 'processing', 'p', 'work', 'step2'])
  await doInject(['job-pause'], 400)
  await waitStates('scxml_Job', ['active', 'paused'])
  await doInject(['job-resume'], 400)
  await waitStates('scxml_Job', ['active', 'processing', 'p', 'work', 'step2', 'quality', 'checking'])
})

await run('final state events', async () => {
  await resetAll()
  await doInject(['sys-ready'])
  let mark = await markEvents()
  await doInject(['cmd-shutdown'], 500)
  await waitEvent('sys.supervisor.shutdown', mark)
  await waitStates('scxml_Supervisor', ['shutdown', 'shutdown.done'])
  await resetAll()
  mark = await markEvents()
  await doInject(['cell-decommission'], 500)
  await waitEvent('sys.cell.decommissioned', mark)
  await waitStates('scxml_Cell', ['decommissioned', 'decommissioned.done'])
})

await resetAll()
await doInject(['sys-ready'], 250)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exitCode = 1
