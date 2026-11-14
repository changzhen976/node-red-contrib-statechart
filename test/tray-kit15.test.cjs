/**
 * Tray-editor regressions for kit 0.13:
 * - `raise` is a first-class action type (it used to fall into the script
 *   branch and be saved as `raise undefined`);
 * - initial invariants mirror kit 0.12.1's editor store.
 *
 * The jQuery handlers are not exercised here; the pure helpers are extracted
 * from editor/statechart.html and run in a VM, matching editor-bridge.test.cjs.
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'editor', 'statechart.html'), 'utf8')

function extractFunction (name) {
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

function run (body, extra = {}) {
  const doc = extra.doc
  const sandbox = {
    t: (key) => key,
    esc: (value) => String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'),
    core: () => ({
      childrenOf: (d, uid) => d.states.filter((s) => s.parent === uid),
      isInternalOnlyEvent: (d, name) => (d.internalOnlyEvents || []).includes(name),
      internalOnlyNames: (d) => d.internalOnlyEvents || [],
      analyzeInternalOnly: (d) => ({ canConfirm: d.__canConfirm !== false }),
    }),
    ...extra,
  }
  const names = [
    'stateById',
    'ensureInitial',
    'collectEventNames',
    'visibilityOptions',
    'renderEvents',
    'updateEventIssue',
    'defaultAction',
    'actionTypeOptions',
    'actionField',
    'actionTextarea',
    'actionRow',
  ]
  const source = names.map(extractFunction).join('\n') + '\n(() => {\n' + body + '\n})()'
  return vm.runInNewContext(source, sandbox)
}

test('tray knows raise as an action type', () => {
  const action = run('return defaultAction("raise")')
  assert.equal(action.type, 'raise')
  assert.equal(action.event, '')
  assert.match(run('return actionTypeOptions("raise")'), /form\.typeRaise/)
})

test('tray renders raise with an event field, not a script code field', () => {
  const row = run('return actionRow({ type: "raise", event: "ping" }, 0)')
  assert.match(row, /data-afield="event"/)
  assert.match(row, /value="ping"/)
  assert.doesNotMatch(row, /data-afield="code"/)
})

test('tray initial helper picks the first non-history child and root state', () => {
  const doc = {
    states: [
      { uid: 'p', id: 'p', kind: 'compound', parent: null, initial: null },
      { uid: 'h', id: 'h', kind: 'history', parent: 'p' },
      { uid: 'a', id: 'a', kind: 'atomic', parent: 'p' },
      { uid: 'b', id: 'b', kind: 'atomic', parent: 'p' },
    ],
    initial: null,
  }
  run('ensureInitial(doc, "p"); ensureInitial(doc, null); return doc', { doc })
  assert.equal(doc.states[0].initial, 'a')
  assert.equal(doc.initial, 'p')
})

test('tray initial helper repairs a deleted initial child and empty root', () => {
  const doc = {
    states: [
      { uid: 'p', id: 'p', kind: 'compound', parent: null, initial: 'gone' },
      { uid: 'b', id: 'b', kind: 'atomic', parent: 'p' },
    ],
    initial: 'missing',
  }
  run('ensureInitial(doc, "p"); ensureInitial(doc, null); return doc', { doc })
  assert.equal(doc.states[0].initial, 'b')
  assert.equal(doc.initial, 'p')
})

test('tray event table lists listened events and their visibility', () => {
  const doc = {
    transitions: [
      { event: 'arm ping', delayMs: undefined },
      { event: 'go' },
      { event: 'timer', delayMs: 1000 },
    ],
    internalOnlyEvents: ['ping', 'stale'],
  }
  const rows = run('return renderEvents(doc)', { doc })
  assert.match(rows, /data-event="ping"/)
  assert.match(rows, /data-event="go"/)
  assert.match(rows, /data-event="stale"/)
  assert.doesNotMatch(rows, /data-event="timer"/)
  assert.match(rows, /value="internal" selected/)
})

test('tray warns when the automatic update event is internal-only', () => {
  const issue = run('return updateEventIssue(doc, updateEvent)', {
    doc: { internalOnlyEvents: ['update'] },
    updateEvent: 'update',
  })
  assert.equal(issue.code, 'updateEventInternal')
  assert.equal(issue.level, 'warning')
  assert.equal(issue.params.event, 'update')
  assert.equal(run('return updateEventIssue(doc, updateEvent)', {
    doc: { internalOnlyEvents: ['update'] },
    updateEvent: '',
  }), null)
  assert.equal(run('return updateEventIssue(doc, updateEvent)', {
    doc: { internalOnlyEvents: [] },
    updateEvent: 'update',
  }), null)
})

test('tray send action preserves an internal target', () => {
  const row = run('return actionRow({ type: "send", event: "ping", target: "#_internal" }, 0)')
  assert.match(row, /data-afield="target"/)
  assert.match(row, /value="#_internal" selected/)
  assert.match(row, /form\.actionSendTarget/)
})

test('tray marks legacy send delay as a hint', () => {
  const row = run('return actionRow({ type: "send", event: "ping", delay: "1s" }, 0)')
  assert.match(row, /scxml-action-hint/)
  assert.match(row, /message\.legacySendDelay/)
})

test('tray disables internal-only when the producer preflight fails', () => {
  const allowed = run('return visibilityOptions("both", true)')
  assert.doesNotMatch(allowed, /disabled/)
  const denied = run('return visibilityOptions("both", false)')
  assert.match(denied, /value="internal" disabled/)
  const rows = run('return renderEvents(doc)', { doc: { transitions: [{ event: 'ping' }], __canConfirm: false } })
  assert.match(rows, /value="internal" disabled/)
})
