# Changelog

## 0.8.0 — 2026-11-14

侧栏体验与 `statechart-kit@0.13.0` 适配版本：新增监控画布相机、侧栏直接编辑入口、
`raise` / internal-only 事件与内部事件示例；修复监控 guard 显示、托盘 `raise`
数据损坏和 `initial` 不一致。

### Added

- 新增 `examples/internal-events.json`：**07 Raise & Internal Events** 演示
  `raise` 与 `eventVisibility: internal`，并展示外部同名事件被 SCXML guard 忽略、
  `raise` 不出现在 Hub 输出 2。

- 侧栏监控的画布相机：**Ctrl/⌘ + 滚轮**以鼠标位置为中心连续缩放（30%–300%），
  **滚轮/拖拽**平移，工具栏提供缩放百分比、**适应窗口**和 **100%** 复位；不再使用
  100/125/150/180/220 的固定档位。相机逻辑独立在 `monitor/camera.mjs`，并用
  `test/camera.test.cjs` 覆盖缩放锚点与 Fit 计算。
- 侧栏增加 **编辑** 按钮：选中机器后直接打开完整编辑器，不必先打开 Hub/Machine
  配置窗。编辑器通过 `opener.parent` 定位 Node-RED 主窗口（URL 带 `host=top` 标记）；
  从侧栏 iframe 打开时会找到真正的宿主窗口，保存仍走现有 `scxml:save` →
  `RED.nodes.dirty(true)`，需要用户点 Update/Deploy。
- `scxmlMonitorUrl` 携带 Node-RED 当前语言，侧栏打开编辑器时沿用该语言。

### Changed

- 内置 `statechart-kit` 从 0.11.0 升级到 0.13.0：新增 `raise` 动作、
  `ProjectDoc.eventVisibility`、internal-only 转移 guard 与
  `serializeToDisplayScxml()`；0.12.1 起结构编辑会维护 `initial` 不变量。
- 监控侧栏改用 `serializeToDisplayScxml()` 渲染图形，不再把
  `_event.type === 'internal'` 显示成作者条件；运行时 SCXML 仍保留 guard。
- 托盘三表编辑器补上 `raise` 动作和 `initial` 不变量；含内部事件的文档显示
  只读提示，引导用户到完整编辑器修改可见性。
- 诊断映射新增 `structure.transition.mixed-event-visibility`，中/英/zh 三份
  locale 与英文诊断同步。
- 完整编辑器的保存 ACK 现在区分成功/失败；宿主回 `ok: false` 时编辑器保持
  dirty 并提示，不再把失败当成功。编辑器未收到 `scxml:load` 或加载超时时
  禁止保存，避免空文档覆盖 config node。
- 编辑器的消息桥从“配置窗临时 handler”改为全局 session 注册：支持配置窗和
  侧栏两个入口，同一机器已打开时聚焦已有窗口。

### Fixed

- 修复托盘动作编辑器把 `raise ping` 当成 `script` 保存、最终写成
  `raise undefined` 的数据损坏；未知动作类型现在会拒绝保存而不是静默降级。
- 修复托盘改父级/删除 initial 子状态后 `initial` 为空、校验出现
  `initial-fallback` 的问题；history 不会被选作 compound initial。
- 修复监控画布把 internal-only guard 当成作者条件显示的问题。
- 侧栏监控的画布 `.frame` 只有 `max-height`，短图时 canvas 只按内容高度收缩，
  没有铺满侧栏纵向空间；向下拖拽会被内容底部的画布边界裁切。现在给
  `<scxml-view>` 的 `frame` part 设置 `height: 100%`，canvas 视口填满侧栏，
  相机 Fit 也按完整可用高度计算。

### Tests

- 新增 `test/kit13.test.cjs`：runtime/display 序列化、可见性导入往返、
  `mixed-event-visibility` warning、`raise` DSL 往返。
- 新增 `test/tray-kit13.test.cjs`：托盘 `raise` 渲染与 `ensureInitial`。
- `test/p0.test.cjs` 增加 internal-only 事件运行时与监控 graph 回归；
  `test/examples.test.cjs` 校验新示例的 `raise`/visibility。

## 0.7.0 — 2026-11-13

稳定性与测试补全版本：不新增节点，不改变 `ProjectDoc`；内置 `statechart-kit`
从 0.10.0 升级到 0.11.0，SCXML 序列化新增 `data-kit-transition-id` 属性。

2026-11-12 的 `0.7.0-dev.0` 与 2026-11-13 的 staging 构建均已在测试服务器验证；
托盘编辑器、独立编辑器（中文 / en-US）、服务端 E2E 与级联 14/14 通过。

### Changed

- 内置 `statechart-kit` 从 0.10.0 升级到 0.11.0：`RunnerDoneEvent.states`、
  运行时错误定位字段、公开诊断 code 目录，以及编辑器的 `locale: 'en'` /
  `diagnostics` 注入能力。
- 删除宿主的 kit 0.10 兼容回退：`done` 直接使用 `event.states`，不再保存最后
  `fired` 目标；删除 `done` 后的空 `active` 过滤。宿主现在要求 kit 0.11.0。
- 全页编辑器跟随 Node-RED 语言：`lang=en*` 时启用 kit `locale: 'en'`、英文
  工具栏/按钮，并注入宿主英文诊断 formatter；中文默认行为不变。
- 全页编辑器启用 `resizablePanes`：左右栏可拖拽调宽、双击复位、可折叠。

### Fixed

- `statechart-hub` 在「未选择 Machine」或「Machine 已被其他 Hub 占用」时，除
  `node.error` 外还会向输出 3 发送 `{ payload, error, machine, topic:
  "statechart/error" }`，与运行时错误使用同一出口。
- 被占用 Hub 释放后，等待中的第二个 Hub 会在下一次输入时重新尝试 claim，不再
  永久停留在红灯状态（无需为它单独重新部署）。
- 连续「事件 → 设变量」时，`sendEvent` / `setVars` 现在等待
  `SessionRunner.settled()`。此前引擎的异步宏步可能让 `set` 抢在上一事件的
  transition action 之前执行，导致变量结果取决于时序。
- 独立编辑器保存 ACK 超时现在返回失败，不再静默当作保存成功；`exit` 会保留
  页面并提示，避免丢失修改。
- `statechart-hub` 输出 3 转发 kit 0.11 的可选错误定位字段（`stateId` /
  `transitionId` / `slot` / `actionIndex` / `element`），可定位出错状态、转移和动作。
- `done` 输出使用 kit 0.11 的 `done.states`，并避免终态被重复发布；不再依赖
  最后一次 `fired` 目标。
- tray 表单补上 `structure.state.donedata-param-duplicate` 的中英文映射。

### Tests

- 新增 `test/lifecycle.test.cjs`（11 个用例）：Hub 配置错误出口、冲突接管、
  unknown variable、非法 ProjectDoc JSON、运行时脚本错误、真实错误定位字段、
  真实终态 done.states、事件/赋值顺序、reset 恢复与延时取消、read 初始状态。
- 新增 `test/browser-lib.mjs`：所有 WebDriver 命令带独立超时；不再把 Node-RED
  的 Promise 返回给 WebDriver；重写 `test/browser-smoke.mjs` 与
  `test/browser-p4.mjs`，覆盖托盘编辑器、监控侧栏、action 对话框、独立编辑器
  保存回写、名称同步、dirty 标记与关闭。
- 新增 `test/e2e-server.mjs`：通过 Admin API 临时部署一个 Hub flow，走真实
  HTTP 验证初始状态、next/reset/read、终态 done，以及未选 Machine 时输出 3 的
  本地化错误文案；结束后删除临时流程与 context key。
- 新增 `npm run test:live`：自动启动临时 Node-RED（临时 userDir + 本包软链），
  导入编辑器 fixture 与级联示例，依次跑托盘编辑器、独立编辑器、服务端 E2E 和
  级联套件；GitHub Actions 增加每周/手动的 `live-e2e` workflow。
- `browser-p4` 增加保存 ACK 超时回归：阻断 `postMessage` 后保存必须失败、父节点
  `doc` 不变且编辑器保持 dirty；恢复后再保存成功。
- `test:cascade` 增加预检与导入提示，缺失级联 tab 时给出可执行指引。
- 新增 `test/kit-compat.test.cjs`：校验 kit 0.11 `STRUCTURE_ISSUE_CODES`
  与宿主 `CODE_MAP` / 中英文文案的覆盖。
- `kit09` 测试断言 kit 0.11 序列化器写出的 `data-kit-transition-id`，并验证
  SCXML round-trip 保留转移 id。
- 新增 `test/diagnostics-en.test.cjs`：校验英文诊断覆盖 kit 0.11 公开的 naming /
  structure / validation / variable code 目录，并检查参数插值。
- `browser-p4` 增加 en-US 真实机器校验回归：加载含非法 final 出边的文档，
  断言校验弹窗显示英文 `Final state ...` 诊断，而不是 kit 的中文文案。
- `npm run verify:all` 增加 typecheck，并可用 `STATECHART_BROWSER=1` /
  `STATECHART_E2E=1` 纳入浏览器与服务端 E2E。

### Compatibility

- `ProjectDoc` 结构不变；SCXML 语义不变，仅序列化器为转移写出
  `data-kit-transition-id`，导入器会保留该属性。
- 宿主要求 `statechart-kit >= 0.11.0`；0.10 的 done/error 回退已删除。
- kit 0.11 的错误定位只使用 DOM Level 1 API，`@xmldom/xmldom` 下可正常产生
  `stateId` / `slot` / `actionIndex` 等字段；0.10 预演时的 `Element.closest`
  阻塞已在上游修复。
- 英文编辑器目前覆盖工具栏、结构/属性标签、按钮和校验诊断；kit 0.11.0 仍把
  kind 徽标、画布缩放提示、action 编辑器、校验弹窗“定位”等少量深层文案硬编码为
  中文，待 kit 后续版本修复。中文界面不受影响。

## 0.6.1 — 2026-11-12

### Changed

- Docs-only release: publish the Hub-focused README/README.en, the
  `docs/images/hub-demo.png` usage screenshot and `docs/hub-contract.md`.
- No runtime, API or ProjectDoc changes.

## 0.6.0 — 2026-11-12

### Changed

- Upgrade the bundled `statechart-kit` from 0.9.0 to 0.10.0. ProjectDoc and
  SCXML output are unchanged; this brings the editor's target/transitionType
  editing, DoneData editor, optional Explorer and structure auto-scroll.
- Map the new `structure.state.final-transition` validation code and add
  localized messages for it.
- Keep `features.explorer` disabled by default; no host behavior change.
- Restructure README/README.en around Hub quick start and per-node minimal
  usage; move the detailed message/config contract to `docs/hub-contract.md`.
- Add `docs/images/hub-demo.png`, a typical Hub flow screenshot, to both READMEs.

## 0.5.0 — 2026-11-12

### Changed

- **BREAKING**: removed `statechart-in` and `statechart-out`. Use one
  `statechart-hub` per machine; action nodes (`statechart-event`,
  `statechart-set`, `statechart-reset`) feed its input and its three outputs
  carry state, chart sends, and errors/done.
- Migrated `examples/demo-suite.json`, `examples/cascade-test.json`,
  `examples/traffic-light.json` and the test suite from in/out to Hub.
- Updated README, help and node documentation for the Hub-only architecture.

## 0.4.0 — 2026-11-11

### Added

- Hub editor warning when another hub already references the same machine
  (the runtime claim remains authoritative).
- Hub output 3 now emits a `done` message (`payload: "done"`, `done: true`)
  before the node status changes.
- `statechart-read`: reads a snapshot/state/variable from a machine or incoming
  Hub state, and can copy the result to flow/global context.
- `statechart-event` supports `msg.event` event source plus flow/global context
  data; `statechart-set` supports flow/global value sources.
- Hub demo now includes a read/context step.

## 0.3.0 — 2026-11-11

### Added

- `statechart-hub`: flow-visible machine hub with one input and three outputs
  (state, chart `<send>` events, errors). A machine can be claimed by only one
  hub at runtime; a second hub fails with a clear error instead of duplicating
  outputs.
- `statechart-event`, `statechart-set` and `statechart-reset`: low-code action
  nodes that produce event/set/reset messages without selecting a Machine.
- `examples/hub-demo.json` and `test/hub.test.cjs` covering hub output,
  event/set/reset flow, and the single-hub claim.

## 0.2.1 — 2026-11-11

### Added

- `examples/cascade-test.json`: a three-machine cascade test bed (Cell parallel
  history, Supervisor hierarchy/timeout, Job nested/parallel/deep history) with
  a shared event router and global-context state/event recorders.
- `npm run test:cascade` (`scripts/test-cascade.mjs`): drives the example over
  the Node-RED admin API and asserts the main state-machine scenarios.
- `test/kit09.test.cjs`: targetless transition and `<donedata>` import/serialize
  coverage for the 0.9 kit contract.

### Changed

- Upgrade the bundled `statechart-kit` from 0.8.0 to 0.9.0. This picks up the
  KIT-001 sidebar scroll fix (0.8.1), `<donedata>` roundtrip (KIT-003) and
  targetless/internal transitions (KIT-004). The tray editor now offers an
  “internal transition” target and maps the new validation codes.
- `TransitionEdge.target` is now `string | null`; host code that renders the
  Node-RED tray form handles the null target. The runtime bundle and existing
  ProjectDoc/raw-SCXML data need no migration.

### Fixed

- The runtime now publishes the final transition target immediately before
  `done`, so a terminal state remains visible in state output and the monitor
  instead of disappearing behind an empty configuration.
- The cascade example models Supervisor/Cell terminal states as visible
  compound states with nested finals, and clears a stale Job on stop/fault/
  shutdown or on a re-start while the Cell is already running.
- Cell now wraps its parallel regions in a `running` compound state so the
  shallow/deep history pseudo-states are ordinary compound children. This
  avoids an upstream `<scxml-view>` layout crash with history directly under
  `<parallel>` and keeps the full editor import warning-free.
- The full-page editor now keeps the Node-RED config-node name, `ProjectDoc.name`
  and the exported SCXML `<scxml name="…">` in sync. Opening the editor prefers
  the dialog's Name field; saving from the editor updates the config node name.

## 0.2.0 — 2026-11-11

### Changed

- The runtime is now built on `statechart-kit@0.8.0`: document model, SCXML
  serializer/importer, structure validation and `SessionRunner` all come from the
  kit. `src/vendor/scxml-core` and the local engine loader are gone.
- The full-screen editor now uses `statechart-kit/vue` (`mountEditor` with a
  Node-RED `EditorAdapter`). The donor SPA build (`editor-app/`) and the 17
  build-time string replacements are removed.
- The runtime event bridge uses the kit's typed `send` / `error` / `done`
  events; a terminal state no longer produces an extra empty state message.
- Tray-form validation now delegates to the kit's `validateStructure` (delays
  below 10 ms are rejected; event-name syntax is still checked by the host).

### Added

- `/statechart/editor/` is served by the new `editor-page/` bundle (kit Vue
  editor + postMessage adapter). The editor does not autosave; the explicit
  "保存到 Node-RED" button writes `node.doc` / `node.source`.

### Fixed

- The standalone editor's close button now closes the window. Unsaved edits
  trigger a confirmation; confirming saves to Node-RED before closing.
- `postMessage` now sends a JSON clone of the document. The Vue reactive Proxy
  previously raised `DataCloneError`, which made save and close silently do
  nothing.
- `npm run check:kit` guards the bundled kit version, dist freshness and that
  the runtime bundle never `require`s `statechart-kit`.
- CI checks out/builds `statechart-kit@v0.8.0` before installing the package.

### Removed

- `src/vendor/`, `editor-app/`, `scripts/{sync,check}-vendor.mjs`,
  `scripts/vendor-patch.mjs` and the donor build patching in `esbuild.config.mjs`.

### Compatibility

- `ProjectDoc` and stored flow data are unchanged; no migration is required.
- `delayMs < 10` is now rejected by the tray validator (previously only `<= 0`).
- The full-page editor opens one machine per window; the donor multi-machine
  selector is no longer part of the Node-RED editor.

## 0.1.3 — 2026-11-10

### Fixed

- "Save to Node-RED" from the standalone editor now also lands in a **brand-new**
  machine dialog. The config node is not registered in `RED.nodes` until the dialog is
  confirmed, so the save used to be dropped silently (and no "sent" confirmation was
  shown). Existing-machine edits are unchanged.

## 0.1.2 — 2026-11-10

### Fixed

- The standalone editor no longer shows the donor project's name in its toolbar: the
  brand reads **State chart** and its stored UI state uses the `statechart:` key prefix.
- The monitor page no longer repeats its title when embedded in the Node-RED sidebar;
  only the machine selector, zoom, refresh and status controls remain.
- The standalone editor no longer documents donor-only features: the variable help
  describes machine-local variables only, prefix rules for a globals registry, MQTT
  bridge, server clock and system events are gone, and the donor service/API entry
  points are hidden.

### Added

- Screenshots of the sidebar monitor and the standalone editor in both READMEs.

## 0.1.0 — 2026-11-10

First public release.

### Changed

- Renamed the package from `node-red-contrib-scxmljs` to `@changzhen976/node-red-contrib-statechart` (v0.1.0, public scoped package).
- Node types are now `statechart-machine` / `statechart-in` / `statechart-out`.
- HTTP routes moved from `/scxmljs/...` to `/statechart/...`; capability header is now `x-statechart-token`.
- Palette entries use `paletteLabel` (no more raw `scxml-in` / `scxml-out` labels) and display **State chart**; nodes have a custom icon.
- English UI uses "State chart"; Chinese UI keeps "状态机".
- Moved the full-editor entry to a primary callout at the top of the machine config dialog; the standalone page title is overridden to `State chart editor — Node-RED` at build time.
- Docked the standalone editor's Node-RED bar to a 44px bottom strip and reserved its layout space, so it no longer covers the canvas.
- Hid the donor "exit edit" button in Node-RED mode; it returned to a gallery that does not exist there, and the bar already offers "Close".

### Fixed

- Preserve the selected state machine when refreshing the monitor view.
- Keep the sidebar resize handle above the monitor iframe and disable iframe pointer events while dragging so the preview can be narrowed.
- Use a green Node-RED 5.x compatibility badge in the bilingual READMEs.

- Sidebar tab now uses a valid `iconClass` and updates its banner title when switching tabs.
- Monitor controls use a balanced 2×2 grid on narrow sidebars instead of clipping.

### Added

- Capability token for monitor/standalone editor routes and APIs.
- Runtime status/error catalogs (server language) and `verify:all` / CI workflow.

- P4 standalone full-screen editor (`/statechart/editor/`) reusing the creator SPA, opened from the machine config and bridged with postMessage; supports switching between all `statechart-machine` config nodes; editor view is locked and Ctrl/Cmd+S saves.

- `statechart-machine` / `statechart-in` / `statechart-out` Node-RED nodes.
- ProjectDoc-first configuration with legacy SCXML `source` fallback.
- State / transition / variable tables, structured actions editor and structural validation.
- Read-only live state monitor (`/statechart/monitor`) and editor sidebar.
- `msg.command = set/reset/event`, auto `updateEvent`, serialized input queue, variable persistence.
- `outputMode`, `stateTopic`, `eventTopic`.
- English / Simplified Chinese language packs with localized help.
- `examples/demo-suite.json` (6 tabs / 8 machines).

### Compatibility

- Node-RED 5.x, Node.js >= 22.9 (tested on Node 22.9 and Node 24.22).
- `@tinyactors/scxmljs@0.2.0-dev.0`, `@xmldom/xmldom@^0.9.12`.

## 0.1.0-dev.0 — 2026-11-09

Initial development preview. Not published.
