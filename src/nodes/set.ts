import { runtimeStatus, runtimeT } from '../runtime/i18n'

function coerce(value: unknown, type: string): unknown {
  if (type === 'num') return Number(value)
  if (type === 'bool') return value === true || value === 'true'
  if (type === 'json') {
    try {
      return JSON.parse(String(value ?? ''))
    } catch {
      throw new Error('variable value is not valid JSON')
    }
  }
  return String(value ?? '')
}

export function registerSet(RED: any): void {
  function SetNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    const mode = config.mode === 'object' ? 'object' : 'single'
    const variable = String(config.variable || '').trim()
    const valueType = ['payload', 'json', 'str', 'num', 'bool', 'flow', 'global'].includes(config.valueType)
      ? config.valueType
      : 'payload'

    node.on('input', async function onInput(msg: any, send: any, done: (err?: Error) => void) {
      try {
        let vars: Record<string, unknown>
        if (mode === 'object') {
          if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) {
            throw new Error(runtimeT(RED, 'errors.setPayload'))
          }
          vars = { ...msg.payload }
        } else {
          if (!variable) throw new Error(runtimeT(RED, 'errors.unknownVariable', { id: '(empty)' }))
          let value: unknown
          if (valueType === 'payload') {
            value = msg.payload
          } else if (valueType === 'flow' || valueType === 'global') {
            const key = String(config.valueKey || '').trim()
            if (!key) throw new Error(runtimeT(RED, 'errors.emptyContextKey'))
            const store = valueType === 'flow' ? node.context().flow : node.context().global
            value = await store.get(key)
          } else {
            value = coerce(config.value, valueType)
          }
          vars = { [variable]: value }
        }
        node.status({ fill: 'green', shape: 'dot', text: runtimeStatus('setVars') })
        send({ ...msg, command: 'set', payload: vars })
        done()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('error') })
        node.error(error, msg)
        done(error)
      }
    })
  }

  RED.nodes.registerType('statechart-set', SetNode)
}
