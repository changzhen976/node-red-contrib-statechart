# statechart-kit / scxmljs 需求记录

> 记录时间：2026-11-11  
> 本仓库依赖：`statechart-kit@0.13.1`、`@tinyactors/scxmljs@0.2.0-dev.0`；测试服务器插件 `0.8.1` 已生效
> 目的：把本轮测试中遇到、但**不应该在 flow 层反复绕过**的问题固定下来，供 kit / scxmljs 后续版本修复。
>
> 0.13.0 同步：KIT-016（结构编辑维护 `initial` 不变量）已在 0.12.1/0.13.0 修复；
> kit 0.13.0 还带来 `raise`、`eventVisibility` 与 internal-only guard。宿主已升级到
> 0.13.0，并补齐监控展示、托盘 raise/initial 与诊断映射。
>
> 0.11.0 同步：KIT-006–KIT-010（done.states、错误定位、编辑器本地化、诊断 code
> 目录）已在 kit 0.11.0 实现；完整实现记录见 kit 仓库 `docs/internal/kit-requirements.md`。

## 需求总表

| ID | 归属 | 优先级 | 问题 | 当前状态 |
| --- | --- | --- | --- | --- |
| KIT-001 | `statechart-kit` 编辑器 | P1 | 全屏编辑器左侧「结构 / 状态树」栏无法上下滚动 | ✅ 0.8.1 已修复 |
| KIT-002 | `@tinyactors/scxmljs` 渲染器 | P1 | `layoutChart` 在「history 直接挂在 parallel 下 + 转移指向 history」时抛异常，官方 `<scxml-view>` 所有状态重叠 | 已绕过；最小复现 + issue 草案 + fork 方案已记录，待上游修复 |
| KIT-003 | `statechart-kit` SCXML 导入 | P2 | `scxmlToDoc` 不支持 `<donedata>`，导入时告警并丢弃该元素 | ✅ 0.9.0 已支持 `doneData` 往返 |
| KIT-004 | `statechart-kit` SCXML 导入 | P2 | `scxmlToDoc` 不支持无 target 的内部转移，导入告警且 ProjectDoc 无法表达 | ✅ 0.9.0 已支持 targetless/internal |
| KIT-005 | `@tinyactors/scxmljs` 渲染器 | P2 | 复杂图中同源/同目标的多条条件转移共享走廊，线条近重合、视觉上像重复 | 已记录最小证据与修复方案；待上游修复 |
| KIT-016 | `statechart-kit` 编辑器 | P2 | `addState`/`removeState`/`setParent` 未维护 `ProjectDoc` 的 `initial` 不变量 | ✅ 0.12.1 已修复；0.13.0 包含 |

---

## KIT-001：左侧结构栏需要滚动

> 状态：`statechart-kit@0.8.1` 已修复（`.sce-side-left { overflow-y: auto }`）。以下保留问题记录与验收标准。

### 现象

全屏状态图编辑器中，状态数量较多时，左侧「结构」栏只能看到前一部分；没有纵向滚动条，后面的状态和转移无法访问。

### 根因

Kit 的布局链是完整的：

```css
.sce-root { height: 100%; }
.sce-main { flex: 1; display: flex; min-height: 0; }
.sce-side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.sce-side-left { width: 300px; }
```

但左栏内容容器 `.sce-panel.sce-structure` 没有建立滚动上下文：

```css
.sce-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 缺少 flex:1 / min-height:0 / overflow-y:auto */
}
```

父级 `.sce-side` 是 `overflow: hidden`，因此超出的状态树被直接裁掉。右侧属性栏有 `.sce-tab-body { flex:1; min-height:0; overflow-y:auto }`，所以右栏可以滚动，左栏不行。

### 期望

- 左栏整体可纵向滚动；或
- 标题、过滤框、添加按钮固定，状态树和转移列表在独立滚动区内。

最小修复：

```css
.sce-structure {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

或：

```css
.sce-side-left {
  overflow-y: auto;
}
```

### 验收

- 生成 100 个以上状态；
- 左栏出现纵向滚动条；
- 能滚动到最后一个状态和最后一条转移；
- 右侧属性栏滚动行为不受影响。

### 当前绕过

测试服务器已升级到插件 0.6.0（含 kit 0.10.0），该滚动修复已生效。

---

## KIT-002：parallel 下 history 导致 `<scxml-view>` 布局崩溃

### 现象

把 Cell 的 SCXML 导入 scxmljs 官方页面后，状态全部重叠；`<scxml-view>` 不能正常绘制。

### 复现条件

SCXML 同时满足：

1. `<history>` 直接作为 `<parallel>` 的子元素；
2. 有 transition 的 target 指向该 history（`resume`、`overheat`、重复 start 等）。

最小结构：

```xml
<parallel id="running">
  <history id="hDeep" type="deep"><transition target="power"/></history>
  <state id="power">...</state>
  <state id="conveyor">...</state>
</parallel>

<state id="paused">
  <transition event="cell.resumeDeep" target="hDeep"/>
</state>
```

### 根因

`@tinyactors/scxmljs/dist/view/layout.js` 中：

```js
const kidsOf = (c) =>
  c.kind === "parallel" ? c.children : [...c.children, ...c.history];
```

parallel 子节点只取 `children`，**history 不参与测量和定位**；但 `routeEdges` 仍会处理所有 transition，包括指向 history 的边，随后执行：

```js
const R = (s) => tr(abs.get(s), down);
const cx = (s) => R(s).x + R(s).w / 2;
```

`abs.get(history)` 为 `undefined`，抛出：

```text
TypeError: Cannot read properties of undefined (reading 'x')
```

`<scxml-view>` 布局失败后，各 state 停留在默认位置，看起来就是所有状态重叠。

### 影响版本

已在本地 `@tinyactors/scxmljs@0.2.0-dev.0` 复现；`<scxml-view>` 使用同一套 `dist/view/layout.js`，因此官方页面表现一致。

### 最小复现（已实测）

```xml
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="paused">
  <parallel id="running">
    <history id="h" type="deep"><transition target="a"/></history>
    <state id="a"/>
  </parallel>
  <state id="paused">
    <transition event="resume" target="h"/>
  </state>
</scxml>
```

Node 复现：

```js
import { DOMParser } from '@xmldom/xmldom'
import { parseSCXML } from '@tinyactors/scxmljs/dist/session.js'
import { compile } from '@tinyactors/scxmljs/dist/model.js'
import { layoutChart } from '@tinyactors/scxmljs/dist/view/layout.js'

const root = parseSCXML(source, new DOMParser())
const model = await compile(root)
layoutChart(model.root, {
  measure: () => ({ w: 80, h: 30 }),
  labelSize: () => ({ w: 40, h: 12 }),
})
```

实际结果：

```text
TypeError: Cannot read properties of undefined (reading 'x')
    at cx (.../dist/view/layout.js:616:27)
    at routeEdges (.../dist/view/layout.js:633:44)
    at layoutChart (.../dist/view/layout.js:532:20)
```

### 期望

二选一：

1. parallel 下的 history 也参与布局（作为伪态盒子绘制），并允许指向它的边；或
2. 布局时跳过指向未布局 pseudo-state 的边，并给出 warning，至少不 crash、不重叠。

### 验收

- 用上述最小 SCXML 调用 `layoutChart` 不抛异常；
- 所有 state 矩形坐标不重合；
- `<scxml-view>` 能绘制 parallel 区域与 history 伪态；
- 指向 history 的 transition 有可见路由或明确的 warning。

### 上游 Issue 草案

标题：

```text
layoutChart throws when a transition targets a <history> directly inside <parallel>
```

正文要点：

```md
Version: @tinyactors/scxmljs@0.2.0-dev.0

`layoutChart` crashes when a transition targets a history pseudo-state that is
a direct child of a `<parallel>`. The history is excluded from `kidsOf()` for
parallel containers, so it never gets a rectangle in `abs`. `routeEdges()` then
computes `R(p.to)` for that history and throws:

  TypeError: Cannot read properties of undefined (reading 'x')
      at cx (dist/view/layout.js)
      at routeEdges (dist/view/layout.js)
      at layoutChart (dist/view/layout.js)

`<scxml-view>` catches the failure and leaves the state boxes at their default
positions, so every state appears stacked on top of every other state.

Minimal repro is in the issue body (one parallel, one history, one transition
to the history). The same document is valid SCXML and runs correctly in the
interpreter; only layout fails.

Expected: either lay out history pseudo-states under parallel, or skip edges
whose endpoint has no layout box and surface a warning. At minimum layoutChart
must not throw and must not stack all states.
```

### Fork 修复方案

优先级 1（最小、可先用）：

- 在 `routeEdges()` 的端口计算前过滤未布局节点：

```js
const placeable = pending.filter((p) => abs.has(p.from) && abs.has(p.to))
const skipped = pending.filter((p) => !abs.has(p.from) || !abs.has(p.to))
```

- 对 `skipped` 给出 warning（或放进 `layoutChart` 返回值的 `warnings`）。
- 这能保证不 crash、不重叠，但指向 history 的边不会绘制。

优先级 2（完整）：

- 为 parallel 下的 history 建立独立的小盒子，放在 parallel 头部或区域网格下方；
- 将 history 加入 `abs` 和 `boxes`，但不加入 `arrangeRegions()` 的区域列表；
- `routeEdges()` 正常为指向 history 的边寻路；
- 增加一个最小 SCXML 的单元测试：断言 `layoutChart` 不抛异常、所有 box 坐标不重合。

建议先提 issue；如果上游短期不处理，再 fork 并用上述优先级 1 的 guard 作为补丁，避免官方 viewer 继续重叠。

### 当前绕过

把 `running` 从「parallel 本身」改成「compound 包一层 parallel」：

```xml
<state id="running" initial="p">
  <history id="hShallow" type="shallow"><transition target="p"/></history>
  <history id="hDeep" type="deep"><transition target="p"/></history>

  <parallel id="p">
    <state id="power">...</state>
    <state id="conveyor">...</state>
    <state id="safety">...</state>
  </parallel>

  <transition event="cell.pause" target="paused"/>
  <transition event="cell.stop" target="offline"/>
</state>
```

这样 history 是 compound 的子节点，`kidsOf` 会包含它们，布局正常。

验证结果：

```text
layoutChart(Cell) → width 1492, height 688, boxes 20, edges 22
editor scxmlToDoc → warnings 0, structure issues 0
```

代价：活动状态会多一个 `p`（`running` 的 parallel 子状态）。测试断言使用包含关系，不受影响。

---

## KIT-003：`scxmlToDoc` 支持 `<donedata>`

> 状态：`statechart-kit@0.9.0` 已支持 `StateNode.doneData` 与无损往返；以下保留问题记录。

### 现象

打开 Cell 配置时弹窗：

```text
import.element.unsupported
{"at":{"stateId":"decommissioned.done"},"tag":"donedata"}
```

### 根因

`statechart-kit` 的 SCXML → ProjectDoc 导入器没有 `donedata` 文档模型；该元素是合法 SCXML，但导入时被标记为 unsupported。

### 期望

- ProjectDoc 增加 final data 表达；或
- 导入时保留原始片段并给出非阻断 warning，不丢失 `<donedata>`；
- 至少不要因为 final data 导致整个状态机渲染异常。

### 当前绕过

Cell/Supervisor 的终止态已移除 `<donedata>`。终止信息改用事件（`sys.cell.decommissioned`、`sys.supervisor.shutdown`）传递。

---

## KIT-004：`scxmlToDoc` 支持无 target 的内部转移

> 状态：`statechart-kit@0.9.0` 已支持 `TransitionEdge.target: string | null` 与 `transitionType`；以下保留问题记录。

### 现象

编辑器导入时告警：

```text
import.transition.no-target
{"at":{"stateId":"running","slot":"transition"},"event":"cell.start"}
```

### 根因

原 Cell 用无 target 的 `type="internal"` 转移做重复握手：

```xml
<transition event="cell.start" type="internal">
  <send event="cell.ready">...</send>
</transition>
```

这是合法 SCXML，但 ProjectDoc 的 transition 模型要求 target；导入器无法表达，导致该转移在编辑器中丢失，图形也不完整。

### 期望

- ProjectDoc 支持 targetless / internal transition；或
- 导入器将其映射为「内部动作」并保留，不丢转移；
- 若确实不支持，应给出明确 warning，并保证其余图仍可渲染。

### 当前绕过

所有内部转移都改成显式 target：

- Cell 重复 start：`target="hDeep"`（深历史恢复并行配置）；
- Supervisor `job.accepted`：`target="hRun"`；
- Supervisor degraded 内 `cell.overheat`：`target="degraded"`；
- Job `job.priority`：移除（测试按钮一并删除）。

现在三台机器导入均为 0 warning / 0 structure issue。

---

## KIT-005：复杂图中的条件转移线条近重合，视觉上像重复

### 现象

状态机复杂后，同一对源/目标之间有多条条件转移，或不同转移共用同一段走廊时，自动布线会把它们画成很近的平行线，甚至共享很长的水平/垂直线段，看起来像“线条重复”。

Cell 里就能看到：

```text
move.done      moving → idle
conveyor.stop  moving → idle
```

`layoutChart` 实际输出（`sp.edge = 10`）：

```text
move.done:
  (1012,339.4) → (1124,339.4) → (1124,370)
  → (1396,370) → (1396,326) → (1416,326)

conveyor.stop:
  (1012,352.6) → (1134,352.6) → (1134,370)
  → (1406,370) → (1406,334) → (1416,334)
```

两条边都沿 `y = 370` 从约 `x = 1124/1134` 走到 `1396/1406`，只差 10px；在缩放后的画布上很容易被看成同一条线或重复线。

### 根因

`@tinyactors/scxmljs/dist/view/layout.js` 的布线粒度是 **每条 transition × 每个 target**，不是 `(from, to)` 边组：

- `weights` 只在分层阶段按 `a→b` 合并权重，**绘制阶段仍为每条 transition 生成一条 edge**；
- `channelUse` / `channelX` 只按 gap 分配固定 `sp.edge` 偏移；
- 没有“同源同目标边组”的偏移、捆绑或标签避让；
- 没有检测长距离共享走廊。

因此边数一多，尤其是嵌套/并行容器里多条边被提升到同一层间走廊时，就会出现近重合。

### 可修复性

可以修复，属于布局路由增强，不是状态机语义问题。按成本从低到高：

1. **最小**：按 `(from.id, to.id)` 分组，给同组边分配递增偏移和独立端口；标签沿组内顺序错开。能减少完全重合，但边多时仍拥挤。
2. **推荐**：同组边使用 bundle/trunk + 分支，或折叠为一条边并在标签上显示条件数量；点击/悬停展开。
3. **完整**：增加标签碰撞检测和走廊占用检测，动态调整 `sp.edge` / `sp.label`。

验收标准：

- 同一对源/目标有 5 条条件转移时，5 条边可区分（或合并为 1 条可展开的 bundle）；
- 任意两条边的长直线段不完全重合；
- 标签矩形不重叠；
- 不影响现有单条转移的布线。

### 上游 Issue 草案

标题：

```text
layoutChart draws near-duplicate edges for multiple guarded transitions between the same states
```

正文要点：

```md
Version: @tinyactors/scxmljs@0.2.0-dev.0

When several transitions share the same source and target (for example guarded
transitions on the same event, or different events both returning to the same
state), layoutChart routes each transition independently through the same
corridor. `sp.edge` only separates them by 10px, and long horizontal/vertical
segments can overlap for hundreds of pixels. In complex nested/parallel charts
this looks like duplicated transition lines.

Concrete example from a three-region chart:

  move.done      moving -> idle
  conveyor.stop  moving -> idle

Both edges run along y = 370, from x ~1124/1134 to ~1396/1406, only 10px apart.

Expected: group edges by (from, to), give the group intentional separation or a
bundle, and avoid label collisions. At minimum, no two long straight segments
should overlap exactly.
```

### Fork / 修复方向

- 在 `routeEdges()` 前为 `pending` 增加 `groupKey = `${p.from.id}→${p.to.id}``；
- 按组分配 `groupIndex`，在 `channelX` / `laneY` 中叠加组内偏移；
- 端口分配把组内边排在一起，标签按组内顺序纵向错开；
- 增加“共享走廊段”检测，必要时增加 lane；
- 单测：同一对状态放 10 条带不同 `cond` 的转移，断言 `points` 不完全相同、标签矩形不相交。

更彻底的产品方案是把同源同目标的多条条件边折叠成一条 bundle，标签显示 `3 conditions`，展开后再看每条条件；这需要 `<scxml-view>` 的交互和布局共同改动。

### 当前规避

- 测试床里暂时接受这种视觉近重合；它不影响 SCXML 语义和运行；
- 如果只是展示用途，可把同源同目标的多条转移合并为一条，用 `<if cond="_event.name === ...">` 区分动作；
- 或在 flow 中避免多个条件转移落在同一对状态上。

---

## 回归资产

- 示例：[`examples/cascade-test.json`](../examples/cascade-test.json)
- 测试：[`scripts/test-cascade.mjs`](../scripts/test-cascade.mjs)
- 命令：

```sh
CASCADE_BASE=http://homeassistant:1880 npm run test:cascade
```

当前结果：14/14 通过。

## 更新建议

- KIT-001 已在 `statechart-kit` 0.8.1 修复（`.sce-side-left { overflow-y: auto }`）。
- KIT-003 / KIT-004 已在 `statechart-kit` 0.9.0 修复；宿主表单仍需适配 `TransitionEdge.target: string | null` 和 `doneData` 展示。
- KIT-002 属于上游 `@tinyactors/scxmljs` 渲染器修复；在修复前，文档和示例应避免 parallel 直接挂 history。
- KIT-005 属于上游布线能力增强；建议先做最小边组偏移，再评估 bundle/折叠交互。
