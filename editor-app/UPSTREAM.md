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
- 本地替换（捐赠方能力裁剪）：本包没有 globals 注册表、MQTT 桥、服务端时钟和系统事件，因此
  1. 变量面板的帮助文案改为"所有变量都是本机变量"，不再提 `gv_`/`mqv_`；
  2. `ks()`（事件名）与 `oa()`（变量名）里针对 `sys.`/`t_`/`g_`/`gv_`/`mqv_`/`ge_`/`mqe_` 的六个阻断分支被整段删除，只保留结构校验；
  3. 构建时在 `dist/editor-app/index.html` 注入脚本，隐藏捐赠方的「服务管理 / API」入口（那两个面板面向本包不存在的 Fastify 服务，端点目录仍留在 bundle 里但不可达）。
  这些替换依赖当前压缩产物的字面量，`npm run release:check` 会在字面量变化时失败——重新拷贝产物后须同步更新 `esbuild.config.mjs` 里的 `DONOR_REPLACEMENTS`。上游修好后删除这一节与对应的替换。
- Runtime entry: Node-RED `httpAdmin` `/statechart/editor/`.
- Mode: `?nodered=1&id=<configNodeId>&lang=zh-CN`; receives/sends ProjectDoc via postMessage.
