# 重构路线：以 statechart-kit 为核心

> 状态：M0–M5 完成；0.6.1 文档发布；0.7.0 稳定性轮已在测试服务器验证（2026-11-12，未打 tag，等用户试用）
> 目标版本：`0.7.0`
> 核心依赖：`statechart-kit@0.9.0`（2026-11-11 升级；重构基线为 0.8.0）
> 关联文档：[完整编辑器设计](p4-standalone-editor.md)（历史方案）、[资源消耗评估](resource-profile.md)、[Kit 需求记录](kit-requirements.md)
> 适用范围：运行时、编辑器、构建与发布

> 0.9.0 适配：KIT-001（左栏滚动，0.8.1）与 KIT-003/KIT-004（doneData、targetless）
> 已随 `statechart-kit@0.9.0` 解决；KIT-002/KIT-005 仍属上游 `@tinyactors/scxmljs`。

## 1. 背景与目标

当前包已经能完整跑通 Node-RED 场景，但核心逻辑存在**四份副本/补丁**：

| 位置 | 现状 | 问题 |
| --- | --- | --- |
| `src/vendor/scxml-core/` | 1,267 行从 donor 镜像的 core | 每次上游变更都要同步，`check:vendor` 才能保证不漂移 |
| `src/runtime/engine.ts` | 58 行自维护引擎加载器 | 与 kit 的 `engine-loader` / `SessionRunner` 重复 |
| `editor/statechart.html` | 1,182 行 jQuery 三表编辑器 | 与 kit Vue 编辑器是两套 UI、两套校验 |
| `editor-app/` | 1.3 MB donor SPA 构建产物 | 构建期 17 条字符串替换 + 2 段 CSS/JS 注入来“伪装”成自己的产品 |

kit 0.8.0 已经提供文档模型、SCXML 序列化/导入、命名策略、结构校验、引擎加载、`SessionRunner`、Vue 编辑器和 typed 宿主事件。本次重构的目标是：

1. **kit 成为唯一核心**：文档模型、序列化、导入、校验、引擎、编辑器全部来自 kit；
2. **宿主只保留 Node-RED 语义**：节点、事件总线、监控路由、capability token、语言包、tray；
3. **删除镜像与补丁**：`src/vendor`、`editor-app`、17 条替换、vendor 同步脚本全部移除；
4. **保持兼容**：`ProjectDoc` 与 flow 数据零迁移，节点类型/配置字段/消息契约/路由路径不变。

**非目标**：重写监控页、增加新运行时特性、多机编排、MQTT/全局变量、为 Node-RED 定制 kit 业务语义。

## 2. 现状基线（2026-11-11）

### 2.1 本仓库

| 模块 | 规模 | 处置 |
| --- | --- | --- |
| `src/vendor/scxml-core/` | 1,267 行 | **删除**，改 kit core |
| `src/runtime/engine.ts` | 58 行 | **删除**，改 kit engine |
| `src/editor/{core-bridge,validate-doc}.ts` | 190 行 | core-bridge 改 kit；validate-doc 已换 `validateStructure`（M4） |
| `editor/statechart.html` | 1,182 行 | 重写：设置窗 + 打开编辑器（或保留精简三表，见 D2） |
| `editor-app/` | 1.3 MB 生成物 | **删除**，改为 kit 编辑器页 |
| `monitor/` + `src/runtime/monitor.ts` | 476 行 | **保留**（已只依赖 `<scxml-view>`） |
| `editor/locales/` | 3 × 177 行 | 保留，诊断 code 重映射 |
| `test/` | 927 行；p0 18 个用例，全量 23 | 适配 + 新增 |
| `scripts/` | 238 行（含 vendor 同步/补丁） | 删 95 行，重写 release-check |

### 2.2 kit 就绪度

| 维度 | 状态 | 结论 |
| --- | --- | --- |
| core（model/serialize/import/naming/validate） | 0.8.0 完整 | ✅ 可替换 vendor |
| engine（loader / `SessionRunner` / data 预置） | 0.8.0 完整 | ✅ |
| 宿主事件（`send.target/sendid`、`done`、`error`） | 0.8.0 新增 | ✅ 需处理 `done → active[]` |
| Vue 编辑器（`mountEditor` / `EditorAdapter` / `features`） | 0.7.x 起可用 | ✅ 宿主需自建页面/打包 |
| 诊断 / i18n | 仅 `diagnostics/zh`；编辑器中文文案 | ⚠️ 英文界面需宿主映射或后续 kit i18n |
| 打包形态 | ESM-only，可被 esbuild 内联 | ✅ 必须 bundle，不能 `require` 原包 |
| 发布 | tag `v0.8.0` 已打；npm `latest` 0.7.0 | ⚠️ 需要 `next` 或本地包过渡 |

## 3. 目标架构

```text
Node-RED runtime
  statechart-machine (config node)
    └─ statechart-kit/engine SessionRunner ── EventBus ── statechart-in / statechart-out
  statechart/monitor + api  ── <scxml-view>（只读渲染，不经过 core）

Node-RED editor
  statechart-machine 配置窗
    ├─ 机器级设置（engine/timeout/persist/updateEvent/output*）
    └─ [打开完整编辑器] ── token + postMessage ──► /statechart/editor/?id=…
                                                      │
                                         statechart-kit/vue mountEditor
                                                      │
                                            EditorAdapter（load/save/deploy/exit）
                                                      │
                                             postMessage 回写 node.doc

Build
  esbuild: src/nodes/index.ts + statechart-kit core/engine → dist/statechart.js (CJS)
  vite:    editor-page/ → dist/editor/（vue + kit/vue + <scxml-view>）
```

边界规则（必须保持）：

1. kit 不读 Node-RED API、不读 `RED`、不发 HTTP；宿主能力只经 `EditorAdapter` 注入；
2. 宿主不再复制 core、不再镜像 donor、不再做产物的字符串替换；
3. kit 作为 **devDependency** 内联进产物，运行时不 `require("statechart-kit")`；
4. 监控页保持现状，不引入 kit 的编辑器 store。

## 4. 关键决策（ADR 摘要）

| # | 决策 | 理由 | 影响 |
| --- | --- | --- | --- |
| D1 | kit 放 `devDependencies`，构建期用 esbuild/Vite 内联 | Node-RED 是 CJS 单文件入口，kit 是 ESM；内联同时解决模块格式与发布顺序 | 消费者不安装 kit；kit 升级需重发插件 |
| D2 | 全页编辑器用 kit；tray 先保留精简三表，M4 再决定是否删除 | 全页体验已成熟；tray 宽度放不下三栏；保留回退路径风险最低 | B/C 两档工作量，见 §5 |
| D3 | 监控页不动 | 只依赖 `<scxml-view>` 与 `data-state` 高亮，已与 core 解耦 | 零改动，仅回归测试 |
| D4 | 数据零迁移 | `ProjectDoc` 字段未变；`doc`/`source` 存储沿用 | 已有 flow 与示例继续可用 |
| D5 | 本地包过渡：先 `file:`，API 稳定后发 `0.8.0` 到 `next`，发布日再升 `latest` | 开发期可自由改 kit；避免过早冻结 API；CI 最终走 registry | 需要发布脚本与版本记录 |
| D6 | 中文优先；宿主负责 en-US 的 code→文案映射；kit 编辑器 i18n 另立项 | 不阻塞重构；英文编辑器是产品级增量 | en-US 用户短期看到中文编辑器 |
| D7 | 接受 kit 的更严校验与行为差异 | `delayMs < 10` 报错、`serializeChecked` 抛错、导入 warning 为 code | 需 CHANGELOG 与迁移提示 |

## 5. 阶段与里程碑

| 里程碑 | 内容 | 退出条件 | 估时 | 依赖 |
| --- | --- | --- | --- | --- |
| **M0 准备** | 分支、基线 tag、本地 kit 依赖、`check-kit`、CI 方案 | `npm test` 仍绿；kit 版本可追溯 | 0.5–1 天 | — |
| **M1 构建 + core** | 删 vendor、改 kit 导入、构建简化、结构校验 | `src/vendor` 删除；core 用例绿 | 2–3 天 | M0 |
| **M2 engine + 运行时** | `SessionRunner`、typed 事件、done 守卫、队列/持久化 | p0 18 用例 + 新增 + 50 次重部署绿 | 3–4 天 | M1 |
| **M3 编辑器页** | kit `mountEditor`、adapter、postMessage、token、删 `editor-app` | 浏览器 smoke：打开→编辑→回写→部署 | 3–4 天 | M2 |
| **M4 tray + i18n** | tray 决策（B/C）、诊断映射、帮助/README/示例 | 三语与示例回归通过 | 2–3 天 | M3 |
| **M5 发布** | release-check、NOTICE、pack 干净安装、CI、CHANGELOG | 干净 Node-RED 安装冒烟 + 发布清单 | 2–3 天 | M4 |

合计：**B 方案 10–15 人日（中位 13）；C 方案 13–18 人日（中位 15）**。单人串行约 3 周；M1/M2 与 M3 可部分并行（编辑器页不依赖运行时桥的最终实现，只依赖 core 序列化）。

### 5.1 建议排期（单人）

| 周 | 工作 |
| --- | --- |
| 第 1 周 | M0 + M1 + M2：构建、core、engine、运行时桥；周末达到“运行时绿灯” |
| 第 2 周 | M3：编辑器页替换 donor SPA；浏览器 smoke |
| 第 3 周 | M4 + M5：tray/i18n、pack 安装、发布 |

## 6. 工作分解（WBS）

### W1 构建与依赖（0.5–1 天）

- `devDependencies` 增加 `statechart-kit`（先 `file:../statechart-kit`，后精确 `0.8.0`）；
- `esbuild.config.mjs`：内联 kit；保留 `@tinyactors/scxmljs`、`/trusted`、`@xmldom/xmldom` external；
- 新增 `scripts/check-kit.mjs`：版本、dist 新鲜度、产物内联断言；接入 `verify:all`；
- CI：Node 22.9/24；kit 获取方式（clone pin 或 `next`）。

**验收**：`dist/statechart.js` 内无 `require("statechart-kit")`；动态 `import("@tinyactors/scxmljs")` 保留；bundle 冒烟可启动 sandboxed 会话。

### W2 core 替换（1–2 天）

- 删除 `src/vendor/scxml-core/`；
- `machine.ts` / `core-bridge.ts` 改从 `statechart-kit` 导入 `normalizeDoc`、`serializeToScxml`、`scxmlToDoc`、`parseActionLine`、`validateStructure`；
- `validate-doc.ts` 先改用 kit 类型并保留宿主行级规则；M4 再换 `validateStructure` + code→locale 映射（避免与三语文案同批改动）；
- 删除 `scripts/{sync-vendor,check-vendor,vendor-patch}.mjs` 与 `verify-all` 中的 vendor 检查。

**验收**：序列化/导入/结构校验用例通过；`editor` 侧不再有 vendor 引用。

### W3 engine 替换（1–2 天）

- 删除 `src/runtime/engine.ts`；
- 使用 kit `SessionRunner`：`domParser`（`@xmldom/xmldom`）、`engine`、`scriptTimeoutMs`、`maxMicrosteps`、`data`；
- 生命周期：`start`/`stop`/`reset`/`settled` 与现有状态机语义对齐。

**验收**：sandboxed/trusted 两种模式、超时、微步上限、持久化变量恢复全部回归。

### W4 运行时桥（1.5–2 天）

- `machine.ts` 改为 `runner.on`：
  - `active` → 计算 `changed`/变量快照 → `publishState`；
  - `send` → 透传 `name/data/target/sendid`；
  - `error` → `node.error` + bus `error`；
  - `done` → 状态与 bus `done`；
- **done 守卫**：`done` 之后引擎还会发一次 `active[]`，必须忽略，避免空状态覆盖终态；
- `in.ts` 不变；`out.ts` 的内部 send 过滤保持 `target === '#_internal' || !!sendid`；
- `setVars` 改用 `assignValue` 的 `{ok, code, params}`，映射 `variable.unknown`。

**验收**：p0 18 个用例 + 新增“终态不发空状态” + 50 次重部署无泄漏。

### W5 编辑器页（2.5–3.5 天）

- 新建 `editor-page/`：`index.html`、`main.ts`、`adapter.ts`；
- `mountEditor` + `features`（`examples:false`、`deploy:false`，保存走 `exportProject`）；
- `EditorAdapter`：
  - `load` 等待 `scxml:load`；不提供自动 `save`；显式保存/退出走 `postMessage('scxml:save')`；
  - `exit` 保存后关闭；`readOnly` 可接草稿锁；
- esbuild 构建到 `dist/editor/`（与 monitor 同一 splitting 策略）；kit/vue 与 `<scxml-view>` 内联；模拟固定 `engine: 'trusted'`，避免在管理页拉取 QuickJS WASM；
- 路由 `/statechart/editor/` 指向新构建；token 与静态资产规则保持。

**验收**：打开→编辑→保存回写→Update/Deploy；每台机器独立打开；无 donor 产物。

### W6 tray 与 i18n（2–3 天，含决策）

- **决策门（M4）**：
  - B：保留三表，适配 kit 校验（低风险，保留无 token/快速编辑路径）；
  - C：tray 精简为机器设置 + “打开编辑器” + 高级 JSON（删 900 行表单，单一编辑入口）。
- 诊断 code 映射：结构/导入/变量/引擎错误 → `zh-CN`/`zh`/`en-US`；
- `validate-doc.ts` 换 `validateStructure` + uid 映射，补齐新增 code 的 locale 文案；
- 节点帮助、README、示例回归；
- `delayMs < 10` 等行为差异的迁移提示。

**验收**：三语界面；示例 flow 全量导入/运行；B/C 决策记录在案。

### W7 测试（1.5–2.5 天）

- `p0.test.cjs` 适配 kit 会话 API 与错误 code；
- 新增：typed 事件映射、done 守卫、变量写入错误、结构校验定位；
- 浏览器：`browser-smoke.mjs` 选择器更新；`browser-p4.mjs` 改为 kit 编辑器页；
- 延时用例使用确定性时钟，避免 `sleep` 抖动。

**验收**：`npm test`、`npm run typecheck`、`npm run release:check` 全绿；Node 22.9/24 双版本。

### W8 打包与发布（1–1.5 天）

- `release-check.mjs` 重写：删除 vendor commit / donor 名称断言，增加 kit 版本断言；
- `NOTICE` / `THIRD_PARTY_LICENSES.md` 增加 kit（MIT）；
- `npm pack` → 干净目录安装 → Node-RED 冒烟；确认 `node_modules` 无 kit；
- `CHANGELOG` 0.2.0；README 架构/兼容性；CONTRIBUTING Layout 更新；
- 发布顺序：kit `0.8.0`（`next` → `latest`）→ 插件 `0.2.0`。

**验收**：干净 Node-RED 用户目录安装 tgz 可启动示例；发布清单全部勾选。

## 7. 任务清单（可直接建 issue）

### M0 准备

- [x] R01 建分支 `refactor/kit-core`，打基线 tag `v0.1.3-pre-kit`
- [x] R02 `statechart-kit` 加入 devDependencies（本地 `file:` 或 `0.8.0`）
- [x] R03 新增 `scripts/check-kit.mjs` 并接入 `verify:all`
- [x] R04 CI 增加 kit 获取步骤（clone pin 或 `next`）
- [x] R05 README「更多文档」加入本路线链接

### M1 core

- [x] R06 删除 `src/vendor/scxml-core/`，改 kit 导入
- [x] R07 `validate-doc.ts` 改用 kit 类型；M4 再换 `validateStructure` + uid/code 映射
- [x] R08 删除 `sync-vendor` / `check-vendor` / `vendor-patch`
- [x] R09 简化 `esbuild.config.mjs`（去 donor patch 与 17 条替换）
- [x] R10 core 用例（serialize/import/validate）通过

### M2 runtime

- [x] R11 删除 `src/runtime/engine.ts`，改用 `SessionRunner`
- [x] R12 `machine.ts` typed 事件映射 + done 守卫
- [x] R13 `out.ts` 内部 send 过滤保持 `target/sendid`
- [x] R14 `setVars` 改用 `assignValue` 返回 code
- [x] R15 运行时用例 + 50 次重部署通过

### M3 editor

- [x] R16 新建 `editor-page/` 与 esbuild 构建
- [x] R17 `EditorAdapter` + postMessage + token
- [x] R18 删除 `editor-app/` 与 donor release-check 断言
- [x] R19 `/statechart/editor/` 路由切换
- [ ] R20 浏览器 smoke（待跑）：编辑→保存→回写

### M4 tray/i18n

- [x] R21 tray 决策：保持三表（B）；校验适配并入 R22
- [x] R22 `validate-doc` 换 `validateStructure`，诊断 code → 三语文案
- [x] R23 节点帮助/README/示例回归
- [ ] R24 监控页浏览器回归（token/缩放/并行高亮）

### M5 release

- [x] R25 重写 `release-check.mjs`（新编辑器、kit 署名）
- [x] R26 NOTICE / THIRD_PARTY_LICENSES（kit + Vue）
- [x] R27 `npm pack` 干净安装 + require 冒烟（无 kit 运行时依赖）
- [x] R28 README/CONTRIBUTING 架构更新
- [x] R29 CI 双 Node 版本（从 npm 安装 kit）
- [x] R30 kit `0.8.0` 发布（npm latest）
- [x] R30b 插件 `0.2.0` 发布（npm latest）
- [x] R31 CHANGELOG 0.2.0

## 8. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| kit 0.x API 漂移 | 中 | 返工 | devDep 锁精确版本；kit 变更走单独工作项；CI 跑宿主契约测试 |
| ESM/CJS 集成失败 | 低 | 阻塞 | 已做 CJS bundle 冒烟；保持 `@tinyactors/scxmljs` external；不加运行时 kit 依赖 |
| `done` 后空 `active` 覆盖状态 | 高 | 用户可见 | 宿主 done 守卫 + 专门用例 |
| 编辑器 QuickJS WASM 资产路径 | 中 | 仿真不可用 | 优先 `engine: 'trusted'`；或把 wasm 纳入 `dist/editor/` 并验证路由 |
| 英文编辑器缺失 | 中 | 英文用户体验 | 先中文优先；en-US 映射宿主文案；kit i18n 另立项 |
| 行为差异（`delayMs < 10` 等） | 中 | 老 flow 启动失败 | CHANGELOG + 启动错误文案 + 迁移提示 |
| 本地 `file:` 进入发布链 | 低 | 消费者安装失败 | 发布前切 `0.8.0`；`npm pack` 干净安装验证；`check-kit` 守卫 |
| tag 与发布内容不一致 | 低 | 追溯困难 | 发布前对齐 tag/HEAD；release checklist |
| 测试抖动（`sleep`） | 中 | CI 不稳 | 确定性时钟；重试仅用于浏览器 |
| 双份 `@tinyactors/scxmljs` | 低 | 引擎缓存分裂 | 保持 external；bundle 冒烟检查只有一份 |

## 9. 验证与发布门禁

```sh
npm install --include=dev
npm test
npm run typecheck
npm run release:check
# 浏览器（需要 Firefox/geckodriver + 运行中的 Node-RED）
STATECHART_BROWSER=1 GECKODRIVER=... NODERED_URL=http://localhost:1880/ npm run verify:all
```

发布前额外检查：

1. `src/vendor/`、`editor-app/`、vendor 脚本、donor 字符串全部不存在；
2. `dist/statechart.js` 无 `require("statechart-kit")`，保留 `import("@tinyactors/scxmljs")`；
3. `npm pack` 后在干净目录安装，`node_modules` 无 `statechart-kit`，Node-RED 可启动示例；
4. 50 次连续部署无 Timeout 泄漏；
5. 终态只输出一次状态，不输出空数组；
6. `NOTICE` / `THIRD_PARTY_LICENSES` 含 kit 版本与许可；
7. `CHANGELOG` 记录 0.2.0 与 kit 0.8.0 的对应关系。

## 10. 工程准备（第一周先做）

1. 建分支与基线 tag，保护现有可发布状态；
2. 加本地 kit 依赖 + `check-kit`，让 CI 先看到“内联成功”；
3. 建 6 个里程碑 issue，把 §7 的 R01–R30 作为子任务；
4. 在 README/CONTRIBUTING 标注“重构进行中”，避免贡献者继续改 vendor/editor-app；
5. 更新 `references/project-state.md`（技能文档）里的阶段与下一步，指向本路线。

## 11. 仍待确认的决策

| 决策 | 选项 | 建议 |
| --- | --- | --- |
| tray 是否保留三表 | B 保留 / C 精简 | 先 B 发 0.2.0，观察真实使用后再 C；若团队只用全页编辑器，直接 C |
| kit 0.8.0 发布时机 | 立即 `next` / 运行时桥绿灯后 | 运行时桥绿灯后；避免 API 冻结过早 |
| 英文编辑器 | 宿主映射 / kit i18n | 先宿主映射；英文用户占比上升再做 kit i18n |
| 多机总览 | 一机一页 / 包装选择器 | 先一机一页；有明确需求再加 |
| 本地包路径 | `file:../statechart-kit` / tarball | 开发用 `file:`；CI 用 `next` 或 clone，避免 tarball 入库 |

## 12. 附录：文件映射

| 现状 | 动作 | 目标 |
| --- | --- | --- |
| `src/vendor/scxml-core/**` | 删除 | `statechart-kit` core |
| `src/runtime/engine.ts` | 删除 | `statechart-kit/engine` |
| `src/editor/core-bridge.ts` | 删除 | 由 `editor-page/` 直接 import kit |
| `src/editor/validate-doc.ts` | 已替换 | `validateStructure` + uid/code 映射 |
| `editor/statechart.html` | 重写/精简 | 机器设置 + 打开编辑器 |
| `editor-app/**` | 删除 | `editor-page/` → `dist/editor/` |
| `esbuild.config.mjs` donor patch | 删除 | 简化复制流程 |
| `scripts/{sync,check}-vendor.mjs`、`vendor-patch.mjs` | 删除 | — |
| `monitor/**`、`src/runtime/monitor.ts` | 保留 | 不动 |
| `editor/locales/**` | 重映射 | `zh-CN`/`zh`/`en-US` |
| `test/p0.test.cjs` | 适配 | kit 运行时契约 |
| `docs/p4-standalone-editor.md` | 标注历史 | 本路线取代 donor SPA 方案 |
| `CONTRIBUTING.md` Layout | 更新 | 去 vendor/editor-app |

## 13. 完成定义（DoD）

- [x] `src/vendor/`、`editor-app/`、vendor 脚本、17 条替换全部删除
- [x] 运行时只经 `statechart-kit` core/engine，无本地副本
- [x] `done` 守卫、typed send/error/done 映射有测试
- [x] 全页编辑器使用 kit `mountEditor`，tray 决策已落地
- [x] `npm test` / `typecheck` / `release:check` 全绿（`verify:all` 通过）
- [ ] 浏览器 smoke（需 geckodriver + 运行中的 Node-RED）
- [x] `npm pack` 干净安装 + require 冒烟通过，无 kit 运行时依赖
- [x] 真实 Node-RED 实例冒烟（测试服务器 0.2.0 部署，API/编辑器资产通过）
- [x] 文档、CHANGELOG、NOTICE、README、CONTRIBUTING 更新
- [x] kit 0.8.0 与插件 0.2.0 的版本对应关系可追溯

## 14. 执行记录（2026-11-11）

- 分支 `refactor/kit-core`；基线 tag `v0.1.3-pre-kit`。
- M0–M4 完成；M5 发布准备完成：版本 `0.2.0`、CHANGELOG、NOTICE/THIRD_PARTY、干净安装。
- `npm run verify:all`：24/24、Node 22.9/24、`check:kit`、`release:check` 全绿。
- `npm pack` 0.2.0 干净安装：`node_modules` 无 `statechart-kit`，`require(plugin)` 正常。
- 2026-11-11：`statechart-kit@0.8.0` 已发布到 npm `latest`（gitHead `f880589`）；宿主 devDependency 改为精确 `0.8.0`，CI 不再 clone/build kit。
- 2026-11-11：插件 `@changzhen976/node-red-contrib-statechart@0.2.0` 已发布到 npm `latest`（gitHead `4d75d7b`），tag `v0.2.0` 已推 GitHub/Gitea；从 npm 干净安装的 dist 与测试服务器哈希一致。
- 待执行：完整浏览器 smoke（独立编辑器的关闭/二次确认 smoke 已通过）。

## 15. 0.2.0 之后（未发布）

- `fd90693 fix(editor): sync machine name between Node-RED and ProjectDoc`：
  编辑器打开/保存时统一 Node-RED 配置节点名、`ProjectDoc.name` 与导出 SCXML 的
  `<scxml name>`；测试服务器已部署该构建。
- npm 上的 `0.2.0` **不包含**该修复。计划在本轮批量 bug 修复完成后发布 `0.2.1`
  （先补 `CHANGELOG` 的 `Unreleased`，再 bump/tag/publish）。
- `main` 有未推送提交（`fd90693` 名称同步 + 本次文档整理）；按用户要求等批量修复完成后再统一推送。
- 完整浏览器套件（`test:browser` / `test:p4`）仍待补；独立编辑器的关闭/名称同步
  已用针对性 Selenium 脚本验证。

## 16. 0.7.0 稳定性轮（2026-11-12）

0.7.0 不增加节点或改动契约，只处理运行时边界与测试缺口。

### 运行时修复

- Hub 的配置错误（`noMachine` / `hubConflict`）统一走输出 3，与运行时错误同出口；
- 冲突 Hub 在占用者释放后可在下一次输入时重新 claim；
- `sendEvent` / `setVars` 等待 `SessionRunner.settled()`，保证「事件 → 赋值」顺序；
- 独立编辑器保存 ACK 超时返回失败，不再静默成功。

### 测试补全

- `test/lifecycle.test.cjs`：9 个生命周期/错误路径用例；
- `test/browser-lib.mjs` + 重写的 `browser-smoke` / `browser-p4`：每个 WebDriver
  命令独立超时，覆盖托盘编辑器、监控侧栏、action 对话框、独立编辑器保存/关闭；
- `test/e2e-server.mjs`：Admin API 临时部署 Hub flow，走真实 HTTP 验证
  next/reset/read/done，结束后清理；
- `verify:all` 增加 typecheck，`STATECHART_BROWSER=1` / `STATECHART_E2E=1` 可选纳入。

### 遗留

- 浏览器套件仍依赖外部 Firefox/geckodriver，不进入 CI；
- `<scxml-view>` 对 parallel 下直接挂 history 的上游布局限制（KIT-002/005）未变。
