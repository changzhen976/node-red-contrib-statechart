const { test } = require('node:test')
const assert = require('node:assert/strict')

test('English diagnostics cover every published kit code', async () => {
  const kit = await import('statechart-kit')
  const en = await import('../editor-page/diagnostics-en.mjs')

  const cases = [
    ['NAMING_ISSUE_CODES', en.formatNamingIssue],
    ['STRUCTURE_ISSUE_CODES', en.formatStructureIssue],
    ['VALIDATION_ISSUE_CODES', en.formatValidationIssue],
    ['VARIABLE_WRITE_CODES', en.formatVariableResult],
  ]

  const missing = []
  for (const [catalog, format] of cases) {
    const codes = kit[catalog]
    assert.ok(Array.isArray(codes), `statechart-kit must export ${catalog}`)
    for (const code of codes) {
      const text = format({ code, params: {} })
      // The formatter falls back to `code {json}` when no English message exists.
      if (!text || text.startsWith(code)) missing.push(`${code} (${catalog})`)
    }
  }
  assert.deepEqual(missing, [], `missing English diagnostics:\n${missing.join('\n')}`)
})

test('English diagnostics interpolate params', async () => {
  const en = await import('../editor-page/diagnostics-en.mjs')
  assert.equal(
    en.formatStructureIssue({ code: 'structure.state.final-transition', params: { id: 'done', count: 2 } }),
    'Final state "done" cannot have 2 outgoing transition(s)',
  )
  assert.equal(
    en.formatVariableResult({ code: 'variable.unknown', params: { id: 'count' } }),
    'Unknown variable "count"',
  )
})
