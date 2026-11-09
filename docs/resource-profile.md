# 资源消耗评估

> 测量日期：2026-11-09
> 运行环境：测试服务器 Node-RED 5.0.0 / Node 24.16.0（容器），本地基准 Node 24.22.2
> 场景：Traffic Light + test chart 两台机器；容器另有 mosquitto，但下列 Node-RED 数据只取 `nodered`。

## 1. 安装 / 磁盘

| 项 | 大小 |
|---|---:|
| npm tarball（含 P4 editor-app、locales、示例） | **833 KB** |
| npm 解包后 | **2.58 MB** |
| `dist/` | 2.52 MB |
| `dist/editor-app/` P4 静态 SPA | 1.28 MB raw / **442 KB gzip** |
| `dist/monitor/` 只读监控页 | 1.12 MB raw / **344 KB gzip** |
| `dist/scxml.html` Node-RED 编辑器资源 | 64 KB raw / **15 KB gzip** |
| `dist/scxml.js` 运行时入口 | 32 KB raw / 8.8 KB gzip |
| `@tinyactors/scxmljs` | 1.6 MB |
| `@xmldom/xmldom` | 460 KB |

说明：P4 页面和 monitor 页面都自带一份浏览器端引擎/WASM；它们是独立页面，
不会和 Node-RED 主编辑器同时全部加载。Node-RED 编辑器自身只加载 64 KB 的 `scxml.html`。

## 2. 服务端内存 / CPU

`docker stats`（两台机器，监控页未打开）：

```text
nodered  CPU=0.02%  MEM=104.8 MiB / 1.82 GiB (5.62%)
```

这台 Node-RED 容器还包含 Node-RED 本体、已加载的两个状态机会话和测试 flow，因此
104.8 MiB 不是插件单独的占用。

引擎基准（sandboxed QuickJS，空 Node 进程）：

| 场景 | RSS 增量 | 说明 |
|---|---:|---|
| 第一个会话 | **+25.6 MiB** | QuickJS/WASM 固定加载成本；启动约 58 ms |
| 已有引擎后再加 10 个会话 | +2.9 MiB | 约 0.29 MiB/会话 |
| 已有引擎后再加 50 个会话 | +6.4 MiB | 约 0.13 MiB/会话 |
| 50 个会话总计（进程 RSS） | 约 97 MiB | 含 Node 基础 RSS 55 MiB + 引擎/会话 |

结论：**固定成本主要来自 QuickJS 沙箱，约 25 MiB；每多一台状态机的增量很小。**
`dispose()` 不会卸载 WASM 模块，所以固定成本会保留到进程结束，但不会按机器重复。

trusted 模式对照（10 个会话）：

```text
RSS +3.6 MiB，外部内存 +0.11 MiB，启动 33.5 ms
```

trusted 没有 QuickJS 固定成本，但图表 JS 在宿主 Node.js realm 执行；只在可信图表上使用。

## 3. CPU / 空闲行为

- 空闲时容器 CPU **0.02%**（快照）；没有轮询/定时器时的常态接近 0。
- 状态机只在收到事件时执行；没有后台 macrostep 循环。
- 监控页 400 ms 轮询**仅在页面打开时**发生；页面关闭即停止。
- 延时转移会创建定时器，但随转移完成/会话 dispose 清理；50 次重部署测试无泄漏。
- `persistVars` 只在状态变化后 250 ms 节流写入 context，不是持续写入。

## 4. 浏览器侧

| 页面 | raw | gzip | 备注 |
|---|---:|---:|---|
| P4 完整编辑器 | 1.28 MB | 442 KB | 一次性打开；含 QuickJS/Vue/画布 |
| 只读监控页 | 1.12 MB | 344 KB | 侧栏/独立页；含渲染引擎 |
| Node-RED 主编辑器新增资源 | 64 KB | 15 KB | 只在加载插件编辑器时 |

资源大头是浏览器端引擎（P4 684 KB raw / 261 KB gzip；monitor 832 KB raw）。
这属于“完整状态机编辑器/实时图”的合理成本；页面有 HTTP 缓存，静态资源 `max-age=3600`。

## 5. 是否合理

**合理，但有边界。**

合理之处：

- 833 KB tarball / 2.58 MB 解包，对 Node-RED 插件不算大；
- 服务端固定成本 25 MiB 来自沙箱安全隔离，换来 QuickJS 超时/内存限制；
- 每增加一台机器约 0.1–0.3 MiB，50 台会话的增量约 6 MiB；
- 空闲 CPU 0.02%，没有后台轮询/常驻定时器；
- 监控/P4 页面是按需打开的独立页面，不会拖慢 Node-RED 主编辑器。

需要注意：

- 在 **128 MB 内存限制**的容器里，Node-RED 本体 + 25 MiB QuickJS 固定成本会比较紧；
- 如果只需要可信图表，`trusted` 模式内存/启动更低，但放弃沙箱隔离；
- P4 页面 1.28 MB raw 对慢速网络有一次性加载成本，但 gzip 442 KB，且可缓存；
- 大量并发浏览器监控页会消耗客户端内存，不是服务端主问题；
- 当前测量是 2 台机器；100+ 台机器/高频事件应重新做压测。

## 6. 建议

1. 默认保持 `sandboxed`；仅在明确信任图表时切换 trusted。
2. 小内存节点（≤128 MB）优先控制机器数量，或提高 Node-RED 容器内存。
3. 监控页不必常开；需要长时间观察时再打开。
4. 若 P4 页面在慢网环境使用，可后续把 Vue/画布按需拆 chunk；当前 442 KB gzip 可接受。
5. 100+ 机器或高频事件场景，补充每机器内存/事件吞吐基准，再决定默认引擎策略。
