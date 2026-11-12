const { test, before, after, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const helper = require('node-red-node-test-helper')
const scxmlModule = require('../dist/statechart.js')

helper.init(require.resolve('node-red'))

const IDLE_RUNNING = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle"><transition event="start" target="running"/></state>
  <state id="running"><transition event="stop" target="idle"/></state>
</scxml>`

const COUNTING = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="a">
  <datamodel><data id="count" expr="0"/></datamodel>
  <state id="a"><transition event="go" target="b"><assign location="count" expr="count + 1"/></transition></state>
  <state id="b"><transition event="back" target="a"/></state>
</scxml>`

const SCRIPT_ERROR = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a"><transition event="go" target="b"><script>throw new Error("boom")</script></transition></state>
  <state id="b"><transition event="back" target="a"/></state>
</scxml>`

const DELAYED = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a">
    <onentry><send event="later" delay="1500ms"/></onentry>
    <transition event="later" target="b"/>
  </state>
  <state id="b"/>
</scxml>`

const BAD = '<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="a"></scxml>'

function testModule(RED) {
  scxmlModule(RED)
  RED.nodes.registerType('lifecycle-sink', function (config) {
    RED.nodes.createNode(this, config)
    globalThis.__lifecycleSinks ||= {}
    globalThis.__lifecycleSinks[this.id] = []
    this.on('input', (msg) => { globalThis.__lifecycleSinks[this.id].push(msg) })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate, label, timeout = 4000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = predicate()
    if (value) return value
    await sleep(20)
  }
  throw new Error(`timeout waiting for ${label}`)
}

function sink(id) {
  return globalThis.__lifecycleSinks?.[id] ?? []
}

function hubFlow(source, options = {}) {
  const { doc, hub = {}, machine = {}, secondHub = false } = options
  const flow = [
    {
      id: 'conf', type: 'statechart-machine', name: 'lifecycle machine',
      source: doc ? '' : source, doc: doc || '',
      engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000,
      ...machine,
    },
    {
      id: 'hub', type: 'statechart-hub', machine: 'conf', includeVars: true,
      emitInitial: true, includeInternalSends: false,
      wires: [['s-state'], ['s-event'], ['s-error']], ...hub,
    },
    { id: 's-state', type: 'lifecycle-sink' },
    { id: 's-event', type: 'lifecycle-sink' },
    { id: 's-error', type: 'lifecycle-sink' },
  ]
  if (secondHub) {
    flow.push(
      { id: 'hub2', type: 'statechart-hub', machine: 'conf', includeVars: true, emitInitial: true, includeInternalSends: false, wires: [['s2-state'], [], ['s2-error']] },
      { id: 's2-state', type: 'lifecycle-sink' },
      { id: 's2-error', type: 'lifecycle-sink' },
    )
  }
  return flow
}

async function load(flow) {
  globalThis.__lifecycleSinks = {}
  await new Promise((resolve, reject) => {
    helper.load(testModule, flow, (err) => (err ? reject(err) : resolve()))
  })
}

before(async () => {
  await new Promise((resolve, reject) => helper.startServer((err) => (err ? reject(err) : resolve())))
})

afterEach(async () => {
  await helper.unload()
  delete globalThis.__lifecycleSinks
})

after(async () => {
  await new Promise((resolve) => helper.stopServer(resolve))
  await sleep(50)
  const timers = process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length
  assert.ok(timers <= 1, `expected no leaked timers, found ${timers}`)
})

test('a hub without a machine reports on output 3 instead of only logging', async () => {
  await load([
    { id: 'hub', type: 'statechart-hub', machine: 'missing', includeVars: true, emitInitial: true, wires: [[], [], ['s-error']] },
    { id: 's-error', type: 'lifecycle-sink' },
  ])
  await waitFor(() => sink('s-error').length > 0, 'missing-machine error')
  const startup = sink('s-error')[0]
  assert.match(String(startup.payload), /machine/i)
  assert.ok(startup.error instanceof Error)
  assert.equal(startup.topic, 'statechart/error')

  helper.getNode('hub').receive({})
  await waitFor(() => sink('s-error').length >= 2, 'missing-machine input error')
})

test('a conflicting hub reports and can take over after the owner releases', async () => {
  await load(hubFlow(IDLE_RUNNING, { secondHub: true }))
  await waitFor(() => sink('s-state').length > 0, 'owner initial state')
  await waitFor(() => sink('s2-error').length > 0, 'conflict error on output 3')
  assert.match(String(sink('s2-error')[0].payload), /hub|machine/i)
  assert.equal(sink('s2-state').length, 0, 'a conflicting hub must not emit state')

  const machine = helper.getNode('conf')
  machine.releaseHub(helper.getNode('hub'))
  helper.getNode('hub2').receive({ command: 'read' })
  await waitFor(() => sink('s2-state').length > 0, 'standby hub state after takeover')
  assert.equal(sink('s2-state').at(-1).payload, 'idle')
})

test('setting an unknown variable fails on output 3 but keeps the machine usable', async () => {
  await load(hubFlow(IDLE_RUNNING))
  await waitFor(() => sink('s-state').length > 0, 'initial state')

  helper.getNode('hub').receive({ command: 'set', payload: { nope: 1 } })
  await waitFor(() => sink('s-error').length > 0, 'unknown-variable error')
  assert.ok(sink('s-error')[0].error instanceof Error)

  helper.getNode('hub').receive({ topic: 'start' })
  await waitFor(() => sink('s-state').some((msg) => msg.payload === 'running'), 'running after set error')
})

test('invalid document JSON is reported instead of crashing the flow', async () => {
  await load(hubFlow('', { doc: '{' }))
  await waitFor(() => sink('s-error').length > 0, 'invalid doc error')
  assert.match(String(sink('s-error')[0].payload), /JSON/i)

  helper.getNode('hub').receive({ topic: 'start' })
  await waitFor(() => sink('s-error').length >= 2, 'invalid doc error on input')
})

test('runtime script errors go to output 3 and later events still work', async () => {
  await load(hubFlow(SCRIPT_ERROR))
  await waitFor(() => sink('s-state').length > 0, 'initial state')
  helper.getNode('hub').receive({ topic: 'go' })
  await waitFor(() => sink('s-error').length > 0, 'runtime error')
  assert.ok(sink('s-error')[0].error instanceof Error)

  await waitFor(() => sink('s-state').some((msg) => msg.payload === 'b'), 'transition target')
  helper.getNode('hub').receive({ topic: 'back' })
  await waitFor(() => sink('s-state').some((msg) => msg.payload === 'a'), 'machine still responsive')
})

test('forwards kit error location fields on hub output 3', async () => {
  await load(hubFlow(IDLE_RUNNING))
  await waitFor(() => sink('s-state').length > 0, 'initial state')
  const machine = helper.getNode('conf')
  machine.bus.emit({
    type: 'error',
    error: new Error('located boom'),
    location: {
      stateId: 'idle',
      transitionId: 't1',
      slot: 'transition',
      actionIndex: 2,
      element: { localName: 'script', id: 'boom' },
    },
    ts: Date.now(),
  })
  await waitFor(() => sink('s-error').length > 0, 'located runtime error')
  const message = sink('s-error').at(-1)
  assert.equal(message.payload, 'located boom')
  assert.equal(message.stateId, 'idle')
  assert.equal(message.transitionId, 't1')
  assert.equal(message.slot, 'transition')
  assert.equal(message.actionIndex, 2)
  assert.deepEqual(message.element, { localName: 'script', id: 'boom' })
})

test('uses done.states from the machine event when available', async () => {
  await load(hubFlow(IDLE_RUNNING))
  await waitFor(() => sink('s-state').length > 0, 'initial state')
  helper.getNode('conf').bus.emit({ type: 'done', states: ['done'], ts: Date.now() })
  await waitFor(() => sink('s-error').some((msg) => msg.done === true), 'done output')
  assert.deepEqual(sink('s-error').at(-1).states, ['done'])
})

test('rapid event and set commands keep arrival order', async () => {
  await load(hubFlow(COUNTING, { hub: { emitInitial: false } }))
  const hub = helper.getNode('hub')
  hub.receive({ topic: 'go' })
  hub.receive({ command: 'set', payload: { count: 10 } })

  await waitFor(() => sink('s-state').some((msg) => msg.payload === 'b' && msg.vars?.count === 10), 'ordered event + set')
  assert.ok(
    sink('s-state').every((msg) => msg.vars?.count !== 11),
    'the set must not run before the event action',
  )
})

test('reset recovers after an invalid machine source is repaired in place', async () => {
  await load(hubFlow(BAD))
  await waitFor(() => sink('s-error').length > 0, 'invalid source error')
  assert.equal(sink('s-state').length, 0)

  helper.getNode('conf').source = IDLE_RUNNING
  helper.getNode('hub').receive({ command: 'reset' })
  await waitFor(() => sink('s-state').some((msg) => msg.payload === 'idle'), 'recovered state after reset')
})

test('reset cancels a pending delayed transition instead of letting it fire', async () => {
  await load(hubFlow(DELAYED, { hub: { emitInitial: false } }))
  const machine = helper.getNode('conf')
  const sends = []
  machine.subscribe((event) => {
    if (event.type === 'send' && event.event === 'later') sends.push(Date.now())
  })

  const hub = helper.getNode('hub')
  hub.receive({ command: 'read' })
  await waitFor(() => sink('s-state').length > 0, 'initial state')
  await sleep(120)
  hub.receive({ command: 'reset' })

  // The old timer was due 1500ms after the first start; the restarted machine
  // schedules its own timer 1500ms after the reset. Wait past the old deadline
  // but before the new one.
  await sleep(1180)
  assert.equal(sends.length, 0, 'the pre-reset delayed send must be cancelled')
  assert.ok(sink('s-state').every((msg) => msg.payload !== 'b'), 'no transition from the stale timer')

  await waitFor(() => sink('s-state').some((msg) => msg.payload === 'b'), 'new delayed transition', 2500)
  assert.equal(sends.length, 1, 'exactly one delayed send should remain after reset')
})

test('read resolves the initial state when the machine has not started yet', async () => {
  await load([
    { id: 'conf', type: 'statechart-machine', name: 'read target', source: IDLE_RUNNING, engine: 'sandboxed' },
    { id: 'read', type: 'statechart-read', machine: 'conf', mode: 'snapshot', scope: 'none', wires: [['s-read']] },
    { id: 's-read', type: 'lifecycle-sink' },
  ])
  helper.getNode('read').receive({})
  await waitFor(() => sink('s-read').length > 0, 'read output')
  assert.deepEqual(sink('s-read').at(-1).states, ['idle'])
})
