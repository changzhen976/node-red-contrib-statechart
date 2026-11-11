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
let dirty = false

const loaded = new Promise<ProjectDoc | null>((resolve) => {
  resolveLoad = resolve
})

function cloneDoc (doc: ProjectDoc): ProjectDoc {
  // The editor store hands over a Vue reactive Proxy; postMessage cannot
  // structured-clone a Proxy (DataCloneError), so send plain JSON.
  return JSON.parse(JSON.stringify(doc)) as ProjectDoc
}

function post (type: string, payload: Record<string, unknown> = {}): boolean {
  if (!window.opener || window.opener.closed) return false
  try {
    window.opener.postMessage({ type, id: machineId, ...payload }, location.origin)
    return true
  } catch (err) {
    console.error('[statechart] postMessage failed', err)
    return false
  }
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

async function saveToNodeRed (doc: ProjectDoc): Promise<boolean> {
  let payload: ProjectDoc
  try {
    payload = cloneDoc(doc)
  } catch (err) {
    console.error('[statechart] failed to serialize document', err)
    return false
  }
  if (!post('scxml:save', { doc: payload })) return false
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      resolveAck = null
      resolve()
    }, ACK_TIMEOUT_MS)
    resolveAck = () => {
      clearTimeout(timer)
      resolve()
    }
  })
  return true
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

function closeWindow (): void {
  window.close()
  setTimeout(() => {
    if (!window.closed) {
      console.warn('[statechart] the browser refused to close this window')
    }
  }, 300)
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
    exportProject: async (doc) => {
      if (!(await saveToNodeRed(doc))) throw new Error('failed to save to Node-RED')
    },
    exportScxml: (xml, doc) => download(xml, doc),
    exit: (doc) => {
      if (dirty && !window.confirm('状态机有未保存的修改，确定保存并关闭？')) return
      void (async () => {
        if (dirty) {
          if (!(await saveToNodeRed(doc))) {
            window.alert('保存到 Node-RED 失败，未关闭页面。')
            return
          }
        }
        closeWindow()
      })()
    },
    onDirtyChange: (value) => {
      dirty = value
      document.title = `${value ? '● ' : ''}State chart editor — Node-RED`
    },
    onLog: (entry) => {
      if (entry.level === 'error') console.error('[statechart]', entry.text)
    },
    // Node-RED admins already trust the flows they edit; avoid fetching QuickJS WASM here.
    runner: { engine: 'trusted' },
  }
}
