# Changelog

## Unreleased

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
