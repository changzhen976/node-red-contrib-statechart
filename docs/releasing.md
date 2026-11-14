# 发布流程

> 适用于 `@changzhen976/node-red-contrib-statechart`。当前版本 `0.9.0`，
> npm `latest` 为 `0.9.0`。
>
> **自动发布已配置**：正常发布走 [GitHub Actions 自动发布](github-actions-release.md)，
> 推送 `v*` tag 触发 npm publish。本文保留为手动兜底流程。
>
> 自动与手动流程的顺序不同：
> - 自动：先 tag → Actions 发布；失败时删除/移动 tag 重来；
> - 手动：先 publish → 再 tag，避免 tag 指向发布失败的提交。
> 同一次发布不要混用两种方式。

## 版本策略

- 开发/试用阶段用 `<next>-dev.<n>`（可以在 `BUILD_INFO.json` 里记录 gitHead），
  不发布、不打 tag；
- 用户确认稳定后，去掉 `-dev` 后缀、补 CHANGELOG 日期，再发布正式版本；
- 发布顺序：**推送代码 → npm publish → 打 tag → 用 npm 发布物重部署测试服务器**。
  先发布再打 tag，避免 tag 指向一个发布失败的提交。

## 发布前检查

1. 工作区干净，所有修复已提交；
2. `CHANGELOG.md` 的版本段已写完整，包含用户可见变更和测试说明；
3. 本地能登录 npm（`npm whoami`），建议 2FA；
4. 测试服务器可用（`homeassistant:1880`），上一版有备份；
5. Firefox + geckodriver 可用（跑浏览器套件）。

如果本机 `~/.npm` 只读，先设置可写缓存：

```sh
export npm_config_cache="$PWD/.tmp/npm-cache"
export npm_config_logs_dir="$PWD/.tmp/npm-logs"
```

## 1. 版本收尾

```sh
# 0.7.0-dev.0 -> 0.7.0
npm version 0.7.0 --no-git-tag-version

# 手工把 CHANGELOG 的“未发布（测试服务器验证通过）”改成
# “0.7.0 — 2026-XX-XX”，并检查 README/docs/README.md 的版本行。
```

## 2. 验证门禁

```sh
npm test
npm run typecheck
npm run check:kit
npm run release:check

# 浏览器 + 临时 Node-RED + 服务端 E2E + 级联
GECKODRIVER=/path/to/geckodriver npm run test:live

# 或一次性全量（需要已有 Node-RED；会临时部署/删除测试 flow）
STATECHART_BROWSER=1 STATECHART_E2E=1 \
  GECKODRIVER=/path/to/geckodriver NODERED_URL=http://localhost:1880/ \
  npm run verify:all
```

发布说明里只能写实际跑过的矩阵。`test:live` 通过即可声称“托盘编辑器、
独立编辑器、服务端 E2E、级联示例在 Node-RED 5.x 上验证通过”。

## 3. 推送代码

```sh
git push origin main
git push gitea main
```

## 4. npm 发布

```sh
npm whoami                 # 需要已登录
npm publish                # publishConfig.access = public
npm view @changzhen976/node-red-contrib-statechart version
```

发布后确认 `dist/` 内容与本地构建一致，且 tarball 不含 `test/`、`.tmp/`、
`.opencode/` 或内网主机名（`release:check` 已覆盖）。

## 5. 打 tag

```sh
git tag v0.7.0
git push origin v0.7.0
git push gitea v0.7.0
```

在 GitHub/Gitea 用 `CHANGELOG.md` 的对应段落作为 release notes。

## 6. 用发布物重部署测试服务器

不要直接用工作区打包覆盖，先从 npm 取发布物：

```sh
rm -rf .tmp/deploy-release
mkdir -p .tmp/deploy-release/node-red-contrib-statechart
npm pack @changzhen976/node-red-contrib-statechart@0.7.0 \
  --pack-destination .tmp/deploy-release
tar -xzf .tmp/deploy-release/*.tgz \
  -C .tmp/deploy-release/node-red-contrib-statechart --strip-components=1
cp package-lock.json .tmp/deploy-release/node-red-contrib-statechart/
(
  cd .tmp/deploy-release/node-red-contrib-statechart
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
)
```

同步到服务器时先停容器、备份当前目录，再替换并启动：

```sh
ssh homeassistant 'docker stop nodered && \
  rm -rf ~/docker/nodered/plugins/node-red-contrib-statechart.prev && \
  cp -a ~/docker/nodered/plugins/node-red-contrib-statechart \
        ~/docker/nodered/plugins/node-red-contrib-statechart.prev && \
  rm -rf ~/docker/nodered/plugins/node-red-contrib-statechart/*'

tar -C .tmp/deploy-release/node-red-contrib-statechart -czf - . \
  | ssh homeassistant 'tar -xzf - -C ~/docker/nodered/plugins/node-red-contrib-statechart'

ssh homeassistant 'docker start nodered'
```

> 上面的路径是示例；实际测试服务器路径与 SSH 命令见
> `.opencode/skills/node-red-scxmljs-dev/references/test-server.md`。
> 本仓库不把内网主机名写进发布产物。

验证：

```sh
ssh homeassistant 'docker inspect --format "{{.State.Health.Status}}" nodered'
curl -fsS http://homeassistant:1880/statechart/token
NODERED_URL=http://homeassistant:1880/ npm run test:e2e
GECKODRIVER=/path/to/geckodriver NODERED_URL=http://homeassistant:1880/ npm run test:browser
```

## 7. 发布后记录

更新：

- `CHANGELOG.md` 顶部版本与日期；
- `docs/README.md` 的“npm 最新发布 / 当前开发”行；
- `.opencode/skills/node-red-scxmljs-dev/references/project-state.md` 与
  `test-server.md`：发布版本、gitHead、测试结果、备份路径。

## 回滚

### 测试服务器

```sh
ssh homeassistant 'docker stop nodered && \
  rm -rf ~/docker/nodered/plugins/node-red-contrib-statechart && \
  cp -a ~/docker/nodered/plugins/node-red-contrib-statechart.prev \
        ~/docker/nodered/plugins/node-red-contrib-statechart && \
  docker start nodered'
```

### npm

已发布版本不要直接 `npm unpublish`（72 小时后不可用，且会破坏已有安装）。
优先发布补丁版本，必要时：

```sh
npm deprecate @changzhen976/node-red-contrib-statechart@0.7.0 "reason"
```
