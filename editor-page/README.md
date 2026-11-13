# editor-page

Node-RED 全页编辑器的宿主页：用 `statechart-kit/vue` 的 `mountEditor` 挂载，
通过 `postMessage` 与 `statechart-machine` 配置窗通信。

## 协议

- 子页 → 父窗：`{ type: 'scxml:ready' }`
- 父窗 → 子页：`{ type: 'scxml:load', id, doc, machines, lang }`
- 子页 → 父窗：`{ type: 'scxml:save', id, doc }`
- 父窗 → 子页：`{ type: 'scxml:save-ack', ok: true }`

只接受同源消息。父窗收到 `scxml:save` 后写入 `node.doc` / `node.source` 并
`RED.nodes.dirty(true)`；用户仍需在 Node-RED 里 Update/Deploy。

编辑器不提供自动保存：`adapter` 不实现 `save`，只有显式“保存到 Node-RED”或
“关闭”才会 `postMessage('scxml:save')`，避免每次编辑都把 flow 标脏。

关闭行为：

- 没有修改时直接关闭窗口；
- `onDirtyChange` 为 true 时先 `window.confirm` 二次确认；确认后保存到 Node-RED
  再关闭，保存失败则留在页面并提示；
- `postMessage` 前必须对 `ProjectDoc` 做 JSON 克隆：编辑器 store 的 `doc` 是 Vue
  reactive Proxy，直接发送会抛 `DataCloneError`，表现为保存/关闭无响应。

## 语言

- 页面读取 URL 的 `lang`（父窗打开时已带 `RED.i18n.lang()`）；`en*` 使用
  `mountEditor({ locale: 'en' })` 和英文按钮文案，其他语言保持中文默认。
- kit 0.11 只发布 `diagnostics/zh`；英文诊断由
  [`diagnostics-en.mjs`](diagnostics-en.mjs) 注入，覆盖 kit 公开的 naming /
  structure / validation / variable code 目录。
- 关闭确认、保存失败提示和加载失败文案在 `main.ts` / `adapter.ts` 内按语言切换。
- 左右栏启用 `features.resizablePanes`，可拖拽调宽、双击复位和折叠。

## 构建

`npm run build` 中的 esbuild 步骤把 `editor-page/main.ts` 打成
`dist/editor/main.js`（ESM + chunks）和 `dist/editor/main.css`，并复制
`index.html`。路由由 `src/runtime/monitor.ts` 提供，入口仍为
`/statechart/editor/`。

编辑器会话固定 `engine: 'trusted'`，避免在 Node-RED 管理页里额外拉取 QuickJS
WASM；运行时状态机仍按机器配置使用 sandboxed/trusted。
