const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Kit 0.11 exports public diagnostic-code catalogs. Keep the host CODE_MAP and
 * locale files aligned with them; on kit 0.10 this test skips because the
 * catalogs do not exist yet.
 */
test('host maps every published kit structure-issue code', async (t) => {
  const kit = await import('statechart-kit')
  const codes = kit.STRUCTURE_ISSUE_CODES
  if (!Array.isArray(codes)) {
    t.skip('statechart-kit does not export STRUCTURE_ISSUE_CODES yet')
    return
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'editor', 'validate-doc.ts'), 'utf8')
  const block = source.match(/const CODE_MAP[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  assert.ok(block, 'CODE_MAP block not found in validate-doc.ts')
  const mapped = new Map(
    [...block[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((match) => [match[1], match[2]]),
  )

  const en = require('../dist/locales/en-US/statechart.json').validate
  const zh = require('../dist/locales/zh-CN/statechart.json').validate
  const missing = []
  for (const code of codes) {
    const key = mapped.get(code)
    if (!key) {
      missing.push(`${code}: no CODE_MAP entry`)
      continue
    }
    if (!en[key]) missing.push(`${code} -> ${key}: missing en-US message`)
    if (!zh[key]) missing.push(`${code} -> ${key}: missing zh-CN message`)
  }
  assert.deepEqual(missing, [], `unmapped kit structure issue codes:\n${missing.join('\n')}`)
})
