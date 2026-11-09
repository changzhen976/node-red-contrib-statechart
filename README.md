# node-red-contrib-scxmljs

> 在 Node-RED 流程中嵌入 SCXML 状态机：配置状态、变量和转移条件，以消息驱动，输出当前状态与变量。

**当前阶段：P0 + P2.5 + P1 完成；P2 GUI 首版可用；中英文语言包已完成（2026-11-09）。** 已实现包骨架、CJS 构建、三节点、只读实时状态图、完整运行时 MVP，以及状态/转移/变量三张表的原生 Node-RED 编辑器。

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

## 新建多个状态机

1. 在 flow 里添加一个 `scxml-in` 或 `scxml-out`；
2. 在编辑窗口的 **Machine** 下拉右侧点 **＋**；
3. 在弹出的 `Add new scxml-machine config node` 窗口填写名称和 SCXML/ProjectDoc；
4. 每个 `scxml-machine` 是独立 config node，各自一个会话；侧栏监控页可以用选择器切换。

旧 flow 的 `source` 字段仍兼容；编辑器打开旧 flow 会自动导入成 `doc`（ProjectDoc JSON），保存时写回 `doc`。

## 输入命令

```js
// 普通事件：msg.topic / msg.event / payload / fixed
{ topic: "next" }

// 显式事件
{ command: "event", event: "next", payload: { ... } }

// 设置变量并自动发 updateEvent（默认 update）
{ command: "set", payload: { temp: 85 } }

// 回到初始态；persistVars 时回填持久化变量，否则用 <data> 默认值
{ command: "reset" }
```

`set` 会先校验变量是否在 `<data>` 中声明，再 `assignValue`，最后发送 `updateEvent`；可在 `scxml-machine` 配置里改 `updateEvent`。

## GUI 编辑状态机

`scxml-machine` 配置窗口现在有三张表：

- **States**：id、kind、parent、initial、entry/exit actions；
- **Transitions**：source、target、event、cond、actions、delay ms；
- **Variables**：id、expr；
- Add/Delete、根 initial、父/子下拉均可用；
- 高级区可编辑原始 SCXML 或 ProjectDoc JSON，并支持导入/导出；
- 保存写 `doc`；旧 `source` 仍保留为兼容回退。

P2 首版已去掉“只能贴 SCXML 文本”的限制；编辑器现在会做结构校验（重复 id、parent/initial、kind、transition、变量、delay），错误显示在表单顶部并高亮行；**GUI 保存 → Deploy → 运行时读 `doc` 已端到端验证**；entry/exit/transition 的 actions 支持结构化弹窗编辑。剩余是浏览器自动化。

## 语言 / i18n

编辑器会自动跟随 Node-RED 的界面语言：

- 默认使用浏览器/系统语言（Node-RED 读取 `navigator.language`）；
- 已内置 `en-US`、`zh-CN` 和 `zh` 回退；
- 中文环境会自动显示中文的节点标签、三张表、按钮、提示和帮助；
- 如果 Node-RED 界面是英文，可在浏览器控制台执行：
  ```js
  localStorage.setItem('editor-language', 'zh-CN');
  location.reload();
  ```
  也可通过浏览器的语言设置让 Node-RED 自动使用中文。

语言包位于 `dist/locales/<lang>/scxml.json`（界面文案）和 `scxml.html`（帮助）；
源码在 `editor/locales/`，构建时复制到 `dist/locales/`。

## 已实现（P0 + P1 + P2 首版）

- config node 持有一个 SCXML 会话与事件总线，in/out 节点共享；
- 多个 `scxml-machine` config node 各自独立会话，可同时存在；
- `scxml-machine` 优先读取 `doc`（ProjectDoc JSON），回退旧 `source`（原始 SCXML）；
- 启动前用 donor 的 `validateScxml` 做 parse + compile 校验；失败红状态、不反复重试；
- vendor 了 scxml-creator core（model/serializer/action-parse/validator/naming/scxml-import）；
- 懒加载 `@tinyactors/scxmljs`，CJS 节点内动态 `import()` 纯 ESM 引擎；
- 使用 `@xmldom/xmldom` 解析 SCXML（支持 CDATA，替代 happy-dom）；
- 状态输出支持单状态/并行多状态、变量快照、`changed` 标记；
- 图内 `<send>` 输出；延时/内部 send 默认过滤；
- 初始状态输出（`scxml-out` 挂载后补发一次）；
- 部署后 `scxml-out` 的 `node.status()` 显示当前激活状态；
- 编辑器三节点表单与帮助文本；
- `scxml-machine` 三张表 GUI、JSON/SCXML 高级编辑；
- 多状态机：`scxml-in`/`scxml-out` 的 Machine 使用 Node-RED 标准 config picker，带「+ Add」按钮，可直接新建 `scxml-machine`；
- `scxml-in` 支持 `msg.command = set/reset/event`；`set` 自动发送 `updateEvent`（默认 `update`）；
- 输入按机器级队列串行处理，初始化期间不会丢顺序；
- `persistVars`：变量写入 Node-RED context，启动时用 `createSession({ data })` 回填；
- `scxml-out` 支持 `outputMode`（state/event/both）、`stateTopic`、`eventTopic`；
- 历史伪态、延时转移、条件转移、持久化均有集成测试。
- 测试覆盖初始状态、转移、`<send>`、并行、非法 SCXML、ProjectDoc、双机独立、set/reset/event、outputMode、历史、延时、持久化、50 次重部署；
- `npm pack` 产物在干净的 Node-RED 5.0.9 用户目录可安装并加载。

## 当前限制

- P2 还缺浏览器自动化回归；
- actions 仍是纯文本行，未做结构化动作编辑器和字段级动作校验；
- 监控页无独立 token，依赖私网；
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

### P2.5 只读实时状态图（已实现）

打开：

```text
http://<Node-RED-host>:1880/scxmljs/monitor
```

编辑器里会注册一个 **SCXML** 侧栏 tab，用 iframe 嵌入同一页；双击 `scxml-machine` 打开配置窗口后，点「在侧栏查看实时状态图」按钮即可切换到该状态机窗口。**没有全局浮动按钮**，不会遮挡工作区。

实现方式：

- runtime 用 `RED.httpAdmin` 提供机器列表、单机状态、SCXML graph 和静态资源；
- 浏览器用 `<scxml-view>` 的 `source` 模式只读绘制，`autostart="false"`，不启动会话；
- 每 400 ms 轮询状态，切换 shadow DOM 里状态盒的 `.active`；
- 顶部提供 100%–220% 缩放，默认 150%，状态图更大更清楚；
- 监控页 HTML 每次请求从磁盘读取，重新构建后不需要重启 Node-RED 就能更新页面；
- 支持并行状态多盒子高亮；`monitorShowVars` 打开时显示变量；
- 只读，不提供拖拽/连线/属性编辑。

安全边界：监控路由目前不走 Node-RED admin token，依赖 Node-RED 绑定在私有 Tailscale 地址；**不要把 Node-RED 绑定到 0.0.0.0 或公网**。删除/写操作仍然只在编辑器，编辑器有 admin 登录保护。

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
├── monitor/          # P2.5 只读监控页（HTML/JS/CSS，构建到 dist/monitor）
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
- [P4 独立编辑器设计](docs/p4-standalone-editor.md)（2026-11-09，草案）
- [验证脚本](spike/)（一次性 spike，不属于发布包）

## 状态

- [x] 独立目录与基础结构
- [x] 可行性评估（2026-11-06）
- [x] 实施计划（2026-11-06）
- [x] 可行性复核与决策稿（2026-11-09）
- [x] G1：接受「重部署不恢复活跃状态」（2026-11-09）
- [x] G2：donor LICENSE、`package.json` 的 `license` 字段与提交均已完成（`b3dfef6`）
- [x] P0：包骨架 + 最小三节点 + Node-RED 5 冒烟（2026-11-09）
- [x] P2.5：只读实时状态图（独立监控页 + 编辑器侧栏 iframe，2026-11-09）
- [x] P1：运行时 MVP（含 50 次重复部署无泄漏，17/17 测试）
- [x] P2（首版）：状态/转移/变量三张表 GUI、JSON/SCXML 高级编辑
- [x] i18n：en-US / zh-CN / zh 语言包，自动跟随 Node-RED 语言
- [x] P2：GUI 保存 → Deploy → 运行时 `doc` 端到端回归（2026-11-09）
- [x] P2：actions 结构化编辑（send/cancel/assign/log/script）
- [ ] P2 打磨：浏览器自动化回归
- [ ] P3：测试矩阵、示例、发布
- [ ] P4（可选）：独立全屏编辑器，见 [设计草案](docs/p4-standalone-editor.md)

## 许可

本包 MIT，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

捐赠项目 `../scxml-creator` 的 README 声明 MIT；其根目录已补 `LICENSE`，`package.json` 已补 `"license": "MIT"`，并已提交到 donor 仓库（`b3dfef6`）。