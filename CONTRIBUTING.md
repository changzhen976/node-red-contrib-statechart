# Contributing

Thanks for taking a look. This package is a Node-RED node set plus a browser
editor, so changes usually touch the runtime contract and the editor together.

## Setup

```sh
npm install --include=dev   # Node.js >= 22.9
npm test                    # builds dist/ and runs the runtime suite
npm run typecheck
```

Useful scripts:

| Script | What it does |
|---|---|
| `npm run build` | Bundles `dist/` with esbuild, copies the editor, locales, icons and `editor-app/` |
| `npm test` | Build plus the Node-RED runtime tests (`node --test test/*.test.cjs`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run release:check` | Pre-release gate: required files, `npm pack` manifest, no stale names |
| `npm run verify:all` | Typecheck, tests, vendor check and release check, optionally browser suites |
| `npm run test:browser` / `npm run test:p4` | Browser regressions; need Firefox, geckodriver and a live Node-RED (`NODERED_URL`, default `http://localhost:1880/`) |
| `npm run sync:vendor` / `npm run check:vendor` | Refresh and verify `src/vendor/scxml-core` from the upstream project |

Browser suites are not part of CI; run them locally when touching the editor,
the standalone page or the monitor.

## Layout

> 重构进行中：`src/vendor/` 与 `editor-app/` 将在 0.2.0 移除，统一改用
> `statechart-kit`；`sync:vendor` / `check:vendor` 随之退役。改这两处之前先看
> [重构路线](docs/refactor-roadmap.md)。

```
src/nodes/          Node-RED nodes (machine config node, in, out)
src/runtime/        engine session handling, bus, i18n, monitor routes
src/editor/         browser-side bridge injected into the node edit form
src/vendor/         vendored core (do not edit by hand)
editor/             node edit form HTML and locales
editor-app/         standalone editor build (do not edit by hand)
monitor/            read-only monitor page shell
examples/           importable flows
test/               runtime and browser tests
```

`src/vendor/**` and `editor-app/**` are copies of another project. Fix them
upstream and re-sync; `npm run check:vendor` fails if the vendored files drift.

## Commits

Conventional Commits, one concern per commit, imperative subject:

```
feat(editor): add variable table sorting
fix(runtime): keep the event queue serialized after a reset
docs: describe the outputMode contract
```

Write the body for *why*, not *what the diff already shows*.

## Pull requests

- Keep the change scoped; unrelated refactors belong in their own PR.
- Add or extend a test in `test/` when behaviour changes.
- Note user-visible changes in `CHANGELOG.md`.
- Update the node help in `editor/locales/*/statechart.html` when the UI changes.
- Make sure no private hostnames, credentials or absolute local paths sneak in.

## Reporting bugs

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.
