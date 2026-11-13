const { test } = require('node:test')
const assert = require('node:assert/strict')

/**
 * statechart-kit 0.13 event visibility contract.
 *
 * Runtime SCXML must keep the internal-only guard; the read-only canvas uses
 * serializeToDisplayScxml() and must not show it as an author condition.
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
  eventVisibility: { ping: 'internal' },
  layout: {},
}

test('kit 0.13 serializer keeps the internal-only guard in runtime SCXML', async () => {
  const { serializeToScxml } = await import('statechart-kit')
  const xml = serializeToScxml(DOC)
  assert.match(xml, /data-kit-visibility="internal"/)
  assert.match(xml, /_event\.type === 'internal'/)
  assert.match(xml, /<raise event="ping"\/>/)
  assert.match(xml, /event="ping"/)
})

test('kit 0.13 display serializer hides kit-generated guards', async () => {
  const { serializeToDisplayScxml } = await import('statechart-kit')
  const xml = serializeToDisplayScxml(DOC)
  assert.doesNotMatch(xml, /data-kit-visibility/)
  assert.doesNotMatch(xml, /_event\.type === 'internal'/)
  assert.match(xml, /event="ping"/)
  assert.match(xml, /event="arm"/)
})

test('kit 0.13 import restores eventVisibility and strips the generated guard', async () => {
  const { scxmlToDoc, serializeToScxml } = await import('statechart-kit')
  const { DOMParser } = await import('@xmldom/xmldom')
  const imported = scxmlToDoc(serializeToScxml(DOC), new DOMParser())
  assert.deepEqual(imported.doc.eventVisibility, { ping: 'internal' })
  const ping = imported.doc.transitions.find((t) => t.event === 'ping')
  assert.equal(ping.cond, 'x > 0')
  assert.ok(imported.doc.transitions.some((t) => t.actions.includes('raise ping')))
})

test('kit 0.13 warns when a transition mixes internal-only and external events', async () => {
  const { validateStructure } = await import('statechart-kit')
  const doc = structuredClone(DOC)
  doc.transitions = [
    { id: 't-mixed', source: 'u1', target: 'u2', event: 'ping go', cond: '', actions: [] },
  ]
  const report = validateStructure(doc)
  const issue = report.issues.find((i) => i.code === 'structure.transition.mixed-event-visibility')
  assert.ok(issue, 'mixed visibility warning expected')
  assert.equal(issue.severity, 'warning')
  assert.equal(issue.params.id, 't-mixed')
})

test('kit 0.13 raise action survives the DSL round-trip', async () => {
  const { parseActionLine, actionToLine } = await import('statechart-kit')
  const parsed = parseActionLine('raise ping')
  assert.deepEqual(parsed, { type: 'raise', event: 'ping' })
  assert.equal(actionToLine(parsed), 'raise ping')
})
