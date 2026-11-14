/**
 * Browser-side bridge to the vendored scxml-creator core.
 * The Node-RED editor is plain jQuery, so expose the pure functions on a
 * global for the form code in editor/scxml.html. No engine/validator import:
 * runtime validation remains the authoritative gate.
 */
import {
  autoDelayEventName,
  childrenOf,
  descendantsOf,
  emptyDoc,
  newTransitionId,
  newUid,
  normalizeDoc,
  uniqueStateId,
  serializeToScxml,
  isInternalOnlyEvent,
  internalOnlyNames,
  setInternalOnlyEvent,
  scxmlToDoc,
  actionToLine,
  parseActionLine,
  type ProjectDoc,
} from 'statechart-kit'
import { formatImportWarning } from 'statechart-kit/diagnostics/zh'
import { validateDoc } from './validate-doc'

/** Kit returns `{ code, params }`; the form still renders plain warning strings. */
function scxmlToDocCompat (xml: string, domParser?: DOMParser) {
  const result = scxmlToDoc(xml, domParser)
  return {
    ...result,
    warnings: result.warnings.map((warning) => formatImportWarning(warning)),
  }
}

;(globalThis as any).SCXMLCore = {
  autoDelayEventName,
  childrenOf,
  descendantsOf,
  emptyDoc,
  newTransitionId,
  newUid,
  normalizeDoc,
  uniqueStateId,
  serializeToScxml,
  isInternalOnlyEvent,
  internalOnlyNames,
  setInternalOnlyEvent,
  scxmlToDoc: scxmlToDocCompat,
  actionToLine,
  parseActionLine,
  validateDoc,
  type: {} as ProjectDoc,
}
