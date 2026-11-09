const { test, before, after, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const helper = require('node-red-node-test-helper')
const scxmlModule = require('../dist/scxml.js')

helper.init(require.resolve('node-red'))

const TRAFFIC = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript" initial="red">
  <datamodel><data id="cycles" expr="0"/></datamodel>
  <state id="red">
    <onentry><assign location="cycles" expr="cycles + 1"/></onentry>
    <transition event="next" target="green"/>
  </state>
  <state id="green"><transition event="next" target="yellow"/></state>
  <state id="yellow"><transition event="next" target="red"/></state>
</scxml>`

const SEND = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a">
    <transition event="go" target="b">
      <send event="notify"><content expr="{n: 1}"/></send>
    </transition>
  </state>
  <state id="b"/>
</scxml>`

const PARALLEL = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="p">
  <parallel id="p">
    <state id="r1" initial="a"><state id="a"/><state id="b"/></state>
    <state id="r2" initial="x"><state id="x"/></state>
  </parallel>
</scxml>`

const BAD = '<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="a"></scxml>'

const DOC_TRAFFIC = JSON.stringify({
  formatVersion: 1,
  name: 'doc traffic light',
  initial: 'u1',
  datamodel: [{ id: 'cycles', expr: '0' }],
  states: [
    { uid: 'u1', id: 'red', label: 'red', kind: 'atomic', parent: null, entryActions: ['assign cycles = cycles + 1'], exitActions: [] },
    { uid: 'u2', id: 'green', label: 'green', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
  ],
  transitions: [
    { id: 't1', source: 'u1', target: 'u2', event: 'next', cond: '', actions: [] },
  ],
  layout: {},
})

const DOC_B = JSON.stringify({
  formatVersion: 1,
  name: 'doc machine B',
  initial: 'b1',
  datamodel: [],
  states: [
    { uid: 'b1', id: 'idleB', label: 'idleB', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
    { uid: 'b2', id: 'runB', label: 'runB', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
  ],
  transitions: [
    { id: 'tb1', source: 'b1', target: 'b2', event: 'goB', cond: '', actions: [] },
  ],
  layout: {},
})

function testModule(RED) {
  scxmlModule(RED)
  RED.nodes.registerType('p0-sink', function (config) {
    RED.nodes.createNode(this, config)
    globalThis.__p0Sinks ||= {}
    globalThis.__p0Sinks[this.id] = []
    this.on('input', (msg) => {
      globalThis.__p0Sinks[this.id].push(msg)
    })
  })
}

function flowFor(source) {
  return [
    {
      id: 'conf1', type: 'scxml-machine', name: 'test machine', source,
      engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000,
    },
    {
      id: 'in1', type: 'scxml-in', machine: 'conf1',
      eventSource: 'topic', fixedEvent: '', wires: [],
    },
    {
      id: 'out1', type: 'scxml-out', machine: 'conf1',
      includeVars: true, emitInitial: true, includeInternalSends: false,
      wires: [['s1'], ['s2']],
    },
    { id: 's1', type: 'p0-sink' },
    { id: 's2', type: 'p0-sink' },
  ]
}

function flowForDoc(doc) {
  const flow = flowFor('')
  flow[0].source = ''
  flow[0].doc = doc
  return flow
}

function twoMachineFlow() {
  return [
    {
      id: 'confA', type: 'scxml-machine', name: 'machine A', doc: DOC_TRAFFIC,
      engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000,
    },
    {
      id: 'confB', type: 'scxml-machine', name: 'machine B', doc: DOC_B,
      engine: 'sandboxed', scriptTimeoutMs: 500, maxMicrosteps: 10000,
    },
    { id: 'inA', type: 'scxml-in', machine: 'confA', eventSource: 'topic', fixedEvent: '', wires: [] },
    { id: 'inB', type: 'scxml-in', machine: 'confB', eventSource: 'topic', fixedEvent: '', wires: [] },
    { id: 'outA', type: 'scxml-out', machine: 'confA', includeVars: true, emitInitial: true, includeInternalSends: false, wires: [['sA'], ['sA2']] },
    { id: 'outB', type: 'scxml-out', machine: 'confB', includeVars: true, emitInitial: true, includeInternalSends: false, wires: [['sB'], ['sB2']] },
    { id: 'sA', type: 'p0-sink' },
    { id: 'sA2', type: 'p0-sink' },
    { id: 'sB', type: 'p0-sink' },
    { id: 'sB2', type: 'p0-sink' },
  ]
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate, label, timeout = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await sleep(20)
  }
  throw new Error(`timeout waiting for ${label}`)
}

function sinkMessages(id) {
  return globalThis.__p0Sinks?.[id] ?? []
}

async function loadFlow(flow) {
  await new Promise((resolve, reject) => {
    helper.load(testModule, flow, (err) => (err ? reject(err) : resolve()))
  })
}

async function unloadFlow() {
  await helper.unload()
}

before(async () => {
  await new Promise((resolve, reject) => {
    helper.startServer((err) => (err ? reject(err) : resolve()))
  })
})

after(async () => {
  await new Promise((resolve) => helper.stopServer(resolve))
  await sleep(50)
  const timers = process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length
  assert.ok(timers <= 1, `expected no leaked timers, found ${timers}`)
})

test('emits the initial state and variable snapshot', async () => {
  await loadFlow(flowFor(TRAFFIC))
  try {
    await waitFor(() => sinkMessages('s1').length > 0, 'initial state')
    const msg = sinkMessages('s1')[0]
    assert.equal(msg.payload, 'red')
    assert.deepEqual(msg.states, ['red'])
    assert.equal(msg.vars.cycles, 1)
    assert.equal(msg.changed, true)
  } finally {
    await unloadFlow()
  }
})

test('drives transitions from msg.topic', async () => {
  await loadFlow(flowFor(TRAFFIC))
  try {
    await waitFor(() => sinkMessages('s1').length > 0, 'initial state')
    helper.getNode('in1').receive({ topic: 'next' })
    await waitFor(() => sinkMessages('s1').some((m) => m.payload === 'green'), 'green')
    helper.getNode('in1').receive({ topic: 'next' })
    await waitFor(() => sinkMessages('s1').some((m) => m.payload === 'yellow'), 'yellow')
  } finally {
    await unloadFlow()
  }
})

test('emits chart <send> events on output 2', async () => {
  await loadFlow(flowFor(SEND))
  try {
    await waitFor(() => sinkMessages('s1').length > 0, 'initial state')
    helper.getNode('in1').receive({ topic: 'go' })
    await waitFor(() => sinkMessages('s2').some((m) => m.event === 'notify'), 'notify')
    const msg = sinkMessages('s2').find((m) => m.event === 'notify')
    assert.deepEqual(msg.payload, { n: 1 })
    assert.equal(msg.topic, 'scxml/test machine/evt/notify')
  } finally {
    await unloadFlow()
  }
})

test('reports parallel states as an array', async () => {
  await loadFlow(flowFor(PARALLEL))
  try {
    await waitFor(() => sinkMessages('s1').length > 0, 'initial state')
    const msg = sinkMessages('s1')[0]
    assert.ok(Array.isArray(msg.payload), 'payload should be an array')
    assert.ok(msg.states.includes('a'))
    assert.ok(msg.states.includes('x'))
  } finally {
    await unloadFlow()
  }
})

test('reports invalid SCXML without crashing', async () => {
  await loadFlow(flowFor(BAD))
  try {
    const errors = []
    const inNode = helper.getNode('in1')
    inNode.on('call:error', (err) => errors.push(err))
    inNode.receive({ topic: 'go' })
    await waitFor(() => errors.length > 0, 'error event')
    inNode.receive({ topic: 'go' })
    await sleep(100)
    assert.ok(errors.length >= 1)
  } finally {
    await unloadFlow()
  }
})

test('exposes the read-only monitor page and API', async () => {
  await loadFlow(flowFor(TRAFFIC))
  try {
    await waitFor(() => sinkMessages('s1').length > 0, 'initial state')

    const list = await helper.request().get('/scxmljs/api/machines').expect(200)
    assert.equal(list.body[0].id, 'conf1')
    assert.equal(list.body[0].name, 'test machine')

    const state = await helper.request().get('/scxmljs/api/machines/conf1').expect(200)
    assert.equal(state.body.running, true)
    assert.deepEqual(state.body.states, ['red'])
    assert.ok(state.body.version)

    const graph = await helper.request().get('/scxmljs/api/machines/conf1/graph').expect(200)
    assert.match(graph.text, /<scxml[\s>]/)

    const page = await helper.request().get('/scxmljs/monitor').expect(200)
    assert.match(page.text, /<base href="\/scxmljs\/assets\/">/)
    assert.match(page.text, /<scxml-view/)

    await helper.request().get('/scxmljs/assets/view.js').expect(200)
    await helper.request().get('/scxmljs/assets/monitor.js').expect(200)
  } finally {
    await unloadFlow()
  }
})


test('drives a ProjectDoc JSON machine and validates it before start', async () => {
  await loadFlow(flowForDoc(DOC_TRAFFIC))
  try {
    await waitFor(() => sinkMessages('s1').length > 0, 'doc initial state')
    assert.equal(sinkMessages('s1')[0].payload, 'red')
    assert.equal(sinkMessages('s1')[0].vars.cycles, 1)
    helper.getNode('in1').receive({ topic: 'next' })
    await waitFor(() => sinkMessages('s1').some((m) => m.payload === 'green'), 'doc green')
    const graph = await helper.request().get('/scxmljs/api/machines/conf1/graph').expect(200)
    assert.match(graph.text, /<scxml[\s>]/)
  } finally {
    await unloadFlow()
  }
})

test('keeps two config-node machines independent', async () => {
  await loadFlow(twoMachineFlow())
  try {
    await waitFor(() => sinkMessages('sA').length > 0 && sinkMessages('sB').length > 0, 'both initial states')
    assert.equal(sinkMessages('sA')[0].payload, 'red')
    assert.equal(sinkMessages('sB')[0].payload, 'idleB')
    helper.getNode('inA').receive({ topic: 'next' })
    await waitFor(() => sinkMessages('sA').some((m) => m.payload === 'green'), 'A green')
    assert.ok(sinkMessages('sB').every((m) => m.payload === 'idleB'), 'B must not change')

    const list = await helper.request().get('/scxmljs/api/machines').expect(200)
    assert.deepEqual(list.body.map((m) => m.id).sort(), ['confA', 'confB'])
  } finally {
    await unloadFlow()
  }
})
