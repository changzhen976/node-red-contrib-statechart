# 文档索引

> 更新：2026-11-12 · 当前 npm 版本：`0.6.0` · 测试服务器：`0.6.0`（已部署）
> 0.6.0 集成 `statechart-kit@0.10.0`；历史变更见 [`CHANGELOG.md`](../CHANGELOG.md)。

## 用户文档

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [README](../README.md) | 安装、节点、消息契约、监控、兼容性 | 当前 |
| [README.en](../README.en.md) | English version | 当前 |
| [CHANGELOG](../CHANGELOG.md) | 版本变更；`Unreleased` 记录待发修复 | 当前 |
| [SECURITY](../SECURITY.md) | 支持版本与能力 token 的威胁模型 | 当前 |
| [examples/README](../examples/README.md) | 示例 flow 与操作顺序 | 当前 |
| [NOTICE](../NOTICE) / [THIRD_PARTY_LICENSES](../THIRD_PARTY_LICENSES.md) | 第三方组件与许可 | 当前 |

## 开发与维护

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [CONTRIBUTING](../CONTRIBUTING.md) | 本地开发、构建、测试、提交约定 | 当前 |
| [重构路线](refactor-roadmap.md) | 以 `statechart-kit` 为核心的迁移记录、验收与发布状态 | 当前（含 0.2.1 计划） |
| [资源消耗评估](resource-profile.md) | tarball、浏览器资源、服务端内存/CPU | 当前（2026-11-11 复测） |
| [完整编辑器宿主](../editor-page/README.md) | `mountEditor` + postMessage adapter、关闭/保存约定 | 当前 |
| [Kit 需求记录](kit-requirements.md) | 左栏滚动、parallel/history 布局、重复布线、SCXML 导入能力等待修项 | 当前（KIT-001/003/004 已修复；KIT-002/005 待 scxmljs） |
| [P4 设计（历史）](p4-standalone-editor.md) | 0.2.0 之前的 donor SPA 方案 | **历史，不要按本文操作** |

## 历史与宣传材料

| 文档 | 说明 |
| --- | --- |
| [community-post/](../community-post/) | 0.1.x 社区宣传稿与旧截图；0.2.0 已更换编辑器，截图/描述可能过时 |

截图：`docs/images/standalone-editor.png` 已于 2026-11-11 更新为 0.2.0 的
`statechart-kit` 编辑器；`monitor-sidebar.png` 仍是当前侧栏监控。

## 开发内部（不随 npm 包发布）

- `.opencode/skills/node-red-scxmljs-dev/`：会话交接、测试服务器、Node-RED API 经验。
  其中 `project-state.md` / `roadmap.md` 的当前状态以本索引与
  [重构路线](refactor-roadmap.md) 为准；旧 P0–P4 段落仅作历史。

## 已知文档缺口

- `community-post` 未按 0.2.0 重写，仅作历史材料；
- 完整浏览器套件（`test:browser` / `test:p4`）尚未在测试服务器上稳定跑通，
  发布说明中不要声称浏览器矩阵已验证。
