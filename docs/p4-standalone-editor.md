# P4 设计：独立全屏状态机编辑器

> 状态：P4.1/P4.2 已实现（2026-11-09）；P4 首版可用，P4.3 为可选打磨。
> 结论：**可行，且推荐**。独立页面比 Node-RED 配置对话框更符合 creator 的常规操作，也比在 tray 里手写画布更省成本。

## 1. 为什么可行

当前已经具备三个前提：

- 运行时以 `ProjectDoc` 为源（`scxml-machine.doc`），不依赖编辑器 UI；
- vendor core 已包含 model / serializer / scxml-import / action-parse；
- Node-RED 编辑器与页面同源，可以用 `postMessage` 传递 `ProjectDoc`，不需要页面直接改 Node-RED 内部状态。

独立页面可以复用 `scxml-creator` 已有的 Vue 三栏布局、画布、属性面板、撤销/校验，
而不是在 jQuery 对话框里重新实现一套画布。

## 2. 方案比较

| 方案 | 做法 | 自由度 | 成本 | 风险 |
|---|---|---|---|---|
| **A. 复用 creator SPA**（推荐） | 把 `scxml-creator` 构建成静态 SPA，加 Node-RED adapter；从配置窗口新标签打开 | 高：三栏/画布/属性/撤销/导入导出 | 1–2 会话 | Vue 应用与 Fastify/MQTT 解耦、构建体积、版本同步 |
| B. 新写独立 Vue 页面 | 用 vendor core + 新 UI，专门为 Node-RED 做 | 高 | 3–5 会话 | 重写 UI，但可控 |
| C. 当前原生三张表 | Node-RED tray 内表单 | 中 | 已完成 | 受 tray 宽度限制，无画布 |
| D. tray 内嵌 iframe | 在配置窗口塞 Vue iframe | 低 | 1–2 会话 | 高度/宽度受限，已证明被 footer 裁切 |

**推荐 A**：先把 creator 当“完整编辑器”，Node-RED 只负责“打开 + 回写 doc”；P2 的原生三张表保留为快速编辑/兜底。

## 3. 推荐架构（方案 A）

```text
Node-RED editor
  scxml-machine 配置窗口
    [打开完整编辑器]  ── window.open ──►  /scxmljs/editor?id=<configNodeId>
                                             │
                                             │ postMessage
                                             ▼
                                    scxml-creator SPA
                                    (Vue + 三栏 + 画布)
                                             │
              {type:'scxml:save', id, doc}   │
                                             ▼
  parent: node.doc = JSON.stringify(doc)
          node.source = serializeToScxml(doc)
          RED.nodes.dirty(true)
          (用户点 Update / Deploy)
```

### 页面与路由

- `RED.httpAdmin.get('/scxmljs/editor', ...)` 返回静态 SPA（或单独静态服务）。
- 资源与监控页同源，避免 CORS；路径统一走 `RED.settings.httpAdminRoot`。
- 从 `scxml-machine` 配置窗口增加按钮：
  - `window.open(url, '_blank', 'noopener=no')` 需要拿到 opener 引用；
  - 更稳妥：`const win = window.open(url, '_blank')`，页面 `postMessage` 回来。
- 独立页面打开（没有 opener）时：
  - 显示“请从 Node-RED 配置窗口打开”，或
  - 只支持本地导入/导出（不直接读写 flow），避免后端权限问题。

### postMessage 协议

```ts
// child -> parent
{ type: 'scxml:ready' }
{ type: 'scxml:save', id: string, doc: ProjectDoc, source: string }
{ type: 'scxml:cancel', id: string }

// parent -> child
{ type: 'scxml:load', id: string, name: string, doc: ProjectDoc | null, source?: string, lang: 'zh-CN'|'en-US' }
{ type: 'scxml:save-ack', ok: true }
```

- 校验 `event.origin === window.location.origin`；
- 只接受白名单 `type`；
- parent 收到 save 后写 `node.doc`/`node.source`，标记 dirty；
- 用户在 Node-RED 里点 Update/Deploy，页面不直接调用部署 API；
- 关闭页面/取消不修改 node。

### 多状态机

- parent 可以发送 `{ machines: [{id,name,doc}] }`；页面左侧机器选择器切换；
- 保存按 id 回写对应 config node；
- 配置窗口只打开当前机器时，也可以先只传当前机器，后续再扩展总览。

### 复用边界

直接复用：

- `scxml-creator` 的 Vue 三栏、画布、属性面板、变量表、校验/导入导出；
- vendor core 的 model/serializer/validator/action-parse；
- `scxml-creator` 的 i18n（或复用当前语言包 key）。

需要改：

- 去掉/绕过 Fastify、MQTT、全局变量等 Node-RED 不需要的服务端功能；
- 把“文件/本地存储”改成 postMessage 的 ProjectDoc；
- `node-red` mode 下的保存/关闭按钮文案；
- 资源基路径（`httpAdminRoot`）；
- 页面启动时等待 `scxml:load`，而不是自动从 localStorage 载入。

### 安全

- 路由挂在 `httpAdmin` 下，但**自定义路由不自动鉴权**；需要 `RED.auth.needsPermission('flows.read')` 或只绑定私网；
- 页面只接收同源 postMessage；
- 不把 `doc` 里的 JS 直接执行到 Node-RED 编辑器上下文；
- 完整编辑器可继续用 `trusted`/`sandboxed` 的运行时策略，编辑器不改变运行时安全边界。

## 4. 分阶段

| 阶段 | 内容 | 估算 |
|---|---|---|
| P4.1 | creator 静态构建 + `/scxmljs/editor` + 打开按钮 + postMessage load/save | 1–2 会话 |
| P4.2 | 三栏/画布/属性面板接入，doc 往返，多机选择 | 1–2 会话 |
| P4.3 | 校验/错误定位、i18n、浏览器自动化、与 P2 表单互操作 | 0.5–1 会话 |

## 5. 风险与取舍

- **Vue 应用与 Fastify/MQTT 解耦**是本方案最大的不确定项；如果解耦成本超过 1 会话，转方案 B。
- 打包体积会明显大于当前 47 KB 的 `scxml.html`；作为独立页面可接受。
- creator 与插件需要固定 donor commit；用 `UPSTREAM.md` 记录，升级时同步。
- P4 不是运行时依赖；即使 P4 未完成，P2 三张表仍可用。
- tray 内嵌 iframe 已证明会被裁切，不再考虑。

## 6. 实现状态（2026-11-09）

- `editor-app/`：scxml-creator 静态构建（donor `05d2fa9`）；
- `src/runtime/monitor.ts`：`/scxmljs/editor/` 静态路由（未鉴权，私网使用）；
- `editor/scxml.html`：配置窗口「打开完整编辑器」按钮；
- `src/nodered-bridge.ts`（donor）：`nodered=1` 模式接收/回传 ProjectDoc；
- 浏览器回归：`npm run test:p4`，验证加载 3 状态、机器选择器（Traffic Light / test chart）并回写父窗口 `node.doc`。

P4.3 已完成多机选择、页面锁定 `#/editor`、Ctrl/Cmd+S 保存。可选：页面内错误定位、直接调用 Node-RED API 保存、路由鉴权。

## 7. 结论

**已实现：独立页面可行，且比在 Node-RED tray 内做画布更合理。**
推荐先做 **P4.1 + P4.2（复用 creator SPA）**；如果 Vue/Fastify 解耦成本过高，再退回“专用 Vue 页面”。
当前 P2 原生三张表继续保留，作为快速编辑和 P4 不可用时的 fallback。
