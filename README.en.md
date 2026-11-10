# @changzhen976/node-red-contrib-statechart

**English** · [简体中文](README.md)

![Node-RED 5.x](https://img.shields.io/badge/Node--RED-5.x-brightgreen)
![Node.js >=22.9](https://img.shields.io/badge/Node.js-%3E%3D22.9-green)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

Build event-driven flows with visual state charts in Node-RED: drive state with messages, and drive downstream flows with state and variables.

The default workflow is entirely GUI-based — no XML required. Charts are executed by a SCXML 1.0 engine, and you can import/export SCXML when you need it.

## Features

- Edit states, transitions, variables and actions inside Node-RED;
- Hierarchical, parallel, history, guarded and delayed transitions;
- `assign`, `send`, `cancel`, `log` and custom JS actions;
- Control a state chart with `msg.command = set/reset/event`;
- Emit states, variables and in-chart `<send>` events as Node-RED messages;
- Optional variable persistence through Node-RED context;
- Read-only live state chart;
- Multiple independent state charts;
- English and Simplified Chinese UI/help;
- Full-screen editor reusing the creator Vue UI.

## Requirements

| Item | Requirement |
|---|---|
| Node-RED | 5.x |
| Node.js | ≥ 22.9 |
| Browser | Web Components and ES2022 |

## Installation

```sh
npm install @changzhen976/node-red-contrib-statechart
```

> The package is not yet published to npm. Until then, install a tarball:

```sh
npm pack
cd ~/.node-red
npm install /path/to/changzhen976-node-red-contrib-statechart-<version>.tgz
```

Restart Node-RED. A **State chart** category appears in the palette.

## Quick Start

1. Import [`examples/demo-suite.json`](examples/demo-suite.json) as a copy;
2. Click **Deploy**;
3. Open the **State chart** sidebar on the right;
4. Open the `01 Traffic Light` tab and click **next**;
5. Watch red → green → yellow → red.

Minimal example: [`examples/traffic-light.json`](examples/traffic-light.json).

## Nodes

| Node | Type | Purpose |
|---|---|---|
| `statechart-machine` | config node | Stores the state chart document and owns one session/event bus |
| `statechart-in` | input node | Converts messages into events, or executes `set/reset` |
| `statechart-out` | output node | Emits state/variables, chart `<send>` events and errors |

`statechart-machine` is a config node and does not appear in the palette. Add `statechart-in` or `statechart-out`, then click **＋** next to **Machine** to create one. Each state chart owns an independent session.

## Editing State Charts

The `statechart-machine` dialog has three tables:

- **States**: id, kind, parent, initial, entry/exit actions;
- **Transitions**: source, target, event, condition, actions, delay;
- **Variables**: id, expression.

Add/remove rows, select parents and initial states, edit structured actions and see structural validation. The advanced section accepts raw SCXML or ProjectDoc JSON.

**Open full editor** launches a full-screen Vue editor in a new tab. It can switch between all state charts, edit them, and **Save to Node-RED** back into the parent editor; then click Update/Deploy in Node-RED.

## Commands

```js
{ topic: "next" }                                      // regular event
{ command: "event", event: "next", payload: { ... } }  // explicit event
{ command: "set", payload: { temp: 85 } }              // assign and auto-send update
{ command: "reset" }                                   // rebuild from initial state
```

`set` accepts an object payload and validates that variables are declared in `<data>`; it then sends `updateEvent` (default `update`). With `persistVars` enabled, variables are stored in Node-RED context.

## Outputs

`statechart-out` has two outputs:

```js
// Output 1: state
msg.payload // string for one state, array for parallel states
msg.states  // always an array
msg.vars    // when includeVars is enabled
msg.changed
msg.event
msg.machine
msg.topic

// Output 2: chart <send>
msg.payload
msg.event
msg.machine
msg.topic
```

Configure `outputMode` (`state` / `event` / `both`), `stateTopic` and `eventTopic`. Internal sends are filtered by default; enable `includeInternalSends` for debugging.

## Monitoring

Open the **State chart** sidebar in the Node-RED editor for a read-only live state chart. It refreshes every 400 ms, highlights parallel states and supports 100%–220% zoom.

The monitor, full editor and API use a per-process capability token that the editor fetches automatically and places in the URL. With `adminAuth` enabled, the token endpoint requires `flows.read`. Without adminAuth, bind Node-RED to a private network or Tailscale; do not expose it directly to the public internet.

## Examples

[`examples/demo-suite.json`](examples/demo-suite.json) contains 6 tabs and 8 machines:

- Traffic Light: basic cycle;
- Commands & Guards: `set/reset/event`, guards and `send`;
- Parallel & History: parallel regions and history restore;
- Delay & Sends: delayed transitions and chart sends;
- Multi-Machine: two independent sessions;
- ProjectDoc & Persistence: ProjectDoc, final state and variable persistence.

See [`examples/README.md`](examples/README.md).

## Languages & Security

The editor, forms and help follow the Node-RED editor language. Catalogs: `en-US`, `zh-CN` and `zh` fallback.

Runtime status text is translated by the editor; `node.error` text follows the Node-RED server language (`settings.lang`).

Monitor and full-editor routes use a capability token. Static assets are public; monitor page, editor index and API require the token. Use this package on trusted networks.

## Relationship to SCXML

The default workflow is fully visual; you never need to touch XML. At runtime the chart is serialized to SCXML 1.0 and executed by `@tinyactors/scxmljs`. The advanced section and import/export keep SCXML available for interoperability and debugging.

## Compatibility

| Item | Target |
|---|---|
| Node-RED | 5.x (tested 5.0.9) |
| Node.js | ≥ 22.9 (24 recommended) |
| Engine | `@tinyactors/scxmljs@0.2.0-dev.0` |
| XML | `@xmldom/xmldom` |
| Module format | CJS entry; ESM engine loaded dynamically |

## Development

```sh
npm install --include=dev
npm test
npm run verify:all
```

Browser tests require Firefox, geckodriver and a running Node-RED:

```sh
STATECHART_BROWSER=1 GECKODRIVER=/path/to/geckodriver \
  NODERED_URL=http://localhost:1880/ npm run verify:all
```

More documentation:

- [Examples](examples/README.md)
- [Resource profile](docs/resource-profile.md)
- [Full editor design](docs/p4-standalone-editor.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party notices are in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
