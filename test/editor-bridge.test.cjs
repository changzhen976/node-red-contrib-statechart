/**
 * Regression test for the standalone-editor save bridge.
 *
 * A brand-new `statechart-machine` config node is not registered in RED.nodes
 * until the dialog is confirmed, so `RED.nodes.node(id)` returns null. The
 * editor session keeps the dialog node itself, and the message handler must
 * fall back to it.
 *
 * The handler is extracted from the editor HTML and executed in a VM with
 * stubbed Node-RED globals so both the new-node and the existing-node paths are
 * covered without a browser.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

function extractFunction (name) {
  const html = fs.readFileSync(path.join(root, 'editor', 'statechart.html'), 'utf8')
  const start = html.indexOf(`function ${name}(`)
  assert.ok(start > 0, `${name} should exist in the editor html`)
  const open = html.indexOf('{', start)
  let depth = 0
  for (let i = open; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1
    else if (html[i] === '}') {
      depth -= 1
      if (depth === 0) return html.slice(start, i + 1)
    }
  }
  throw new Error(`unbalanced ${name} braces`)
}

function runSave ({ registered, session, data }) {
  const calls = { notify: [], ack: [], prepared: 0, dirty: 0 }
  const source = { closed: false, postMessage: (msg) => calls.ack.push(msg) }
  const registry = new Map(registered ? [[registered.id, registered]] : [])
  const node = { id: 'new-machine-1', type: 'statechart-machine', name: '' }
  const sessions = new Map()
  if (session) sessions.set(source, Object.assign({ win: source, loaded: true }, session))
  const core = {
    serializeToScxml: () => '<scxml version="1.0"/>',
    normalizeDoc: (doc) => doc,
  }
  const sandbox = {
    console,
    location: { origin: 'http://127.0.0.1:1880' },
    editorSessions: sessions,
    RED: {
      nodes: {
        node: (id) => registry.get(id) || null,
        dirty: () => { calls.dirty += 1 },
      },
    },
    core: () => core,
    notify: (message, level) => calls.notify.push({ message, level }),
    t: (key) => key,
    postToSource: (source, message) => calls.ack.push(message),
    scxmlPrepareMachineEditor: () => { calls.prepared += 1 },
    event: {
      origin: 'http://127.0.0.1:1880',
      source,
      data,
    },
  }
  vm.runInNewContext(
    `${extractFunction('saveEditorDoc')};\n${extractFunction('onEditorMessage')};\nonEditorMessage(event);`,
    sandbox,
  )
  return { node, calls, registry }
}

test('standalone editor save lands on a brand-new machine dialog', () => {
  const doc = { formatVersion: 1, name: 'Traffic Light', states: [{ uid: 's1', id: 'red' }], transitions: [] }
  const dialogNode = { id: 'new-machine-1', type: 'statechart-machine', name: '' }
  const { calls } = runSave({
    registered: null,
    session: { id: 'new-machine-1', node: dialogNode, isEditingSelf: true, dialogDoc: doc },
    data: { type: 'scxml:save', id: 'new-machine-1', doc },
  })

  assert.ok(dialogNode.doc, 'the dialog node should carry the saved document')
  assert.equal(JSON.parse(dialogNode.doc).name, 'Traffic Light')
  assert.equal(dialogNode.name, 'Traffic Light', 'dialog node name should follow doc.name')
  assert.equal(dialogNode.source, '<scxml version="1.0"/>')
  assert.equal(calls.prepared, 1, 'the dialog form should be re-rendered')
  assert.equal(JSON.stringify(calls.ack[0]), '{"type":"scxml:save-ack","ok":true}')
  assert.equal(calls.notify[0].level, 'success')
  assert.equal(calls.notify[0].message, 'message.savedFromFullEditor')
})

test('standalone editor save still targets an existing machine config node', () => {
  const existing = { id: 'existing-1', type: 'statechart-machine', name: 'Plant' }
  const doc = { formatVersion: 1, name: 'Plant 2', states: [{ uid: 's1', id: 'idle' }], transitions: [] }
  const { node, calls } = runSave({
    registered: existing,
    session: { id: 'existing-1', node: null, isEditingSelf: false, dialogDoc: null },
    data: { type: 'scxml:save', id: 'existing-1', doc },
  })

  assert.equal(existing.doc, JSON.stringify(doc))
  assert.equal(existing.name, 'Plant 2', 'existing config node name should follow doc.name')
  assert.equal(existing.source, '<scxml version="1.0"/>')
  assert.equal(node.doc, undefined, 'the open dialog must not be touched')
  assert.equal(JSON.stringify(calls.ack[0]), '{"type":"scxml:save-ack","ok":true}')
})

test('standalone editor save reports unknown machine ids', () => {
  const { node, calls } = runSave({
    registered: null,
    session: { id: 'someone-else', node: null, isEditingSelf: false, dialogDoc: null },
    data: { type: 'scxml:save', id: 'someone-else', doc: { formatVersion: 1, states: [] } },
  })

  assert.equal(node.doc, undefined)
  assert.equal(calls.ack.length, 1)
  assert.equal(calls.ack[0].ok, false)
  assert.equal(calls.notify.length, 1)
  assert.equal(calls.notify[0].level, 'error')
})

test('sidebar editor ready creates a session for the selected machine', () => {
  const source = { closed: false, postMessage: () => {} }
  const sessions = new Map()
  const calls = { loads: [], notify: [] }
  const node = { id: 'sidebar-machine', type: 'statechart-machine', name: 'Sidebar' }
  const sandbox = {
    console,
    location: { origin: 'http://127.0.0.1:1880' },
    editorSessions: sessions,
    RED: { nodes: { node: () => node } },
    notify: (message, level) => calls.notify.push({ message, level }),
    t: (key) => key,
    sendEditorLoad: (session) => calls.loads.push(session),
    postToSource: () => {},
    event: {
      origin: 'http://127.0.0.1:1880',
      source,
      data: { type: 'scxml:ready', id: 'sidebar-machine' },
    },
  }
  vm.runInNewContext(`${extractFunction('onEditorMessage')};\nonEditorMessage(event);`, sandbox)
  assert.equal(sessions.get(source).id, 'sidebar-machine')
  assert.equal(sessions.get(source).node, node)
  assert.equal(calls.loads.length, 1)
  assert.equal(calls.notify.length, 0)
})
