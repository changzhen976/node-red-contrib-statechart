# GitHub Actions 自动发布

> 目标：推送一个 `v*` tag，GitHub Actions 自动跑发布门禁并把包发布到 npm。
> 推荐使用 **npm Trusted Publishing（OIDC）**，不需要长期保存 `NPM_TOKEN`。
>
> 工作流文件：[`.github/workflows/release.yml`](../.github/workflows/release.yml)

## 1. 工作流做了什么

触发条件：

- push 一个 `v*` tag，例如 `v0.8.0`；
- 手动 `workflow_dispatch`，默认只做 **dry run**，方便第一次验证配置。

执行顺序：

1. 校验 tag 与 `package.json` 的 `version` 完全一致（`v0.8.0` ↔ `0.8.0`）；
2. `npm ci`；
3. `npm run typecheck`；
4. `npm test`；
5. `npm run check:kit`；
6. `npm run release:check`；
7. 安装 geckodriver，跑 `npm run test:live`（托盘/完整编辑器、服务端 E2E、级联）；
8. 查询 npm 上是否已有同版本：已存在则跳过 publish（重跑安全）；
9. 解析 npm dist-tag：正式版发 `latest`，`-dev`/`-rc` 等预发布版发 `next`
   （避免预发布覆盖 `latest`）；
10. `npm publish --provenance --access public --tag <dist-tag>`；
11. 在 Actions Summary 里记录版本、tag、是否已发布。

权限：

```yaml
permissions:
  contents: read
  id-token: write   # npm provenance / trusted publishing
```

---

## 2. 一次性配置（推荐：npm Trusted Publishing）

### 2.1 在 npm 上添加 Trusted Publisher

1. 登录 <https://www.npmjs.com/>；
2. 打开包 `@changzhen976/node-red-contrib-statechart` 的 **Settings**；
3. 找到 **Trusted publishing** / **Publish access** 区域；
4. 选择 **GitHub Actions**，填写：

| 字段 | 值 |
| --- | --- |
| Organization or user | `changzhen976` |
| Repository | `node-red-contrib-statechart` |
| Workflow filename | `release.yml` |
| Environment | 留空（本工作流未使用 environment） |

5. 保存。

> npm 的 Trusted Publishing 要求包已经存在（当前 npm 上有 `0.6.1`，满足）；
> 同时要求 npm CLI ≥ 11.5.1。工作流用 Node 24，并在发布前检查 npm 版本。

### 2.2 GitHub 仓库侧

- **不需要**添加 `NPM_TOKEN` secret；
- `Settings → Actions → General → Workflow permissions` 选择
  **Read repository contents and packages permissions** 即可；
- `id-token: write` 已经在工作流里声明，不需要额外开写权限。

### 2.3 可选：发布环境保护

如果希望发布前人工点一次批准：

1. GitHub `Settings → Environments` 新建 `npm-release`，添加 Required reviewers；
2. npm Trusted Publishing 的 Environment 填 `npm-release`；
3. 在工作流 `publish` job 上加：

```yaml
environment: npm-release
```

三处名称必须完全一致，否则 npm 会拒绝 OIDC 发布。

---

## 3. 备选：使用 NPM_TOKEN（不推荐长期使用）

如果暂时不能用 Trusted Publishing：

1. npm → **Access Tokens** → **Generate New Token** → **Granular Access Token**；
2. 权限至少包含：
   - Read and write packages；
   - 作用域选择 `@changzhen976/node-red-contrib-statechart`；
   - 允许 bypass 2FA（自动化 token）；
3. GitHub 仓库 → `Settings → Secrets and variables → Actions` → 新建
   `NPM_TOKEN`；
4. 在 `.github/workflows/release.yml` 的 publish 步骤加：

```yaml
      - name: Publish to npm (token fallback)
        if: github.ref_type == 'tag' && inputs.dry_run != true && steps.published.outputs.exists != 'true'
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --provenance --access public
```

`id-token: write` 仍建议保留，这样即使使用 token 也能生成 provenance。

---

## 4. 先验证工作流（不发布）

### 4.1 手动 dry run

1. GitHub → **Actions** → **release** → **Run workflow**；
2. 分支选 `main`，`dry_run` 保持 `true`；
3. 运行后应看到：
   - typecheck / test / check:kit / release:check 全绿；
   - `npm publish --dry-run --access public` 成功；
   - 没有真正发布。

### 4.2 本地等价检查

```sh
export npm_config_cache="$PWD/.tmp/npm-cache"
export npm_config_logs_dir="$PWD/.tmp/npm-logs"
npm ci
npm run typecheck
npm test
npm run check:kit
npm run release:check
# 正式版用 --tag latest，预发布版用 --tag next
npm publish --dry-run --access public --tag latest
```

> 当前 `0.8.0-dev.2` 是预发布版，dry run 要加 `--tag next`；直接
> `npm publish` 会报 `You must specify a tag using --tag when publishing a prerelease version`。

---

## 5. 正式发布流程

### 5.1 准备版本

```sh
# 确认工作区干净、CI 通过
npm version 0.8.0 --no-git-tag-version

# 手工把 CHANGELOG 的 Unreleased 改成：
# ## 0.8.0 — 2026-XX-XX
# 并检查 README / docs/README 的版本行
```

提交并推送：

```sh
git add -A
git commit -m "release: 0.8.0"
git push origin main
git push gitea main
```

### 5.2 打 tag，触发自动发布

```sh
git tag v0.8.0
git push origin v0.8.0
git push gitea v0.8.0
```

工作流会：

- 校验 `v0.8.0` 与 `package.json` 的 `0.8.0` 一致；
- 跑全部发布门禁；
- 如果 npm 上没有 `0.8.0`，执行 `npm publish --provenance --tag latest`；
- 如果已经有同版本，跳过 publish，工作流仍然成功；
- 预发布版本（如 `v0.8.0-dev.2`）会自动发到 `next` tag，而不是 `latest`。

### 5.3 验证

```sh
npm view @changzhen976/node-red-contrib-statechart version
npm view @changzhen976/node-red-contrib-statechart dist-tags
npm view @changzhen976/node-red-contrib-statechart@0.8.0 dist.tarball
```

在 npm 包页面应能看到 **Provenance** 标记，并链接到本次 GitHub Actions run。

### 5.4 创建 GitHub Release

Actions 成功后，在 GitHub 上：

1. **Releases → Draft a new release**；
2. 选择 tag `v0.8.0`；
3. 用 `CHANGELOG.md` 的 `0.8.0` 段落作为 release notes；
4. 发布。

工作流不会自动创建 GitHub Release；tag + npm publish 已经完成，Release 只是展示层。

### 5.5 用 npm 发布物重部署测试服务器

按 [`docs/releasing.md`](releasing.md) 第 6 节，用
`npm pack @changzhen976/node-red-contrib-statechart@0.8.0` 的产物重新部署，
不要用工作区打包覆盖。

---

## 6. 失败与重试

### 发布失败

- **代码/测试失败**：修代码，重新提交；删除并重建 tag：
  ```sh
  git tag -d v0.8.0
  git push origin :refs/tags/v0.8.0
  git tag v0.8.0
  git push origin v0.8.0
  ```
- **网络/临时失败**：在 Actions 页面 **Re-run failed jobs**；工作流会先查
  `npm view`，已发布则跳过，不会重复发布。
- **版本已存在**：不要改 tag 指向旧版本；应 bump 到下一个版本。

### 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `EOTP` / 2FA required | 用了普通 token 或未配置 Trusted Publishing | 配 OIDC；或改用 automation token |
| `404 Not Found` / `E403` | 包名、scope 或 publisher 配置不匹配 | 检查 npm Trusted Publisher 的 repo/workflow/environment |
| `E422` version already exists | 同版本已发布 | bump 版本后重新 tag |
| provenance 生成失败 | 缺 `id-token: write` 或 npm 太旧 | 检查权限与 npm ≥ 11.5.1 |
| tag 校验失败 | tag 与 `package.json` 版本不一致 | 改 tag 或改版本，二者必须一致 |

---

## 7. 手动发布（兜底）

如果 Actions 不可用，仍可按 [`docs/releasing.md`](releasing.md) 的手动流程：
本地 `npm publish`（2FA）→ 打 tag → 用 npm 发布物重部署测试服务器。

> 自动化流程与手动流程的差别：自动发布由 **tag 触发**，所以顺序是
> **先 tag 后 publish**；如果 publish 失败，删除/移动 tag 后重来。手动流程仍是
> **先 publish 后 tag**，避免 tag 指向发布失败的提交。两种方式不要混用同一次发布。
