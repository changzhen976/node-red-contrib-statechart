function stateMessage(machine: any, event: any, includeVars: boolean): any {
  const states: string[] = Array.isArray(event.states) ? event.states : []
  const msg: any = {
    payload: states.length === 1 ? states[0] : states,
    states: [...states],
    changed: !!event.changed,
    machine: machine.name,
    topic: states.length === 1 ? states[0] : states.join(','),
  }
  if (event.event !== undefined) msg.event = event.event
  if (includeVars) msg.vars = event.vars ?? {}
  return msg
}

export function registerOut(RED: any): void {
  function OutNode(this: any, config: any): void {
    RED.nodes.createNode(this, config)
    const node = this
    const machine = config.machine ? RED.nodes.getNode(config.machine) : null
    const includeVars = config.includeVars !== false
    const emitInitial = config.emitInitial !== false
    const includeInternalSends = config.includeInternalSends === true

    if (!machine) {
      node.status({ fill: 'red', shape: 'ring', text: 'machine not found' })
      node.on('close', function onClose(_removed: boolean, done: () => void) {
        done()
      })
      return
    }

    let sawState = false
    let closed = false

    function emitState(event: any): void {
      if (closed) return
      sawState = true
      const msg = stateMessage(machine, event, includeVars)
      node.send([msg, null])
      const states: string[] = event.states ?? []
      node.status({ fill: 'green', shape: 'dot', text: states.join('+') || 'running' })
    }

    const unsubscribe = machine.subscribe((event: any) => {
      if (closed) return
      if (event.type === 'state') {
        emitState(event)
      } else if (event.type === 'send') {
        const internal = event.target === '#_internal' || !!event.sendid
        if (internal && !includeInternalSends) return
        node.send([
          null,
          {
            payload: event.data,
            event: event.event,
            machine: machine.name,
            topic: `scxml/${machine.name || machine.id}/evt/${event.event}`,
          },
        ])
      } else if (event.type === 'error') {
        node.status({ fill: 'red', shape: 'ring', text: 'error' })
        node.error(event.error)
      } else if (event.type === 'done') {
        node.status({ fill: 'grey', shape: 'dot', text: 'done' })
      }
    })

    if (emitInitial) {
      setTimeout(async () => {
        if (closed) return
        try {
          await machine.ensureStarted()
          if (!closed && !sawState) {
            const current = machine.getCurrentState()
            if (current) emitState(current)
          }
        } catch (err) {
          if (!closed) node.error(err)
        }
      }, 0)
    }

    node.on('close', function onClose(_removed: boolean, done: () => void) {
      closed = true
      unsubscribe()
      done()
    })
  }

  RED.nodes.registerType('scxml-out', OutNode)
}
