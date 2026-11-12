import { runtimeStatus } from '../runtime/i18n'

export function registerReset(RED: any): void {
  function ResetNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    node.on('input', function onInput(msg: any, send: any, done: (err?: Error) => void) {
      try {
        node.status({ fill: 'green', shape: 'dot', text: runtimeStatus('reset') })
        send({ ...msg, command: 'reset' })
        done()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        node.status({ fill: 'red', shape: 'ring', text: runtimeStatus('error') })
        node.error(error, msg)
        done(error)
      }
    })
  }

  RED.nodes.registerType('statechart-reset', ResetNode)
}
