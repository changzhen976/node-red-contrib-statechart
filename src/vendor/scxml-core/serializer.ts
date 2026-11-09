// vendored from scxml-creator@6b5cfb6 (2026-11-01); do not edit
/**
 * SCXML 序列化器：文档模型 → SCXML 1.0 文本。
 *
 * 动作 DSL（entry/exit/transition 的每一行）：
 *   send <event> [delay <时间>] [id <sendid>] [data <JSON> | data-expr <JS表达式>]
 *                                                → <send .../>（延时事件 = SCXML 的 after(x) 时间逻辑；
 *                                                  data-expr 发送变量当前值）
 *   cancel <sendid>                             → <cancel sendid="..."/>
 *   assign <变量> = <JS 表达式>                  → <assign location expr/>
 *   log <JS 表达式>                             → <log expr/>
 *   其它任何文本                                 → <script><![CDATA[...]]></script>
 *
 * 说明：选择"逐行小 DSL + JS 兜底"而不是纯 <script>，是因为延时发送（send delay）
 * 无法用普通 JS 表达，而它正是 Stateflow 中 after(n, sec) 的标准等价物。
 */
import type { ProjectDoc, StateNode, TransitionEdge } from './model'
import { childrenOf, uidMap } from './model'

/** XML 属性值转义 */
const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** JS 代码包进 CDATA；处理源码中可能出现 "]]>" 的情况 */
const cdata = (js: string) => `<![CDATA[${js.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`

/** 单行动作 → SCXML 可执行内容（返回 null 表示该行为空/注释） */
export function actionLineToScxml(line: string): string | null {
  const t = line.trim()
  if (!t || t.startsWith('//')) return null

  let m: RegExpMatchArray | null
  // send <event> [delay <T>] [id <sendid>] [data <JSON> | data-expr <JS表达式>]
  //   data → <send><content>JSON</content></send>（引擎按 B.2 将 JSON 解析为事件 data）
  //   data-expr → <send><content expr="..."/></send>（发送变量当前值）
  if ((m = t.match(/^send\s+(\S+)(?:\s+delay\s+(\S+))?(?:\s+id\s+(\S+))?(?:\s+(data-expr|data)\s+([\s\S]+))?\s*$/))) {
    const attrs = [`event="${esc(m[1])}"`]
    if (m[2]) attrs.push(`delay="${esc(m[2])}"`)
    if (m[3]) attrs.push(`id="${esc(m[3])}"`)
    if (m[4] === 'data-expr') {
      return `<send ${attrs.join(' ')}><content expr="${esc(m[5].trim())}"/></send>`
    }
    if (m[5] !== undefined) {
      // content 为文本节点：esc 转义 &<>（引号在文本内容中合法）
      return `<send ${attrs.join(' ')}><content>${esc(m[5])}</content></send>`
    }
    return `<send ${attrs.join(' ')}/>`
  }
  // cancel <sendid>
  if ((m = t.match(/^cancel\s+(\S+)\s*$/))) {
    return `<cancel sendid="${esc(m[1])}"/>`
  }
  // assign <var> = <expr>（右侧整体为 JS 表达式；变量支持 Unicode 字母/下划线）
  if ((m = t.match(/^assign\s+([\p{L}_$][\p{L}\p{N}_$]*)\s*=\s*(.+)$/u))) {
    return `<assign location="${esc(m[1])}" expr="${esc(m[2].trim())}"/>`
  }
  // log <expr>
  if ((m = t.match(/^log\s+(.+)$/))) {
    return `<log label="log" expr="${esc(m[1].trim())}"/>`
  }
  // 兜底：整行当作 JS
  return `<script>${cdata(t)}</script>`
}

/** 动作数组 → 缩进的可执行内容块；空数组返回空串 */
function actionsBlock(actions: string[], pad: string): string {
  const lines = actions
    .map(actionLineToScxml)
    .filter((x): x is string => x !== null)
    .map((x) => `${pad}${x}`)
  return lines.length ? `\n${lines.join('\n')}` : ''
}

function transitionXml(t: TransitionEdge, idOf: (uid: string) => string, pad: string): string {
  const attrs: string[] = []
  if (t.event) attrs.push(`event="${esc(t.event)}"`)
  attrs.push(`target="${esc(idOf(t.target))}"`)
  if (t.cond) attrs.push(`cond="${esc(t.cond)}"`)
  const open = `${pad}<transition ${attrs.join(' ')}`
  const body = actionsBlock(t.actions, pad + '  ')
  return body ? `${open}>${body}\n${pad}</transition>` : `${open}/>`
}

function stateToScxml(doc: ProjectDoc, s: StateNode, idOf: (uid: string) => string, pad: string): string {
  // 标签映射：atomic/compound→<state>，final→<final>，parallel→<parallel>，history→<history>
  const tag = s.kind === 'final' ? 'final' : s.kind === 'parallel' ? 'parallel' : s.kind === 'history' ? 'history' : 'state'
  const attrs = [`id="${esc(s.id)}"`]
  // 历史伪态：type 属性（shallow 默认）
  if (s.kind === 'history') attrs.push(`type="${s.historyType ?? 'shallow'}"`)
  // 组合状态写出 initial（历史伪态不能作 initial；parallel 没有 initial 语义）
  const kids = childrenOf(doc, s.uid)
  if (s.kind === 'compound') {
    const iniKids = kids.filter((k) => k.kind !== 'history')
    if (iniKids.length) {
      const ini = s.initial && iniKids.some((k) => k.uid === s.initial) ? s.initial : iniKids[0].uid
      attrs.push(`initial="${esc(idOf(ini))}"`)
    }
  }
  const open = `${pad}<${tag} ${attrs.join(' ')}`
  const parts: string[] = []
  // history 伪态无 onentry/onexit（store 已阻止编辑，此处双保险跳过）
  const isPseudo = s.kind === 'history'
  // 内部延迟转移（after 语义）：带 delayMs 的出边 → entry 自动先 cancel 再 send（重入防御：同名 sendid 先撤旧再挂新），exit 自动 cancel——doc 不存展开行
  const delayEdges = isPseudo ? [] : doc.transitions.filter((t) => t.source === s.uid && t.delayMs !== undefined && t.event)
  const delayCancels = delayEdges.map((t) => `cancel ${t.event}`)
  const delaySends = delayEdges.map((t) => {
    // delay 属性值按 delayUnit 格式化（s 整秒显示 Ns，与自动事件名一致）
    const dm = t.delayMs ?? 0
    const v = t.delayUnit === 's' && dm % 1000 === 0 ? `${dm / 1000}s` : `${dm}ms`
    return `send ${t.event} delay ${v} id ${t.event}`
  })
  const entryAll = [...delayCancels, ...delaySends, ...s.entryActions]
  const exitAll = [...delayCancels, ...s.exitActions]
  if (!isPseudo && entryAll.length) {
    parts.push(`${pad}  <onentry>${actionsBlock(entryAll, pad + '    ')}\n${pad}  </onentry>`)
  }
  if (!isPseudo && exitAll.length) {
    parts.push(`${pad}  <onexit>${actionsBlock(exitAll, pad + '    ')}\n${pad}  </onexit>`)
  }
  for (const c of kids) parts.push(stateToScxml(doc, c, idOf, pad + '  '))
  // history 的出边即其"默认转移"（SCXML 规定写在 <history> 元素内部），此处逻辑天然正确
  for (const t of doc.transitions.filter((x) => x.source === s.uid)) {
    parts.push(transitionXml(t, idOf, pad + '  '))
  }
  return parts.length ? `${open}>\n${parts.join('\n')}\n${pad}</${tag}>` : `${open}/>`
}

/** 文档模型 → SCXML 文本 */
export function serializeToScxml(doc: ProjectDoc): string {
  const map = uidMap(doc)
  const idOf = (uid: string) => map.get(uid)?.id ?? uid

  const top = childrenOf(doc, null)
  const initial = doc.initial && top.some((s) => s.uid === doc.initial) ? doc.initial : top[0]?.uid
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n`
  const open =
    `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" ` +
    `datamodel="ecmascript" name="${esc(doc.name)}"${initial ? ` initial="${esc(idOf(initial))}"` : ''}`
  const parts: string[] = []

  if (doc.datamodel.length) {
    const dataLines = doc.datamodel
      .map((d) => `    <data id="${esc(d.id)}"${d.expr ? ` expr="${esc(d.expr)}"` : ''}/>`)
      .join('\n')
    parts.push(`  <datamodel>\n${dataLines}\n  </datamodel>`)
  }
  for (const s of top) parts.push(stateToScxml(doc, s, idOf, '  '))

  return parts.length ? `${head}${open}>\n${parts.join('\n')}\n</scxml>\n` : `${head}${open}/>\n`
}

/** 调试用：把当前文档的 SCXML 打到控制台 */
export function logScxml(doc: ProjectDoc): void {
  console.log(serializeToScxml(doc))
}
