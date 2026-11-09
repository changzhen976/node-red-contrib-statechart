import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'

export type EngineMode = 'sandboxed' | 'trusted'

interface EngineModule {
  createSession(source: string, options?: Record<string, unknown>): Promise<any>
}

let sandboxedPromise: Promise<EngineModule> | null = null
let trustedPromise: Promise<EngineModule> | null = null
let domParserPromise: Promise<DOMParserLike> | null = null

/** Load the engine entry point lazily; Node-RED startup stays synchronous. */
export function loadEngine(mode: EngineMode): Promise<EngineModule> {
  if (mode === 'trusted') {
    trustedPromise ??= import('@tinyactors/scxmljs/trusted') as unknown as Promise<EngineModule>
    return trustedPromise
  }
  sandboxedPromise ??= import('@tinyactors/scxmljs') as unknown as Promise<EngineModule>
  return sandboxedPromise
}

/** happy-dom is deliberately not used: xmldom is smaller and supports CDATA. */
export function getDomParser(): Promise<DOMParserLike> {
  domParserPromise ??= (async () => {
    const { DOMParser } = await import('@xmldom/xmldom')
    const parser = new DOMParser({
      onError(level: string, message: string) {
        if (level !== 'warning') throw new Error(message)
      },
    })
    return parser as unknown as DOMParserLike
  })()
  return domParserPromise
}

export interface MachineSessionOptions {
  engine: EngineMode
  scriptTimeoutMs: number
  maxMicrosteps: number
  /** Initial data values, used to restore persisted variables before start. */
  data?: Record<string, unknown>
}

export async function createMachineSession(
  source: string,
  options: MachineSessionOptions,
): Promise<any> {
  const engine = await loadEngine(options.engine)
  const domParser = await getDomParser()
  const sessionOptions: Record<string, unknown> = {
    domParser,
    scriptTimeoutMs: options.scriptTimeoutMs,
    maxMicrosteps: options.maxMicrosteps,
  }
  if (options.data) sessionOptions.data = options.data
  return engine.createSession(source, sessionOptions)
}
