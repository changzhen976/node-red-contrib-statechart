# @changzhen976/node-red-contrib-statechart

[English](README.en.md) · **简体中文**

![Node-RED 5.x](https://img.shields.io/badge/Node--RED-5.x-brightgreen)
![Node.js >=22.9](https://img.shields.io/badge/Node.js-%3E%3D22.9-green)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

在 Node-RED 中用可视化状态机（state chart）编排事件驱动逻辑。

每个状态机由一个 **Hub** 接入 flow：左侧接收事件、变量和读取请求，右侧输出状态、图内 `<send>` 事件和错误/done。外围节点只负责产生消息，不再重复选择状态机。

```text
inject / event / set / read ──▶ ┌──────────────┐ ──▶ 状态
                               │ statechart-hub│ ──▶ 图内事件
                               └──────────────┘ ──▶ 错误 / done
```

默认全程 GUI 编辑，不需要手写 XML；需要时可导入/导出 SCXML 1.0。

## 安装

```sh
npm install @changzhen976/node-red-contrib-statechart
```

需要安装本地改动时，也可以打包后安装：

```sh
npm pack
cd ~/.node-red
npm install /path/to/changzhen976-node-red-contrib-statechart-<version>.tgz
```

重启 Node-RED 后，左侧节点面板会出现 **状态机** 分类。

环境要求：Node-RED 5.x、Node.js ≥ 22.9、支持 Web Components 的浏览器。

## 5 分钟上手

1. 导入 [`examples/hub-demo.json`](examples/hub-demo.json)，选择“导入副本”；
2. 点击 **部署**；
3. 打开 **Hub 低代码演示** tab；
4. 依次点击 `start` → `bump` ×2 → `set label` → `read state`；
5. 观察 Hub 的三个输出，以及 global context 里的 `hub_demo_context`；
6. 点击 `reset` 回到初始状态。

这个示例包含：

```text
inject → statechart-event (start/stop/bump) ─┐
inject → statechart-set (label=hello) ──────┼─▶ statechart-hub
inject → statechart-read (写 global context) ┘
```

更小的示例：[`examples/traffic-light.json`](examples/traffic-light.json)。

## 节点速查

| 节点 | 作用 |
|---|---|
| `statechart-machine` | config node，保存状态机文档和会话 |
| `statechart-hub` | 把一台状态机接入 flow；1 输入、3 输出 |
| `statechart-event` | 发送固定或 `msg.event` 事件 |
| `statechart-set` | 设置一个或多个状态机变量 |
| `statechart-read` | 读取状态/变量/快照，可写入 flow/global context |
| `statechart-reset` | 发送 reset 命令 |

`statechart-machine` 不在 palette 中，由 Hub 引用。**一台状态机只能有一个 Hub**；第二个 Hub 会在运行时红灯报错。

### `statechart-hub`

```text
Machine:  选择 statechart-machine
Input:    msg.event / msg.topic / msg.command
Output 1: 状态 + 变量
Output 2: 图内 <send> 事件
Output 3: 错误 / done
```

一台状态机放一个 Hub。删除占用中的 Hub 后重新部署，另一个 Hub 才能接管。

### `statechart-event`

仅事件：

```text
Event: cmd.start
Data:  none
```

带值事件：

```text
Event: sensor.temp
Data:  fixed JSON {"value": 85}
```

数据也可以来自 `msg.payload`，或 flow/global context。

### `statechart-set`

单个变量：

```text
Mode:     single
Variable: temp
Value:    msg.payload
```

批量设置：

```text
Mode: object
payload = { "temp": 85, "mode": "cooling" }
```

值来源支持 `msg.payload`、固定 JSON、字符串、数字、布尔、flow/global context。

### `statechart-read`

```text
Machine: Cell
Read:    snapshot   # snapshot / state / variable
Store:   global
Key:     cellState
```

不选 Machine 时，使用输入的 `msg.states` / `msg.vars`。读取结果会写入 flow/global context，并继续从节点输出。

### `statechart-reset`

```text
输入触发 → 向 Hub 发送 reset
```

## 常见编排

| 目标 | 编排 |
|---|---|
| 只发事件 | `inject → statechart-event (cmd.start, data=none) → Hub` |
| 带值事件 | `sensor → statechart-event (sensor.temp, fixed JSON) → Hub` |
| 设置变量 | `inject → statechart-set (temp = msg.payload) → Hub` |
| 读取到 context | `inject → statechart-read (snapshot → global:cellState)` |
| 按状态路由 | `Hub 输出 1 → switch (msg.payload = "running")` |

并行状态请检查 `msg.states` 数组。快照不会自动清空，需要最新值就再次触发 read。

## Hub 输入与输出

| 方向 | 常用字段 |
|---|---|
| 输入 | `event` / `topic` + 可选 `payload`；`command: set/reset/read` |
| 输出 1 状态 | `payload`、`states`、`vars`、`changed`、`event`、`machine`、`topic` |
| 输出 2 图内事件 | `payload`、`event`、`machine`、`topic` |
| 输出 3 错误/done | `payload`、`error` 或 `done` |

完整字段、配置项和从旧 in/out 迁移的说明见 [docs/hub-contract.md](docs/hub-contract.md)。

## 编辑状态机

`statechart-machine` 配置窗口提供三张表：

- **States**：id、kind、parent、initial、entry/exit actions；
- **Transitions**：source、target、event、condition、actions、delay；
- **Variables**：id、expression。

支持层级状态、并行状态、历史、守卫、延时转移和结构化 action 编辑；高级区可编辑 raw SCXML 或 ProjectDoc JSON。

**打开完整编辑器** 会打开 `statechart-kit` 的全屏 Vue 编辑器；保存回 Node-RED 后点击 Update/Deploy。

## 监控

编辑器右侧 **状态机** 侧栏显示只读实时状态图，支持并行状态高亮和缩放。

监控、完整编辑器和 API 使用 capability token；启用 `adminAuth` 时 token 接口要求 `flows.read`。未启用时请将 Node-RED 绑定在私网或 Tailscale。

## 示例

- [`examples/hub-demo.json`](examples/hub-demo.json)：Hub + event/set/read/reset，推荐先看；
- [`examples/traffic-light.json`](examples/traffic-light.json)：最小状态循环；
- [`examples/cascade-test.json`](examples/cascade-test.json)：三机级联测试床；
- [`examples/demo-suite.json`](examples/demo-suite.json)：6 个 tab、8 台机器，覆盖层级、并行、历史、延时和 ProjectDoc。

自动化级联测试：

```sh
CASCADE_BASE=http://localhost:1880 npm run test:cascade
```

详见 [`examples/README.md`](examples/README.md)。

## 兼容性与限制

| 项 | 目标 |
|---|---|
| Node-RED | 5.x（测试服务器 5.0.0，开发环境 5.0.9） |
| Node.js | ≥ 22.9（推荐 24） |
| 引擎 | `@tinyactors/scxmljs@0.2.0-dev.0` |
| 编辑器 | `statechart-kit/vue` 0.10.0（构建期内联） |
| XML | `@xmldom/xmldom` |

已知限制：

- 一台状态机只能由一个 Hub 占用；
- 跨 tab 的状态机需要 `link` 节点，或保持在同一 tab；
- `<scxml-view>` 对 parallel 下直接挂 history 的布局仍有上游限制；
- 复杂图中同源同目标的条件转移仍可能有近重合线条。

## 开发

```sh
npm install --include=dev
npm test
npm run verify:all
```

浏览器回归需要 Firefox、geckodriver 和运行中的 Node-RED：

```sh
STATECHART_BROWSER=1 GECKODRIVER=/path/to/geckodriver \
  NODERED_URL=http://localhost:1880/ npm run verify:all
```

更多文档：

- [文档索引](docs/README.md)
- [Hub 输入/输出契约](docs/hub-contract.md)
- [示例说明](examples/README.md)
- [重构路线](docs/refactor-roadmap.md)
- [贡献指南](CONTRIBUTING.md)

## 许可

MIT，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)；第三方组件许可见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。
