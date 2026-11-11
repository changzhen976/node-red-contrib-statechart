# Contributing

Thanks for taking a look. This package is a Node-RED node set plus a browser
editor, so changes usually touch the runtime contract and the editor together.

Project docs are indexed in [docs/README.md](docs/README.md); historical designs
are marked there so they are not mistaken for current implementation notes.

## Setup

```sh
npm install --include=dev   # Node.js >= 22.9
npm test                    # builds dist/ and runs the runtime suite
npm run typecheck
```

Useful scripts:

| Script | What it does |
|---|---|
| `npm run build` | Bundles `dist/` with esbuild: node runtime (kit inlined), tray form, full-page editor and monitor |
| `npm test` | Build plus the Node-RED runtime tests (`node --test test/*.test.cjs`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:kit` | Verify the `statechart-kit` dependency (version, dist, inlined bundle) |
| `npm run release:check` | Pre-release gate: required files, `npm pack` manifest, no stale names |
| `npm run verify:all` | Typecheck, tests, kit check and release check, optionally browser suites |
| `npm run test:browser` / `npm run test:p4` | Browser regressions; need Firefox, geckodriver and a live Node-RED (`NODERED_URL`, default `http://localhost:1880/`) |

Browser suites are not part of CI; run them locally when touching the editor,
the full-page editor or the monitor.

## Layout

> 0.2.0 起：`src/vendor/` 与 `editor-app/` 已移除，核心统一为 `statechart-kit`；
> 详见 [重构路线](docs/refactor-roadmap.md)。

```
src/nodes/          Node-RED nodes (machine config node, in, out)
src/runtime/        session bridge, bus, i18n, dom parser, monitor routes
src/editor/         browser-side bridge injected into the node edit form
editor/             node edit form HTML and locales
editor-page/        full-page kit editor host (adapter / postMessage)
monitor/            read-only monitor page shell
examples/           importable flows
test/               runtime and browser tests
```

`statechart-kit` is a devDependency and is bundled into `dist/` at build time;
the published package has no runtime dependency on it.

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
