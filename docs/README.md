# 文档索引

> 更新：2026-11-13 · npm 最新发布：`0.6.1` · 当前版本：`0.8.0`
> 0.8.0 集成 `statechart-kit@0.13.0`；0.7.0 集成 0.11.0；历史变更见 [`CHANGELOG.md`](../CHANGELOG.md)。

## 用户文档

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [README](../README.md) | 安装、Hub 快速上手、节点速查、示例、兼容性 | 当前 |
| [README.en](../README.en.md) | English version | 当前 |
| [Hub 契约](hub-contract.md) | Hub / event / set / read / reset 的完整字段与消息契约 | 当前 |
| [CHANGELOG](../CHANGELOG.md) | 版本变更；`Unreleased` 记录待发修复 | 当前 |
| [SECURITY](../SECURITY.md) | 支持版本与能力 token 的威胁模型 | 当前 |
| [examples/README](../examples/README.md) | 示例 flow 与操作顺序 | 当前 |
| [NOTICE](../NOTICE) / [THIRD_PARTY_LICENSES](../THIRD_PARTY_LICENSES.md) | 第三方组件与许可 | 当前 |

## 开发与维护

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [CONTRIBUTING](../CONTRIBUTING.md) | 本地开发、构建、运行时/浏览器/服务端 E2E、提交约定 | 当前 |
| [发布流程](releasing.md) | 版本收尾、验证门禁、npm 发布、tag、测试服务器重部署与回滚 | 当前（手动兜底） |
| [GitHub Actions 自动发布](github-actions-release.md) | Trusted Publishing、tag 触发、dry run、失败重试与验证 | 当前（推荐） |
| [重构路线](refactor-roadmap.md) | 以 `statechart-kit` 为核心的迁移记录、验收与发布状态 | 当前（0.8.0 / kit 0.13 适配） |
| [资源消耗评估](resource-profile.md) | tarball、浏览器资源、服务端内存/CPU | 当前（2026-11-11 复测） |
| [完整编辑器宿主](../editor-page/README.md) | `mountEditor` + postMessage adapter、关闭/保存约定 | 当前 |
| [Kit 需求记录](kit-requirements.md) | 左栏滚动、parallel/history 布局、重复布线、SCXML 导入能力等待修项 | 当前（KIT-001/003/004 已修复；KIT-002/005 待 scxmljs） |
| [Kit 0.13 适配计划](kit-0.13-adaptation-plan.md) | 0.11 → 0.13 的影响矩阵、工作分解、估时与风险 | **计划，待实施** |
| [P4 设计（历史）](p4-standalone-editor.md) | 0.2.0 之前的 donor SPA 方案 | **历史，不要按本文操作** |

## 历史与宣传材料

| 文档 | 说明 |
| --- | --- |
| [community-post/](../community-post/) | 0.1.x 社区宣传稿与旧截图；**保留为历史**，不随 0.7 更新，对外宣传需重写 |

截图：`docs/images/hub-demo.png` 是当前 Hub 低代码用法的典型截图；`standalone-editor.png` 仍为 0.2.0 编辑器截图，`monitor-sidebar.png` 为侧栏监控。

## 开发内部（不随 npm 包发布）

- `.opencode/skills/node-red-scxmljs-dev/`：会话交接、测试服务器、Node-RED API 经验。
  其中 `project-state.md` / `roadmap.md` 的当前状态以本索引与
  [重构路线](refactor-roadmap.md) 为准；旧 P0–P4 段落仅作历史。

## 测试与 CI

- 运行时：`npm test`（44 个用例，含生命周期/错误路径）；
- 干净实例 live 套件：`GECKODRIVER=/path/to/geckodriver npm run test:live`，
  自动启动临时 Node-RED 并跑托盘编辑器、独立编辑器、服务端 E2E 和级联示例；
- GitHub Actions：`.github/workflows/ci.yml` 跑单测/类型/打包门禁；
  `.github/workflows/live-e2e.yml` 每周及手动跑 live 套件；
- 浏览器套件仍依赖 Firefox + geckodriver，不进入每次 PR 的 CI。

## 已知文档缺口

- `community-post` 保留为 0.1.x 历史材料，不再按当前版本维护；
- `docs/images/standalone-editor.png` 仍是 0.2.0 截图，更新截图时一并替换；
- `refactor-roadmap.md` 的 §14/§15 是 0.2.0 历史记录，当前状态看 §16。
