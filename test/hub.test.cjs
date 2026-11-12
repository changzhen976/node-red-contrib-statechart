const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const helper = require('node-red-node-test-helper')
const scxmlModule = require('../dist/statechart.js')

helper.init(require.resolve('node-red'))

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="idle">
  <datamodel>
    <data id="label" expr="'idle'"/>
    <data id="count" expr="0"/>
  </datamodel>
  <state id="idle"><transition event="start" target="running"><assign location="label" expr="'running'"/></transition></state>
  <state id="running">
    <transition event="stop" target="idle"/>
    <transition event="bump">
      <assign location="count" expr="count + 1"/>
      <send event="bumped"><content expr="{count: count}"/></send>
    </transition>
    <transition event="setpoint">
      <assign location="label" expr="_event.data.value"/>
    </transition>
  </state>
</scxml>`

function testModule(RED) {
  scxmlModule(RED)
  RED.nodes.registerType('hub-sink', function (config) {
    RED.nodes.createNode(this, config)
    globalThis.__hubSinks ||= {}
    globalThis.__hubSinks[this.id] = []
    this.on('input', (msg) => { globalThis.__hubSinks[this.id].push(msg) })
  })
}

function flow() {
  return [
    { id: 'conf', type: 'statechart-machine', name: 'Hub Demo', source: SOURCE, engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000 },
    {
      id: 'hub', type: 'statechart-hub', machine: 'conf', includeVars: true, emitInitial: true,
      includeInternalSends: false, wires: [['s-state'], ['s-event'], ['s-error']],
    },
    {
      id: 'hub2', type: 'statechart-hub', machine: 'conf', includeVars: true, emitInitial: true,
      includeInternalSends: false, wires: [['s2-state'], ['s2-event'], ['s2-error']],
    },
    { id: 'ev-start', type: 'statechart-event', event: 'start', dataMode: 'none', wires: [['hub']] },
    { id: 'ev-bump', type: 'statechart-event', event: 'bump', dataMode: 'none', wires: [['hub']] },
    { id: 'set-label', type: 'statechart-set', mode: 'single', variable: 'label', valueType: 'json', value: '"hello"', wires: [['hub']] },
    { id: 'reset', type: 'statechart-reset', wires: [['hub']] },
    { id: 'ev-data', type: 'statechart-event', event: 'setpoint', eventSource: 'fixed', dataMode: 'json', data: '{"value":"from-json"}', wires: [['hub']] },
    { id: 'set-object', type: 'statechart-set', mode: 'object', wires: [['hub']] },
    { id: 'read', z: 'tab1', type: 'statechart-read', machine: 'conf', mode: 'snapshot', scope: 'flow', key: 'readSnapshot', wires: [['s-read']] },
    { id: 's-state', type: 'hub-sink' },
    { id: 's-event', type: 'hub-sink' },
    { id: 's-error', type: 'hub-sink' },
    { id: 's2-state', type: 'hub-sink' },
    { id: 's2-event', type: 'hub-sink' },
    { id: 's2-error', type: 'hub-sink' },
    { id: 's-read', type: 'hub-sink' },
  ]
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, label, timeout = 4000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = fn()
    if (value) return value
    await sleep(20)
  }
  throw new Error(`timeout waiting for ${label}`)
}
const sink = (id) => globalThis.__hubSinks?.[id] ?? []

async function load() {
  await new Promise((resolve, reject) => helper.load(testModule, flow(), (err) => (err ? reject(err) : resolve())))
  await waitFor(() => sink('s-state').length > 0, 'initial hub state')
}

afterEach(async () => {
  await helper.unload()
  delete globalThis.__hubSinks
})

test('hub emits initial state and only one hub may claim a machine', async () => {
  await load()
  assert.equal(sink('s-state').at(-1).payload, 'idle')
  assert.equal(sink('s2-state').length, 0, 'second hub must not emit')
  await sleep(80)
  assert.equal(sink('s2-state').length, 0, 'second hub must stay silent')
  assert.equal(helper.getNode('conf').hubOwner.id, 'hub')

  helper.getNode('conf').releaseHub(helper.getNode('hub'))
  assert.equal(helper.getNode('conf').claimHub(helper.getNode('hub2')).ok, true)
})

test('event, set and reset modules drive the hub', async () => {
  await load()
  helper.getNode('ev-start').receive({ payload: 'ignored' })
  await waitFor(() => sink('s-state').some((m) => m.payload === 'running'), 'running')

  helper.getNode('ev-bump').receive({ payload: { ignored: true } })
  await waitFor(() => sink('s-event').some((m) => m.event === 'bumped' && m.payload.count === 1), 'bumped event')

  helper.getNode('set-label').receive({ payload: { ignored: true } })
  await waitFor(() => sink('s-state').some((m) => m.vars && m.vars.label === 'hello'), 'label variable')

  helper.getNode('ev-data').receive({})
  await waitFor(() => sink('s-state').some((m) => m.vars && m.vars.label === 'from-json'), 'json event data')

  helper.getNode('set-object').receive({ payload: { label: 'from-object', count: 7 } })
  await waitFor(() => sink('s-state').some((m) => m.vars && m.vars.label === 'from-object' && m.vars.count === 7), 'object set')

  helper.getNode('reset').receive({})
  await waitFor(() => sink('s-state').some((m) => m.payload === 'idle'), 'reset state')
})

test('read writes a snapshot to flow context', async () => {
  await load()
  helper.getNode('ev-start').receive({ payload: 'ignored' })
  await waitFor(() => sink('s-state').some((m) => m.payload === 'running'), 'running')
  helper.getNode('read').receive({})
  await waitFor(() => sink('s-read').length > 0, 'read output')
  const value = await helper.getNode('read').context().flow.get('readSnapshot')
  assert.ok(value)
  assert.deepEqual(value.states, ['running'])
  assert.equal(value.vars.label, 'running')
})

const FINAL_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a"><transition event="go" target="done"/></state>
  <final id="done"/>
</scxml>`

test('hub reports done on its third output', async () => {
  await new Promise((resolve, reject) => helper.load(testModule, [
    { id: 'conf', type: 'statechart-machine', name: 'Final', source: FINAL_SOURCE, engine: 'sandboxed' },
    { id: 'hub', type: 'statechart-hub', machine: 'conf', includeVars: true, emitInitial: true, includeInternalSends: false, wires: [[], [], ['s-done']] },
    { id: 's-done', type: 'hub-sink' },
  ], (err) => (err ? reject(err) : resolve())))
  await waitFor(() => sink('s-done').length === 0, 'initial quiet')
  helper.getNode('hub').receive({ event: 'go' })
  await waitFor(() => sink('s-done').some((m) => m.done === true), 'done output')
  assert.equal(sink('s-done').at(-1).payload, 'done')
})
