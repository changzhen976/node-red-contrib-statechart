import { createCamera } from './camera.mjs';

const pagePath = window.location.pathname.replace(/\/monitor\/?$/, '/')
const apiBase = `${pagePath}api/machines`
const capabilityToken = new URLSearchParams(window.location.search).get('token') || ''
const pageLang = new URLSearchParams(window.location.search).get('lang') || ''
function authUrl(url) {
  if (!capabilityToken) return url
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(capabilityToken)
}
const view = document.getElementById('view')
const select = document.getElementById('machine')
const refresh = document.getElementById('refresh')
const zoomIn = document.getElementById('zoom-in')
const zoomOut = document.getElementById('zoom-out')
const zoomFit = document.getElementById('zoom-fit')
const zoomReset = document.getElementById('zoom-reset')
const zoomLabel = document.getElementById('zoom-label')
const editButton = document.getElementById('edit')
const statusEl = document.getElementById('status')
const emptyEl = document.getElementById('empty')
const varsEl = document.getElementById('vars')

let machines = []
let selectedId = ''
let lastState = null
let lastVersion = ''
let pollTimer = null
let polling = false

if (new URLSearchParams(window.location.search).get('embed') === '1') {
  document.body.classList.add('embed')
}

function setZoomLabel(scale) {
  if (!zoomLabel) return
  const text = `${Math.round(scale * 100)}%`
  if (zoomLabel.textContent !== text) zoomLabel.textContent = text
}

const camera = createCamera(view, { onChange: setZoomLabel })
let cameraReady = false
let fallbackZoom = 1

// The old renderer structure is kept as a safety net: if `<scxml-view>` no
// longer exposes `.canvas` / `.diagram`, the buttons fall back to CSS zoom
// instead of doing nothing.
function fallbackZoomBy(factor) {
  fallbackZoom = Math.min(3, Math.max(0.3, fallbackZoom * factor))
  view.style.zoom = String(fallbackZoom)
  setZoomLabel(fallbackZoom)
}

function canOpenEditor() {
  if (!capabilityToken || window.parent === window) return false
  try {
    return !!(window.parent.RED && window.parent.RED.nodes)
  } catch {
    return false
  }
}

const canEdit = canOpenEditor()
if (editButton && !canEdit) editButton.hidden = true

function editorUrl(id) {
  const params = new URLSearchParams({ nodered: '1', id, host: 'top' })
  if (capabilityToken) params.set('token', capabilityToken)
  if (pageLang) params.set('lang', pageLang)
  return `${pagePath}editor/?${params.toString()}`
}

function openEditor() {
  if (!selectedId || !canEdit) return
  const opened = window.open(editorUrl(selectedId), '_blank')
  if (!opened) setStatus('弹窗被拦截，请允许弹窗后重试', 'error')
}

if (editButton && canEdit) {
  editButton.addEventListener('click', openEditor)
}

if (zoomIn) {
  zoomIn.addEventListener('click', () => {
    if (cameraReady) camera.zoomBy(1.25)
    else fallbackZoomBy(1.25)
  })
}

if (zoomOut) {
  zoomOut.addEventListener('click', () => {
    if (cameraReady) camera.zoomBy(1 / 1.25)
    else fallbackZoomBy(1 / 1.25)
  })
}

if (zoomFit) {
  zoomFit.addEventListener('click', () => {
    if (cameraReady) camera.fit()
    else {
      fallbackZoom = 1
      view.style.zoom = '1'
      setZoomLabel(1)
    }
  })
}

if (zoomReset) {
  zoomReset.addEventListener('click', () => {
    if (cameraReady) camera.reset()
    else {
      fallbackZoom = 1
      view.style.zoom = '1'
      setZoomLabel(1)
    }
  })
}

function setStatus(text, kind = '') {
  statusEl.textContent = text
  statusEl.className = `status${kind ? ` ${kind}` : ''}`
}

function showEmpty(text) {
  emptyEl.textContent = text
  emptyEl.hidden = false
  view.hidden = true
  varsEl.hidden = true
}

async function json(url) {
  const res = await fetch(authUrl(url), { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function text(url) {
  const res = await fetch(authUrl(url), { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.text()
}

function applyState(state) {
  lastState = state
  if (!view || !view.shadowRoot) return
  const active = new Set(Array.isArray(state?.states) ? state.states : [])
  for (const box of view.shadowRoot.querySelectorAll('[data-state]')) {
    box.classList.toggle('active', active.has(box.getAttribute('data-state') || ''))
  }
  if (state.vars && Object.keys(state.vars).length) {
    varsEl.textContent = JSON.stringify(state.vars, null, 2)
    varsEl.hidden = false
  } else {
    varsEl.hidden = true
  }
  if (!state.running) {
    setStatus('not started', '')
  } else {
    const label = active.size ? [...active].join(' + ') : 'running'
    setStatus(label, 'ok')
  }
}

function clearHighlight() {
  if (!view || !view.shadowRoot) return
  for (const box of view.shadowRoot.querySelectorAll('[data-state]')) {
    box.classList.remove('active')
  }
}

async function loadGraph() {
  if (!selectedId) return
  const [state, graph] = await Promise.all([
    json(`${apiBase}/${encodeURIComponent(selectedId)}`),
    text(`${apiBase}/${encodeURIComponent(selectedId)}/graph`),
  ])
  lastVersion = state.version
  lastState = state
  emptyEl.hidden = true
  view.hidden = false
  view.source = graph
  applyState(state)
}

async function poll() {
  if (polling || !selectedId || document.hidden) return
  polling = true
  try {
    const state = await json(`${apiBase}/${encodeURIComponent(selectedId)}`)
    if (state.version !== lastVersion) {
      await loadGraph()
    } else {
      applyState(state)
    }
  } catch (err) {
    setStatus(`monitor error: ${err.message}`, 'error')
  } finally {
    polling = false
  }
}

function syncSelectedId(id) {
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('id', id)
    else url.searchParams.delete('id')
    history.replaceState(null, '', url)
  } catch { /* ignore */ }
}

async function selectMachine(id) {
  selectedId = id || ''
  syncSelectedId(selectedId)
  lastState = null
  lastVersion = ''
  if (editButton) editButton.disabled = !selectedId || !canEdit
  clearHighlight()
  if (!selectedId) {
    showEmpty('没有可用的状态机')
    return
  }
  showEmpty('正在加载状态图…')
  try {
    await loadGraph()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(poll, 400)
  } catch (err) {
    showEmpty('加载失败')
    setStatus(err.message, 'error')
  }
}

async function loadMachines() {
  try {
    machines = await json(apiBase)
    // Keep the user's current selection across Refresh. The URL id is only
    // the initial entry point; selecting a machine updates both selectedId
    // and the URL.
    const current = selectedId || new URLSearchParams(window.location.search).get('id')
    select.innerHTML = ''
    if (!machines.length) {
      showEmpty('没有已部署的 statechart-machine')
      setStatus('no machines')
      if (editButton) editButton.disabled = true
      return
    }
    for (const machine of machines) {
      const option = document.createElement('option')
      option.value = machine.id
      option.textContent = machine.name || machine.id
      select.append(option)
    }
    const wanted = (current && machines.some((m) => m.id === current)) ? current : machines[0].id
    select.value = wanted
    await selectMachine(wanted)
  } catch (err) {
    showEmpty('无法读取状态机列表')
    setStatus(err.message, 'error')
    if (editButton) editButton.disabled = true
  }
}

view.addEventListener('scxml-load', () => {
  emptyEl.hidden = true
  view.hidden = false
  if (lastState) applyState(lastState)
})

view.addEventListener('scxml-error', (event) => {
  const detail = event.detail || {}
  showEmpty('状态图渲染失败')
  setStatus(detail.message || 'view error', 'error')
})

select.addEventListener('change', () => {
  selectMachine(select.value)
})

refresh.addEventListener('click', () => {
  loadMachines()
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) poll()
})

customElements.whenDefined('scxml-view')
  .then(() => {
    cameraReady = camera.attach()
    return loadMachines()
  })
  .catch((err) => {
    showEmpty('scxml-view 未加载')
    setStatus(err.message, 'error')
  })
