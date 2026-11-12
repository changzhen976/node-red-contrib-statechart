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

export type MachineErrorSlot = 'entry' | 'exit' | 'transition'

/** Optional runtime-error location supplied by newer statechart-kit versions. */
export interface MachineErrorLocation {
  stateId?: string
  transitionId?: string
  slot?: MachineErrorSlot
  actionIndex?: number
  element?: { localName: string; id?: string }
}

export interface MachineErrorEvent {
  type: 'error'
  error: Error
  /** Present when kit can locate the failing state/transition/action. */
  location?: MachineErrorLocation
  ts: number
}

export interface MachineDoneEvent {
  type: 'done'
  /** Final configuration supplied by newer kit versions; absent on 0.10. */
  states?: string[]
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
