/**
 * Node-RED host adapter for the kit editor.
 *
 * The page is opened by the `statechart-machine` config dialog or by the
 * sidebar monitor's Edit button, and talks to the Node-RED editor only via
 * `postMessage` (same origin). It never reads RED.*, localStorage or the admin
 * API, so the kit editor keeps its host boundary.
 */
import type { ProjectDoc } from 'statechart-kit'
import type { EditorAdapter } from 'statechart-kit/vue'

const ACK_TIMEOUT_MS = 1500
const LOAD_TIMEOUT_MS = 4000

let machineId = new URLSearchParams(location.search).get('id') ?? ''
let resolveLoad: ((doc: ProjectDoc | null) => void) | null = null
let resolveAck: ((ok: boolean) => void) | null = null
let dirty = false
let hostReady = false
let loadTimedOut = false
let loadTimer: ReturnType<typeof setTimeout> | null = null

const loaded = new Promise<ProjectDoc | null>((resolve) => {
  resolveLoad = resolve
})

function cloneDoc (doc: ProjectDoc): ProjectDoc {
  // The editor store hands over a Vue reactive Proxy; postMessage cannot
  // structured-clone a Proxy (DataCloneError), so send plain JSON.
  return JSON.parse(JSON.stringify(doc)) as ProjectDoc
}

/**
 * The editor can be opened from the machine config dialog (the opener is the
 * Node-RED page) or from the sidebar monitor iframe (the opener is the iframe,
 * and the real host is its parent). Resolve to the Node-RED page in both cases.
 */
function hostWindow (): Window | null {
  const opener = window.opener
  if (!opener || opener.closed) return null
  const forceTop = new URLSearchParams(location.search).get('host') === 'top'
  try {
    if (forceTop) return opener.parent || opener
    if (opener.parent && opener.parent !== opener) return opener.parent
  } catch {
    // Cross-origin opener: fall back to the opener itself.
  }
  return opener
}

function post (type: string, payload: Record<string, unknown> = {}): boolean {
  const host = hostWindow()
  if (!host) return false
  try {
    host.postMessage({ type, id: machineId, ...payload }, location.origin)
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
    const doc = (data.doc as ProjectDoc | null | undefined) ?? null
    if (doc) hostReady = true
    if (loadTimer) {
      clearTimeout(loadTimer)
      loadTimer = null
    }
    settleLoad(doc)
  } else if (data.type === 'scxml:save-ack') {
    const resolve = resolveAck
    resolveAck = null
    resolve?.(data.ok !== false)
  }
})

async function saveToNodeRed (doc: ProjectDoc): Promise<boolean> {
  if (!hostReady || loadTimedOut) return false
  let payload: ProjectDoc
  try {
    payload = cloneDoc(doc)
  } catch (err) {
    console.error('[statechart] failed to serialize document', err)
    return false
  }
  if (!post('scxml:save', { doc: payload })) return false
  let acknowledged = false
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      resolveAck = null
      console.warn('[statechart] Node-RED did not acknowledge the save in time')
      resolve()
    }, ACK_TIMEOUT_MS)
    resolveAck = (ok) => {
      acknowledged = ok
      clearTimeout(timer)
      resolve()
    }
  })
  return acknowledged
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

export function createNodeRedAdapter (english = false): EditorAdapter {
  return {
    load: () => {
      if (!hostWindow()) {
        settleLoad(null)
        return null
      }
      post('scxml:ready')
      loadTimer = setTimeout(() => {
        loadTimer = null
        loadTimedOut = true
        settleLoad(null)
      }, LOAD_TIMEOUT_MS)
      return loaded
    },
    // No autosave: the kit only marks dirty until the explicit save button posts
    // scxml:save. This keeps Node-RED flows from becoming dirty on every edit.
    exportProject: async (doc) => {
      if (!(await saveToNodeRed(doc))) throw new Error('failed to save to Node-RED')
    },
    exportScxml: (xml, doc) => download(xml, doc),
    exit: (doc) => {
      if (dirty && !window.confirm(english
        ? 'This state chart has unsaved changes. Save and close?'
        : '状态机有未保存的修改，确定保存并关闭？')) return
      void (async () => {
        if (dirty) {
          if (!(await saveToNodeRed(doc))) {
            window.alert(english
              ? 'Failed to save to Node-RED. The page will stay open.'
              : '保存到 Node-RED 失败，未关闭页面。')
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
