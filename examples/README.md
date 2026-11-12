# 示例 flow

## 导入

1. 打开 Node-RED 编辑器；
2. 右上角菜单 → **导入**；
3. 选择 `demo-suite.json`（或粘贴内容），选择“导入副本”；
4. 点 **部署**；
5. 打开右侧 **状态机** 侧栏，或用 `http://<node-red>:1880/statechart/monitor`。

`demo-suite.json` 会新增 6 个 tab；`traffic-light.json` 是最小示例，可单独导入；`cascade-test.json` 会新增 1 个三机级联测试 tab；`hub-demo.json` 新增 1 个 Hub 低代码演示 tab。

## Demo Suite 内容

| Tab | 机器 | 初始状态 | 覆盖功能 |
|---|---|---|---|
| 01 Traffic Light | Traffic Light | `red` | 基础转移、entry action、变量、`reset`、监控 |
| 02 Commands & Guards | HVAC Guard | `idle` | `set/reset/event`、条件转移、`updateEvent`、`assign`、`send(data-expr)`、state/event topic |
| 03 Parallel & History | Parallel Plant | `p/power/off` + `p/network/disconnected` | parallel、活动状态数组、Hub 状态输出 |
| 03 Parallel & History | History Player | `session/app/home` | shallow history、pause/resume |
| 04 Delay & Sends | Door with Delay | `closed` | 1.2s/0.8s delay、`send id`、内部 send、event topic |
| 05 Multi-Machine | Lamp / Fan | `off` / `low` | 多 config node、独立 session、同名 `toggle` 互不影响 |
| 06 ProjectDoc & Persistence | Checkout (ProjectDoc) | `cart` | ProjectDoc JSON、GUI 三张表、final 状态、`persistVars`、reset |

> Parallel Plant 的 `states` 会同时包含 `p`、`power`、`off`、`network`、`disconnected`；这是层级/并行状态的活动路径，不是 bug。
> 04 的 `includeInternalSends` 已打开，因此输出 2 能看到延时 timer send；生产建议关闭。

## 推荐操作顺序

### 02 Commands & Guards

1. 点 **start**：temp=20 → cooling，并输出 `started` 事件；
2. 点 **set temp=15**：自动发 `update` → heating；
3. 点 **set temp=25**：→ cooling；
4. 点 **done**：回到 idle；
5. 点 **reset**：从初始态重建。

### 03 History

1. **open** → details；
2. **pause** → paused；
3. **resume** → 回到 details（history）；
4. **back** → home；
5. **stop** → stopped；**resume** 仍回 history 默认 home。

### 04 Delay

1. **open**：立即进入 opening，约 1.2s 后 open；
2. **close**：进入 closing，约 0.8s 后 closed；
3. 输出 2 会看到 `door.notify` 和 `openTimer`/`closeTimer` 事件（已勾选 internal sends）。

### 06 ProjectDoc

打开 **Checkout (ProjectDoc)** 配置，会直接看到三张表；切到高级 JSON 可查看 `ProjectDoc`。
`persistVars` 已打开，`step` 变量会写入 Node-RED context。

## 已验证

- 7 台 source 机器通过 `parseSCXML` + `compile`；
- 测试服务器导入后 8 台机器全部注册，初始状态与上表一致；
- demo suite 验证后曾恢复测试服务器原 flow；`cascade-test.json` 是后续新增的独立测试 tab。

## Cascade Test（三机级联测试床）

`cascade-test.json` 新增一个 **SCXML 级联测试床** tab，包含 3 台不同拓扑的机器：

| 机器 | 拓扑 | 覆盖点 |
|---|---|---|
| Cell | parallel + shallow/deep history + delayed send | 并行区域、浅/深历史、1.5s timer、守卫、final |
| Supervisor | hierarchy + guard + timeout + final | 层级、超时/cancel、内部转移、浅历史、故障复位 |
| Job | nested + parallel + deep history + done.state | 嵌套、双 final、`done.state.*`、事件less 转移、守卫 |

事件通过三个 Hub 的输出 2 交给 `switch`，按 `cell.*` / `job.*` 前缀路由到对应 Hub 输入；Cell/Job 的发送再回到 Supervisor，形成闭环。

状态写入 global context，便于脚本断言：

- `scxml_Cell`
- `scxml_Supervisor`
- `scxml_Job`
- `scxml_events`（最近 300 条 `<send>` 事件）

导入并部署后：

1. 点 **sys.ready**；
2. 点 **cmd.start**：Supervisor → Cell → Job 自动完成第一轮握手；
3. 点 **job.step** 两次、**quality.ok**：Job 完成并通知 Supervisor 停机；
4. 继续测试 history / conveyor.fault / sensor.temp 85/55 / safety.estop / timeout / final 等按钮。

自动化检查（需要已部署该 tab 的 Node-RED）：

```sh
CASCADE_BASE=http://homeassistant:1880 npm run test:cascade
```

> 三台机器都直接使用 raw SCXML。带值 `<send>` 必须写标准 `<content expr="..."/>`；
> `data-expr` 是 ProjectDoc 动作 DSL 的写法，直接放进 raw `source` 不会把数据传给引擎。
>
> 顶层 final 进入后引擎会清空活动配置，旧版节点不会把最终状态输出到状态口。为了让终止态可见，
> Supervisor/Cell 使用 compound state + nested final child：`shutdown` + `shutdown.done`、
> `decommissioned` + `decommissioned.done`；进入时仍发送 `sys.supervisor.shutdown` /
> `sys.cell.decommissioned`，因此状态口和 `scxml_events` 都能观察。


## Hub Demo（低代码中枢）

`hub-demo.json` 新增一个 **Hub 低代码演示** tab：

- `statechart-hub` 只选一次状态机，1 个输入、3 个输出（状态 / 图内事件 / 错误）；
- 左侧 `statechart-event`、`statechart-set`、`statechart-reset` 不再需要选 Machine；
- 状态写入 global context：`hub_demo_state`、`hub_demo_events`、`hub_demo_errors`；
- 推荐操作：start → bump ×2 → set label → read state → reset；
- `statechart-read` 会把快照写入 global context `hub_demo_context`。

> 一台 `statechart-machine` 在运行时只能被一个 Hub 占用；第二个 Hub 会红灯报错，不会重复输出。
