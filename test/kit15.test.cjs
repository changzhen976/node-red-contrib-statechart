const { test } = require('node:test')
const assert = require('node:assert/strict')

/**
 * statechart-kit 0.15 internal-only event contract.
 *
 * Runtime SCXML keeps the guard and root data-kit-internal-events metadata;
 * the read-only canvas uses serializeToDisplayScxml() and hides both.
 */

const DOC = {
  formatVersion: 1,
  name: 'visibility',
  initial: 'u1',
  datamodel: [],
  states: [
    { uid: 'u1', id: 'a', label: 'a', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
    { uid: 'u2', id: 'b', label: 'b', kind: 'atomic', parent: null, entryActions: [], exitActions: [] },
  ],
  transitions: [
    { id: 't-arm', source: 'u1', target: 'u1', event: 'arm', cond: '', actions: ['raise ping'] },
    { id: 't-ping', source: 'u1', target: 'u2', event: 'ping', cond: 'x > 0', actions: [] },
  ],
  internalOnlyEvents: ['ping'],
  layout: {},
}

test('kit 0.15 serializer writes root internal-only metadata and the guard', async () => {
  const { serializeToScxml } = await import('statechart-kit')
  const xml = serializeToScxml(DOC)
  assert.match(xml, /data-kit-internal-events="\[&quot;ping&quot;\]"/)
  assert.match(xml, /data-kit-visibility="internal"/)
  assert.match(xml, /_event\.type === 'internal'/)
  assert.match(xml, /<raise event="ping"\/>/)
})

test('kit 0.15 display serializer hides metadata and guards', async () => {
  const { serializeToDisplayScxml } = await import('statechart-kit')
  const xml = serializeToDisplayScxml(DOC)
  assert.doesNotMatch(xml, /data-kit-internal-events/)
  assert.doesNotMatch(xml, /data-kit-visibility/)
  assert.doesNotMatch(xml, /_event\.type === 'internal'/)
  assert.match(xml, /event="ping"/)
})

test('kit 0.15 import restores internalOnlyEvents and strips the generated guard', async () => {
  const { scxmlToDoc, serializeToScxml } = await import('statechart-kit')
  const { DOMParser } = await import('@xmldom/xmldom')
  const imported = scxmlToDoc(serializeToScxml(DOC), new DOMParser())
  assert.deepEqual(imported.doc.internalOnlyEvents, ['ping'])
  assert.equal(imported.doc.eventVisibility, undefined)
  const ping = imported.doc.transitions.find((t) => t.event === 'ping')
  assert.equal(ping.cond, 'x > 0')
})

test('kit 0.15 rejects a transition that mixes internal-only and external events', async () => {
  const { serializeChecked, validateStructure } = await import('statechart-kit')
  const doc = structuredClone(DOC)
  doc.transitions = [
    { id: 't-mixed', source: 'u1', target: 'u2', event: 'ping go', cond: '', actions: [] },
  ]
  const report = validateStructure(doc)
  const issue = report.issues.find((i) => i.code === 'structure.transition.mixed-event-visibility')
  assert.ok(issue, 'mixed visibility error expected')
  assert.equal(issue.severity, 'error')
  assert.throws(() => serializeChecked(doc), /document\.invalid-structure/)
})

test('kit 0.15 rejects an internal-only event with an external producer', async () => {
  const { validateStructure } = await import('statechart-kit')
  const doc = structuredClone(DOC)
  doc.transitions[0].actions = ['send ping']
  const issue = validateStructure(doc).issues.find(
    (i) => i.code === 'structure.event.internal-only-with-external-producer',
  )
  assert.ok(issue, 'external producer error expected')
  assert.equal(issue.severity, 'error')
})

test('kit 0.15 migrates legacy eventVisibility into internalOnlyEvents', async () => {
  const { normalizeDoc } = await import('statechart-kit')
  const doc = structuredClone(DOC)
  delete doc.internalOnlyEvents
  doc.eventVisibility = { ping: 'internal', other: 'external' }
  normalizeDoc(doc)
  assert.deepEqual(doc.internalOnlyEvents, ['ping'])
  assert.equal(doc.eventVisibility, undefined)
})

test('kit 0.15 action DSL round-trips raise and internal send', async () => {
  const { parseActionLine, actionToLine } = await import('statechart-kit')
  assert.deepEqual(parseActionLine('raise ping'), { type: 'raise', event: 'ping' })
  assert.deepEqual(parseActionLine('send ping target #_internal'), {
    type: 'send',
    event: 'ping',
    target: '#_internal',
  })
  assert.equal(actionToLine({ type: 'send', event: 'ping', target: '#_internal' }), 'send ping target #_internal')
})
