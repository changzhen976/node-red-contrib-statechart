const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('kit 0.10 reports final-state outgoing transitions', async () => {
  const { scxmlToDoc, validateStructure } = await import('statechart-kit')
  const { DOMParser } = await import('@xmldom/xmldom')
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
  <state id="a"><transition event="go" target="done"/></state>
  <final id="done"><transition event="again" target="a"/></final>
</scxml>`
  const { doc } = scxmlToDoc(source, new DOMParser())
  const report = validateStructure(doc)
  assert.ok(report.issues.some((issue) => issue.code === 'structure.state.final-transition'))
})

test('0.6 editor ships the final-transition message', () => {
  const root = path.join(__dirname, '..')
  const zh = JSON.parse(fs.readFileSync(path.join(root, 'dist/locales/zh-CN/statechart.json'), 'utf8'))
  assert.ok(zh.validate.finalTransition)
  const html = fs.readFileSync(path.join(root, 'dist/statechart.html'), 'utf8')
  assert.ok(html.includes('structure.state.final-transition'))
})
