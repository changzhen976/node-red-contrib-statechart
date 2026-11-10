# Security policy

## Supported versions

The latest published `0.1.x` release receives fixes. Older versions are not
maintained.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
private reporting instead:

<https://github.com/changzhen976/node-red-contrib-statechart/security/advisories/new>

If that is unavailable, open an issue that only asks for a private channel and
contains no details.

Please include the affected version, the Node-RED and Node.js versions, and a
reproduction when possible. Expect an initial response within a week.

## Threat model

The nodes run inside the user's Node-RED instance, so they inherit its trust
boundary. What the package itself does:

- The monitor page, the standalone editor and their APIs are served from
  Node-RED's admin HTTP server (`RED.httpAdmin`) and are not part of the
  runtime endpoints.
- Those routes are gated by a per-process capability token that the editor
  fetches over the authenticated admin session. Static assets are public; the
  monitor page, editor entry and APIs require the token.
- With `adminAuth` enabled, the token endpoint requires `flows.read`. Without
  `adminAuth`, Node-RED's admin API is unauthenticated, so the token adds no
  isolation: bind the instance to a trusted network and do not expose it
  directly to the internet.

Two consequences worth stating explicitly:

- A capability token is not an authorisation system. Anyone who can read the
  token can view machines and open the editor.
- The runtime executes state machine actions defined in flows, which is
  equivalent to trusting whoever can deploy flows in your Node-RED instance.
