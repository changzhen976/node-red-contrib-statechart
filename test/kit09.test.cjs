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
  assert.match(out, /<transition event="ping" type="internal">/)
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
