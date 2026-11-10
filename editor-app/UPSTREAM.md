# P4 独立编辑器构建产物

- Source: `../scxml-creator` @ `edd8558`（Vue 3 + Vite）
- Adapter: `src/nodered-bridge.ts` + Node-RED mode in `src/main.ts`
- Build command:
  ```sh
  cd ../scxml-creator
  npx vite build --base=./
  ```
- Copied from `../scxml-creator/dist/` into this directory.
- Do not hand-edit this directory; rebuild the donor SPA and copy again.
- 本地替换：`assets/index-*.js` 中内置 API 文档的示例 MQTT broker 地址已改为 `localhost`（随产物发布的示例不应指向内网主机）。重新拷贝产物后需要再执行一次，`npm run release:check` 会检测遗漏。
- 本地替换：工具栏品牌 `scxmljs-creator` 改为 `State chart`，localStorage 键前缀 `scxmljs-creator:` 改为 `statechart:`；`index.html` 的 title 改为 `State chart editor — Node-RED`。构建时 `esbuild.config.mjs` 会对 `dist/editor-app` 再做一次同样的替换，重新拷贝产物后由构建保证，`npm run release:check` 会检测遗漏。
- Runtime entry: Node-RED `httpAdmin` `/statechart/editor/`.
- Mode: `?nodered=1&id=<configNodeId>&lang=zh-CN`; receives/sends ProjectDoc via postMessage.
