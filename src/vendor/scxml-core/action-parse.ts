// vendored from scxml-creator@6b5cfb6 (2026-11-01); do not edit
/**
 * 动作行解析/生成：结构化动作编辑器（B1 混合式）与 DSL 字符串的双向桥。
 *
 * 识别规则与 serializer.actionLineToScxml **同源**，保证
 * `actionToLine(parseActionLine(line)) === line` 的往返一致性：
 *   send <event> [delay <T>] [id <X>] [data <JSON> | data-expr <JS表达式>]
 *                                        → { type:'send' }
 *     data      → <send><content>JSON</content></send>（静态数据）
 *     data-expr → <send><content expr="表达式"/></send>（可发送变量当前值）
 *   cancel <sendid>                     → { type:'cancel' }
 *   assign <var> = <JS 表达式>           → { type:'assign' }（变量仅标识符）
 *   log <JS 表达式>                      → { type:'log' }
 *   其它                                 → { type:'script' }（JS 兜底，原文保留）
 *
 * 存储格式仍为 string[]（每行一条），本项目数据模型/序列化器零改动。
 */

export type ActionStruct =
  | { type: 'send'; event: string; delay?: string; id?: string; data?: unknown; dataExpr?: string }
  | { type: 'cancel'; sendid: string }
  | { type: 'assign'; target: string; expr: string }
  | { type: 'log'; expr: string }
  | { type: 'script'; code: string }

const RE_SEND =
  /^send\s+(\S+)(?:\s+delay\s+(\S+))?(?:\s+id\s+(\S+))?(?:\s+(data-expr|data)\s+([\s\S]+))?\s*$/
const RE_CANCEL = /^cancel\s+(\S+)\s*$/
// 变量名支持 Unicode 字母（引擎的 ECMAScript datamodel 允许中文变量，如 温度）
const RE_ASSIGN = /^assign\s+([\p{L}_$][\p{L}\p{N}_$]*)\s*=\s*([\s\S]+)$/u
const RE_LOG = /^log\s+([\s\S]+)$/

/** DSL 行 → 结构；无法识别的行返回 script（原文保留） */
export function parseActionLine(line: string): ActionStruct {
  const t = line.trim()
  let m: RegExpMatchArray | null
  if ((m = t.match(RE_SEND))) {
    const a: ActionStruct = { type: 'send', event: m[1] }
    if (m[2]) a.delay = m[2]
    if (m[3]) a.id = m[3]
    if (m[4] === 'data-expr') {
      a.dataExpr = m[5].trim()
    } else if (m[5] !== undefined) {
      // data <JSON>：解析失败时保留原始字符串（引擎侧按字符串数据处理）
      try {
        a.data = JSON.parse(m[5])
      } catch {
        a.data = m[5]
      }
    }
    return a
  }
  if ((m = t.match(RE_CANCEL))) return { type: 'cancel', sendid: m[1] }
  if ((m = t.match(RE_ASSIGN))) return { type: 'assign', target: m[1], expr: m[2].trim() }
  if ((m = t.match(RE_LOG))) return { type: 'log', expr: m[1].trim() }
  return { type: 'script', code: t }
}

/** 结构 → DSL 行（可被 actionLineToScxml 原样识别） */
export function actionToLine(a: ActionStruct): string {
  switch (a.type) {
    case 'send': {
      let s = `send ${a.event}`
      if (a.delay) s += ` delay ${a.delay}`
      if (a.id) s += ` id ${a.id}`
      if (a.dataExpr !== undefined) s += ` data-expr ${a.dataExpr}`
      else if (a.data !== undefined) s += ` data ${JSON.stringify(a.data)}`
      return s
    }
    case 'cancel':
      return `cancel ${a.sendid}`
    case 'assign':
      return `assign ${a.target} = ${a.expr}`
    case 'log':
      return `log ${a.expr}`
    case 'script':
      return a.code
  }
}

/** 动作类型清单（编辑器"添加动作"用；send 分立即/延时两个快捷入口） */
export const ACTION_KINDS: {
  type: ActionStruct['type']
  label: string
  /** 快捷添加时的初始结构；缺省用 ActionListEditor 的 defaults */
  template?: ActionStruct
}[] = [
  { type: 'send', label: '发送事件', template: { type: 'send', event: '事件名' } },
  {
    type: 'send',
    label: '延时发送',
    template: { type: 'send', event: '事件名', delay: '1s', id: '定时器' },
  },
  { type: 'cancel', label: '撤销事件' },
  { type: 'assign', label: '赋值' },
  { type: 'log', label: '日志' },
  { type: 'script', label: '自定义 JS' },
]

import type { ProjectDoc } from './model'

/** script 动作命中记录（服务端部署受限：happy-dom 解析 script CDATA 会失败） */
export interface ScriptActionHit {
  /** 状态的 SCXML id */
  stateId: string
  stateLabel: string
  stateUid: string
  slot: 'entry' | 'exit' | 'transition'
  /** 转移动作时的转移事件名（entry/exit 无） */
  event?: string
  /** 动作序号（1 起） */
  index: number
  line: string
}

/**
 * 扫描文档中所有"自定义 JS"动作（将生成 script CDATA 的行）。
 * - 服务端部署闸门：P0 部署流程调用本函数，非空即拒绝并逐条列出；
 * - 浏览器本地运行不受影响（浏览器 DOMParser 可正常解析 CDATA）。
 */
export function scanScriptActions(doc: ProjectDoc): ScriptActionHit[] {
  const hits: ScriptActionHit[] = []
  const scan = (
    s: { uid: string; id: string; label: string },
    slot: ScriptActionHit['slot'],
    lines: string[],
    event?: string,
  ): void => {
    lines.forEach((line, i) => {
      const a = parseActionLine(line)
      // 空白行忽略；非空白且识别为 script → 命中
      if (a.type === 'script' && a.code.trim()) {
        hits.push({
          stateId: s.id,
          stateLabel: s.label || s.id,
          stateUid: s.uid,
          slot,
          event,
          index: i + 1,
          line: a.code,
        })
      }
    })
  }
  for (const s of doc.states) {
    scan(s, 'entry', s.entryActions)
    scan(s, 'exit', s.exitActions)
  }
  for (const t of doc.transitions) {
    const src = doc.states.find((x) => x.uid === t.source)
    if (src) scan(src, 'transition', t.actions, t.event || '(无事件)')
  }
  return hits
}

/** 某状态的 entry 动作里，是否存在对指定事件的延时发送（计时器来源提示用） */
export function findDelayedSend(
  entryActions: string[],
  eventName: string,
): { delay: string } | null {
  for (const line of entryActions) {
    const a = parseActionLine(line)
    if (a.type === 'send' && a.delay && a.event === eventName) return { delay: a.delay }
  }
  return null
}
