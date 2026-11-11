/**
 * Structural validation for the Node-RED tray form.
 *
 * Rules live in `statechart-kit` (`validateStructure`); this module only maps
 * kit codes into the row-level shape the jQuery table uses (uid / transitionId
 * / variableId) and keeps the few tray-specific checks that are not structural:
 * root initial presence and event-name syntax.
 */
import { validateStructure, type ProjectDoc, type StructureIssue } from 'statechart-kit'

export interface DocIssue {
  code: string
  level: 'error' | 'warning'
  params?: Record<string, unknown>
  uid?: string
  transitionId?: string
  variableId?: string
}

const CODE_MAP: Record<string, string> = {
  'structure.root.initial-missing': 'missingRootInitial',
  'structure.root.initial-not-top': 'invalidRootInitial',
  'structure.state.atomic-children': 'atomicHasChildren',
  'structure.state.compound-empty': 'compoundNoChildren',
  'structure.state.duplicate-id': 'duplicateStateId',
  'structure.state.duplicate-uid': 'duplicateStateId',
  'structure.state.final-children': 'finalHasChildren',
  'structure.state.history-actions': 'historyHasActions',
  'structure.state.history-children': 'historyHasChildren',
  'structure.state.history-root': 'historyWithoutParent',
  'structure.state.initial-fallback': 'compoundNoInitial',
  'structure.state.initial-history': 'invalidStateInitial',
  'structure.state.initial-ignored': 'initialIgnored',
  'structure.state.initial-missing': 'invalidStateInitial',
  'structure.state.initial-not-child': 'invalidStateInitial',
  'structure.state.invalid-id': 'invalidStateId',
  'structure.state.missing-id': 'invalidStateId',
  'structure.state.missing-parent': 'parentMissing',
  'structure.state.missing-uid': 'invalidStateId',
  'structure.state.parallel-initial': 'initialIgnored',
  'structure.state.parent-cycle': 'parentCycle',
  'structure.state.self-parent': 'parentCycle',
  'structure.transition.delay-invalid': 'invalidDelay',
  'structure.transition.delay-without-event': 'delayNeedsEvent',
  'structure.transition.duplicate-id': 'transitionDuplicateId',
  'structure.transition.missing-id': 'transitionMissingId',
  'structure.transition.missing-source': 'transitionSourceMissing',
  'structure.transition.missing-target': 'transitionTargetMissing',
  'structure.variable.duplicate-id': 'duplicateVarId',
  'structure.variable.invalid-id': 'invalidVarId',
  'structure.variable.missing-id': 'invalidVarId',
}

function mapIssue(issue: StructureIssue): DocIssue {
  const params: Record<string, unknown> = { ...(issue.params ?? {}) }
  if (
    issue.code === 'structure.state.missing-id' ||
    issue.code === 'structure.state.missing-uid' ||
    issue.code === 'structure.variable.missing-id'
  ) {
    params.id = '(empty)'
  } else if (
    issue.code === 'structure.transition.delay-invalid' ||
    issue.code === 'structure.transition.delay-without-event'
  ) {
    params.delay = issue.params?.delayMs
  } else if (issue.code === 'structure.transition.missing-id') {
    params.id = '(missing)'
  }
  return {
    code: CODE_MAP[issue.code] ?? issue.code,
    level: issue.severity,
    params,
    ...(issue.stateUid ? { uid: issue.stateUid } : {}),
    ...(issue.transitionId ? { transitionId: issue.transitionId } : {}),
    ...(issue.variableId ? { variableId: issue.variableId } : {}),
  }
}

const EVENT_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export function validateDoc(doc: ProjectDoc): DocIssue[] {
  const issues: DocIssue[] = []
  if (!Array.isArray(doc.states) || !doc.states.length) {
    issues.push({ code: 'noStates', level: 'error' })
    return issues
  }
  if (!doc.initial) issues.push({ code: 'missingRootInitial', level: 'warning' })
  for (const transition of doc.transitions ?? []) {
    if (transition.event && !EVENT_RE.test(transition.event)) {
      issues.push({
        code: 'invalidEvent',
        level: 'error',
        params: { event: transition.event },
        ...(transition.id ? { transitionId: transition.id } : {}),
      })
    }
  }
  issues.push(...validateStructure(doc).issues.map(mapIssue))
  return issues
}
