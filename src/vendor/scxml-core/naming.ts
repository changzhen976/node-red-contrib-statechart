// vendored from scxml-creator@6b5cfb6 (2026-11-01); do not edit
/**
 * 命名规则 v2（全量重写 g_ 体系）——服务端/前端/迁移共用的唯一权威源。
 *
 * | 类别            | 前缀  | 机制                                        |
 * | 全局变量        | gv_   | 跨机共享 datamodel（globals 注册表）          |
 * | 全局事件        | ge_   | send 即广播给所有运行中机器                   |
 * | 时钟事件        | t_    | 保留字：仅服务端时钟注入；用户 send/路由拒绝   |
 * | MQTT 通道事件   | mqe_  | 入向注入/出向发布的边界事件（建议级）          |
 * | MQTT 本地变量   | mqv_  | MQTT 写入的机器本地变量（必须绑机器）          |
 * | 系统事件        | sys.  | 保留字：sys.changed.<var> 变量变更通知        |
 * | 本机事件        | 无前缀| 自由（power.off 等）                         |
 *
 * v1 → v2 迁移映射（migrateDoc 与数据迁移脚本共用）：
 *   g_tick_*   → t_*
 *   g_changed.* → sys.changed.*
 *   事件上下文 g_* → ge_*（send 动作 / 转移 event 属性）
 *   变量上下文 g_* → gv_*（datamodel / assign / cond / log 等表达式）
 */
import { parseActionLine } from './action-parse'
import type { ProjectDoc } from './model'

export const P_GV = 'gv_'
export const P_GE = 'ge_'
export const P_T = 't_'
export const P_MQE = 'mqe_'
export const P_MQV = 'mqv_'
export const P_SYS = 'sys.'

export const isGlobalVar = (name: string): boolean => name.startsWith(P_GV)
export const isGlobalEvent = (name: string): boolean => name.startsWith(P_GE)
export const isClockEvent = (name: string): boolean => name.startsWith(P_T)
export const isSystemEvent = (name: string): boolean => name.startsWith(P_SYS)
/** 内部延迟转移事件（after 语义）：`delay<N>s|ms_<源>_to_<目标>`，工具自动生成——
 *  进入源状态 N（按单位）后触发该转移，离开源状态自动撤销；不可手输/路由/MQTT 规则 */
export const AUTO_DELAY_RE = /^delay\d+(s|ms)_.+/
export const isAutoDelayEvent = (name: string): boolean => AUTO_DELAY_RE.test(name)
/** v1 遗留：g_ 开头但不是新体系的 gv_/ge_ */
export const isLegacyGlobal = (name: string): boolean =>
  name.startsWith('g_') && !name.startsWith(P_GV) && !name.startsWith(P_GE)

/** 路由/出向规则禁止的事件前缀：由广播/时钟/系统投递，规则匹配不到或会双投递 */
export function reservedRouteEvent(name: string): boolean {
  return (
    isGlobalEvent(name) ||
    isClockEvent(name) ||
    isSystemEvent(name) ||
    isLegacyGlobal(name) ||
    isAutoDelayEvent(name)
  )
}

// ── v1 → v2 迁移映射 ──────────────────────────────────────────

/** 事件名迁移：g_tick_*→t_*；g_changed.*→sys.changed.*；其余 g_*→ge_* */
export function migrateEventName(name: string): string {
  const tick = name.match(/^g_tick_(.+)$/)
  if (tick) return `t_${tick[1]}`
  if (name.startsWith('g_changed.')) return `${P_SYS}changed.${name.slice('g_changed.'.length)}`
  if (isLegacyGlobal(name)) return P_GE + name.slice(2)
  return name
}

/** 变量名迁移：g_* → gv_* */
export function migrateVarName(name: string): string {
  return isLegacyGlobal(name) ? P_GV + name.slice(2) : name
}

/** JS 表达式（cond/log/data-expr/script）中的变量引用重写：g_x → gv_x */
export function migrateExpr(expr: string): string {
  return expr.replace(/(?<![A-Za-z0-9_.])g_([A-Za-z_])/g, 'gv_$1')
}

/** 动作 DSL 行迁移（只做定点手术，保留其余字节）：send 事件 / assign 变量 / 表达式内容 */
export function migrateActionLine(line: string): string {
  const a = parseActionLine(line)
  if (a.type === 'send') {
    let out = line
    const ev = migrateEventName(a.event)
    if (ev !== a.event) out = out.replace(/^send\s+\S+/, `send ${ev}`)
    if (a.dataExpr) {
      const patched = migrateExpr(a.dataExpr)
      if (patched !== a.dataExpr && out.includes(a.dataExpr)) out = out.replace(a.dataExpr, patched)
    }
    return out
  }
  if (a.type === 'assign') {
    return line.replace(
      /^(assign\s+)([\p{L}_$][\p{L}\p{N}_$]*)(\s*=\s*)([\s\S]+)$/u,
      (_m, head: string, target: string, eq: string, expr: string) =>
        `${head}${migrateVarName(target)}${eq}${migrateExpr(expr)}`,
    )
  }
  if (a.type === 'log') {
    return line.replace(/^log\s+([\s\S]+)$/, (_m, expr: string) => `log ${migrateExpr(expr)}`)
  }
  if (a.type === 'script') {
    return migrateExpr(line)
  }
  return line
}

export interface MigrateResult {
  doc: ProjectDoc
  /** 实际发生改写的字段数（报告用） */
  changes: number
}

/** 工程文档结构化迁移（draft 与 deployed.docSnapshot 共用；不改动 uid/layout） */
export function migrateDoc(input: ProjectDoc): MigrateResult {
  const doc: ProjectDoc = structuredClone(input)
  let changes = 0
  const bump = <T>(before: T, after: T): T => {
    if (after !== before) changes++
    return after
  }
  doc.datamodel = doc.datamodel.map((d) => ({
    id: bump(d.id, migrateVarName(d.id)),
    expr: bump(d.expr, migrateExpr(d.expr)),
  }))
  for (const s of doc.states) {
    s.entryActions = s.entryActions.map((l) => bump(l, migrateActionLine(l)))
    s.exitActions = s.exitActions.map((l) => bump(l, migrateActionLine(l)))
  }
  for (const t of doc.transitions) {
    t.event = bump(t.event, migrateEventName(t.event))
    t.cond = bump(t.cond, migrateExpr(t.cond))
    t.actions = t.actions.map((l) => bump(l, migrateActionLine(l)))
  }
  return { doc, changes }
}

// ── 新增输入校验（保留字阻断 + 规范提示） ─────────────────────

export interface NamingIssue {
  level: 'block' | 'warn'
  message: string
}

/** 事件名校验：保留字阻断；mqe_/ge_/无前缀合法。
 *  doc：转移响应内部延迟事件需要引用 delay<N>ms_ 自动名——传入文档后，**已被某转移
 *  以 delayMs 引用的自动名放行**（下拉可选），凭空手输的新 delay 名仍拦截。
 *  MQTT 规则等场景不传 doc（自动名一律拦截）。 */
export function checkEventName(name: string, doc?: ProjectDoc): NamingIssue | null {
  if (isSystemEvent(name)) {
    return { level: 'block', message: 'sys. 为系统保留前缀（sys.changed.*），事件不可使用' }
  }
  if (isAutoDelayEvent(name)) {
    const exists = !!doc?.transitions.some((t) => t.delayMs !== undefined && t.event === name)
    if (!exists) {
      return {
        level: 'block',
        message: 'delay…ms_ 为内部延迟转移事件（创建转移时勾选「内部延迟事件」自动生成），不能手动命名',
      }
    }
    return null
  }
  if (isClockEvent(name)) {
    return { level: 'block', message: 't_ 为时钟保留前缀（仅服务端注入），不可手动 send 或命名事件' }
  }
  if (isLegacyGlobal(name)) {
    return { level: 'block', message: 'g_ 前缀已废弃：全局事件请用 ge_，普通事件请去掉前缀' }
  }
  if (name.startsWith(P_GV)) {
    return { level: 'block', message: 'gv_ 为全局变量前缀，事件请用 ge_ 或无前缀' }
  }
  if (name.startsWith(P_MQV)) {
    return { level: 'block', message: 'mqv_ 为 MQTT 本地变量前缀，事件请用 mqe_' }
  }
  return null
}

/** 变量名校验：保留字阻断；gv_ 全局、mqv_ 提示须绑机器、无前缀本地 */
export function checkVarName(name: string): NamingIssue | null {
  if (isSystemEvent(name)) {
    return { level: 'block', message: 'sys. 为系统保留前缀，变量不可使用' }
  }
  if (isClockEvent(name)) {
    return { level: 'block', message: 't_ 为时钟保留前缀，变量不可使用' }
  }
  if (name.startsWith(P_GE) || name.startsWith(P_MQE)) {
    return { level: 'block', message: 'ge_/mqe_ 为事件前缀，变量请用 gv_ 或无前缀' }
  }
  if (isLegacyGlobal(name)) {
    return { level: 'block', message: 'g_ 前缀已废弃：全局变量请用 gv_' }
  }
  if (name.startsWith(P_MQV)) {
    return { level: 'warn', message: 'mqv_ 表示 MQTT 写入的本地变量，规则中必须绑定机器' }
  }
  return null
}

/** 部署/保存闸门：返回第一条违规描述；null = 合规（监听 t_/sys. 事件合法，send 才禁止） */
export function checkDocNaming(doc: ProjectDoc): string | null {
  for (const d of doc.datamodel) {
    const issue = checkVarName(d.id)
    if (issue?.level === 'block') return `datamodel 变量「${d.id}」：${issue.message}`
  }
  const scan = (label: string, actions: string[]): string | null => {
    for (const line of actions) {
      const a = parseActionLine(line)
      if (a.type === 'send') {
        if (isClockEvent(a.event)) {
          return `${label} send「${a.event}」：t_ 为时钟保留前缀，服务端自动注入，不可手动发送`
        }
        if (isSystemEvent(a.event)) {
          return `${label} send「${a.event}」：sys. 为系统保留前缀，不可手动发送`
        }
        if (isLegacyGlobal(a.event)) {
          return `${label} send「${a.event}」：g_ 前缀已废弃，全局事件请改用 ge_`
        }
      }
      if (a.type === 'assign' && isLegacyGlobal(a.target)) {
        return `${label} assign「${a.target}」：g_ 前缀已废弃，全局变量请改用 gv_`
      }
    }
    return null
  }
  for (const s of doc.states) {
    const label = `状态「${s.label || s.id}」`
    const e1 = scan(`${label} entry`, s.entryActions)
    if (e1) return e1
    const e2 = scan(`${label} exit`, s.exitActions)
    if (e2) return e2
  }
  for (const t of doc.transitions) {
    if (isLegacyGlobal(t.event)) {
      return `转移事件「${t.event}」使用已废弃的 g_ 前缀：全局事件请改用 ge_`
    }
    const e = scan(`转移（事件 ${t.event || '无'}）`, t.actions)
    if (e) return e
  }
  return null
}
