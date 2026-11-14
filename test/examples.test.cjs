const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const flows = JSON.parse(readFileSync(resolve(__dirname, '../examples/demo-suite.json'), 'utf8'))

test('demo suite SCXML sources compile', async () => {
  const { parseSCXML, compile } = await import('@tinyactors/scxmljs/trusted')
  const { DOMParser } = await import('@xmldom/xmldom')
  const parser = new DOMParser()
  const machines = flows.filter((node) => node.type === 'statechart-machine' && node.source)
  assert.ok(machines.length >= 5, 'expected several source machines')
  for (const machine of machines) {
    const parsed = parseSCXML(machine.source, parser)
    await compile(parsed)
  }
})

test('demo suite ProjectDoc example has a valid shape', () => {
  const machine = flows.find((node) => node.type === 'statechart-machine' && node.doc)
  assert.ok(machine, 'expected a ProjectDoc machine')
  const doc = JSON.parse(machine.doc)
  assert.equal(doc.formatVersion, 1)
  assert.ok(doc.states.length >= 2)
  assert.ok(doc.states.some((state) => state.uid === doc.initial))
  for (const transition of doc.transitions) {
    assert.ok(doc.states.some((state) => state.uid === transition.source))
    assert.ok(transition.target == null || doc.states.some((state) => state.uid === transition.target))
  }
})

test('kit 0.15 internal-events example demonstrates raise and internal-only visibility', async () => {
  const flow = JSON.parse(readFileSync(resolve(__dirname, '../examples/internal-events.json'), 'utf8'))
  const machine = flow.find((node) => node.type === 'statechart-machine' && node.doc)
  assert.ok(machine, 'expected the internal-events ProjectDoc machine')

  const doc = JSON.parse(machine.doc)
  assert.ok(doc.internalOnlyEvents.includes('ping'))
  assert.ok(doc.transitions.some((transition) => transition.actions.includes('raise ping')))
  assert.ok(doc.states.some((state) => state.uid === doc.initial))
  assert.ok(doc.states.some((state) => state.kind === 'compound' && state.initial))

  const { serializeToScxml, serializeToDisplayScxml, validateStructure } = await import('statechart-kit')
  const xml = serializeToScxml(doc)
  assert.match(xml, /<raise event="ping"\/>/)
  assert.match(xml, /data-kit-internal-events="\[&quot;ping&quot;\]"/)
  assert.match(xml, /data-kit-visibility="internal"/)
  assert.match(xml, /_event\.type === 'internal'/)
  assert.doesNotMatch(serializeToDisplayScxml(doc), /_event\.type === 'internal'/)

  const errors = validateStructure(doc).issues.filter((issue) => issue.severity === 'error')
  assert.deepEqual(errors, [])

  const { parseSCXML, compile } = await import('@tinyactors/scxmljs/trusted')
  const { DOMParser } = await import('@xmldom/xmldom')
  await compile(parseSCXML(xml, new DOMParser()))
})
