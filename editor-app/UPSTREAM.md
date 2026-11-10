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
- Runtime entry: Node-RED `httpAdmin` `/statechart/editor/`.
- Mode: `?nodered=1&id=<configNodeId>&lang=zh-CN`; receives/sends ProjectDoc via postMessage.
