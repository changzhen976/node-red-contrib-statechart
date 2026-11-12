export function expandTopic(template: string, machine: string, event: string): string {
  return template.replace(/\{machine\}/g, machine).replace(/\{event\}/g, event)
}

export function stateMessage(machine: any, event: any, includeVars: boolean, stateTopic: string): any {
  const states: string[] = Array.isArray(event.states) ? event.states : []
  const msg: any = {
    payload: states.length === 1 ? states[0] : states,
    states: [...states],
    changed: !!event.changed,
    machine: machine.name,
    topic: stateTopic
      ? expandTopic(stateTopic, machine.name, String(event.event ?? ''))
      : (states.length === 1 ? states[0] : states.join(',')),
  }
  if (event.event !== undefined) msg.event = event.event
  if (includeVars) msg.vars = event.vars ?? {}
  return msg
}

export function eventMessage(machine: any, event: any, eventTopic: string): any {
  return {
    payload: event.data,
    event: event.event,
    machine: machine.name,
    topic: expandTopic(eventTopic, machine.name || machine.id, event.event),
  }
}
