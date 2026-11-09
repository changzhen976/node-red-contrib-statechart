/**
 * 用 @xmldom/xmldom 跑复杂 SCXML 语义（替代 happy-dom 的可行性验证）。
 * 运行：cd spike/nr && ../../scxml-creator/node_modules/.bin/tsx complex-test.mts
 */
import { DOMParser } from '@xmldom/xmldom'
import { emptyDoc, autoDelayEventName, type ProjectDoc, type StateNode } from '../../../scxml-creator/src/core/model.ts'
import { serializeToScxml } from '../../../scxml-creator/src/core/serializer.ts'
import { validateScxml } from '../../../scxml-creator/src/core/validator.ts'

const { createSession } = (await import('@tinyactors/scxmljs')) as any
const domParser = new DOMParser()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function state(uid: string, id: string, kind: StateNode['kind'] = 'atomic', parent: string | null = null, initial: string | null = null): StateNode {
  return { uid, id, label: id, kind, parent, initial, entryActions: [], exitActions: [] }
}

async function run(name: string, doc: ProjectDoc, drive: (s: any) => Promise<void>) {
  const xml = serializeToScxml(doc)
  const v = await validateScxml(xml, domParser as any)
  if (!v.ok) {
    console.log(JSON.stringify({ name, validate: v.message }))
    return
  }
  const s = await createSession(xml, { domParser })
  const events: any[] = []
  s.addEventListener('send', (e: any) => events.push({ type: 'send', ...e.message }))
  s.addEventListener('macrostep', () => events.push({ type: 'macro', active: s.activeStateIds() }))
  s.addEventListener('error', (e: any) => events.push({ type: 'error', kind: e.kind, message: e.message }))
  s.start()
  await sleep(5)
  await drive(s)
  await sleep(60)
  const out = { name, validate: v.ok, events, snapshot: s.snapshot(), final: s.activeStateIds() }
  s.dispose()
  console.log(JSON.stringify(out))
}

// 并行 + 图内 send + log
{
  const d = emptyDoc('parallel')
  d.initial = 'p'
  d.states = [
    state('p', 'p', 'parallel'),
    state('r1', 'r1', 'compound', 'p', 's11'),
    state('s11', 's11', 'atomic', 'r1'),
    state('s12', 's12', 'atomic', 'r1'),
    state('r2', 'r2', 'compound', 'p', 's21'),
    state('s21', 's21', 'atomic', 'r2'),
    state('s22', 's22', 'atomic', 'r2'),
  ]
  d.transitions = [
    { id: 't1', source: 's11', target: 's12', event: 'go1', cond: '', actions: ['send batchDone data {"batch":42}', 'log "moved"'] },
    { id: 't2', source: 's21', target: 's22', event: 'go2', cond: '', actions: [] },
  ]
  await run('parallel-send-log', d, async (s) => {
    s.send('go1')
    s.send('go2')
  })
}

// 延时转移
{
  const d = emptyDoc('delay')
  d.initial = 'idle'
  d.states = [state('idle', 'idle'), state('run', 'run'), state('cool', 'cool')]
  d.transitions = [
    { id: 't1', source: 'idle', target: 'run', event: 'start', cond: '', actions: [] },
    { id: 't2', source: 'run', target: 'cool', event: '', cond: '', actions: [], delayMs: 40, delayUnit: 'ms' },
  ]
  d.transitions[1].event = autoDelayEventName(d, 'run', 'cool', 40, 'ms')
  await run('delay', d, async (s) => {
    s.send('start')
  })
}

// 历史伪态
{
  const d = emptyDoc('history')
  d.initial = 'p'
  d.states = [
    state('p', 'p', 'compound', null, 's1'),
    state('s1', 's1', 'atomic', 'p'),
    state('s2', 's2', 'atomic', 'p'),
    state('h', 'h', 'history', 'p'),
  ]
  d.states[3].historyType = 'shallow'
  d.transitions = [
    { id: 't1', source: 's1', target: 's2', event: 'next', cond: '', actions: [] },
    { id: 't2', source: 's2', target: 'out', event: 'out', cond: '', actions: [] },
    { id: 't3', source: 'out', target: 'h', event: 'back', cond: '', actions: [] },
    { id: 't4', source: 'h', target: 's1', event: '', cond: '', actions: [] },
  ]
  d.states.push(state('out', 'out'))
  await run('history', d, async (s) => {
    s.send('next')
    await sleep(5)
    s.send('out')
    await sleep(5)
    s.send('back')
  })
}
