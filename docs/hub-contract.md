# Hub 契约与低代码节点

本文是 `statechart-hub`、`statechart-event`、`statechart-set`、`statechart-read`、`statechart-reset` 的完整字段和消息契约。README 只保留常用示例。

## 1. 总体结构

```text
外部消息 ──▶ statechart-hub ──▶ 输出 1：状态
                               ├─▶ 输出 2：图内 <send>
                               └─▶ 输出 3：错误 / done
```

- 一个 `statechart-machine` 拥有一个独立会话；
- 一个会话只能由一个 `statechart-hub` 接入 flow；
- `statechart-event` / `statechart-set` / `statechart-read` / `statechart-reset` 只产生消息，不直接持有会话。

## 2. `statechart-hub`

### 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `machine` | 空 | 引用的 `statechart-machine` |
| `includeVars` | `true` | 状态输出是否带 `msg.vars` |
| `emitInitial` | `true` | 启动后是否立即输出一次状态 |
| `includeInternalSends` | `false` | 是否把延时/内部 send 也输出到输出 2 |
| `stateTopic` | 空 | 状态输出的 topic 模板 |
| `eventTopic` | `statechart/{machine}/evt/{event}` | 图内事件的 topic 模板 |

### 输入

默认按事件处理；`msg.command` 可改为其他命令。

```js
{ event: "cmd.start" }                              // 仅事件
{ event: "sensor.temp", payload: { value: 85 } }    // 带值事件
{ topic: "cmd.start" }                              // 没有 msg.event 时用 topic
{ command: "set", payload: { temp: 85 } }           // 设置变量
{ command: "reset" }                                // 复位会话
{ command: "read" }                                 // 主动输出当前状态
```

规则：

- 事件名优先取 `msg.event`，否则取 `msg.topic`；
- 事件数据取 `msg.payload`，必须是可 JSON 序列化的值；
- `set` 的 payload 必须是对象；变量必须在 `<data>` 中声明；
- `set` 完成后会自动发送 `updateEvent`（默认 `update`）；
- `read` 会重新输出当前状态，不改变状态。

### 输出 1：状态

```js
msg.payload // 单状态字符串；并行状态为数组
msg.states  // 始终是数组
msg.vars    // includeVars 时
msg.changed // 状态或变量是否变化
msg.event   // 触发这次状态输出的事件
msg.machine // machine 名称
msg.topic   // stateTopic 或状态名
```

并行状态机示例：

```js
msg.payload // ["running", "power", "on", ...]
msg.states  // ["running", "power", "on", ...]
```

### 输出 2：图内事件

```js
msg.payload // <send> 的数据
msg.event   // 事件名
msg.machine
msg.topic   // eventTopic 展开后的 topic
```

- 默认过滤 `sendid` 存在或 `target="#_internal"` 的内部 send；
- 打开 `includeInternalSends` 可观察延时 timer 等内部事件。

### 输出 3：错误 / done

错误（运行时错误、未选择 Machine、Hub 占用冲突共用此出口）：

```js
{
  payload: "错误消息",
  error: Error,
  machine: "…",
  topic: "statechart/error",
  // statechart-kit 0.11+，能定位出错位置时附带；0.10 没有这些字段
  stateId?: "idle",
  transitionId?: "t1",
  slot?: "entry" | "exit" | "transition",
  actionIndex?: 0,
  element?: { localName: "script", id?: "…" }
}
```

未选择 Machine 或冲突发生在部署/首帧启动时，也会直接发到输出 3，不需要先给
Hub 一条输入。错误定位字段只在 kit 能确定时出现，宿主不应假设它们一定存在。

完成：

```js
{
  payload: "done",
  done: true,
  machine: "…",
  states: [...],   // kit 0.11+ 优先使用 done.states；0.10 使用最后 fired 目标
  vars: {...},
  ts: 179...
}
```

### 单 Hub 约束

`statechart-machine` 在运行时记录 Hub owner：

- 第一个 Hub 启动成功并占用；
- 第二个 Hub 状态变红，输出 3 报 `hubConflict`，且不订阅状态、不输出状态；
- 占用者关闭/释放后，第二个 Hub 会在下一次输入时重新尝试 claim；claim 成功后
  恢复正常输出（无需为它单独重新部署）；
- 编辑器会扫描同 Machine 的其他 Hub 并显示警告，但最终约束在运行时。

## 3. `statechart-event`

| 字段 | 说明 |
|---|---|
| `eventSource` | `fixed` 或 `msg.event` |
| `event` | 固定事件名；`msg.event` 模式下可空 |
| `dataMode` | `none` / `payload` / `json` / `flow` / `global` |
| `data` | `json` 模式下的固定 JSON |
| `dataKey` | `flow` / `global` 模式下的 context key |

行为：

- `none`：删除 `msg.payload`，只发事件；
- `payload`：保留输入的 `msg.payload`；
- `json`：解析配置里的 JSON；
- `flow` / `global`：从对应 context 读取 `dataKey`；
- 输出 `msg.command = "event"`、`msg.event` 和可选 `msg.payload`。

```js
// 输出示例（带值）
{ command: "event", event: "sensor.temp", payload: { value: 85 } }
```

## 4. `statechart-set`

| 字段 | 说明 |
|---|---|
| `mode` | `single` / `object` |
| `variable` | `single` 模式的变量名 |
| `valueType` | `payload` / `json` / `str` / `num` / `bool` / `flow` / `global` |
| `value` | 固定值（json/str/num/bool 模式） |
| `valueKey` | flow/global 模式的 context key |

行为：

- `single`：`{ [variable]: value }`；
- `object`：直接使用 `msg.payload` 对象，可一次设置多个变量；
- 输出 `msg.command = "set"` 和 `msg.payload` 变量对象；
- 变量声明/类型错误由 Hub 的 `machine.setVars` 报错。

## 5. `statechart-read`

| 字段 | 说明 |
|---|---|
| `machine` | 可选；为空时使用输入消息里的状态 |
| `mode` | `snapshot` / `state` / `var` |
| `variable` | `var` 模式的变量名 |
| `scope` | `none` / `flow` / `global` |
| `key` | context key，支持 `{machine}` / `{event}` 模板 |

行为：

- 配置 Machine：调用 `getCurrentState()` 主动读取；
- 未配置 Machine：使用 `msg.states` / `msg.vars` / `msg.payload`；
- `snapshot`：`{ states, vars, event, ts }`；
- `state`：单状态字符串或状态数组；
- `var`：指定变量值；
- `scope` 非 `none` 时写入 `flow.set(key, value)` 或 `global.set(key, value)`；
- 输出 `msg.payload = value`、`msg.states`、`msg.vars`、`msg.statechart`，以及 `msg.context`（写入时）。

注意：

- 快照不会自动清空，reset 后需要重新 read；
- key 为空会报错；
- flow/global context 只保存最新值，不保存历史。

## 6. `statechart-reset`

无额外配置。输入触发后输出：

```js
{ ...msg, command: "reset" }
```

Hub 收到后重建会话并回到初始状态。

## 7. 从旧 in/out 迁移

`statechart-in` / `statechart-out` 已在 0.5.0 移除。

| 旧节点 | 新方式 |
|---|---|
| `statechart-out` 输出 1 | Hub 输出 1 |
| `statechart-out` 输出 2 | Hub 输出 2 |
| `statechart-in` 事件 | 上游直接接 Hub，或 `statechart-event` |
| `statechart-in` set/reset | `statechart-set` / `statechart-reset` |

迁移时注意：

- 一台 machine 只能有一个 Hub；
- 同一 tab 的多个 in/out 合并到一个 Hub；
- 跨 tab 的 machine 需要 `link` 节点，或保持在同一 tab；
- 旧 `outputMode` 不再存在；Hub 总是同时提供 3 个输出，按需接线即可。

## 8. 示例

- [`examples/hub-demo.json`](../examples/hub-demo.json)：event/set/read/reset + Hub；
- [`examples/traffic-light.json`](../examples/traffic-light.json)：最小循环；
- [`examples/cascade-test.json`](../examples/cascade-test.json)：三机级联；
- [`examples/demo-suite.json`](../examples/demo-suite.json)：完整功能集。

## 9. 常见问题

**Hub 红灯：已被其他 Hub 占用**  
输出 3 会带 `hubConflict` 错误。删除占用中的 Hub 后重新部署，或让等待中的 Hub
再收到一条输入以重新 claim；也请检查是否复制了旧 Hub。

**Hub 红灯：没有选择 Machine**  
输出 3 会带 `noMachine` 错误；检查 Hub 的 Machine 选择。


**read 报 context key 为空**  
`scope` 不是 `none` 时必须填 `key`。

**read 没有输出**  
没有 Machine 且输入也没有 `msg.states` / `msg.vars`；检查上游是否来自 Hub 状态输出。

**set 报 unknown variable**  
变量必须先在 `statechart-machine` 的 `<data>` 中声明。

**事件没有反应**  
检查事件名是否与 transition 的 `event` 完全一致，以及守卫条件是否满足。
