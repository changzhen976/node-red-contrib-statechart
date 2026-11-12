import { runtimeStatus, runtimeT } from '../runtime/i18n'

function expandKey(template: string, machine: any, event?: string): string {
  return String(template || '')
    .replace(/\{machine\}/g, machine?.name || machine?.id || '')
    .replace(/\{event\}/g, event || '')
}

function statesFromMessage(msg: any): string[] {
  if (Array.isArray(msg.states)) return [...msg.states]
  if (typeof msg.payload === 'string') return [msg.payload]
  if (Array.isArray(msg.payload)) return [...msg.payload]
  return []
}

export function registerRead(RED: any): void {
  function ReadNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    const machine = config.machine ? RED.nodes.getNode(config.machine) : null
    const mode = ['snapshot', 'state', 'var'].includes(config.mode) ? config.mode : 'snapshot'
    const variable = String(config.variable || '').trim()
    const scope = ['flow', 'global'].includes(config.scope) ? config.scope : 'none'
    const contextKey = String(config.key || '').trim()

    node.on('input', async function onInput(msg: any, send: any, done: (err?: Error) => void) {
      try {
        let current: any = null
        if (machine) {
          await machine.ensureStarted()
          current = machine.getCurrentState()
        }
        const states = current?.states ?? statesFromMessage(msg)
        const vars = current?.vars ?? (msg.vars && typeof msg.vars === 'object' ? msg.vars : {})
        const event = current?.event ?? msg.event
        if (!states.length && !Object.keys(vars).length) {
          throw new Error(runtimeT(RED, 'errors.noState'))
        }
        let value: unknown
        if (mode === 'state') {
          value = states.length === 1 ? states[0] : [...states]
        } else if (mode === 'var') {
          if (!variable) throw new Error(runtimeT(RED, 'errors.unknownVariable', { id: '(empty)' }))
          if (!Object.prototype.hasOwnProperty.call(vars, variable)) {
            throw new Error(runtimeT(RED, 'errors.unknownVariable', { id: variable }))
          }
          value = vars[variable]
        } else {
          value = { states: [...states], vars: { ...vars }, event: event ?? null, ts: Date.now() }
        }

        let key = ''
        if (scope !== 'none') {
          key = expandKey(contextKey, machine, event)
          if (!key) throw new Error(runtimeT(RED, 'errors.emptyContextKey'))
          const store = scope === 'global' ? node.context().global : node.context().flow
          await store.set(key, value)
        }

        const out = {
          ...msg,
          payload: value,
          states: [...states],
          vars: { ...vars },
          statechart: { states: [...states], vars: { ...vars }, event: event ?? null, ts: Date.now() },
        }
        if (machine) out.machine = machine.name
        if (scope !== 'none') out.context = { scope, key, value }
        node.status({ fill: 'green', shape: 'dot', text: scope === 'none' ? runtimeStatus('read') : `${scope}:${key}` })
        send(out)
        done()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('error') })
        node.error(error, msg)
        done(error)
      }
    })
  }

  RED.nodes.registerType('statechart-read', ReadNode)
}
