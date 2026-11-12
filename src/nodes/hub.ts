import type { MachineErrorLocation } from '../runtime/bus'
import { runtimeStatus, runtimeT } from '../runtime/i18n'
import { eventMessage, stateMessage } from './messages'

function toJsonData(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    throw new Error('msg.payload is not JSON-serializable')
  }
}

/** Forward kit 0.11+ error location fields without emitting undefined keys. */
function errorLocationFields(location?: MachineErrorLocation): Record<string, unknown> {
  if (!location) return {}
  const fields: Record<string, unknown> = {}
  if (location.stateId !== undefined) fields.stateId = location.stateId
  if (location.transitionId !== undefined) fields.transitionId = location.transitionId
  if (location.slot !== undefined) fields.slot = location.slot
  if (location.actionIndex !== undefined) fields.actionIndex = location.actionIndex
  if (location.element !== undefined) fields.element = location.element
  return fields
}

/**
 * A flow-visible state machine hub: one input for events/commands and three
 * outputs (state, chart sends, errors). A machine may be hosted by one hub.
 */
export function registerHub(RED: any): void {
  function HubNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    const machine = config.machine ? RED.nodes.getNode(config.machine) : null
    const includeVars = config.includeVars !== false
    const emitInitial = config.emitInitial !== false
    const includeInternalSends = config.includeInternalSends === true
    const stateTopic = typeof config.stateTopic === 'string' ? config.stateTopic : ''
    const eventTopic = typeof config.eventTopic === 'string' && config.eventTopic
      ? config.eventTopic
      : 'statechart/{machine}/evt/{event}'

    let closed = false
    let sawState = false
    let claimed = false
    let unsubscribe: (() => void) | null = null

    function sendError(error: Error, msg?: any, location?: MachineErrorLocation): void {
      if (closed) return
      node.send([null, null, {
        payload: error.message,
        error,
        machine: machine ? machine.name : String(config.machine || ''),
        topic: 'statechart/error',
        ...errorLocationFields(location),
      }])
      node.error(error, msg)
    }

    /**
     * Claim the machine lazily so a standby hub can take over after the previous
     * owner is removed, instead of staying broken until the flow is redeployed.
     */
    function claimOrError(): Error | null {
      if (!machine) return new Error(runtimeT(RED, 'errors.noMachine'))
      if (claimed) return null
      const claim = machine.claimHub(node)
      if (claim.ok) {
        claimed = true
        subscribeToMachine()
        node.status({ fill: 'blue', shape: 'dot', text: runtimeStatus('starting') })
        return null
      }
      const ownerName = claim.owner?.name || claim.owner?.id || '?'
      return new Error(runtimeT(RED, 'errors.hubConflict', { name: ownerName }))
    }

    const initialClaimError = claimOrError()
    if (initialClaimError) {
      node.status({ fill: 'red', shape: 'ring', text: runtimeStatus(machine ? 'hubConflict' : 'machineNotFound') })
      // Report through output 3 as well, so the error is visible without an input.
      setTimeout(() => {
        if (!claimed) sendError(initialClaimError)
      }, 0)
    }

    function emitState(event: any): void {
      if (closed) return
      sawState = true
      node.send([stateMessage(machine, event, includeVars, stateTopic), null, null])
      const states: string[] = event.states ?? []
      node.status({ fill: 'green', shape: 'dot', text: states.join('+') || runtimeStatus('running') })
    }

    function emitCurrent(): void {
      if (!machine) return
      const current = machine.getCurrentState()
      if (current) emitState(current)
    }

    function subscribeToMachine(): void {
      if (!machine || unsubscribe) return
      unsubscribe = machine.subscribe((event: any) => {
        if (closed) return
        if (event.type === 'state') {
          emitState(event)
        } else if (event.type === 'send') {
          const internal = event.target === '#_internal' || !!event.sendid
          if (internal && !includeInternalSends) return
          node.send([null, eventMessage(machine, event, eventTopic), null])
        } else if (event.type === 'error') {
          const error = event.error instanceof Error ? event.error : new Error(String(event.error))
          sendError(error, undefined, event.location)
        } else if (event.type === 'done') {
          const current = machine.getCurrentState()
          const states = event.states?.length ? event.states : current?.states ?? []
          node.send([null, null, {
            payload: 'done',
            done: true,
            machine: machine.name,
            states,
            vars: current?.vars ?? {},
            ts: Date.now(),
          }])
          node.status({ fill: 'grey', shape: 'dot', text: runtimeStatus('done') })
        }
      })
    }

    node.on('input', async function onInput(msg: any, _send: any, done: (err?: Error) => void) {
      try {
        if (closed) throw new Error(runtimeT(RED, 'errors.closed'))
        if (!machine) throw new Error(runtimeT(RED, 'errors.noMachine'))
        const claimError = claimOrError()
        if (claimError) throw claimError
        const command = String(msg.command || 'event').toLowerCase()
        if (command === 'set') {
          const vars = toJsonData(msg.payload)
          if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
            throw new Error(runtimeT(RED, 'errors.setPayload'))
          }
          await machine.setVars(vars as Record<string, unknown>)
          node.status({ fill: 'green', shape: 'dot', text: runtimeStatus('setVars') })
          done()
          return
        }
        if (command === 'reset') {
          await machine.reset()
          node.status({ fill: 'green', shape: 'dot', text: runtimeStatus('reset') })
          done()
          return
        }
        if (command === 'read') {
          await machine.ensureStarted()
          emitCurrent()
          done()
          return
        }
        if (command !== 'event') {
          throw new Error(runtimeT(RED, 'errors.unknownCommand', { command }))
        }
        const name = String(msg.event !== undefined ? msg.event : msg.topic || '').trim()
        if (!name) throw new Error(runtimeT(RED, 'errors.emptyEvent'))
        const data = toJsonData(msg.payload)
        await machine.sendEvent(name, data)
        node.status({ fill: 'green', shape: 'dot', text: name })
        done()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('error') })
        sendError(error, msg)
        done(error)
      }
    })

    if (machine && emitInitial && claimed) {
      setTimeout(async () => {
        if (closed) return
        try {
          await machine.ensureStarted()
          if (!closed && !sawState) emitCurrent()
        } catch (err) {
          if (!closed) sendError(err instanceof Error ? err : new Error(String(err)))
        }
      }, 0)
    }

    node.on('close', function onClose(_removed: boolean, done: () => void) {
      closed = true
      unsubscribe?.()
      if (claimed && machine) machine.releaseHub(node)
      done()
    })
  }

  RED.nodes.registerType('statechart-hub', HubNode)
}
