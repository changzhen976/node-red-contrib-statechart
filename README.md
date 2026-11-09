# node-red-contrib-scxmljs

> 在 Node-RED 流程中嵌入 SCXML 状态机：配置状态、变量和转移条件，以消息驱动，输出当前状态与变量。

**当前阶段：可行性复核完成（2026-11-09），待 P0。** 本仓库目前只有目录骨架、可行性评估、实施计划和一次性验证脚本，尚未实现节点运行时代码。

复核结论：**有条件 Go**。运行时路线已在 Node-RED 5.0.9 上跑通；G1（重部署不恢复活跃状态）已接受，G2（补齐捐赠项目许可文件/字段）进行中。实时状态会通过节点状态和 `scxml-out` 消息输出；图形化只读状态图已选 P2.5 方案 B（独立监控页 + 编辑器侧栏 iframe），不是可编辑画布。详见 [可行性计划](docs/feasibility-plan.md)。

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

MVP 自带三层实时可见性：

- **节点状态**：`scxml-out` / config node 的 `node.status()` 显示当前激活状态；并行时显示多个或 `2 active`；
- **消息输出**：`scxml-out` 输出 `msg.states`、`msg.vars`、`msg.changed`，可接 Debug、Switch、Change、Dashboard；
- **错误**：红状态 + `node.error`，Catch 节点可接。

如果要在编辑器里看到**状态盒子实时高亮**的只读状态图，已选 P2.5 方案 B：runtime 提供只读监控页和状态接口，编辑器侧栏用 iframe 嵌入；页面用 `<scxml-view>` 只读绘制并切 `.active`，状态每 300–500 ms 轮询。它不提供编辑能力，工作量约 1–2 会话。详见 [可行性计划](docs/feasibility-plan.md)（§2.6 概览、§4.10 监控页设计）。

## 计划中的节点

| 节点 | 类型 | 作用 |
|---|---|---|
| `scxml-machine` | config node | 保存状态机定义，编译/校验 SCXML，持有唯一会话和事件总线 |
| `scxml-in` | 输入节点 | 把 `msg` 转成 SCXML 事件；支持设置变量、重置等命令 |
| `scxml-out` | 输出节点 | 输出状态变化、图内 `<send>` 事件和运行错误 |

详细消息契约见 [可行性计划](docs/feasibility-plan.md)（§4.4 消息契约）。

## 计划目录

```text
.
├── src/
│   ├── nodes/        # 节点运行时入口（构建为 CJS）
│   ├── runtime/      # 会话封装、事件总线、生命周期
│   └── vendor/       # vendor 自 scxml-creator core 的模型/序列化/校验
├── editor/           # Node-RED 编辑对话框资源（HTML/JS/CSS）
├── monitor/          # P2.5 只读监控页（构建到 dist/monitor）
├── examples/         # 示例 flow
├── test/             # node-red-node-test-helper 集成测试
├── spike/            # 一次性可行性验证（不发布）
└── docs/             # 评估与计划
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
- [ ] G2：补齐捐赠项目核心代码的许可文件/字段（进行中）
- [ ] 实时状态：MVP 节点状态 + 输出已含；只读实时图 P2.5（方案 B）待实现
- [ ] P0：包骨架 + Node-RED 冒烟
- [ ] P1：运行时 MVP
- [ ] P2：表单配置编辑器
- [ ] P3：测试、示例、发布

## 许可

MIT（本包）。注意：`../scxml-creator` 的 README 声明 MIT，但仓库是 `private: true`、没有 LICENSE 文件、`package.json` 也没有 `license` 字段；vendor 其 `core` 代码前，先补 LICENSE 与字段（或取得书面授权，见可行性计划 G2）。发布前补本包 LICENSE、NOTICE 与第三方声明。
