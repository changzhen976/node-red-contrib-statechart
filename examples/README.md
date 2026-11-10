# 示例 flow

## 导入

1. 打开 Node-RED 编辑器；
2. 右上角菜单 → **导入**；
3. 选择 `demo-suite.json`（或粘贴内容），选择“导入副本”；
4. 点 **部署**；
5. 打开右侧 **状态机** 侧栏，或用 `http://<node-red>:1880/statechart/monitor`。

`demo-suite.json` 会新增 6 个 tab；`traffic-light.json` 是最小示例，可单独导入。

## Demo Suite 内容

| Tab | 机器 | 初始状态 | 覆盖功能 |
|---|---|---|---|
| 01 Traffic Light | Traffic Light | `red` | 基础转移、entry action、变量、`reset`、监控 |
| 02 Commands & Guards | HVAC Guard | `idle` | `set/reset/event`、条件转移、`updateEvent`、`assign`、`send(data-expr)`、state/event topic |
| 03 Parallel & History | Parallel Plant | `p/power/off` + `p/network/disconnected` | parallel、活动状态数组、`outputMode=state` |
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
- 测试后已恢复测试服务器原 flow。
