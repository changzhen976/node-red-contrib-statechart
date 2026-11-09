// vendored from scxml-creator@6b5cfb6 (2026-11-01); do not edit
/**
 * 文档模型（Document Model）
 *
 * 这是整个应用的"唯一事实源"：侧栏编辑面板、SCXML 序列化器都只读写它；
 * 中栏主视图是官方 <scxml-view> 对序列化结果的实时镜像（渲染与编辑分离，
 * 见 docs/decisions.md D8）。
 *
 * 关键设计（详见 docs/decisions.md）：
 * - D3 布局完全交给官方自动布局，模型不存坐标（layout 字段仅为未来预留）。
 * - D4 状态用"扁平数组 + parent 引用"而非树形嵌套：表单式"父状态"下拉重新嵌套、
 *   级联删除、序列化时用 childrenOf() 重建层级，都比树形结构直接。
 * - D5 全部内部引用（parent/initial/transition 端点）使用稳定键 uid，
 *   SCXML id 只是可编辑的序列化字段 —— 改 id 无需级联改任何引用；
 *   uid 同时充当 v-for key 与选中态标识。
 */

/**
 * 状态种类：原子状态 / 组合状态（可嵌套容器）/ 终态
 * —— v2 新增：并行状态（parallel，子状态=并行 region）/ 历史伪态（history）
 */
export type StateKind = 'atomic' | 'compound' | 'final' | 'parallel' | 'history'

/** 内部稳定键（画布 cell id、布局键、引用键） */
let uidSeq = 1
export function newUid(prefix = 's'): string {
  return `${prefix}${uidSeq++}`
}

/** <data id="x" expr="0"/> —— 数据模型变量 */
export interface DataVar {
  id: string
  expr: string
}

/** 状态节点 */
/** 内部延迟转移事件的延时（after 语义）：挂在转移上——
 *  进入源状态后 N ms 触发该转移（若仍在源状态）；离开源状态时自动撤销。
 *  序列化时由源状态 entry 注入 `send <自动事件名> delay Nms id <同事件名>`
 *  + exit 注入 `cancel sendid=<同事件名>`，doc 的 entry/exit 不存展开行。
 *  自动事件名：`delay<N>ms_<源id>_to_<目标id>`（读名即义：延时多久、从哪到哪）。 */

export interface StateNode {
  /** 内部稳定键，创建后不变 */
  uid: string
  /** SCXML id（NCName：字母/下划线开头；唯一性由 store 在编辑时校验） */
  id: string
  /** 显示名（仅 UI；SCXML 里以 id 标识） */
  label: string
  kind: StateKind
  /** 父状态 uid；null = 顶层（history 伪态必须有父，见 store 约束） */
  parent: string | null
  /** 组合状态的初始子状态 uid（parallel 无 initial；history 无 initial） */
  initial?: string | null
  /** 历史伪态类型：<history type="shallow|deep">，仅 kind==='history' 时有效 */
  historyType?: 'shallow' | 'deep'
  /** 进入动作（动作 DSL / JS，见 serializer.ts 头注释）；history 伪态无动作 */
  entryActions: string[]
  /** 退出动作；history 伪态无动作 */
  exitActions: string[]
}

/** 内部延迟转移事件的延时（after 语义）：挂在转移上——
 *  进入源状态后 N ms 触发该转移（若仍在源状态）；离开源状态时自动撤销。
 *  序列化时由源状态 entry 注入 `send <自动事件名> delay Nms id <同事件名>`
 *  + exit 注入 `cancel sendid=<同事件名>`，doc 的 entry/exit 不存展开行。
 *  自动事件名：`delay<N>ms_<源id>_to_<目标id>`（读名即义：延时多久、从哪到哪）。 */
export interface TransitionEdge {
  /** 内部唯一 id（不进入 SCXML） */
  id: string
  /** 源状态 uid */
  source: string
  /** 目标状态 uid */
  target: string
  /**
   * 事件名。内部延迟转移（delayMs 存在）由工具自动生成：
   * `delay<N><单位>_<源id>_to_<目标id>`（读名即义：进入源状态 N 后触发）。
   * 离开源状态时自动撤销（serializer 注入 entry send / exit cancel）。
   * delayMs 存在时**不可手改**（属性面板置灰），改延时/状态 id 自动级联改名。
   */
  event: string
  /** 条件表达式（JS，可空） */
  cond: string
  /** 动作列表 */
  actions: string[]
  /**
   * 内部延迟转移事件延时 ms：进入源状态后 N ms 触发本转移（若仍在源状态）；
   * 离开源状态时自动撤销。存在时 event 为自动名（delay<N>...），不可手改。
   */
  delayMs?: number
  /**
   * 延时显示单位（'s' 默认 | 'ms'）：继承创建时的选择，仅影响自动名格式
   * （如 delay5s_… / delay5000ms_…），实际延时以 delayMs 为准。
   */
  delayUnit?: 's' | 'ms'
  /** 连线折点（预留：若未来恢复直接操控画布再启用；当前序列化不写出） */
  vertices?: { x: number; y: number }[]
}

/** 工程文档：保存/加载/序列化的完整单元 */
export interface ProjectDoc {
  formatVersion: 1
  name: string
  /** 根级初始状态 uid；null 时序列化取第一个顶层状态 */
  initial: string | null
  datamodel: DataVar[]
  states: StateNode[]
  transitions: TransitionEdge[]
  /** 布局（画布绝对坐标），键为状态 uid */
  layout: Record<string, { x: number; y: number; w?: number; h?: number }>
}

/** 合法 SCXML id（NCName 简化版） */
export const ID_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/

let edgeSeq = 1
/** 内部转移 id */
export function newTransitionId(): string {
  return `t${edgeSeq++}_${Math.random().toString(36).slice(2, 6)}`
}

/** 生成不与现有 SCXML id 冲突的候选 id（state / state2 / state3 …） */
export function uniqueStateId(doc: ProjectDoc, base = 'state'): string {
  const ids = new Set(doc.states.map((s) => s.id))
  if (!ids.has(base)) return base
  let i = 2
  while (ids.has(`${base}${i}`)) i++
  return `${base}${i}`
}

/**
 * 把模块级 uid 计数器推进到文档中已有 uid 之后。
 *
 * uidSeq 是模块级变量，刷新页面、Vite HMR 重载模块、导入旧工程后都会回到 1；
 * 不同步就会与存档里已有的 s1、s2… 重号。uid 是 parent/initial/转移端点的
 * 引用键（D5），重号会让序列化把老状态的连线解析到新状态上，表现为绘图错乱。
 */
export function syncUidSeq(doc: ProjectDoc): void {
  let max = 0
  for (const s of doc.states) {
    const m = /(\d+)$/.exec(s.uid ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  if (max >= uidSeq) uidSeq = max + 1
}

/** uid → StateNode 索引（每次调用新建，量级小无需缓存） */
export function uidMap(doc: ProjectDoc): Map<string, StateNode> {
  return new Map(doc.states.map((s) => [s.uid, s]))
}

/** 某状态的直接子状态（保持文档顺序） */
export function childrenOf(doc: ProjectDoc, parentUid: string | null): StateNode[] {
  return doc.states.filter((s) => s.parent === parentUid)
}

/** 某状态的全部后代 uid（含子孙），用于级联删除/环检测 */
export function descendantsOf(doc: ProjectDoc, uid: string): Set<string> {
  const out = new Set<string>()
  const walk = (pid: string) => {
    for (const s of doc.states) {
      if (s.parent === pid && !out.has(s.uid)) {
        out.add(s.uid)
        walk(s.uid)
      }
    }
  }
  walk(uid)
  return out
}

/** 新建空白工程 */
export function emptyDoc(name = 'untitled'): ProjectDoc {
  return {
    formatVersion: 1,
    name,
    initial: null,
    datamodel: [],
    states: [],
    transitions: [],
    layout: {},
  }
}

/**
 * 兼容旧存档：确保每个状态都有 uid / 动作数组等字段，并修复历史重号。
 * - 先同步 uid 计数器，避免刷新/导入后 newUid 与存档已有 uid 重号；
 * - 已发生的重复 uid（旧版本 bug 写坏的存档）保留数组里第一个，后续重新分配。
 *   引用键仍指向第一个状态，因此老状态的连线/initial 不会被改到新状态上。
 */
export function normalizeDoc(doc: ProjectDoc): ProjectDoc {
  syncUidSeq(doc)
  const original = new Set(doc.states.map((s) => s.uid).filter(Boolean))
  const seen = new Set<string>()
  for (const s of doc.states) {
    if (!s.uid || seen.has(s.uid)) {
      let uid = newUid()
      while (original.has(uid) || seen.has(uid)) uid = newUid()
      s.uid = uid
    }
    seen.add(s.uid)
    s.entryActions ??= []
    s.exitActions ??= []
  }
  for (const t of doc.transitions) {
    t.actions ??= []
    t.event ??= ''
    t.cond ??= ''
    // 内部延迟转移容错：延时非法（<10ms / 非数值）时移除，退化为普通转移
    if (t.delayMs !== undefined && (!Number.isFinite(t.delayMs) || t.delayMs < 10)) delete t.delayMs
  }
  return doc
}

/**
 * 生成内部延迟转移事件名：`delay<N><单位>_<源id>_to_<目标id>`
 * （读名即义：进入源状态 N（按单位显示 s/ms）后触发，离开源状态自动撤销）。
 * 同源同目标同延时同单位有冲突时追加序号（`_2`/`_3`…）。与全文档已有定时器名、
 * 转移事件、动作 send 事件均不冲突（NCName 允许中文）。
 * excludeEvent：改名场景排除自身当前事件名（否则自己占用自己的新名，永远加后缀）。
 */
export function autoDelayEventName(
  doc: ProjectDoc,
  sourceId: string,
  targetId: string,
  delayMs: number,
  unit: 's' | 'ms' = 's',
  excludeEvent?: string,
): string {
  const taken = new Set<string>()
  for (const t of doc.transitions) {
    if (t.event && t.event !== excludeEvent) taken.add(t.event)
  }
  // 单位 s 且整秒 → `Ns`；非整秒回落 ms（避免 0.8s 这类小数不直观）
  const n = unit === 's' && delayMs % 1000 === 0 ? `${delayMs / 1000}s` : `${delayMs}ms`
  const base = `delay${n}_${sourceId}_to_${targetId}`
  if (!taken.has(base)) return base
  let k = 2
  while (taken.has(`${base}_${k}`)) k++
  return `${base}_${k}`
}
