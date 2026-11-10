import { EventBus, type MachineStateEvent } from '../runtime/bus'
import { createMachineSession, getDomParser, type EngineMode } from '../runtime/engine'
import { normalizeDoc, type ProjectDoc } from '../vendor/scxml-core/model'
import { serializeToScxml } from '../vendor/scxml-core/serializer'
import { validateScxml } from '../vendor/scxml-core/validator'
import { runtimeStatus, runtimeT } from '../runtime/i18n'

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
  xml: string
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
    return { xml: serializeToScxml(doc), doc }
  }
  const source = typeof node.source === 'string' ? node.source.trim() : ''
  if (source) return { xml: source, doc: null }
  return { xml: DEFAULT_SOURCE, doc: null }
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
        return resolveMachineSource(node).xml
      } catch {
        return node.source || ''
      }
    }
    machines.set(node.id, node)

    const bus = new EventBus()
    let session: any = null
    let startPromise: Promise<any> | null = null
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

    function writePersistedVars(active: any): void {
      if (!node.persistVars || !active) return
      try {
        const result = node.context().set(PERSIST_KEY, active.snapshot())
        if (result && typeof result.catch === 'function') result.catch(() => {})
      } catch {
        // Context may be unavailable during shutdown; persistence is best-effort.
      }
    }

    function schedulePersistVars(): void {
      if (!node.persistVars || !session || saveTimer) return
      saveTimer = setTimeout(() => {
        saveTimer = null
        if (session) writePersistedVars(session)
      }, 250)
    }

    function publishState(): void {
      const states = Array.isArray(session?.activeStateIds()) ? session.activeStateIds() : []
      const vars = session && typeof session.snapshot === 'function' ? session.snapshot() : {}
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

    node.ensureStarted = function ensureStarted(): Promise<any> {
      if (session) return Promise.resolve(session)
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
          const err = new Error(runtimeT(RED, 'errors.configInvalid', { message: validation.message }))
          ;(err as any).issues = validation.issues
          throw err
        }

        const persisted = await readPersistedVars()
        const created = await createMachineSession(resolved.xml, {
          engine: node.engine,
          scriptTimeoutMs: node.scriptTimeoutMs,
          maxMicrosteps: node.maxMicrosteps,
          data: persisted,
        })
        if (closed) {
          created.dispose()
          throw new Error(runtimeT(RED, 'errors.closedWhileStarting'))
        }
        session = created

        created.addEventListener('macrostep', () => {
          if (!closed) publishState()
        })
        created.addEventListener('send', (event: any) => {
          if (closed) return
          const message = event?.message ?? {}
          bus.emit({
            type: 'send',
            event: String(message.event ?? ''),
            data: message.data,
            target: message.target,
            sendid: message.sendid,
            ts: Date.now(),
          })
        })
        created.addEventListener('error', (event: any) => {
          if (closed) return
          const err = new Error(runtimeT(RED, 'errors.runtime', { kind: event?.kind ?? 'error', message: event?.message ?? 'unknown error' }))
          node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('runtimeError') })
          node.error(err)
          bus.emit({ type: 'error', error: err, ts: Date.now() })
        })
        created.addEventListener('done', () => {
          if (closed) return
          node.status({ fill: 'grey', shape: 'dot', text: runtimeStatus('done') })
          bus.emit({ type: 'done', ts: Date.now() })
        })

        created.start()
        return created
      })()

      startPromise = promise.catch((err) => {
        startPromise = null
        startError = err instanceof Error ? err : new Error(String(err))
        if (!closed) {
          node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('invalidConfig') })
          node.error(startError)
        }
        throw startError
      })
      return startPromise
    }

    node.sendEvent = function sendEvent(name: string, data: unknown): Promise<void> {
      return enqueue(async () => {
        const active = await node.ensureStarted()
        currentEvent = name
        active.send(name, data)
      })
    }

    node.setVars = function setVars(vars: Record<string, unknown>): Promise<void> {
      return enqueue(async () => {
        const active = await node.ensureStarted()
        const datamodel = active.datamodel
        if (!datamodel) throw new Error(runtimeT(RED, 'errors.dataModel'))
        const entries = Object.entries(vars)
        for (const [id] of entries) {
          if (typeof datamodel.isValidLocation === 'function' && !datamodel.isValidLocation(id)) {
            throw new Error(runtimeT(RED, 'errors.unknownVariable', { id }))
          }
        }
        for (const [id, value] of entries) {
          datamodel.assignValue(id, value)
        }
        const updateEvent = String(node.updateEvent || '').trim()
        if (updateEvent) {
          currentEvent = updateEvent
          active.send(updateEvent, {})
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
        const old = session
        session = null
        startPromise = null
        startError = null
        lastStates = []
        lastVars = {}
        lastStateKey = null
        lastChanged = false
        currentEvent = undefined
        if (old) {
          try {
            old.dispose()
          } catch {
            // dispose is best-effort
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
      return !!session
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
      const active = session
      if (active) writePersistedVars(active)
      session = null
      startPromise = null
      startError = null
      if (active) {
        try {
          active.dispose()
        } catch {
          // dispose is best-effort; never block Node-RED shutdown
        }
      }
      node.status({})
      done()
    })
  }

  RED.nodes.registerType('statechart-machine', MachineNode)
}
