import { runtimeStatus, runtimeT } from '../runtime/i18n'

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('fixed event data is not valid JSON')
  }
}

export function registerEvent(RED: any): void {
  function EventNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    const fixedEvent = String(config.event || '').trim()
    const eventSource = config.eventSource === 'msg.event' ? 'msg.event' : 'fixed'
    const dataMode = ['none', 'payload', 'json', 'flow', 'global'].includes(config.dataMode)
      ? config.dataMode
      : 'none'

    node.on('input', async function onInput(msg: any, send: any, done: (err?: Error) => void) {
      try {
        const event = eventSource === 'msg.event'
          ? String(msg.event || '').trim()
          : (fixedEvent || String(msg.event || '').trim())
        if (!event) throw new Error(runtimeT(RED, 'errors.emptyEvent'))
        const out = { ...msg, command: 'event', event }
        if (dataMode === 'none') {
          delete out.payload
        } else if (dataMode === 'json') {
          out.payload = parseJson(String(config.data || ''))
        } else if (dataMode === 'flow' || dataMode === 'global') {
          const key = String(config.dataKey || '').trim()
          if (!key) throw new Error(runtimeT(RED, 'errors.emptyContextKey'))
          const store = dataMode === 'flow' ? node.context().flow : node.context().global
          out.payload = await store.get(key)
        }
        node.status({ fill: 'green', shape: 'dot', text: event })
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

  RED.nodes.registerType('statechart-event', EventNode)
}
