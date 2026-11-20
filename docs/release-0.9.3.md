# 0.9.3 发布说明（草案）

> 状态：已发布（2026-11-20，npm `latest`）。
> 日期：2026-11-20
> npm 包：`@changzhen976/node-red-contrib-statechart`
> 内置 `statechart-kit@0.16.0`

## 亮点

### 转移条件 tooltip

完整编辑器的转移标签现在支持 hover / focus / 触摸 tap / Escape 查看**完整条件**，
不再受画布标签截断影响。tooltip 由 `statechart-kit@0.16.0` 的
`ScxmlLabelTooltip` 提供，使用共享的 `canvas-contract` 解析标签事实；重绘或卸载后
会恢复原生 `title` 与 `aria-describedby`。

### 监控侧栏 fit 修复

侧栏监控的「适应」现在按**实际可见内容**的包围盒缩放、居中：

- 取 `offset` / `scroll` 的较大值，并纳入状态框、转移标签、连线、初始标记；
- 用包围盒的 `left/top` 修正平移，不再以 `.diagram` 的 `0,0` 角为内容中心；
- fit 允许低于手动缩放下限（独立 `FIT_MIN_SCALE=0.02`），高状态机也能全览；
- 监听 canvas / window / visualViewport 尺寸变化，浏览器缩放或控件换行后自动重算。

### 侧栏 iframe 高度

修复 Node-RED 侧栏 section 高于可见区域时 iframe 溢出、底部 vars 覆盖层被裁切的问题。
监控 iframe 现在按 `#red-ui-sidebar` 的可见底边约束，100% 浏览器缩放下也能完整显示。

## 安装/升级

```sh
npm install @changzhen976/node-red-contrib-statechart@0.9.3
```

要求 Node-RED 5.x、Node.js >= 22.9。

## 兼容性

- `ProjectDoc`、运行时消息契约与诊断码不变；
- 内置 kit 0.15.1 -> 0.16.0，仅新增 Vue tooltip API 与画布内部 resolver 调整；
- 现有 internal event / `internalOnlyEvents` 文档无需迁移；
- 完整编辑器新增 `features.canvasTransitionTooltip`，默认在宿主启用。

## 验证

发布前应跑完：

- `npm test`：80/80；
- `npm run typecheck`、`check:kit`、`release-check`；
- `test:live`：托盘编辑器、完整编辑器、tooltip、服务端 E2E、cascade；
- 测试服务器 npm 发布物 `0.9.3`：浏览器、E2E 7/7、cascade 14/14，1366x768、100% 缩放下 fit 与 vars 覆盖层正常。

## 已知事项

- Dependabot TypeScript 7 PR (#3) 仍被 `@node-red/util` 的 `typescript ^5` peer 阻塞，
  不属于本版本发布门禁；
- 测试服务器已改用 npm 发布物重新部署，备份为 `.prev-before-0.9.3`。
