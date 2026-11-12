# Changelog

## 0.6.1 — 2026-11-12

### Changed

- Docs-only release: publish the Hub-focused README/README.en, the
  `docs/images/hub-demo.png` usage screenshot and `docs/hub-contract.md`.
- No runtime, API or ProjectDoc changes.

## 0.6.0 — 2026-11-12

### Changed

- Upgrade the bundled `statechart-kit` from 0.9.0 to 0.10.0. ProjectDoc and
  SCXML output are unchanged; this brings the editor's target/transitionType
  editing, DoneData editor, optional Explorer and structure auto-scroll.
- Map the new `structure.state.final-transition` validation code and add
  localized messages for it.
- Keep `features.explorer` disabled by default; no host behavior change.
- Restructure README/README.en around Hub quick start and per-node minimal
  usage; move the detailed message/config contract to `docs/hub-contract.md`.
- Add `docs/images/hub-demo.png`, a typical Hub flow screenshot, to both READMEs.

## 0.5.0 — 2026-11-12

### Changed

- **BREAKING**: removed `statechart-in` and `statechart-out`. Use one
  `statechart-hub` per machine; action nodes (`statechart-event`,
  `statechart-set`, `statechart-reset`) feed its input and its three outputs
  carry state, chart sends, and errors/done.
- Migrated `examples/demo-suite.json`, `examples/cascade-test.json`,
  `examples/traffic-light.json` and the test suite from in/out to Hub.
- Updated README, help and node documentation for the Hub-only architecture.

## 0.4.0 — 2026-11-11

### Added

- Hub editor warning when another hub already references the same machine
  (the runtime claim remains authoritative).
- Hub output 3 now emits a `done` message (`payload: "done"`, `done: true`)
  before the node status changes.
- `statechart-read`: reads a snapshot/state/variable from a machine or incoming
  Hub state, and can copy the result to flow/global context.
- `statechart-event` supports `msg.event` event source plus flow/global context
  data; `statechart-set` supports flow/global value sources.
- Hub demo now includes a read/context step.

## 0.3.0 — 2026-11-11

### Added

- `statechart-hub`: flow-visible machine hub with one input and three outputs
  (state, chart `<send>` events, errors). A machine can be claimed by only one
  hub at runtime; a second hub fails with a clear error instead of duplicating
  outputs.
- `statechart-event`, `statechart-set` and `statechart-reset`: low-code action
  nodes that produce event/set/reset messages without selecting a Machine.
- `examples/hub-demo.json` and `test/hub.test.cjs` covering hub output,
  event/set/reset flow, and the single-hub claim.

## 0.2.1 — 2026-11-11

### Added

- `examples/cascade-test.json`: a three-machine cascade test bed (Cell parallel
  history, Supervisor hierarchy/timeout, Job nested/parallel/deep history) with
  a shared event router and global-context state/event recorders.
- `npm run test:cascade` (`scripts/test-cascade.mjs`): drives the example over
  the Node-RED admin API and asserts the main state-machine scenarios.
- `test/kit09.test.cjs`: targetless transition and `<donedata>` import/serialize
  coverage for the 0.9 kit contract.

### Changed

- Upgrade the bundled `statechart-kit` from 0.8.0 to 0.9.0. This picks up the
  KIT-001 sidebar scroll fix (0.8.1), `<donedata>` roundtrip (KIT-003) and
  targetless/internal transitions (KIT-004). The tray editor now offers an
  “internal transition” target and maps the new validation codes.
- `TransitionEdge.target` is now `string | null`; host code that renders the
  Node-RED tray form handles the null target. The runtime bundle and existing
  ProjectDoc/raw-SCXML data need no migration.

### Fixed

- The runtime now publishes the final transition target immediately before
  `done`, so a terminal state remains visible in state output and the monitor
  instead of disappearing behind an empty configuration.
- The cascade example models Supervisor/Cell terminal states as visible
  compound states with nested finals, and clears a stale Job on stop/fault/
  shutdown or on a re-start while the Cell is already running.
- Cell now wraps its parallel regions in a `running` compound state so the
  shallow/deep history pseudo-states are ordinary compound children. This
  avoids an upstream `<scxml-view>` layout crash with history directly under
  `<parallel>` and keeps the full editor import warning-free.
- The full-page editor now keeps the Node-RED config-node name, `ProjectDoc.name`
  and the exported SCXML `<scxml name="…">` in sync. Opening the editor prefers
  the dialog's Name field; saving from the editor updates the config node name.

## 0.2.0 — 2026-11-11

### Changed

- The runtime is now built on `statechart-kit@0.8.0`: document model, SCXML
  serializer/importer, structure validation and `SessionRunner` all come from the
  kit. `src/vendor/scxml-core` and the local engine loader are gone.
- The full-screen editor now uses `statechart-kit/vue` (`mountEditor` with a
  Node-RED `EditorAdapter`). The donor SPA build (`editor-app/`) and the 17
  build-time string replacements are removed.
- The runtime event bridge uses the kit's typed `send` / `error` / `done`
  events; a terminal state no longer produces an extra empty state message.
- Tray-form validation now delegates to the kit's `validateStructure` (delays
  below 10 ms are rejected; event-name syntax is still checked by the host).

### Added

- `/statechart/editor/` is served by the new `editor-page/` bundle (kit Vue
  editor + postMessage adapter). The editor does not autosave; the explicit
  "保存到 Node-RED" button writes `node.doc` / `node.source`.

### Fixed

- The standalone editor's close button now closes the window. Unsaved edits
  trigger a confirmation; confirming saves to Node-RED before closing.
- `postMessage` now sends a JSON clone of the document. The Vue reactive Proxy
  previously raised `DataCloneError`, which made save and close silently do
  nothing.
- `npm run check:kit` guards the bundled kit version, dist freshness and that
  the runtime bundle never `require`s `statechart-kit`.
- CI checks out/builds `statechart-kit@v0.8.0` before installing the package.

### Removed

- `src/vendor/`, `editor-app/`, `scripts/{sync,check}-vendor.mjs`,
  `scripts/vendor-patch.mjs` and the donor build patching in `esbuild.config.mjs`.

### Compatibility

- `ProjectDoc` and stored flow data are unchanged; no migration is required.
- `delayMs < 10` is now rejected by the tray validator (previously only `<= 0`).
- The full-page editor opens one machine per window; the donor multi-machine
  selector is no longer part of the Node-RED editor.

## 0.1.3 — 2026-11-10

### Fixed

- "Save to Node-RED" from the standalone editor now also lands in a **brand-new**
  machine dialog. The config node is not registered in `RED.nodes` until the dialog is
  confirmed, so the save used to be dropped silently (and no "sent" confirmation was
  shown). Existing-machine edits are unchanged.

## 0.1.2 — 2026-11-10

### Fixed

- The standalone editor no longer shows the donor project's name in its toolbar: the
  brand reads **State chart** and its stored UI state uses the `statechart:` key prefix.
- The monitor page no longer repeats its title when embedded in the Node-RED sidebar;
  only the machine selector, zoom, refresh and status controls remain.
- The standalone editor no longer documents donor-only features: the variable help
  describes machine-local variables only, prefix rules for a globals registry, MQTT
  bridge, server clock and system events are gone, and the donor service/API entry
  points are hidden.

### Added

- Screenshots of the sidebar monitor and the standalone editor in both READMEs.

## 0.1.0 — 2026-11-10

First public release.

### Changed

- Renamed the package from `node-red-contrib-scxmljs` to `@changzhen976/node-red-contrib-statechart` (v0.1.0, public scoped package).
- Node types are now `statechart-machine` / `statechart-in` / `statechart-out`.
- HTTP routes moved from `/scxmljs/...` to `/statechart/...`; capability header is now `x-statechart-token`.
- Palette entries use `paletteLabel` (no more raw `scxml-in` / `scxml-out` labels) and display **State chart**; nodes have a custom icon.
- English UI uses "State chart"; Chinese UI keeps "状态机".
- Moved the full-editor entry to a primary callout at the top of the machine config dialog; the standalone page title is overridden to `State chart editor — Node-RED` at build time.
- Docked the standalone editor's Node-RED bar to a 44px bottom strip and reserved its layout space, so it no longer covers the canvas.
- Hid the donor "exit edit" button in Node-RED mode; it returned to a gallery that does not exist there, and the bar already offers "Close".

### Fixed

- Preserve the selected state machine when refreshing the monitor view.
- Keep the sidebar resize handle above the monitor iframe and disable iframe pointer events while dragging so the preview can be narrowed.
- Use a green Node-RED 5.x compatibility badge in the bilingual READMEs.

- Sidebar tab now uses a valid `iconClass` and updates its banner title when switching tabs.
- Monitor controls use a balanced 2×2 grid on narrow sidebars instead of clipping.

### Added

- Capability token for monitor/standalone editor routes and APIs.
- Runtime status/error catalogs (server language) and `verify:all` / CI workflow.

- P4 standalone full-screen editor (`/statechart/editor/`) reusing the creator SPA, opened from the machine config and bridged with postMessage; supports switching between all `statechart-machine` config nodes; editor view is locked and Ctrl/Cmd+S saves.

- `statechart-machine` / `statechart-in` / `statechart-out` Node-RED nodes.
- ProjectDoc-first configuration with legacy SCXML `source` fallback.
- State / transition / variable tables, structured actions editor and structural validation.
- Read-only live state monitor (`/statechart/monitor`) and editor sidebar.
- `msg.command = set/reset/event`, auto `updateEvent`, serialized input queue, variable persistence.
- `outputMode`, `stateTopic`, `eventTopic`.
- English / Simplified Chinese language packs with localized help.
- `examples/demo-suite.json` (6 tabs / 8 machines).

### Compatibility

- Node-RED 5.x, Node.js >= 22.9 (tested on Node 22.9 and Node 24.22).
- `@tinyactors/scxmljs@0.2.0-dev.0`, `@xmldom/xmldom@^0.9.12`.

## 0.1.0-dev.0 — 2026-11-09

Initial development preview. Not published.
