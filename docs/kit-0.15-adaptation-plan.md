# statechart-kit 0.15 适配评估

> 状态：**已执行并发布 `0.9.0`**
> 宿主：`@changzhen976/node-red-contrib-statechart@0.9.0`
> 当前 kit：`0.13.1`
> 目标 kit：`0.15.0`（npm `latest`，2026-11-14）
> 结论：这是一次**模型迁移**，不是普通依赖升级。建议按 **0.9.0** 发布。

---

## 1. 结论摘要

| 方案 | 内容 | 预估工作量 |
| --- | --- | --- |
| 只升版本 + 修红测试 | 让 `npm test` 变绿，不补托盘/运行时语义 | 1–1.5 人日 |
| **P0 安全集成（推荐）** | 模型迁移、运行时校验、托盘 `internal send`、测试/发布 | **4–5 人日** |
| P0 + P1 | 再加 `trySend`、生产者预检、legacy delay UX、示例/截图 | **5.5–6.5 人日** |

推荐按 **5 人日** 排期（含约 20% 缓冲），先 P0 发 **0.9.0**，P1 进后续补丁。

---

## 2. 预演结果（已实测）

临时把 `node_modules/statechart-kit` 换成 `0.15.0`：

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | ✅ 通过（宿主没有直接 import 被删的 `EventVisibility` 类型） |
| `npm test` | ⚠️ **61/67 通过，6 个失败** |
| 失败 1–2 | `test/kit-compat` / `test/diagnostics-en` 缺 2 个新诊断码 |
| 失败 3 | `test/examples` 仍断言 `doc.eventVisibility` |
| 失败 4 | `test/kit13` 仍断言转移级 `data-kit-visibility` |
| 失败 5 | 导入后仍断言 `eventVisibility` 对象 |
| 失败 6 | 混合可见性从 warning 变为 **error**，旧断言失败 |
| 浏览器套件 | 未跑；0.15 事件面板 UI 已改，现有 `browser-kit13` 会失败 |

> 编译不是主要工作量；**持久化模型、托盘、运行时校验和浏览器测试**才是。

---

## 3. 0.15 的关键破坏性变更

| 变更 | 宿主影响 | 优先级 |
| --- | --- | --- |
| `ProjectDoc.eventVisibility` / `EventVisibility` 删除，改为 `internalOnlyEvents?: string[]` | 托盘事件表、`updateEvent` 校验、示例、测试全部要迁移 | **P0** |
| 混合可见性从 warning 升为 **error** | 宿主运行时若继续用 `serializeToScxml`，非法文档可能静默生成“无守卫”的转移 | **P0** |
| 新增 `structure.event.internal-only-with-external-producer` | 需要 `CODE_MAP`、三份 locale、英文诊断 | **P0** |
| 新增 `structure.action.internal-delay-unsupported` | 同上；托盘若允许 `send target="#_internal" delay` 会报错 | **P0** |
| 新增 `send <event> target="#_internal"` | 托盘动作编辑器目前不保存 `target`，会丢数据（与之前 `raise` 同类问题） | **P0** |
| 完整编辑器事件面板从“可见性下拉”改为“仅内部复选框 + 定义/约束弹窗” | `test/browser-kit13` 的选择器和交互要重写 | **P0** |
| `external` 可见性删除 | 宿主没有暴露“仅外部”；旧文档自动降级为双向 | P1 |
| 动作编辑器移除“延时发送”入口 | 托盘仍有 delay 输入；旧 `send delay` 仍可解析/序列化 | P1 |
| 新增 `trySend()` | 宿主仍用 `send()` boolean；可选增强 | P1 |
| `serializeToDisplayScxml()` 保留 | 监控画布不需要改 | — |
| 结构编辑 `initial` 不变量、`raise` 等 0.13 能力保留 | 无新增迁移 | — |

---

## 4. 工作分解

### P0：安全集成（4–5 人日）

| ID | 任务 | 主要文件 | 估时 |
| --- | --- | --- | --- |
| P0-1 | 升 `0.15.0`，更新 lock、`check-kit`、NOTICE/第三方许可、README 版本表 | `package.json`、`scripts/check-kit.mjs`、`NOTICE`、`THIRD_PARTY_LICENSES.md` | 0.25 天 |
| P0-2 | 新诊断码与 i18n：2 个新 structure code、混合可见性改为 error 文案、英文诊断 | `src/editor/validate-doc.ts`、3 份 locale、`editor-page/diagnostics-en.mjs` | 0.5 天 |
| P0-3 | 托盘模型迁移：`eventVisibility` 对象 → `internalOnlyEvents` 数组；事件表、提示、`updateEventInternal` 全部改 | `editor/statechart.html`、locale | 0.5–0.75 天 |
| P0-4 | 运行时结构闸门：doc 路径改用 `serializeChecked()`，阻止混合/生产者冲突文档静默运行；错误转成 Hub 配置错误 | `src/nodes/machine.ts`、hub 错误测试 | 0.25 天 |
| P0-5 | 托盘动作编辑器支持 `send target="#_internal"`：target 字段、保存往返、`#_internal + delay` 校验 | `editor/statechart.html`、locale、tray 测试 | 0.5 天 |
| P0-6 | 单测更新：kit15 根级元数据、导入、混合 error、生产者冲突、internal send、旧文档迁移 | `test/kit13.test.cjs` 重命名/扩展、`p0`、`examples`、`tray-kit13` | 1 天 |
| P0-7 | 浏览器回归：0.15 复选框 + 弹窗、内部发送动作行、托盘事件表、监控 graph | `test/browser-kit13.mjs`（重写） | 0.5 天 |
| P0-8 | 全量门禁 + 测试服务器 + 发布 0.9.0 | `test:live`、部署、CHANGELOG、发布 tag | 0.5 天 |

**P0 合计：约 4–4.5 人日**；加 20% 缓冲约 **5 人日**。

### P1：增强（1–1.5 人日）

| ID | 任务 | 估时 |
| --- | --- | --- |
| P1-1 | 接入 `trySend()`：区分 `session-not-running` / `session-done` / `send-failed`，Hub 输出 3 报明确错误 | 0.25 天 |
| P1-2 | 托盘“仅内部”勾选前生产者预检：无 internal 生产者时提示/禁用，减少无效配置 | 0.25 天 |
| P1-3 | 旧 `send delay` 写法提示/迁移说明（保留兼容，不强制删除） | 0.25 天 |
| P1-4 | 示例并入 `demo-suite`、截图、0.9.0 发布说明 | 0.5 天 |

---

## 5. 迁移与运行时策略

### 5.1 旧文档

`normalizeDoc()` 会把：

- `eventVisibility.internal` → `internalOnlyEvents`
- `eventVisibility.external/both/未知` → 丢弃（降级为双向）

所以 **旧 JSON 不需要手工迁移**。但要在文档中说明：旧的“混合可见性”文档在 0.15 会变成
error，需要在编辑器里拆分转移。

### 5.2 运行时必须加结构闸门

0.13 的 `serializeToScxml` 对混合可见性不生成守卫；0.15 把它升为 error。如果宿主继续直接
`serializeToScxml`，旧的混合文档会“看起来能跑”，但 internal-only 语义已经失效。

建议 `src/nodes/machine.ts` 的 doc 分支改为：

```ts
import { serializeChecked } from 'statechart-kit'

const xml = serializeChecked(doc)
```

`DocumentStructureError.issues` 可以复用 Hub 的配置错误出口，显示 `code + params`。
这会把“以前能跑但语义错误”的文档变成明确的配置错误，属于有意的破坏性变更。

### 5.3 托盘 `send target="#_internal"`

当前托盘 `actionRow` 只渲染 `event/delay/id/dataExpr/data`，`parseActionLine` 解析出的
`target` 会被丢弃，保存后 internal send 变成普通 send。必须补：

- `target` 下拉（外部 / `#_internal`）；
- 保存/往返测试；
- `#_internal + delay` 由 kit 校验或托盘提前报错。

### 5.4 事件面板 UI

0.15 完整编辑器：

- 接收事件表列从「可见性下拉」改为「仅内部」复选框；
- 勾选时弹出定义/约束弹窗，冲突时禁止确认；
- 事件请求从 `setEventVisibility` 改为 `setInternalOnlyEvent`。

宿主只需跟随 kit 的 `locale`/`labels`；但 `test/browser-kit13` 的 DOM 选择和交互必须重写。

---

## 6. 版本与发布建议

建议发 **0.9.0**，而不是 0.8.2：

- `ProjectDoc` 持久化字段改变（旧 JSON 自动迁移，但保存后格式变化）；
- 混合可见性从 warning 变 error，运行时开始拒绝非法文档；
- 新增 `send target="#_internal"` 动作；
- 用户需要一条明确的迁移说明。

发布路径沿用现有自动流程：

```sh
npm version 0.9.0 --no-git-tag-version
# 更新 CHANGELOG / README / 迁移说明
git push origin main && git push gitea main
git tag v0.9.0 && git push origin v0.9.0 && git push gitea v0.9.0
```

---

## 7. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 旧混合可见性文档被 0.15 判为 error | 已有用户 flow 无法启动 | 发布说明 + 运行时明确错误；提供拆分指引 |
| 托盘丢失 `send target` | internal send 被改成普通 send，语义静默改变 | P0-5 必须做，参考之前 `raise` 修复 |
| 0.15 事件面板 UI 重写导致浏览器测试脆弱 | 发布被卡 | 用 `aria-label` / 稳定 class，只断言语义 |
| 运行时 `serializeChecked` 使旧文档报错 | 用户升级后首次部署失败 | 在 CHANGELOG/README 写迁移说明；错误信息带 code |
| 0.15.0 无 0.14 发布，社区文档可能混用 0.14 概念 | 误解 | 只以 0.15.0 为基线，不引用 0.14 |
| `trySend` 改变错误出口 | 行为变化 | 放 P1，单独测试 |

---

## 8. 推荐执行顺序

1. P0-1 依赖/版本；
2. P0-2 诊断/i18n；
3. P0-3 托盘模型迁移；
4. P0-4 运行时 `serializeChecked`；
5. P0-5 托盘 `internal send`；
6. P0-6/P0-7 单测与浏览器；
7. P0-8 `test:live` + 测试服务器 + 0.9.0；
8. P1 单独排期，不阻塞 0.9.0。

**最终建议：按 5 人日排 P0，先发 0.9.0；P1 约 1–1.5 人日放后续补丁。**
