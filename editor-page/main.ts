import 'statechart-kit/vue/style.css'
import { mountEditor } from 'statechart-kit/vue'
import { createNodeRedAdapter } from './adapter'
import { englishDiagnostics } from './diagnostics-en.mjs'

const params = new URLSearchParams(location.search)
const english = (params.get('lang') || '').toLowerCase().startsWith('en')

if (english) document.documentElement.lang = 'en'

const labels = english
  ? {
      appTitle: 'State chart editor',
      save: 'Save to Node-RED',
      exit: 'Close',
    }
  : {
      appTitle: 'State chart',
      save: '保存到 Node-RED',
      exit: '关闭',
    }

const mounted = mountEditor('#app', {
  adapter: createNodeRedAdapter(english),
  locale: english ? 'en' : 'zh',
  ...(english ? { diagnostics: englishDiagnostics } : {}),
  features: {
    toolbar: true,
    structure: true,
    canvas: true,
    properties: true,
    structuredActions: true,
    variables: true,
    events: true,
    simulation: true,
    simBar: true,
    validation: true,
    importExport: true,
    examples: false,
    undoRedo: true,
    deploy: false,
    exit: true,
    resizablePanes: true,
  },
  labels,
})

mounted.ready.catch((err: unknown) => {
  console.error('[statechart] editor failed to load', err)
  const el = document.getElementById('app')
  if (el) {
    const detail = err instanceof Error ? err.message : String(err)
    el.textContent = english ? `Editor failed to load: ${detail}` : `编辑器加载失败：${detail}`
  }
})
