/**
 * Node-RED host adapter for the kit editor.
 *
 * The page is opened by the `statechart-machine` config dialog and talks to it
 * only via `postMessage` (same origin). It never reads RED.*, localStorage or
 * the admin API, so the kit editor keeps its host boundary.
 */
import type { ProjectDoc } from 'statechart-kit'
import type { EditorAdapter } from 'statechart-kit/vue'

const ACK_TIMEOUT_MS = 1500
const LOAD_TIMEOUT_MS = 4000

let machineId = new URLSearchParams(location.search).get('id') ?? ''
let resolveLoad: ((doc: ProjectDoc | null) => void) | null = null
let resolveAck: (() => void) | null = null

const loaded = new Promise<ProjectDoc | null>((resolve) => {
  resolveLoad = resolve
})

function post (type: string, payload: Record<string, unknown> = {}): boolean {
  if (!window.opener || window.opener.closed) return false
  window.opener.postMessage({ type, id: machineId, ...payload }, location.origin)
  return true
}

function settleLoad (doc: ProjectDoc | null): void {
  const resolve = resolveLoad
  resolveLoad = null
  resolve?.(doc)
}

window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return
  const data = event.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return
  if (data.type === 'scxml:load') {
    if (typeof data.id === 'string' && data.id) machineId = data.id
    settleLoad((data.doc as ProjectDoc | null | undefined) ?? null)
  } else if (data.type === 'scxml:save-ack') {
    const resolve = resolveAck
    resolveAck = null
    resolve?.()
  }
})

function saveToNodeRed (doc: ProjectDoc): Promise<void> {
  if (!post('scxml:save', { doc })) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolveAck = null
      resolve()
    }, ACK_TIMEOUT_MS)
    resolveAck = () => {
      clearTimeout(timer)
      resolve()
    }
  })
}

function download (xml: string, doc: ProjectDoc): void {
  const blob = new Blob([xml], { type: 'application/scxml+xml' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${doc.name || 'chart'}.scxml`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function createNodeRedAdapter (): EditorAdapter {
  return {
    load: () => {
      if (!window.opener || window.opener.closed) {
        settleLoad(null)
        return null
      }
      post('scxml:ready')
      setTimeout(() => settleLoad(null), LOAD_TIMEOUT_MS)
      return loaded
    },
    // No autosave: the kit only marks dirty until the explicit save button posts
    // scxml:save. This keeps Node-RED flows from becoming dirty on every edit.
    exportProject: (doc) => saveToNodeRed(doc),
    exportScxml: (xml, doc) => download(xml, doc),
    exit: (doc) => {
      void saveToNodeRed(doc).finally(() => window.close())
    },
    onDirtyChange: (dirty) => {
      document.title = `${dirty ? '● ' : ''}State chart editor — Node-RED`
    },
    onLog: (entry) => {
      if (entry.level === 'error') console.error('[statechart]', entry.text)
    },
    // Node-RED admins already trust the flows they edit; avoid fetching QuickJS WASM here.
    runner: { engine: 'trusted' },
  }
}
