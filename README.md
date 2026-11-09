# node-red-contrib-scxmljs

> 在 Node-RED 流程中嵌入 SCXML 状态机：配置状态、变量和转移条件，以消息驱动，输出当前状态与变量。

**当前阶段：P0 完成（2026-11-09）。** 已实现包骨架、CJS 构建、最小 `scxml-machine` / `scxml-in` / `scxml-out`、编辑器表单、示例 flow，并通过 `node-red-node-test-helper` 与真实 Node-RED 5.0.9 加载验证。

**复核结论：有条件 Go。** 运行时路线已在 Node-RED 5.0.9 上跑通；G1（重部署不恢复活跃状态）已接受；G2 的 donor LICENSE 与 `license` 字段已补并提交（donor commit `b3dfef6`）。实时状态通过节点状态和 `scxml-out` 消息输出；图形化只读状态图已选 P2.5 方案 B（独立监控页 + 编辑器侧栏 iframe），不是可编辑画布。详见 [可行性计划](docs/feasibility-plan.md)。

## P0 快速试用

```sh
# 本仓库开发
npm install --include=dev
npm run build
npm test

# 打包并安装到 Node-RED 用户目录
npm pack
cd ~/.node-red
npm install /path/to/node-red-contrib-scxmljs-0.1.0-dev.0.tgz
node-red
```

然后在 Node-RED 编辑器导入 [`examples/traffic-light.json`](examples/traffic-light.json)。流程包含：

- `scxml-machine`：交通灯 SCXML（红/绿/黄），默认沙箱引擎；
- `inject`：发送 `next` 事件；
- `scxml-in`：把 `msg.topic` 作为事件名；
- `scxml-out`：输出 1 是状态 + 变量，输出 2 是图内 `<send>`；
- 两个 `debug` 节点。

> 如果本机环境设置了 `NODE_ENV=production`，npm 会跳过 devDependencies；开发时用 `npm install --include=dev`。

## P0 已实现

- config node 持有一个 SCXML 会话与事件总线，in/out 节点共享；
- 懒加载 `@tinyactors/scxmljs`，CJS 节点内动态 `import()` 纯 ESM 引擎；
- 使用 `@xmldom/xmldom` 解析 SCXML（支持 CDATA，替代 happy-dom）；
- 状态输出支持单状态/并行多状态、变量快照、`changed` 标记；
- 图内 `<send>` 输出；延时/内部 send 默认过滤；
- 初始状态输出（`scxml-out` 挂载后补发一次）；
- 部署后 `scxml-out` 的 `node.status()` 显示当前激活状态；
- 编辑器三节点表单与帮助文本；
- 测试覆盖初始状态、转移、`<send>`、并行、非法 SCXML、关闭无定时器泄漏；
- `npm pack` 产物在干净的 Node-RED 5.0.9 用户目录可安装并加载。

## P0 限制

- `scxml-machine` 目前直接接收 SCXML 文本，还没有 `ProjectDoc` 表单/序列化（P1 vendor core，P2 三张表）；
- 输入节点暂不支持 `msg.command = "set"` / `"reset"`（P1）；
- 不做变量 context 持久化（P1）；
- 不做只读监控页（P2.5）；
- 不做可编辑画布（P4）；
- 包仍为 `private: true`，未发布 npm。

## 为什么单独建仓

- 不把 Node-RED 运行时塞进 `scxml-creator`（Vue + Vite 的可视化编辑器）；
- 不要求先启动 `scxml-creator` 的 Fastify 服务，也不依赖 MQTT/REST；
- 复用 `scxml-creator` 已经验证过的 SCXML 文档模型、序列化器和校验器；引擎会话按 Node-RED 的生命周期重新封装（不复用 `SessionRunner` 的播放时钟）；
- 把「Node-RED 节点包」与「可视化建模应用」各自独立发布、独立演进。

捐赠项目位于相邻目录：`../scxml-creator`。

## 目标

- 一个 Node-RED npm 包，提供状态机配置节点与消息输入/输出节点；
- 用户可以在节点配置中定义：状态、初始状态、变量、转移事件、转移条件、动作；
- 运行时把 Node-RED 消息转换为 SCXML 事件，把状态变化和图内 `<send>` 事件转换为 Node-RED 消息；
- 支持层级状态、并行状态、历史伪态、延时转移等 SCXML 语义；
- 运行时无浏览器依赖，不启动额外服务；
- 实时看到当前状态：节点状态灯 + `scxml-out` 的 `msg.states`/`msg.vars`；P2.5 增加只读状态图（方案 B）。

## 非目标（至少 MVP 不做）

- 不集成 `scxml-creator` 的 Fastify 服务、MQTT 桥、全局变量、机器管理；
- 不在 Node-RED 运行时里挂载 Vue 应用；
- 不把**可编辑**的可视化画布作为 MVP 的交付条件（先做表单/JSON 配置；只读实时图在 P2.5，可编辑画布后置）；
- 不保证 Node-RED 重部署后恢复活跃状态（见可行性计划 G1 与「状态持久化」相关章节）。

## 实时状态怎么看

「不做画布」指不做**可编辑的图形化建模画布**（拖拽状态/连线、改属性、撤销），不是不做状态展示。

P0 自带三层实时可见性：

- **节点状态**：`scxml-out` / config node 的 `node.status()` 显示当前激活状态；并行时显示多个或 `2 active`；
- **消息输出**：`scxml-out` 输出 `msg.states`、`msg.vars`、`msg.changed`，可接 Debug、Switch、Change、Dashboard；
- **错误**：红状态 + `node.error`，Catch 节点可接。

如果要在编辑器里看到**状态盒子实时高亮**的只读状态图，已选 P2.5 方案 B：runtime 提供只读监控页和状态接口，编辑器侧栏用 iframe 嵌入；页面用 `<scxml-view>` 只读绘制并切 `.active`，状态每 300–500 ms 轮询。它不提供编辑能力，工作量约 1–2 会话。详见 [可行性计划](docs/feasibility-plan.md)（§2.6 概览、§4.10 监控页设计）。

## 节点

| 节点 | 类型 | 作用 |
|---|---|---|
| `scxml-machine` | config node | 保存 SCXML 文本，懒加载引擎，持有唯一会话和事件总线 |
| `scxml-in` | 输入节点 | 把 `msg` 转成 SCXML 事件；事件名来自 topic / `msg.event` / payload / 固定值 |
| `scxml-out` | 输出节点 | 输出状态 + 变量、图内 `<send>` 事件和运行错误 |

`scxml-out` 消息契约：

```js
// 输出 1：状态
msg.payload = "red"          // 并行时为数组
msg.states = ["red"]         // 始终数组
msg.vars = { cycles: 1 }     // includeVars 时
msg.changed = true
msg.event = "next"           // 触发本次宏步的事件（可空）
msg.machine = "Traffic Light"
msg.topic = "red"

// 输出 2：图内 <send>
msg.payload = { n: 1 }
msg.event = "notify"
msg.machine = "Traffic Light"
msg.topic = "scxml/Traffic Light/evt/notify"
```

详细契约见 [可行性计划](docs/feasibility-plan.md)（§4.4 消息契约）。

## 目录

```text
.
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── nodes/        # machine/in/out + CJS 入口
│   ├── runtime/      # 引擎加载、事件总线
│   └── vendor/       # P1 vendor scxml-creator core（当前为空）
├── editor/
│   └── scxml.html    # 三节点编辑表单 + 帮助
├── examples/
│   └── traffic-light.json
├── test/
│   └── p0.test.cjs   # test-helper 集成测试
├── monitor/          # P2.5 只读监控页（当前为空）
├── spike/            # 一次性可行性验证（不发布）
└── docs/
```

## 兼容性基线

| 项 | 目标 |
|---|---|
| Node-RED | 5.x 首选（实测基线 5.0.9）；4.1.x 不作为 MVP 支持目标，后续另立兼容任务 |
| Node.js | ≥ 22.9（Node-RED 5 要求；推荐 24）；不支持 Node 18/20 |
| 引擎 | `@tinyactors/scxmljs@0.2.0-dev.0` 精确锁定，与 `scxml-creator` 保持同一版本 |
| XML 解析 | `@xmldom/xmldom@^0.9.12`（替代 happy-dom，安装体积约 464 KB，支持 CDATA） |
| 模块格式 | 运行时入口 CJS，ESM 依赖用动态 `import()` 加载 |

## 文档

- [可行性计划](docs/feasibility-plan.md)（v1.0，2026-11-09，当前决策依据）
- [可行性评估](docs/assessment.md)（2026-11-06，历史评估）
- [实施计划](docs/plan.md)（v0.1，2026-11-06，任务细节）
- [验证脚本](spike/)（一次性 spike，不属于发布包）

## 状态

- [x] 独立目录与基础结构
- [x] 可行性评估（2026-11-06）
- [x] 实施计划（2026-11-06）
- [x] 可行性复核与决策稿（2026-11-09）
- [x] G1：接受「重部署不恢复活跃状态」（2026-11-09）
- [x] G2：donor LICENSE、`package.json` 的 `license` 字段与提交均已完成（`b3dfef6`）
- [x] P0：包骨架 + 最小三节点 + Node-RED 5 冒烟（2026-11-09）
- [ ] 实时状态：P2.5 只读监控页（方案 B）
- [ ] P1：运行时 MVP（vendor core、set/reset、变量持久化）
- [ ] P2：表单配置编辑器（三张表）
- [ ] P3：测试矩阵、示例、发布

## 许可

本包 MIT，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

捐赠项目 `../scxml-creator` 的 README 声明 MIT；其根目录已补 `LICENSE`，`package.json` 已补 `"license": "MIT"`，并已提交到 donor 仓库（`b3dfef6`）。