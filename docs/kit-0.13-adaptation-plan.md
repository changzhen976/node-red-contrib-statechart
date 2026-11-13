# statechart-kit 0.13 适配计划

> 状态：**P0 + P1 已执行并发布 `0.8.0`；P2 仍为 backlog**
> 宿主基线：`@changzhen976/node-red-contrib-statechart@0.8.0`
> 当前 kit：`0.13.0`
> 目标 kit：`0.13.0`（npm `latest`，2026-11-13）
> 编写日期：2026-11-13
> 结论：**升级风险低，但不能只改版本号**。编译与现有运行时基本兼容；真正需要适配的是
> 新诊断码、监控画布的“实现守卫”显示、托盘编辑器的 `raise` 动作，以及 `initial` 不变量。

---

## 1. 结论摘要

| 方案 | 范围 | 预估工作量 |
| --- | --- | --- |
| **P0 最小可用** | 依赖升级、诊断/i18n、监控显示、运行时回归、必要文档 | **2.5 人日**（约 19h） |
| **P0 + P1 推荐** | 再加托盘 `raise`、托盘 `initial` 对齐、浏览器回归、测试服务器验证 | **4.5 人日**（约 35h） |
| **全量（含 P2）** | 再加托盘事件可见性编辑、`updateEvent` 校验、截图/文档打磨 | **5.5 人日**（约 44h） |

建议按 **3 / 5 / 6 人日** 排期（含约 10% 缓冲），分两次提交/验证：

1. **第一批（P0）**：升到 0.13.0，跑通编译、单测、监控与运行时，先出一个
   `0.8.0-dev.2` 内部版本；
2. **第二批（P1）**：补齐托盘动作/初始状态和浏览器回归，再发 `0.8.0`；
3. **P2 进 backlog**，不阻塞本次发布。

### 1.1 推荐执行方案（决策版）

**推荐：做 P0 + P1，目标版本 `0.8.0`，按 5 人日排期；P2 本次不做。**

| 决策项 | 推荐 | 理由 |
| --- | --- | --- |
| kit 版本 | **0.13.0** | npm `latest`；0.12.0 未发布，直接升级 |
| 宿主版本 | **0.8.0** | 当前已是 `0.8.0-dev.1`，`Unreleased` 已有侧栏/编辑器特性 |
| 托盘定位 | **继续支持简易编辑** | 但必须修 `raise` 数据损坏和 `initial` 不一致；不做完整事件可见性编辑 |
| 是否等 0.13.1 | **不等** | 0.13.1 只补 `raise` 展示 UI，不改 `ProjectDoc`/SCXML/运行时 |
| 交付方式 | **两批** | P0 出 `0.8.0-dev.2` 上测试服务器；P1 通过后发 `0.8.0` |

**5 天排期**

| 天 | 工作 | 产出 |
| --- | --- | --- |
| D1 | P0-1 依赖/守卫/许可证；P0-2 诊断码 + 3 份 locale + 英文诊断 | 依赖升级完成，2 个失败测试转绿 |
| D2 | P0-3 监控展示序列化；P0-4 运行时回归；P0-5 必要文档；跑 P0 门禁 | `0.8.0-dev.2` 可部署 |
| D3 | P1-1 托盘 `raise`；P1-2 托盘 `initial`；P1-3 可见性只读提示 | 托盘不再改坏 0.13 文档 |
| D4 | P1-4 浏览器回归；P1-5 测试服务器 live/e2e | 浏览器与 live 全绿 |
| D5 | 发布文档、`release:check`、打 tag/发布、测试服务器复验 | `0.8.0` |

**本次明确不做**

- 托盘内编辑 `eventVisibility`（P2-1）：只显示只读提示，引导到完整编辑器；
- `updateEvent` internal-only 的保存期校验（P2-2）：先写进文档/backlog；
- 截图与社区宣传材料（P2-3）：发布后再补。

这样做的原因是：只升版本会留下 2 个红测试、监控 guard 泄漏和托盘 `raise` 数据损坏；
而把 P2 一起做会把 4.5 人日拖到 5.5 人日以上，收益远低于风险。

---

## 2. 基线与兼容性预演

### 2.1 预演方法

在不动 `package.json` / `package-lock.json` 的前提下，把本地 `node_modules/statechart-kit`
临时换成 kit 仓库已构建的 `0.13.0` dist，执行：

- `npm run typecheck`
- `npm test`（含 build，54 个用例）
- 直接用 `SessionRunner` 验证 `raise` + `eventVisibility` 的运行时行为
- 用 `createEditor` 验证 KIT-016（kit 0.12.1/0.13.0 的 `initial` 修复）
- 验证 `serializeToScxml` / `scxmlToDoc` 的可见性往返
- 检查 `<scxml-view>` 如何显示 guard 条件

预演结束后已恢复 `0.11.0` 并重新构建 `dist/`。

### 2.2 预演结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `tsc --noEmit` | ✅ 0 错误 | 0.13 公共 API 对宿主是**加法**，现有调用无需改类型 |
| 单测 | ⚠️ 52/54 通过 | 2 个失败都来自新增诊断码，不是运行时回归 |
| 失败 1 | `test/diagnostics-en.test.cjs` | 英文诊断缺 `structure.transition.mixed-event-visibility` |
| 失败 2 | `test/kit-compat.test.cjs` | 宿主 `CODE_MAP` 缺同一个 code |
| `raise` 运行时 | ✅ | `raise ping` 能触发 internal-only 转移；外部同名事件被 guard 拦住；`trusted` 与 `sandboxed` 引擎均验证 |
| `eventVisibility` 往返 | ✅ | 单事件且 all-internal 时，序列化 → 导入能恢复 `eventVisibility` 并剥离 guard |
| 混合事件转移 | ✅ 有 warning | `event="ping go"` 且只有 `ping` internal 时，kit 报 `mixed-event-visibility`，不加 guard |
| `<scxml-view>` 显示 | ⚠️ 会泄漏实现条件 | 画布会把 `[(_event.type === 'internal')]` 显示成作者条件 |
| KIT-016 `initial` | ✅ 已修复 | 新增顶层/首个子状态都会写回 `doc.initial` / `parent.initial` |
| `check:kit` | ⚠️ 预期失败 | 版本守卫仍写死 `0.11.0` |

### 2.3 本次预演**未**覆盖

| 项目 | 原因 | 计划中如何处理 |
| --- | --- | --- |
| 浏览器 smoke / P4 | 当前环境没有 `geckodriver` | 列入 P1，先装驱动再跑 |
| `test:e2e` / live | 本机 `:1880` 没有运行 Node-RED | 列入 P1，在测试服务器或临时实例上跑 |
| 托盘编辑器真实交互 | 预演只做了静态代码分析 | 列入 P1，补 `raise` 和 `initial` 用例 |

### 2.4 一个已确认的宿主 bug

托盘动作编辑器目前只认 `send` / `cancel` / `assign` / `log` / `script`：

- `parseActionLine('raise ping')` 返回 `{ type: 'raise', event: 'ping' }`；
- `actionRow()` 的 `else` 分支把它当 `script` 渲染，`code` 为空；
- 保存时 `actionToLine({ type: 'raise' })` 实际返回 **`raise undefined`**。

也就是说：**用户在完整编辑器里写了 `raise`，只要打开托盘的“动作”对话框再保存，动作就会被改坏。**
这是 P1 中最优先的一项，不能只靠文档规避。

---

## 3. Kit 0.11 → 0.13 变更与宿主影响矩阵

| Kit 变更 | 宿主影响 | 优先级 | 处理方式 |
| --- | --- | --- | --- |
| **0.12.0** 结构树折叠、`resizablePanes` 折叠按钮、横向布局/fit 修复、运行不再弹 JS 模态框 | 编辑器页面行为变化；宿主不读这些 DOM | P1 | 只做浏览器回归，不改业务代码 |
| **0.12.1** KIT-016：`addState`/`removeState`/`setParent` 维护 `initial` | 完整编辑器自动受益；托盘自己的增删改仍需对齐 | P1 | 托盘补 `ensureInitial`；删除 `docs/kit-bug-report-initial-state.md` |
| **0.13.0** `raise <event>` 动作 | 运行时已支持（scxmljs 0.2.0-dev.0 的 `EXECUTABLE` 含 `raise`）；托盘动作编辑器会改坏它 | P1 | 托盘支持 `raise` 的编辑、校验、往返 |
| **0.13.0** `ProjectDoc.eventVisibility` + internal-only 转移 guard | 宿主只存/传 doc，默认无需改数据；但监控画布会显示 guard | P0 | 监控改用 `serializeToDisplayScxml`；运行时继续用 `serializeToScxml` |
| **0.13.0** `data-kit-visibility="internal"` | 导入器能据此恢复 `eventVisibility`；只在“该转移所有事件名都 internal”时写出 | P0 | 不要假设逐事件 guard；混合事件由 warning 提示 |
| **0.13.0** `structure.transition.mixed-event-visibility` | 宿主 `CODE_MAP`、3 份 locale、英文诊断都要补 | P0 | 新增 `mixedEventVisibility` 文案 |
| **0.13.0** `serializeToDisplayScxml()` | 就是给画布用的：去掉 guard，避免把实现条件当作者条件 | P0 | 监控 graph 路由改用它 |
| **0.13.0** 编辑器事件面板显示来源/可见性；外部注入 internal-only 事件提前拒绝 | 完整编辑器开箱即用；宿主 adapter 没实现 `externalEvents`，无额外改动 | P0 | 浏览器回归确认 |
| **0.13.1（计划中）** 内部 raise 发出 UI | 纯展示层补丁，不改 `ProjectDoc`/SCXML/运行时 | — | 不阻塞；升级到 0.13.0 即可 |

> 0.12.0 未发布到 npm；npm 上直接是 `0.12.1`。因此升级路径应为 **0.11.0 → 0.13.0**，
> 不需要逐版本停留。

---

## 4. 工作分解与估时

### 4.1 P0：最小可用（约 19h / 2.5 人日）

| ID | 任务 | 主要文件 | 验收标准 | 估时 |
| --- | --- | --- | --- | --- |
| P0-1 | 依赖与版本守卫升级 | `package.json`、`package-lock.json`、`scripts/check-kit.mjs`、`NOTICE`、`THIRD_PARTY_LICENSES.md` | `statechart-kit@0.13.0` 精确版本；`npm run check:kit` 通过；NOTICE/许可证版本一致 | 3h |
| P0-2 | 新诊断码与 i18n | `src/editor/validate-doc.ts`、`editor/locales/{zh-CN,zh,en-US}/statechart.json`、`editor-page/diagnostics-en.mjs` | `mixedVisibility` 映射存在；中/英/zh 三份文案齐全；2 个失败测试转绿 | 3h |
| P0-3 | 监控画布使用展示序列化 | `src/nodes/machine.ts`（`getGraphSource`）、`src/runtime/monitor.ts`（如需拆分） | 监控 `/graph` 不含 `data-kit-visibility` 和 `_event.type === 'internal'`；运行时 XML 仍含 guard；`graphVersion` 仍按运行时 XML 计算 | 3h |
| P0-4 | 运行时语义回归 | `test/`（新增或扩展 hub 测试） | 外部同名 internal-only 事件被忽略；`raise` 链能转移；输出 2 不出现 `raise`；`validateScxml` 通过 | 4h |
| P0-5 | 必要文档与变更记录 | `CHANGELOG.md`、`README.md`、`README.en.md`、`docs/README.md`、`docs/refactor-roadmap.md`、`docs/kit-requirements.md`、`docs/hub-contract.md` | 版本表、兼容性、internal-only 语义、KIT-016 关闭记录齐全 | 3h |
| P0-6 | 全量门禁与收尾 | 构建产物、`scripts/verify-all.mjs`、`scripts/release-check.mjs` | `typecheck` + `test` + `build` + `check:kit` + `verify:all` 全绿 | 3h |

**P0 完成定义（DoD）**

- 0.13.0 安装后不改业务代码即可 `typecheck` 通过；
- 54 个现有单测全绿；
- 监控不再显示实现 guard；
- 文档明确“外部注入 internal-only 事件会被忽略、`raise` 不会出现在输出 2”；
- 能出一个可部署的 `0.8.0-dev.2`。

### 4.2 P1：推荐在同一次发布完成（约 16h / 2 人日）

| ID | 任务 | 主要文件 | 验收标准 | 估时 |
| --- | --- | --- | --- | --- |
| P1-1 | 托盘动作编辑器支持 `raise` | `editor/statechart.html`、3 份 locale | 新增 `raise` 类型与事件字段；必填校验；打开→保存不改变 `raise` 行；未知类型不再被静默转成 script | 3h |
| P1-2 | 托盘 `initial` 不变量对齐 KIT-016 | `editor/statechart.html` | 新增顶层/首个子状态、改父级、删除 initial 子状态后，根/父 `initial` 与 kit 编辑器一致；history 不作为 compound initial | 3h |
| P1-3 | 托盘对 `eventVisibility` 的保护 | `editor/statechart.html`、locale | 含 internal 事件的文档在托盘显示只读提示；保存不丢 `eventVisibility`；不静默改写 | 2h |
| P1-4 | 浏览器回归 | `test/browser-smoke.mjs`、`test/browser-p4.mjs` | 事件可见性下拉、`raise` 动作行、结构树折叠、`resizablePanes`、监控无 guard、打开/保存回写均通过 | 5h |
| P1-5 | 测试服务器 live/e2e | `scripts/test-live.mjs`、临时 Node-RED | 托盘编辑器、完整编辑器、服务端 E2E、级联示例全绿；核对 README/`editor-page/README` 中“kit 0.11 仍硬编码中文”的已知限制是否仍成立；记录版本与截图 | 3h |

**P1 完成定义**

- 托盘不再是“打开就改坏 `raise`”的状态；
- 完整编辑器与托盘对 `initial` 的行为一致；
- 浏览器与 live 套件在测试服务器通过；
- 可发 `0.8.0`。

### 4.3 P2：可选/后续（约 9h / 1 人日）

| ID | 任务 | 说明 | 估时 |
| --- | --- | --- | --- |
| P2-1 | 托盘内编辑 `eventVisibility` | 增加事件级可见性表格；否则只能引导用户去完整编辑器 | 5h |
| P2-2 | `updateEvent` internal-only 校验 | `set` 后自动发外部 `update`，若用户把 `update` 标成 internal-only，会静默不触发；加保存期 warning | 2h |
| P2-3 | 截图与发布材料 | `docs/images/` 更新、release notes/社区稿 | 2h |

### 4.4 汇总

| 阶段 | 工作量 | 累计 |
| --- | --- | --- |
| P0 | 19h ≈ 2.5 人日 | 2.5 人日 |
| P1 | 16h ≈ 2 人日 | 4.5 人日 |
| P2 | 9h ≈ 1 人日 | 5.5 人日 |

> 估算前提：1 名熟悉本仓库的开发者；不含等待 review、npm 发布审批、测试服务器排队；
> 浏览器套件按 1 轮通过计，若遇 geckodriver/Node-RED 环境问题另加 0.5 人日。

---

## 5. 关键设计决策

### 5.1 运行时与展示序列化必须分开

- **运行时**：继续 `serializeToScxml(doc)`，保留 `cond="_event.type === 'internal'"` 和
  `data-kit-visibility`，这是 SCXML 语义的一部分；
- **画布/监控**：用 `serializeToDisplayScxml(doc)`。它复制 doc、删除 `eventVisibility`
  后再序列化，只影响显示；
- `graphVersion` 仍按**运行时 XML** 哈希，避免“显示变了但运行时没变”导致监控误刷新。

落点：`src/nodes/machine.ts` 的 `getGraphSource()` 改为返回展示 XML；如果担心语义混用，
可拆成 `getRuntimeXml()` / `getDisplayXml()` 两个方法，`monitor.ts` 只调后者。

### 5.2 托盘 `raise`：按“未知类型不可静默降级”处理

- `defaultAction('raise')`、`actionTypeOptions()`、`actionRow()`、`saveActionEditor()` 四处补齐；
- `raise` 只需要 `event` 字段，复用 `form.actionEvent` 或新增 `form.typeRaise`；
- **重要**：`actionRow()` 现在的 `else` 会吞掉所有未知类型。应改成显式分支：
  未知类型显示为只读文本/报错，而不是当 `script` 保存；
- 加一个 round-trip 测试：`parseActionLine('raise ping')` → `actionToLine()` → 仍是
  `raise ping`。

### 5.3 托盘 `initial`：抽一个 `ensureInitial(doc, parentUid)`

与 kit 0.12.1 的语义保持一致：

- 根：`doc.initial` 为空或指向不存在的顶层状态时，取第一个顶层状态；
- compound：`parent.initial` 为空、失效或指向非直接子状态时，取第一个**非 history** 子状态；
- parallel / history：不设置 `initial`；
- 删除/移动/改父级后，对新旧父级都调用；空 compound 保持 `null`，让 `compound-empty` 提示保留；
- 托盘现有的“只在新增顶层状态时补 `doc.initial`”可以收敛到这个 helper。

> 不建议在宿主侧用 `adapter.onDocChange` 静默改写 `initial`：那会绕过 kit 的 undo/revision，
> 也会改写导入文档。托盘是宿主自己的表单模型，在表单操作后调用 helper 是安全的。

### 5.4 internal-only 事件的宿主语义

- Hub 输入、`statechart-event` 节点发出的都是**外部事件**；命中 internal-only 转移时会被
  SCXML guard 忽略，这是正确行为；
- `raise` 是图内内部事件，**不会**产生 `SessionRunner` 的 `send` 事件，因此不会出现在
  Hub 输出 2；不要为了“看得见”去改输出契约；
- 如果希望用户有反馈，优先在文档/编辑器提示，不要新增运行时错误（会破坏“事件可忽略”的
  SCXML 语义）；
- `updateEvent` 是宿主自动发的外部事件，P2 再加“不要把它标成 internal-only”的保存期 warning。

### 5.5 诊断码映射

新增：

```ts
'structure.transition.mixed-event-visibility': 'mixedVisibility',
```

文案要说明：一条转移同时监听 internal-only 和普通事件，kit 不会为它生成 internal guard；
建议拆成两条转移。参数为 `{ id, events }`。

同时更新：

- `editor/locales/zh-CN/statechart.json`
- `editor/locales/zh/statechart.json`
- `editor/locales/en-US/statechart.json`
- `editor-page/diagnostics-en.mjs` 的 `STRUCTURE` map
- `test/kit-compat.test.cjs` / `test/diagnostics-en.test.cjs` 的注释与断言（断言本身会自动覆盖）

### 5.6 版本与文档

- `package.json` 用精确版本 `"statechart-kit": "0.13.0"`，保持现有风格；
- `scripts/check-kit.mjs` 的 `EXPECTED_VERSION` 同步改；
- `NOTICE`、`THIRD_PARTY_LICENSES.md` 的 0.11.0 改为 0.13.0；
- `docs/kit-requirements.md` 关闭 KIT-016；`docs/kit-bug-report-initial-state.md` 是 kit 的
  问题报告，修复后不应随宿主发布，直接删除（或迁到 kit 仓库归档）；
- `CHANGELOG.md` 的 `Unreleased` 下新增 kit 0.13 适配条目，若本次发 0.8.0，则归入 0.8.0。

---

## 6. 测试与验收

### 6.1 新增/扩展用例

| # | 用例 | 层级 |
| --- | --- | --- |
| 1 | 单 internal 事件序列化含 `data-kit-visibility` + guard | 单测 |
| 2 | 展示序列化不含上述两者 | 单测 |
| 3 | `serializeToScxml` → `scxmlToDoc` 恢复 `eventVisibility`，guard 不进 `cond` | 单测 |
| 4 | 混合事件转移产生 `mixed-event-visibility` warning | 单测 |
| 5 | 外部同名 internal-only 事件不改变状态 | 运行时/集成 |
| 6 | `raise` 触发 internal-only 转移 | 运行时/集成 |
| 7 | Hub 输出 2 不出现 `raise` | 运行时/集成 |
| 8 | 监控 `/graph` 不显示 guard；运行时 XML 仍显示 | HTTP/集成 |
| 9 | 托盘动作弹窗打开/保存 `raise` 不丢 | 浏览器 |
| 10 | 托盘改父级/删除 initial 子状态后 `initial` 正确 | 浏览器或 DOM 单测 |
| 11 | 完整编辑器事件面板可切 internal/both；外部注入被拒 | 浏览器 |
| 12 | 结构树折叠、`resizablePanes`、横向 fit 无回归 | 浏览器 |

### 6.2 门禁顺序

```text
npm run typecheck
npm run check:kit
npm test                 # build + 单测（现有 54 + 新增）
npm run verify:all       # 仓库聚合校验
npm run test:browser     # 需 Firefox + geckodriver
npm run test:p4
npm run test:live        # 需临时/测试服务器 Node-RED
npm run release:check
```

### 6.3 验收标准

- `statechart-kit@0.13.0` 构建期内联，发布包运行时不 `require('statechart-kit')`；
- 现有 54 个用例全绿，新增用例覆盖 `raise` / `eventVisibility` / `mixed-event-visibility` /
  监控展示；
- 完整编辑器与托盘的 `initial` 行为一致；
- 监控不把 internal guard 当作者条件显示；
- 0.11 旧文档（无 `eventVisibility`）无需迁移，行为不变；
- 0.13 新文档（含 `eventVisibility` / `raise`）保存、重开、导入、导出均不丢语义。

---

## 7. 风险与缓解

| 风险 | 概率/影响 | 缓解 |
| --- | --- | --- |
| 托盘动作编辑器把 `raise` 改成 `raise undefined` | **已确认** / 高 | P1-1 必须做；否则 0.13 发布说明中明确“托盘不支持 raise”并阻止保存含 raise 的文档 |
| 监控显示 `_event.type === 'internal'` | **已确认** / 中 | P0-3 改用展示序列化；加 HTTP 断言 |
| 托盘改事件名导致 `eventVisibility` 留下旧 key，新事件变外部 | 中 / 中 | P1-3 只读提示；P2 再做事件级编辑/清理 |
| `updateEvent` 被标成 internal-only，`set` 后静默不触发 | 低 / 中 | P2-2 保存期 warning；文档说明 |
| 0.12 的 UI 改动导致浏览器用例选择器失效 | 中 / 低 | P1-4 先跑一遍，必要时只改测试选择器 |
| geckodriver/Node-RED 环境缺失导致验证延期 | 中 / 中 | 提前准备；CI 的 live-e2e 可兜底 |
| kit 0.13.1 的 raise 展示补丁带来二次升级 | 低 / 低 | 0.13.1 不改语义；不阻塞 0.13.0 |
| 当前工作区有未提交改动，升级混入其他变更 | 高 / 低 | 开始前先 commit/stash 当前 0.8.0-dev.1 工作树 |

---

## 8. 实施顺序与提交拆分

建议从当前 `main` 拉 `feat/kit-0.13`，先做“可回滚的小提交”：

1. `chore(kit): upgrade statechart-kit to 0.13.0`
   - package/lock、check-kit、NOTICE/THIRD_PARTY、README 兼容性表
2. `fix(editor): map mixed event visibility diagnostics`
   - validate-doc、3 份 locale、英文诊断、测试
3. `fix(monitor): hide internal-only guards from the read-only canvas`
   - machine.getGraphSource / monitor 测试
4. `feat(tray): support raise actions and initial invariants`
   - 托盘 raise、ensureInitial、eventVisibility 提示
5. `test+docs: kit 0.13 coverage and release notes`
   - 单测/浏览器/live、CHANGELOG、hub-contract、roadmap、删除 bug report
6. `release: 0.8.0`

回滚策略：第 1 个提交可单独 revert；0.13 的 `eventVisibility`/`raise` 对 0.11 宿主是
未知字段/未知动作，旧版本仍能读写不含这些特性的文档。若已发布 0.8.0 发现严重问题，
回滚到 0.11 只需回退依赖提交，但需要确认用户没有开始使用 `raise`/internal-only 特性。

---

## 9. 待确认问题

1. **托盘是否仍是正式支持的编辑入口？** 如果只作为“查看/简单修改”，P1-1/P1-2 可以降到
   P2，改为在托盘中阻止保存含 `raise` 的文档并引导到完整编辑器；这样推荐工作量可降到
   **约 3 人日**。
2. **本次发 `0.8.0` 还是 `0.7.1`？** 当前 `package.json` 已是 `0.8.0-dev.1`，且
   `Unreleased` 已有侧栏相机/编辑器保存等特性，建议直接归入 `0.8.0`。
3. **是否需要托盘内编辑 `eventVisibility`？** 如果内部事件主要由完整编辑器维护，P2-1 可以
   不做，只在托盘显示只读提示。
4. **是否等 kit 0.13.1？** 0.13.1 只补“内部发出事件”的展示，不改 `ProjectDoc`/SCXML/运行时；
   建议不等，直接上 0.13.0。

---

## 附：预演中的关键证据

### A. 0.13 新增的失败断言

```text
structure.transition.mixed-event-visibility (STRUCTURE_ISSUE_CODES)
structure.transition.mixed-event-visibility: no CODE_MAP entry
```

### B. `raise` 运行时（kit 0.13 dist + xmldom，trusted / sandboxed 均验证）

```text
external "ping" → states 仍为 [a, a1]     # guard 生效
"go"（动作 raise ping）→ states [b]      # 内部 raise 触发转移
SessionRunner 未发出 send 事件            # 输出 2 不会看到 raise
```

### C. 展示序列化差异

```xml
<!-- serializeToScxml：运行时 -->
<transition event="ping" target="b" data-kit-transition-id="t1"
            data-kit-visibility="internal"
            cond="(x &gt; 0) &amp;&amp; (_event.type === 'internal')"/>

<!-- serializeToDisplayScxml：画布 -->
<transition event="ping" target="b" data-kit-transition-id="t1"
            cond="x &gt; 0"/>
```

### D. 托盘 `raise` 现状

```text
parseActionLine('raise ping')        -> { type: 'raise', event: 'ping' }
actionToLine({ type: 'raise' })      -> 'raise undefined'
actionRow({ type: 'raise', ... })    -> 落到 script 分支，code 为空
```
