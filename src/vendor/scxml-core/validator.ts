// vendored from scxml-creator@6b5cfb6 (2026-11-01); do not edit
/**
 * SCXML 校验器：把序列化产物交给 scxmljs 引擎干跑（parse + compile），
 * 在真正启动会话前发现语法/结构错误。
 *
 * 注意：parseSCXML / compile 从 `@tinyactors/scxmljs/trusted` 入口导出
 * （官方 custom-ui.md 的用法），compile 是纯编译，不执行图表 JS。
 *
 * 校验结果弹窗（validation-dialog-plan）：失败时保留 problems 逐条
 * （issues）与序列化产物（source，供 XML 片段展示），不再只有拼接 message。
 */
import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'
import type { ProjectDoc } from './model'
import type { ScriptActionHit } from './action-parse'

/** 单条校验问题（弹窗逐条展示 + 尽量定位到文档对象） */
export interface ValidationIssue {
  message: string
  /** 定位类别：状态 / 转移 / 自定义 JS / XML 解析 / 通用 */
  kind: 'state' | 'transition' | 'script' | 'xml' | 'generic'
  /** 状态 SCXML id（映射 doc.states） */
  stateId?: string
  /** 转移事件名（配合 stateId 定位转移行） */
  event?: string
  /** 动作槽位（SCRIPT_ACTIONS） */
  slot?: 'entry' | 'exit' | 'transition'
  /** 动作行号（1 起） */
  actionIndex?: number
  /** XML 解析错误的行/列（1 起） */
  line?: number
  column?: number
}

export interface ValidationResult {
  ok: boolean
  message: string
  /** 逐条问题（失败时由 problems/解析错误提取） */
  issues?: ValidationIssue[]
  /** 失败时保留序列化产物，供 XML 片段展示（成功时不保留） */
  source?: string
}

/**
 * 校验 SCXML 文本；成功返回 ok=true，失败携带可读错误信息与逐条 issues。
 * domParser：Node 环境必须注入（happy-dom / linkedom）；浏览器可省略（全局 DOMParser）。
 */
export async function validateScxml(
  source: string,
  domParser?: DOMParserLike,
): Promise<ValidationResult> {
  try {
    // Node 22.9 cannot require() this ESM entry from CJS; load it lazily.
    const { parseSCXML, compile } = await import('@tinyactors/scxmljs/trusted')
    const parsed = parseSCXML(source, domParser)
    await compile(parsed)
    return { ok: true, message: '校验通过：SCXML 语法与结构正确' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const issues = issuesFromError(err, source)
    return { ok: false, message: `校验失败：${msg}`, issues, source }
  }
}

/**
 * 从引擎错误提取逐条 issues：
 * - SCXMLValidationError.problems[]（compile 结构错误）→ 逐条 + 正则定位；
 * - SCXMLParseError / message 含 "line N at column M" → xml 类（弹窗展示源码片段）；
 * - 兜底：整条 message 作为 generic 单条。
 */
export function issuesFromError(err: unknown, _source: string): ValidationIssue[] {
  const e = err as { name?: string; message?: string; problems?: unknown } | null
  const problems = Array.isArray(e?.problems) ? (e!.problems as unknown[]) : null
  if (problems && problems.length) {
    return problems.map((p) => {
      const message = typeof p === 'string' ? p : JSON.stringify(p)
      const issue: ValidationIssue = { message, kind: 'generic' }
      const m = message.match(/line (\d+)(?: at column (\d+))?/i)
      if (m) {
        issue.kind = 'xml'
        issue.line = Number(m[1])
        if (m[2]) issue.column = Number(m[2])
      }
      return issue
    })
  }
  const message = e?.message ?? String(err)
  const m = message.match(/line (\d+)(?: at column (\d+))?/i)
  if (m) {
    return [{ message, kind: 'xml', line: Number(m[1]), ...(m[2] ? { column: Number(m[2]) } : {}) }]
  }
  return [{ message, kind: 'generic' }]
}

/**
 * script 命中（scanScriptActions）→ 弹窗 issues（状态 + entry/exit/转移 + 第 N 行）。
 * 唯一实现——store 校验弹窗与 service 部署闸门共用，勿再内联复制。
 */
export function scriptHitsToIssues(hits: ScriptActionHit[]): ValidationIssue[] {
  return hits.map((h) => ({
    message: `自定义 JS（${h.slot === 'transition' ? `转移 ${h.event ?? ''}` : h.slot === 'entry' ? 'entry' : 'exit'} 第 ${h.index} 行）：${h.line}`,
    kind: 'script',
    stateId: h.stateId,
    slot: h.slot,
    actionIndex: h.index,
  }))
}

/**
 * 用文档对象给 issues 补定位（状态 id / 转移事件）。
 * 引擎 problems 里常见的 "in \"x\""、"unknown target \"y\""、"duplicate id \"z\""。
 */
export function locateIssues(issues: ValidationIssue[], doc: ProjectDoc): ValidationIssue[] {
  return issues.map((iss) => {
    if (iss.kind !== 'generic') return iss
    const tokens = [...iss.message.matchAll(/"([^"]+)"/g)].map((m) => m[1])
    const out: ValidationIssue = { ...iss }
    const evTok = tokens.find((t) => doc.transitions.some((tr) => tr.event === t))
    const stTok = tokens.find((t) => doc.states.some((s) => s.id === t))
    if (evTok) {
      out.kind = 'transition'
      out.event = evTok
      if (stTok) out.stateId = stTok
    } else if (stTok) {
      out.kind = 'state'
      out.stateId = stTok
    }
    return out
  })
}
