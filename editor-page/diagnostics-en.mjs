/**
 * English diagnostic formatters for the standalone kit editor.
 *
 * statechart-kit 0.11–0.13 only ships `diagnostics/zh`; the host injects these
 * formatters through `CreateEditorOptions.diagnostics` when Node-RED runs in
 * an English locale. Codes and params stay owned by kit, so a missing code
 * falls back to the raw code instead of hiding the problem.
 */
const NAMING = {
  'naming.empty': 'Name is empty',
  'naming.auto-delay': '"{name}" is an internal delay event name (generated automatically) and cannot be entered manually',
  'naming.legacy-prefix': '"{name}" uses the deprecated {prefix} prefix; migrate to the current namespace',
  'naming.prefix.not-for-event': 'The {prefix} prefix of "{name}" belongs to the {namespace} namespace and cannot be used as an event name',
  'naming.prefix.not-for-variable': 'The {prefix} prefix of "{name}" belongs to the {namespace} namespace and cannot be used as a variable name',
  'naming.prefix.warn': '"{name}" uses the {prefix} prefix: {hint}',
  'naming.send.reserved': 'Cannot send "{name}" manually: {prefix} is injected by the host',
  'naming.assign.forbidden': 'Cannot assign to "{name}": {prefix} is a reserved namespace',
  'naming.transition.legacy': 'Transition event "{name}" uses the deprecated {prefix} prefix',
}

const STRUCTURE = {
  'structure.state.missing-uid': 'State "{id}" is missing its internal uid',
  'structure.state.duplicate-uid': 'State "{id}" has duplicate uid "{uid}"',
  'structure.state.missing-id': 'State uid "{uid}" is missing its SCXML id',
  'structure.state.invalid-id': 'State id "{id}" is invalid (must start with a letter or underscore)',
  'structure.state.duplicate-id': 'Duplicate state id "{id}"',
  'structure.state.self-parent': 'State "{id}" cannot be its own parent',
  'structure.state.missing-parent': 'Parent "{parent}" of state "{id}" does not exist',
  'structure.state.parent-cycle': 'State "{id}" has a parent cycle',
  'structure.state.history-root': 'History pseudo-state "{id}" must have a parent',
  'structure.state.history-children': 'History pseudo-state "{id}" cannot have child states',
  'structure.state.history-actions': 'Entry/exit actions on history pseudo-state "{id}" are ignored',
  'structure.state.final-children': 'Final state "{id}" cannot have child states',
  'structure.state.final-transition': 'Final state "{id}" cannot have {count} outgoing transition(s)',
  'structure.state.atomic-children': 'Atomic state "{id}" cannot have child states',
  'structure.state.compound-empty': 'Compound state "{id}" has no child states',
  'structure.state.parallel-initial': 'initial on parallel state "{id}" is ignored',
  'structure.state.initial-ignored': 'State "{id}" is not compound; initial is ignored',
  'structure.state.initial-fallback': 'Compound state "{id}" has no initial; the first child will be used',
  'structure.state.initial-missing': 'initial "{initial}" of state "{id}" does not exist',
  'structure.state.initial-not-child': 'initial "{initial}" of state "{id}" is not a direct child',
  'structure.state.initial-history': 'initial of state "{id}" points to a history pseudo-state and is ignored',
  'structure.state.donedata-not-final': 'State "{id}" ({kind}) cannot have done data: donedata belongs to final states only',
  'structure.state.donedata-empty': 'Done data of state "{id}" is empty',
  'structure.state.donedata-ambiguous': 'Done data of state "{id}" mixes forms: content / expr / param are mutually exclusive',
  'structure.state.donedata-param-invalid': 'Done data param {index} of state "{id}" is missing name or expr',
  'structure.state.donedata-param-duplicate': 'Duplicate done data param name "{name}" on state "{id}"',
  'structure.root.initial-missing': 'Root initial "{initial}" does not exist',
  'structure.root.initial-not-top': 'Root initial "{initial}" is not a top-level state',
  'structure.variable.missing-id': 'Variable at index {index} is missing an id',
  'structure.variable.invalid-id': 'Variable id "{id}" is invalid',
  'structure.variable.duplicate-id': 'Duplicate variable id "{id}"',
  'structure.transition.missing-id': 'A transition is missing an id',
  'structure.transition.duplicate-id': 'Duplicate transition id "{id}"',
  'structure.transition.missing-source': 'Source state of transition "{id}" does not exist',
  'structure.transition.missing-target': 'Target state of transition "{id}" does not exist',
  'structure.transition.history-targetless': 'The default transition of history pseudo-state "{id}" must have a target',
  'structure.transition.internal-eventless': 'Internal transition "{id}" has no event and may form a self-triggering loop',
  'structure.transition.mixed-event-visibility': 'Transition "{id}" listens to both internal-only and external events ({events}); split it into separate transitions',
  'structure.transition.delay-invalid': 'delayMs of transition "{id}" is invalid (must be at least 10)',
  'structure.transition.delay-without-event': 'Transition "{id}" has a delay but no event name',
}

const VALIDATION = {
  'validation.engine.problem': 'Engine structure error: {detail}',
  'validation.engine.error': 'Engine error: {detail}',
  'validation.script-action': 'Custom JS ({slot} line {index}): {line}',
}

const VARIABLE = {
  'variable.session-not-running': 'Session is not running',
  'variable.unknown': 'Unknown variable "{id}"',
  'variable.assign-failed': 'Failed to write "{id}": {detail}',
  'variable.assign-expr': 'Assigned {id} = {expr}',
  'variable.assign-value': 'Wrote {id}',
}

function value (params, key) {
  const v = params?.[key]
  if (v === undefined || v === null) return '?'
  return typeof v === 'string' ? v : JSON.stringify(v)
}

function template (text, params) {
  return text.replace(/\{(\w+)\}/g, (_match, key) => value(params, key))
}

function fromMap (map, code, params) {
  const text = map[code]
  return text ? template(text, params) : null
}

export function formatNamingIssue (issue) {
  return fromMap(NAMING, issue.code, issue.params) ?? `${issue.code} ${JSON.stringify(issue.params ?? {})}`
}

export function formatStructureIssue (issue) {
  return (
    fromMap(STRUCTURE, issue.code, issue.params) ??
    fromMap(NAMING, issue.code, issue.params) ??
    `${issue.code} ${JSON.stringify(issue.params ?? {})}`
  )
}

export function formatValidationIssue (issue) {
  return (
    fromMap(VALIDATION, issue.code, issue.params) ??
    fromMap(STRUCTURE, issue.code, issue.params) ??
    fromMap(NAMING, issue.code, issue.params) ??
    `${issue.code} ${JSON.stringify(issue.params ?? {})}`
  )
}

export function formatImportWarning (warning) {
  return `${warning.code} ${JSON.stringify(warning.params ?? {})}`
}

export function formatVariableResult (result) {
  return fromMap(VARIABLE, result.code, result.params) ?? result.code
}

/** Object injected into `mountEditor({ diagnostics })`. */
export const englishDiagnostics = {
  formatNamingIssue,
  formatStructureIssue,
  formatValidationIssue,
  formatImportWarning,
  formatVariableResult,
}
