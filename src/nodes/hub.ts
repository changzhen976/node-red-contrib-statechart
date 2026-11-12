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

    if (!machine) {
      const error = new Error(runtimeT(RED, 'errors.noMachine'))
      node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('machineNotFound') })
      node.on('input', function (_msg: any, _send: any, done: (err?: Error) => void) { done(error) })
      node.on('close', function (_removed: boolean, done: () => void) { done() })
      return
    }

    const claim = machine.claimHub(node)
    if (!claim.ok) {
      const ownerName = claim.owner?.name || claim.owner?.id || '?'
      const error = new Error(runtimeT(RED, 'errors.hubConflict', { name: ownerName }))
      node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('hubConflict') })
      node.error(error)
      node.on('input', function (_msg: any, _send: any, done: (err?: Error) => void) { done(error) })
      node.on('close', function (_removed: boolean, done: () => void) { done() })
      return
    }

    let closed = false
    let sawState = false

    function sendError(error: Error, msg?: any): void {
      if (closed) return
      node.send([null, null, {
        payload: error.message,
        error,
        machine: machine.name,
        topic: 'statechart/error',
      }])
      node.error(error, msg)
    }

    function emitState(event: any): void {
      if (closed) return
      sawState = true
      node.send([stateMessage(machine, event, includeVars, stateTopic), null, null])
      const states: string[] = event.states ?? []
      node.status({ fill: 'green', shape: 'dot', text: states.join('+') || runtimeStatus('running') })
    }

    function emitCurrent(): void {
      const current = machine.getCurrentState()
      if (current) emitState(current)
    }

    const unsubscribe = machine.subscribe((event: any) => {
      if (closed) return
      if (event.type === 'state') {
        emitState(event)
      } else if (event.type === 'send') {
        const internal = event.target === '#_internal' || !!event.sendid
        if (internal && !includeInternalSends) return
        node.send([null, eventMessage(machine, event, eventTopic), null])
      } else if (event.type === 'error') {
        const error = event.error instanceof Error ? event.error : new Error(String(event.error))
        sendError(error)
      } else if (event.type === 'done') {
        const current = machine.getCurrentState()
        node.send([null, null, {
          payload: 'done',
          done: true,
          machine: machine.name,
          states: current?.states ?? [],
          vars: current?.vars ?? {},
          ts: Date.now(),
        }])
        node.status({ fill: 'grey', shape: 'dot', text: runtimeStatus('done') })
      }
    })

    node.on('input', async function onInput(msg: any, _send: any, done: (err?: Error) => void) {
      try {
        if (closed) throw new Error(runtimeT(RED, 'errors.closed'))
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

    if (emitInitial) {
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
      unsubscribe()
      machine.releaseHub(node)
      done()
    })
  }

  RED.nodes.registerType('statechart-hub', HubNode)
}
