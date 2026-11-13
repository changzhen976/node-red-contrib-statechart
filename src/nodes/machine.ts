import { EventBus, type MachineErrorLocation, type MachineStateEvent } from '../runtime/bus'
import { getDomParser } from '../runtime/dom'
import { normalizeDoc, serializeToDisplayScxml, serializeToScxml, type ProjectDoc } from 'statechart-kit'
import { SessionRunner, validateScxml, type EngineMode } from 'statechart-kit/engine'
import { runtimeStatus, runtimeT } from '../runtime/i18n'

/** Compare active configurations without relying on order. */
function sameStateSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** Kit 0.11+ supplies optional error location fields. */
function errorLocationFromEvent(event: unknown): MachineErrorLocation | undefined {
  const source = event as Record<string, any> | null
  if (!source || typeof source !== 'object') return undefined
  const location: MachineErrorLocation = {}
  if (typeof source.stateId === 'string' && source.stateId) location.stateId = source.stateId
  if (typeof source.transitionId === 'string' && source.transitionId) location.transitionId = source.transitionId
  if (source.slot === 'entry' || source.slot === 'exit' || source.slot === 'transition') location.slot = source.slot
  if (typeof source.actionIndex === 'number' && Number.isInteger(source.actionIndex) && source.actionIndex >= 0) {
    location.actionIndex = source.actionIndex
  }
  if (source.element && typeof source.element.localName === 'string') {
    location.element = {
      localName: source.element.localName,
      ...(typeof source.element.id === 'string' ? { id: source.element.id } : {}),
    }
  }
  return Object.keys(location).length ? location : undefined
}

const DEFAULT_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle"><transition event="start" target="running"/></state>
  <state id="running"><transition event="stop" target="idle"/></state>
</scxml>`

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

interface ResolvedMachineSource {
  /** Runtime SCXML: keeps internal-only guards and data-kit-visibility. */
  xml: string
  /** Display SCXML: same graph without kit-generated internal guards. */
  displayXml: string
  doc: ProjectDoc | null
}

/** Prefer ProjectDoc JSON (`doc`) and fall back to legacy raw `source`. */
function resolveMachineSource(node: any): ResolvedMachineSource {
  const docText = typeof node.doc === 'string' ? node.doc.trim() : ''
  if (docText) {
    let parsed: ProjectDoc
    try {
      parsed = JSON.parse(docText) as ProjectDoc
    } catch (err) {
      throw new Error(`doc is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
    const doc = normalizeDoc(parsed)
    if (!doc.states.length) throw new Error('doc has no states')
    return {
      xml: serializeToScxml(doc),
      displayXml: serializeToDisplayScxml(doc),
      doc,
    }
  }
  const source = typeof node.source === 'string' ? node.source.trim() : ''
  if (source) return { xml: source, displayXml: source, doc: null }
  return { xml: DEFAULT_SOURCE, displayXml: DEFAULT_SOURCE, doc: null }
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

const machines = new Map<string, any>()

/** Used by the read-only monitor HTTP routes. */
export function getMachine(id: string): any | undefined {
  return machines.get(id)
}

export function listMachines(): any[] {
  return [...machines.values()]
}

export function registerMachine(RED: any): void {
  function MachineNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this

    node.name = String(config.name || 'State chart')
    node.source = typeof config.source === 'string' ? config.source : ''
    node.doc = typeof config.doc === 'string' ? config.doc : ''
    node.engine = (config.engine === 'trusted' ? 'trusted' : 'sandboxed') as EngineMode
    node.scriptTimeoutMs = positiveNumber(config.scriptTimeoutMs, 500)
    node.maxMicrosteps = positiveNumber(config.maxMicrosteps, 10000)
    node.monitorShowVars = config.monitorShowVars === true
    node.persistVars = config.persistVars === true
    node.updateEvent = String(config.updateEvent || 'update').trim()
    node.graphVersion = hashString(node.doc || node.source)
    node.getGraphSource = function getGraphSource(): string {
      try {
        // The monitor is read-only: hide the internal-only guard that kit adds
        // for SCXML semantics, so it is not mistaken for an author condition.
        return resolveMachineSource(node).displayXml
      } catch {
        return node.source || ''
      }
    }
    machines.set(node.id, node)
    node.hubOwner = null

    /** A state machine may be hosted by at most one hub node at a time. */
    node.claimHub = function claimHub(hubNode: any): { ok: boolean; owner?: any } {
      const owner = node.hubOwner
      if (!owner || owner === hubNode || !RED.nodes.getNode(owner.id)) {
        node.hubOwner = hubNode
        return { ok: true, owner: hubNode }
      }
      return { ok: false, owner }
    }

    node.releaseHub = function releaseHub(hubNode: any): void {
      if (node.hubOwner === hubNode) node.hubOwner = null
    }

    const bus = new EventBus()
    let runner: SessionRunner | null = null
    let startPromise: Promise<SessionRunner> | null = null
    let startError: Error | null = null
    let closed = false
    let currentEvent: string | undefined
    let lastStates: string[] = []
    let lastVars: Record<string, unknown> = {}
    let lastStateKey: string | null = null
    let lastChanged = false
    const MAX_QUEUE = 1000
    const PERSIST_KEY = 'statechartVars'
    let opChain: Promise<void> = Promise.resolve()
    let queuedOps = 0
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    /** Serialize inputs/commands; keeps arrival order while the session starts. */
    function enqueue<T>(work: () => Promise<T>): Promise<T> {
      if (closed) return Promise.reject(new Error('state machine is closed'))
      if (queuedOps >= MAX_QUEUE) {
        return Promise.reject(new Error(runtimeT(RED, 'errors.queueFull', { max: MAX_QUEUE })))
      }
      queuedOps++
      const run = opChain.then(work)
      opChain = run.then(
        () => { queuedOps-- },
        () => { queuedOps-- },
      )
      return run
    }

    node.bus = bus
    node.status({ fill: 'grey', shape: 'ring', text: runtimeStatus('notStarted') })

    async function readPersistedVars(): Promise<Record<string, unknown> | undefined> {
      if (!node.persistVars) return undefined
      try {
        const saved = await node.context().get(PERSIST_KEY)
        return saved && typeof saved === 'object' && !Array.isArray(saved)
          ? (saved as Record<string, unknown>)
          : undefined
      } catch {
        return undefined
      }
    }

    function writePersistedVars(active: SessionRunner): void {
      if (!node.persistVars || !active) return
      try {
        const result = node.context().set(PERSIST_KEY, active.snapshot())
        if (result && typeof result.catch === 'function') result.catch(() => {})
      } catch {
        // Context may be unavailable during shutdown; persistence is best-effort.
      }
    }

    function schedulePersistVars(): void {
      if (!node.persistVars || !runner || saveTimer) return
      saveTimer = setTimeout(() => {
        saveTimer = null
        if (runner) writePersistedVars(runner)
      }, 250)
    }

    function publishState(active: SessionRunner, statesOverride?: string[]): void {
      const states = statesOverride ? [...statesOverride] : active.activeStateIds()
      const vars = active.snapshot()
      const key = JSON.stringify([states, vars])
      const changed = lastStateKey === null || key !== lastStateKey
      lastStateKey = key
      lastChanged = changed
      lastStates = states
      lastVars = vars
      schedulePersistVars()
      node.status({
        fill: 'green',
        shape: 'dot',
        text: states.length ? states.join('+') : runtimeStatus('running'),
      })
      bus.emit({
        type: 'state',
        states: [...states],
        vars,
        changed,
        event: currentEvent,
        ts: Date.now(),
      })
    }

    node.ensureStarted = function ensureStarted(): Promise<SessionRunner> {
      if (runner) return Promise.resolve(runner)
      if (startError) return Promise.reject(startError)
      if (startPromise) return startPromise
      if (closed) return Promise.reject(new Error('state machine is closed'))

      node.status({ fill: 'blue', shape: 'dot', text: runtimeStatus('starting') })
      const promise = (async () => {
        const resolved = resolveMachineSource(node)
        node.source = resolved.xml
        node.graphVersion = hashString(resolved.xml)

        const domParser = await getDomParser()
        const validation = await validateScxml(resolved.xml, domParser)
        if (!validation.ok) {
          const detail = validation.issues
            .map((issue) => {
              const value = issue.params?.detail
              return typeof value === 'string' ? value : issue.code
            })
            .join('; ')
          const err = new Error(runtimeT(RED, 'errors.configInvalid', { message: detail || 'invalid SCXML' }))
          ;(err as any).issues = validation.issues
          throw err
        }

        const persisted = await readPersistedVars()
        const created = new SessionRunner({
          domParser,
          engine: node.engine,
          scriptTimeoutMs: node.scriptTimeoutMs,
          maxMicrosteps: node.maxMicrosteps,
        })

        created.on((event) => {
          if (closed) return
          switch (event.type) {
            case 'active':
              // Use the event's configuration: the engine may have cleared the
              // live session by the time the terminal active is emitted.
              publishState(created, event.ids)
              break
            case 'send':
              bus.emit({
                type: 'send',
                event: event.name,
                data: event.data,
                target: event.target,
                sendid: event.sendid,
                ts: Date.now(),
              })
              break
            case 'error': {
              const err = new Error(runtimeT(RED, 'errors.runtime', { kind: event.kind, message: event.message }))
              const location = errorLocationFromEvent(event)
              node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('runtimeError') })
              node.error(err)
              bus.emit({ type: 'error', error: err, ...(location ? { location } : {}), ts: Date.now() })
              break
            }
            case 'done': {
              // Kit 0.11+ emits the terminal active itself and supplies the final
              // configuration; avoid publishing it twice.
              const doneStates = event.states
              if (doneStates.length && !sameStateSet(lastStates, doneStates)) {
                publishState(created, doneStates)
              }
              node.status({ fill: 'grey', shape: 'dot', text: runtimeStatus('done') })
              bus.emit({ type: 'done', states: doneStates, ts: Date.now() })
              break
            }
            default:
              break
          }
        })

        if (closed) {
          await created.stop()
          throw new Error(runtimeT(RED, 'errors.closedWhileStarting'))
        }

        runner = created
        try {
          await created.start(resolved.xml, persisted ? { data: persisted } : {})
        } catch (err) {
          runner = null
          await created.stop().catch(() => {})
          throw err
        }
        return created
      })()

      startPromise = promise.then(
        (created) => {
          startPromise = null
          return created
        },
        (err) => {
          startPromise = null
          startError = err instanceof Error ? err : new Error(String(err))
          if (!closed) {
            node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('invalidConfig') })
            node.error(startError)
          }
          throw startError
        },
      )
      return startPromise
    }

    node.sendEvent = function sendEvent(name: string, data: unknown): Promise<void> {
      return enqueue(async () => {
        const active = await node.ensureStarted()
        currentEvent = name
        active.send(name, data, null)
        // The engine queues external events; wait for that macrostep so a
        // following set/read command observes the post-transition state.
        await active.settled()
      })
    }

    node.setVars = function setVars(vars: Record<string, unknown>): Promise<void> {
      return enqueue(async () => {
        const active = await node.ensureStarted()
        // Preserve command order: let an event queued just before this set run
        // its transition actions before values are written.
        await active.settled()
        const datamodel = active.sessionOrNull?.datamodel as any
        if (!datamodel) throw new Error(runtimeT(RED, 'errors.dataModel'))
        const entries = Object.entries(vars)
        for (const [id] of entries) {
          if (typeof datamodel.isValidLocation === 'function' && !datamodel.isValidLocation(id)) {
            throw new Error(runtimeT(RED, 'errors.unknownVariable', { id }))
          }
        }
        for (const [id, value] of entries) {
          const result = active.assignValue(id, value)
          if (!result.ok) {
            if (result.code === 'variable.unknown') {
              throw new Error(runtimeT(RED, 'errors.unknownVariable', { id }))
            }
            throw new Error(runtimeT(RED, 'errors.dataModel'))
          }
        }
        const updateEvent = String(node.updateEvent || '').trim()
        if (updateEvent) {
          currentEvent = updateEvent
          active.send(updateEvent, {}, null)
          await active.settled()
        }
      })
    }

    node.reset = function reset(): Promise<void> {
      return enqueue(async () => {
        const pending = startPromise
        if (pending) {
          try {
            await pending
          } catch {
            // Invalid configuration: reset clears the cached error and tries again.
          }
        }
        const old = runner
        runner = null
        startPromise = null
        startError = null
        lastStates = []
        lastVars = {}
        lastStateKey = null
        lastChanged = false
        currentEvent = undefined
        if (old) {
          try {
            await old.stop()
          } catch {
            // stop is best-effort
          }
        }
        node.status({ fill: 'blue', shape: 'dot', text: runtimeStatus('resetting') })
        await node.ensureStarted()
      })
    }

    node.getCurrentState = function getCurrentState(): MachineStateEvent | null {
      if (!lastStates.length) return null
      return {
        type: 'state',
        states: [...lastStates],
        vars: lastVars,
        changed: lastChanged,
        ts: Date.now(),
      }
    }

    node.isRunning = function isRunning(): boolean {
      return !!runner
    }

    node.subscribe = function subscribe(listener: (event: any) => void): () => void {
      return bus.subscribe(listener)
    }

    node.on('close', function onClose(_removed: boolean, done: () => void) {
      closed = true
      bus.clear()
      machines.delete(node.id)
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      node.hubOwner = null
      const active = runner
      if (active) writePersistedVars(active)
      runner = null
      startPromise = null
      startError = null
      if (active) {
        // SessionRunner.stop() is async but disposes synchronously; never block shutdown.
        void active.stop().catch(() => {})
      }
      node.status({})
      done()
    })
  }

  RED.nodes.registerType('statechart-machine', MachineNode)
}
