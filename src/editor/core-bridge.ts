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
  type ProjectDoc,
} from '../vendor/scxml-core/model'
import { serializeToScxml } from '../vendor/scxml-core/serializer'
import { scxmlToDoc } from '../vendor/scxml-core/scxml-import'
import { actionToLine, parseActionLine } from '../vendor/scxml-core/action-parse'
import { checkEventName, checkVarName } from '../vendor/scxml-core/naming'

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
  scxmlToDoc,
  actionToLine,
  parseActionLine,
  checkEventName,
  checkVarName,
  type: {} as ProjectDoc,
}
