/**
 * Structural validation for the Node-RED editor.
 *
 * This is intentionally separate from the runtime `validateScxml` gate:
 * the browser does not bundle the engine, and this checker can point at
 * individual rows before deployment. The runtime remains authoritative.
 */
import { ID_RE, type ProjectDoc, type StateNode } from '../vendor/scxml-core/model'

export interface DocIssue {
  code: string
  level: 'error' | 'warning'
  params?: Record<string, unknown>
  uid?: string
  transitionId?: string
  variableId?: string
}

export function validateDoc(doc: ProjectDoc): DocIssue[] {
  const issues: DocIssue[] = []
  const states = Array.isArray(doc.states) ? doc.states : []
  const transitions = Array.isArray(doc.transitions) ? doc.transitions : []
  const vars = Array.isArray(doc.datamodel) ? doc.datamodel : []
  const byUid = new Map<string, StateNode>()
  const byId = new Map<string, StateNode>()

  for (const state of states) {
    if (!state.id || !ID_RE.test(state.id)) {
      issues.push({ code: 'invalidStateId', level: 'error', params: { id: state.id || '(empty)' }, uid: state.uid })
    }
    if (byId.has(state.id)) {
      issues.push({ code: 'duplicateStateId', level: 'error', params: { id: state.id }, uid: state.uid })
    } else {
      byId.set(state.id, state)
    }
    byUid.set(state.uid, state)
  }

  if (!states.length) {
    issues.push({ code: 'noStates', level: 'error' })
  }

  const top = states.filter((s) => !s.parent)
  if (states.length && !doc.initial) {
    issues.push({ code: 'missingRootInitial', level: 'warning' })
  } else if (doc.initial && !top.some((s) => s.uid === doc.initial)) {
    issues.push({ code: 'invalidRootInitial', level: 'error', params: { initial: doc.initial } })
  }

  for (const state of states) {
    const children = states.filter((s) => s.parent === state.uid)
    if (state.parent) {
      const parent = byUid.get(state.parent)
      if (!parent) {
        issues.push({ code: 'parentMissing', level: 'error', params: { id: state.id, parent: state.parent }, uid: state.uid })
      } else {
        let cursor: StateNode | undefined = parent
        const seen = new Set<string>([state.uid])
        while (cursor) {
          if (seen.has(cursor.uid)) {
            issues.push({ code: 'parentCycle', level: 'error', params: { id: state.id }, uid: state.uid })
            break
          }
          seen.add(cursor.uid)
          cursor = cursor.parent ? byUid.get(cursor.parent) : undefined
        }
      }
    }

    if (state.kind === 'history') {
      if (!state.parent) {
        issues.push({ code: 'historyWithoutParent', level: 'error', params: { id: state.id }, uid: state.uid })
      }
      if (children.length) {
        issues.push({ code: 'historyHasChildren', level: 'error', params: { id: state.id }, uid: state.uid })
      }
    } else if (state.kind === 'final' && children.length) {
      issues.push({ code: 'finalHasChildren', level: 'error', params: { id: state.id }, uid: state.uid })
    } else if (state.kind === 'atomic' && children.length) {
      issues.push({ code: 'atomicHasChildren', level: 'warning', params: { id: state.id }, uid: state.uid })
    }

    if (state.kind === 'compound') {
      if (!children.length) {
        issues.push({ code: 'compoundNoChildren', level: 'warning', params: { id: state.id }, uid: state.uid })
      } else if (state.initial && !children.some((s) => s.uid === state.initial)) {
        issues.push({ code: 'invalidStateInitial', level: 'error', params: { id: state.id }, uid: state.uid })
      } else if (!state.initial && children.some((s) => s.kind !== 'history')) {
        issues.push({ code: 'compoundNoInitial', level: 'warning', params: { id: state.id }, uid: state.uid })
      }
    }
  }

  for (const transition of transitions) {
    const source = byUid.get(transition.source)
    const target = byUid.get(transition.target)
    if (!source) {
      issues.push({
        code: 'transitionSourceMissing',
        level: 'error',
        params: { source: transition.source },
        transitionId: transition.id,
      })
    }
    if (!target) {
      issues.push({
        code: 'transitionTargetMissing',
        level: 'error',
        params: { target: transition.target },
        transitionId: transition.id,
      })
    }
    if (transition.delayMs !== undefined && (!Number.isFinite(transition.delayMs) || transition.delayMs <= 0)) {
      issues.push({
        code: 'invalidDelay',
        level: 'error',
        params: { delay: transition.delayMs },
        transitionId: transition.id,
      })
    }
    if (!transition.event) {
      if (transition.delayMs !== undefined) {
        issues.push({
          code: 'delayNeedsEvent',
          level: 'error',
          params: { delay: transition.delayMs },
          transitionId: transition.id,
        })
      }
    } else if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(transition.event)) {
      issues.push({
        code: 'invalidEvent',
        level: 'error',
        params: { event: transition.event },
        transitionId: transition.id,
      })
    }
  }

  const seenVars = new Set<string>()
  for (const variable of vars) {
    if (!variable.id || !ID_RE.test(variable.id)) {
      issues.push({ code: 'invalidVarId', level: 'error', params: { id: variable.id || '(empty)' }, variableId: variable.id })
    } else if (seenVars.has(variable.id)) {
      issues.push({ code: 'duplicateVarId', level: 'error', params: { id: variable.id }, variableId: variable.id })
    } else {
      seenVars.add(variable.id)
    }
  }

  return issues
}
