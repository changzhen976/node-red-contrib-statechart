const { test } = require('node:test')
const assert = require('node:assert/strict')

const SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle">
    <transition event="ping" type="internal">
      <send event="pong"/>
    </transition>
    <transition event="go" target="done"/>
  </state>
  <final id="done">
    <donedata>
      <param name="code" expr="200"/>
    </donedata>
  </final>
</scxml>`

test('kit 0.9 imports and serializes targetless transitions', async () => {
  const { scxmlToDoc, serializeToScxml } = await import('statechart-kit')
  const { DOMParser } = await import('@xmldom/xmldom')
  const { doc, warnings } = scxmlToDoc(SOURCE, new DOMParser())
  assert.deepEqual(warnings, [])

  const ping = doc.transitions.find((edge) => edge.event === 'ping')
  assert.ok(ping)
  assert.equal(ping.target, null)
  assert.equal(ping.transitionType, 'internal')

  const out = serializeToScxml(doc)
  assert.match(out, /<transition[^>]*\bevent="ping"[^>]*\btype="internal"[^>]*>/)
  assert.doesNotMatch(out, /<transition event="ping"[^>]*target=/)
})

test('kit 0.9 imports and serializes final donedata', async () => {
  const { scxmlToDoc, serializeToScxml } = await import('statechart-kit')
  const { DOMParser } = await import('@xmldom/xmldom')
  const { doc } = scxmlToDoc(SOURCE, new DOMParser())

  const done = doc.states.find((state) => state.id === 'done')
  assert.ok(done)
  assert.deepEqual(done.doneData, { params: [{ name: 'code', expr: '200' }] })

  const out = serializeToScxml(doc)
  assert.match(out, /<donedata>/)
  assert.match(out, /<param name="code" expr="200"\/>/)
})

test('statechart-kit preserves transition ids in serialized SCXML', async () => {
  const { scxmlToDoc, serializeToScxml } = await import('statechart-kit')
  const { DOMParser } = await import('@xmldom/xmldom')
  const doc = {
    formatVersion: 1,
    name: 'transition ids',
    initial: 'u1',
    datamodel: [],
    states: [
      { uid: 'u1', id: 'idle', label: 'idle', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
      { uid: 'u2', id: 'done', label: 'done', kind: 'final', parent: null, entryActions: [], exitActions: [] },
    ],
    transitions: [
      { id: 't-go', source: 'u1', target: 'u2', event: 'go', cond: '', actions: [] },
    ],
    layout: {},
  }

  const out = serializeToScxml(doc)
  assert.match(out, /data-kit-transition-id="t-go"/)

  const { doc: roundTrip } = scxmlToDoc(out, new DOMParser())
  assert.equal(roundTrip.transitions[0].id, 't-go')
})
