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

## 构建

`npm run build` 中的 esbuild 步骤把 `editor-page/main.ts` 打成
`dist/editor/main.js`（ESM + chunks）和 `dist/editor/main.css`，并复制
`index.html`。路由由 `src/runtime/monitor.ts` 提供，入口仍为
`/statechart/editor/`。

编辑器会话固定 `engine: 'trusted'`，避免在 Node-RED 管理页里额外拉取 QuickJS
WASM；运行时状态机仍按机器配置使用 sandboxed/trusted。
