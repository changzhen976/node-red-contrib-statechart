/**
 * 可行性 spike（只读复用 ../scxml-creator，不修改捐赠项目）。
 *
 * 运行：../scxml-creator/node_modules/.bin/tsx spike/feasibility-spike.ts
 * 目的：用实测替换 docs/assessment.md 里的经验判断：
 *   1. 纯 Node + happy-dom + realClock 无头跑 SCXML 会话
 *   2. 并行状态的多激活态输出形态
 *   3. assignValue 后事件less条件不重算，需要补发内部事件
 *   4. 自定义 JS 动作（CDATA）在 happy-dom 下解析失败
 *   5. 直接 createSession（realClock）不泄漏定时器；SessionRunner（PlaybackClock）会
 */
import {
  emptyDoc,
  newUid,
  type ProjectDoc,
  type StateNode,
} from '../../scxml-creator/src/core/model.ts'
import { serializeToScxml } from '../../scxml-creator/src/core/serializer.ts'
import { validateScxml } from '../../scxml-creator/src/core/validator.ts'
import { scanScriptActions } from '../../scxml-creator/src/core/action-parse.ts'
import { SessionRunner } from '../../scxml-creator/src/engine/session-runner.ts'

const DONOR = new URL('../../scxml-creator/', import.meta.url).pathname
const ENGINE = new URL('node_modules/@tinyactors/scxmljs/dist/index.js', `file://${DONOR}`).href
const HAPPY = new URL('node_modules/happy-dom/lib/index.js', `file://${DONOR}`).href

const { createSession } = (await import(ENGINE)) as any
const { Window } = (await import(HAPPY)) as any
const domParser = new (new Window().DOMParser)()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function state(
  uid: string,
  id: string,
  kind: StateNode['kind'] = 'atomic',
  parent: string | null = null,
  initial: string | null = null,
): StateNode {
  return {
    uid,
    id,
    label: id,
    kind,
    parent,
    initial,
    entryActions: [],
    exitActions: [],
  }
}

function baseDoc(name: string): ProjectDoc {
  const d = emptyDoc(name)
  d.initial = 's1'
  d.states = [state('s1', 'idle'), state('s2', 'running'), state('s3', 'done', 'final')]
  d.datamodel = [{ id: 'temp', expr: '0' }]
  d.transitions = [
    { id: 't1', source: 's1', target: 's2', event: 'start', cond: '', actions: [] },
    { id: 't2', source: 's2', target: 's1', event: 'stop', cond: '', actions: [] },
    { id: 't3', source: 's2', target: 's3', event: 'finish', cond: '', actions: [] },
  ]
  return d
}

function parallelDoc(): ProjectDoc {
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
    { id: 'tp1', source: 's11', target: 's12', event: 'go1', cond: '', actions: [] },
    { id: 'tp2', source: 's21', target: 's22', event: 'go2', cond: '', actions: [] },
  ]
  return d
}

function condDoc(): ProjectDoc {
  const d = emptyDoc('cond')
  d.initial = 'a'
  d.datamodel = [{ id: 'temp', expr: '0' }]
  d.states = [state('a', 'a'), state('b', 'b')]
  d.transitions = [
    { id: 'tc', source: 'a', target: 'b', event: 'update', cond: 'temp > 80', actions: [] },
  ]
  return d
}

function tickCount(): number {
  return process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length
}

async function newSession(xml: string, opts: Record<string, unknown> = {}) {
  return createSession(xml, { domParser, ...opts })
}

const results: Record<string, unknown> = {}
const step = (m: string) => console.error('[spike]', m)

// ---- 1. 无头会话 ----
step('headless start')
{
  const doc = baseDoc('smoke')
  const xml = serializeToScxml(doc)
  const v = await validateScxml(xml, domParser)
  const seen: string[] = []
  const s = await newSession(xml)
  s.addEventListener('macrostep', () => seen.push(s.activeStateIds().join('+')))
  s.addEventListener('log', (e: any) => seen.push(`log:${e.value}`))
  s.start()
  await sleep(0)
  const initial = s.activeStateIds()
  s.send('start', { n: 1 })
  await sleep(5)
  const after = s.activeStateIds()
  const snap = s.snapshot()
  s.dispose()
  results.headless = {
    validateOk: v.ok,
    validateMessage: v.message,
    initial,
    afterStart: after,
    macrosteps: seen,
    snapshot: snap,
  }
}

step('headless done')
// ---- 2. 并行状态 ----
step('parallel start')
{
  const xml = serializeToScxml(parallelDoc())
  const v = await validateScxml(xml, domParser)
  const s = await newSession(xml)
  let macro = 0
  s.addEventListener('macrostep', () => macro++)
  s.start()
  await sleep(0)
  const active = s.activeStateIds()
  s.send('go1')
  await sleep(5)
  const active2 = s.activeStateIds()
  s.dispose()
  results.parallel = { validateOk: v.ok, issues: v.issues, active, active2, macro }
}

step('parallel done')
// ---- 3. assignValue 后的事件less条件 ----
step('assign start')
{
  const xml = serializeToScxml(condDoc())
  const s = await newSession(xml)
  s.start()
  await sleep(0)
  const before = s.activeStateIds()
  ;(s as any).datamodel.assignValue('temp', 85)
  await sleep(5)
  const afterAssign = s.activeStateIds()
  s.send('update')
  await sleep(5)
  const afterUpdate = s.activeStateIds()
  s.dispose()
  results.assign = { before, afterAssign, afterUpdate }
}

step('assign done')
// ---- 4. CDATA / 自定义 JS ----
step('cdata start')
{
  const doc = baseDoc('script')
  doc.states[0].entryActions = ['const x = 1\nconsole.log(x)']
  const xml = serializeToScxml(doc)
  const hits = scanScriptActions(doc)
  const v = await validateScxml(xml, domParser)
  let createErr = ''
  try {
    const s = await newSession(xml)
    s.dispose()
  } catch (e: any) {
    createErr = e?.message ?? String(e)
  }
  results.cdata = { xmlFragment: xml.includes('CDATA'), hits: hits.length, validateOk: v.ok, message: v.message, createErr }
}

step('cdata done')
// ---- 5. 定时器泄漏 ----
step('leak start')
{
  const xml = serializeToScxml(baseDoc('leak'))
  const before = tickCount()
  for (let i = 0; i < 20; i++) {
    const s = await newSession(xml)
    s.start()
    await sleep(0)
    s.dispose()
  }
  await sleep(20)
  const afterDirect = tickCount()

  const runner = new SessionRunner({ domParser })
  const beforeRunner = tickCount()
  for (let i = 0; i < 5; i++) {
    await runner.start(xml)
    await sleep(0)
    await runner.stop()
  }
  await sleep(20)
  const afterRunner = tickCount()
  results.leak = { before, afterDirect, beforeRunner, afterRunner }
}

step('leak done')
// ---- 6. 延时转移 ----
step('delay start')
{
  const doc = baseDoc('delay')
  doc.states.push(state('s4', 'cooling'))
  doc.transitions.push({
    id: 'td',
    source: 's2',
    target: 's4',
    event: '',
    cond: '',
    actions: [],
    delayMs: 40,
    delayUnit: 'ms',
  })
  // 用引擎自己的自动事件名规则补齐事件名
  const { autoDelayEventName } = await import('../../scxml-creator/src/core/model.ts')
  doc.transitions[doc.transitions.length - 1].event = autoDelayEventName(doc, 's2', 's4', 40, 'ms')
  const xml = serializeToScxml(doc)
  const s = await newSession(xml)
  s.start()
  await sleep(0)
  s.send('start')
  await sleep(15)
  const during = s.activeStateIds()
  await sleep(60)
  const after = s.activeStateIds()
  s.dispose()
  results.delay = { during, after }
}

step('delay done')
console.log(JSON.stringify(results, null, 2))
process.exit(0)
