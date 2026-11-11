import 'statechart-kit/vue/style.css'
import { mountEditor } from 'statechart-kit/vue'
import { createNodeRedAdapter } from './adapter'

const mounted = mountEditor('#app', {
  adapter: createNodeRedAdapter(),
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
  },
  labels: {
    appTitle: 'State chart',
    save: '保存到 Node-RED',
    exit: '关闭',
  },
})

mounted.ready.catch((err: unknown) => {
  console.error('[statechart] editor failed to load', err)
  const el = document.getElementById('app')
  if (el) el.textContent = `编辑器加载失败：${err instanceof Error ? err.message : String(err)}`
})
