function resolveEventName(msg: any, config: any): string {
  switch (config.eventSource) {
    case 'fixed':
      return String(config.fixedEvent || '').trim()
    case 'msg.event':
      return String(msg.event || '').trim()
    case 'payload':
      return typeof msg.payload === 'string' ? msg.payload.trim() : ''
    case 'topic':
    default:
      return String(msg.topic || '').trim()
  }
}

function toJsonData(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    throw new Error('msg.payload is not JSON-serializable')
  }
}

export function registerIn(RED: any): void {
  function InNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    const machine = config.machine ? RED.nodes.getNode(config.machine) : null

    if (!machine) {
      node.status({ fill: 'red', shape: 'ring', text: 'machine not found' })
    }

    node.on('input', async function onInput(msg: any, _send: any, done: (err?: Error) => void) {
      try {
        if (!machine) throw new Error('no scxml-machine configured')
        const command = String(msg.command || 'event').toLowerCase()
        if (command === 'set') {
          const vars = toJsonData(msg.payload)
          if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
            throw new Error('set command requires msg.payload to be an object')
          }
          await machine.setVars(vars)
          node.status({ fill: 'green', shape: 'dot', text: `set ${Object.keys(vars).length} var(s)` })
          done()
          return
        }
        if (command === 'reset') {
          await machine.reset()
          node.status({ fill: 'green', shape: 'dot', text: 'reset' })
          done()
          return
        }
        if (command !== 'event') {
          throw new Error(`unknown command: ${command}`)
        }
        const name = command === 'event' && msg.event !== undefined
          ? String(msg.event || '').trim()
          : resolveEventName(msg, config)
        if (!name) throw new Error('event name is empty')
        const data = toJsonData(msg.payload)
        await machine.sendEvent(name, data)
        node.status({ fill: 'green', shape: 'dot', text: name })
        done()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        node.status({ fill: 'red', shape: 'ring', text: 'error' })
        node.error(error, msg)
        done(error)
      }
    })
  }

  RED.nodes.registerType('scxml-in', InNode)
}
