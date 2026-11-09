import { EventBus, type MachineStateEvent } from '../runtime/bus'
import { createMachineSession, type EngineMode } from '../runtime/engine'

const DEFAULT_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle"><transition event="start" target="running"/></state>
  <state id="running"><transition event="stop" target="idle"/></state>
</scxml>`

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
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

    node.name = String(config.name || 'state machine')
    node.source = typeof config.source === 'string' && config.source.trim() ? config.source : DEFAULT_SOURCE
    node.engine = (config.engine === 'trusted' ? 'trusted' : 'sandboxed') as EngineMode
    node.scriptTimeoutMs = positiveNumber(config.scriptTimeoutMs, 500)
    node.maxMicrosteps = positiveNumber(config.maxMicrosteps, 10000)
    node.monitorShowVars = config.monitorShowVars === true
    node.graphVersion = hashString(node.source)
    machines.set(node.id, node)

    const bus = new EventBus()
    let session: any = null
    let startPromise: Promise<any> | null = null
    let closed = false
    let currentEvent: string | undefined
    let lastStates: string[] = []
    let lastVars: Record<string, unknown> = {}
    let lastStateKey: string | null = null
    let lastChanged = false

    node.bus = bus
    node.status({ fill: 'grey', shape: 'ring', text: 'not started' })

    function publishState(): void {
      const states = Array.isArray(session?.activeStateIds()) ? session.activeStateIds() : []
      const vars = session && typeof session.snapshot === 'function' ? session.snapshot() : {}
      const key = JSON.stringify([states, vars])
      const changed = lastStateKey === null || key !== lastStateKey
      lastStateKey = key
      lastChanged = changed
      lastStates = states
      lastVars = vars
      node.status({
        fill: 'green',
        shape: 'dot',
        text: states.length ? states.join('+') : 'running',
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
      if (startPromise) return startPromise
      if (closed) return Promise.reject(new Error('state machine is closed'))

      node.status({ fill: 'blue', shape: 'dot', text: 'starting' })
      const promise = (async () => {
        const created = await createMachineSession(node.source, {
          engine: node.engine,
          scriptTimeoutMs: node.scriptTimeoutMs,
          maxMicrosteps: node.maxMicrosteps,
        })
        if (closed) {
          created.dispose()
          throw new Error('state machine was closed while starting')
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
          const err = new Error(`${event?.kind ?? 'error'}: ${event?.message ?? 'unknown error'}`)
          node.status({ fill: 'red', shape: 'ring', text: 'runtime error' })
          node.error(err)
          bus.emit({ type: 'error', error: err, ts: Date.now() })
        })
        created.addEventListener('done', () => {
          if (closed) return
          node.status({ fill: 'grey', shape: 'dot', text: 'done' })
          bus.emit({ type: 'done', ts: Date.now() })
        })

        created.start()
        return created
      })()

      startPromise = promise.catch((err) => {
        startPromise = null
        node.status({ fill: 'red', shape: 'ring', text: 'start failed' })
        node.error(err)
        throw err
      })
      return startPromise
    }

    node.sendEvent = async function sendEvent(name: string, data: unknown): Promise<void> {
      const active = await node.ensureStarted()
      currentEvent = name
      active.send(name, data)
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
      const active = session
      session = null
      startPromise = null
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

  RED.nodes.registerType('scxml-machine', MachineNode)
}
