const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { parseSCXML, compile } = require('@tinyactors/scxmljs/trusted')
const { DOMParser } = require('@xmldom/xmldom')

const flows = JSON.parse(readFileSync(resolve(__dirname, '../examples/demo-suite.json'), 'utf8'))

test('demo suite SCXML sources compile', async () => {
  const parser = new DOMParser()
  const machines = flows.filter((node) => node.type === 'scxml-machine' && node.source)
  assert.ok(machines.length >= 5, 'expected several source machines')
  for (const machine of machines) {
    const parsed = parseSCXML(machine.source, parser)
    await compile(parsed)
  }
})

test('demo suite ProjectDoc example has a valid shape', () => {
  const machine = flows.find((node) => node.type === 'scxml-machine' && node.doc)
  assert.ok(machine, 'expected a ProjectDoc machine')
  const doc = JSON.parse(machine.doc)
  assert.equal(doc.formatVersion, 1)
  assert.ok(doc.states.length >= 2)
  assert.ok(doc.states.some((state) => state.uid === doc.initial))
  for (const transition of doc.transitions) {
    assert.ok(doc.states.some((state) => state.uid === transition.source))
    assert.ok(doc.states.some((state) => state.uid === transition.target))
  }
})
