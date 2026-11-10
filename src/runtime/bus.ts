export interface MachineStateEvent {
  type: 'state'
  states: string[]
  vars: Record<string, unknown>
  changed: boolean
  event?: string
  ts: number
}

export interface MachineSendEvent {
  type: 'send'
  event: string
  data: unknown
  target?: string
  sendid?: string
  ts: number
}

export interface MachineErrorEvent {
  type: 'error'
  error: Error
  ts: number
}

export interface MachineDoneEvent {
  type: 'done'
  ts: number
}

export type MachineEvent =
  | MachineStateEvent
  | MachineSendEvent
  | MachineErrorEvent
  | MachineDoneEvent

export type MachineListener = (event: MachineEvent) => void

/** Small synchronous bus; config node owns it, in/out nodes subscribe. */
export class EventBus {
  private readonly listeners = new Set<MachineListener>()

  subscribe(listener: MachineListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: MachineEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event)
      } catch (err) {
        console.error('[statechart] listener failed:', err)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
