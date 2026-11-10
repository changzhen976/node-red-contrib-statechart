/**
 * Regression test for the standalone-editor save bridge.
 *
 * A brand-new `statechart-machine` config node is not registered in RED.nodes
 * until the dialog is confirmed, so `RED.nodes.node(id)` returns null. The
 * message handler used to bail out there, which made "Save to Node-RED" in the
 * standalone editor silently do nothing for new machines.
 *
 * The handler is extracted from the built editor HTML and executed in a VM with
 * stubbed Node-RED globals so both the new-node and the existing-node paths are
 * covered without a browser.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

function extractHandler () {
  const html = fs.readFileSync(path.join(root, 'editor', 'statechart.html'), 'utf8')
  const start = html.indexOf('p4Handler = function (event) {')
  assert.ok(start > 0, 'p4Handler assignment should exist in the editor html')
  const open = html.indexOf('{', start)
  let depth = 0
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1
    else if (html[i] === '}') {
      depth -= 1
      if (depth === 0) return html.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced handler braces')
}

function runHandler ({ registered, data }) {
  const handlerSrc = extractHandler().replace('p4Handler = ', 'const handler = ')
  const calls = { notify: [], ack: [], prepared: 0, dirty: 0 }
  const registry = new Map(registered ? [[registered.id, registered]] : [])
  const node = { id: 'new-machine-1', type: 'statechart-machine', name: '' }
  const p4Window = { closed: false, postMessage: (msg) => calls.ack.push(msg) }
  const sandbox = {
    console,
    location: { origin: 'http://127.0.0.1:1880' },
    node,
    p4Window,
    RED: {
      nodes: {
        node: (id) => registry.get(id) || null,
        dirty: () => { calls.dirty += 1 },
      },
    },
    c: {
      serializeToScxml: () => '<scxml version="1.0"/>',
      normalizeDoc: (doc) => doc,
    },
    notify: (message, level) => calls.notify.push({ message, level }),
    t: (key) => key,
    scxmlPrepareMachineEditor: () => { calls.prepared += 1 },
    sendLoad: () => {},
    event: {
      origin: 'http://127.0.0.1:1880',
      source: p4Window,
      data,
    },
  }
  vm.runInNewContext(`${handlerSrc};\nhandler(event);`, sandbox)
  return { node, calls, registry }
}

test('standalone editor save lands on a brand-new machine dialog', () => {
  const doc = { formatVersion: 1, name: 'Traffic Light', states: [{ uid: 's1', id: 'red' }], transitions: [] }
  const { node, calls } = runHandler({
    registered: null,
    data: { type: 'scxml:save', id: 'new-machine-1', doc },
  })

  assert.ok(node.doc, 'the dialog node should carry the saved document')
  assert.equal(JSON.parse(node.doc).name, 'Traffic Light')
  assert.equal(node.source, '<scxml version="1.0"/>')
  assert.equal(calls.prepared, 1, 'the dialog form should be re-rendered')
  assert.equal(JSON.stringify(calls.ack[0]), '{"type":"scxml:save-ack","ok":true}')
  assert.equal(calls.notify[0].level, 'success')
  assert.equal(calls.notify[0].message, 'message.savedFromFullEditor')
})

test('standalone editor save still targets an existing machine config node', () => {
  const existing = { id: 'existing-1', type: 'statechart-machine', name: 'Plant' }
  const doc = { formatVersion: 1, name: 'Plant', states: [{ uid: 's1', id: 'idle' }], transitions: [] }
  const { node, calls } = runHandler({
    registered: existing,
    data: { type: 'scxml:save', id: 'existing-1', doc },
  })

  assert.equal(existing.doc, JSON.stringify(doc))
  assert.equal(existing.source, '<scxml version="1.0"/>')
  assert.equal(node.doc, undefined, 'the open dialog must not be touched')
  assert.equal(JSON.stringify(calls.ack[0]), '{"type":"scxml:save-ack","ok":true}')
})

test('standalone editor save ignores unknown machine ids', () => {
  const { node, calls } = runHandler({
    registered: null,
    data: { type: 'scxml:save', id: 'someone-else', doc: { formatVersion: 1, states: [] } },
  })

  assert.equal(node.doc, undefined)
  assert.equal(calls.ack.length, 0)
  assert.equal(calls.notify.length, 0)
})
