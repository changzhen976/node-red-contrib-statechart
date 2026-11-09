# 可行性 spike（一次性验证，不是交付代码）

这些脚本用于 2026-11-09 的可行性复核，支撑 [docs/feasibility-plan.md](../docs/feasibility-plan.md) 中的结论。**不要**把它们打进 `dist/` 或 npm 包。

## 文件

| 文件 | 作用 |
|---|---|
| `feasibility-spike.mts` | 引擎无头运行、并行、`assignValue`、happy-dom CDATA、`realClock` 与 `SessionRunner` 定时器对比 |
| `nr/complex-test.mts` | 用 `@xmldom/xmldom` 跑并行、延时、历史、图内 `<send>` |
| `nr/scxml-spike.js` | 最小 Node-RED 5 CJS 节点：动态 import ESM 引擎 + xmldom + 自定义 JS |
| `nr/smoke.cjs` | `node-red-node-test-helper` 加载节点，驱动 `idle → running → idle` |
| `nr/initial-smoke.cjs` | 构造期 `setImmediate` 启动，验证部署时初始状态输出到真实下游节点 |

## 运行

引擎级 spike 直接借用捐赠项目的 `node_modules`：

```sh
cd ../scxml-creator
node_modules/.bin/tsx ../node-red-contrib-scxmljs/spike/feasibility-spike.mts
```

Node-RED 级 spike：

```sh
cd spike/nr
npm install
node smoke.cjs
node initial-smoke.cjs
../../../scxml-creator/node_modules/.bin/tsx complex-test.mts
```

需要 `../scxml-creator` 存在；`complex-test.mts` 复用了它的 `core`。这些依赖和路径只用于验证，不代表正式包的依赖关系。

## 已知结论

- Node-RED 5.0.9 能加载 CJS 节点，并在节点内 `await import('@tinyactors/scxmljs')`；
- `@xmldom/xmldom` 可替代 happy-dom，且原生支持 CDATA 自定义 JS；
- 直接 `createSession` + `realClock` 不泄漏定时器；`SessionRunner` 会泄漏 `PlaybackClock`；
- `createSession({ data })` 可在启动前注入变量，初始条件会正确求值；
- 并行状态返回多个激活态；延时 `<send>` 带 `sendid`，输出时应过滤。
