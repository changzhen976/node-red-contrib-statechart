import { build } from 'esbuild'
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = resolve(root, 'dist')

// Clean previous hashed assets so npm pack does not include stale chunks.
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/nodes/index.ts')],
  outfile: resolve(dist, 'statechart.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  logLevel: 'info',
  external: ['@tinyactors/scxmljs', '@tinyactors/scxmljs/trusted', '@xmldom/xmldom'],
})

// Bundle the pure core for the Node-RED editor form. It is inlined below so
// the editor never needs a bare ESM import or a second HTTP route.
const editorCore = await build({
  entryPoints: [resolve(root, 'src/editor/core-bridge.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
})
const editorCoreJs = editorCore.outputFiles[0].text
const editorHtml = (await readFile(resolve(root, 'editor/statechart.html'), 'utf8'))
  .replace('<!-- SCXML_CORE_INLINE -->', `<script>${editorCoreJs}</script>`)
await writeFile(resolve(dist, 'statechart.html'), editorHtml)
await cp(resolve(root, 'editor/locales'), resolve(dist, 'locales'), { recursive: true })
await cp(resolve(root, 'assets/icons'), resolve(dist, 'icons'), { recursive: true })
// P4 standalone editor build (generated from ../scxml-creator).
await cp(resolve(root, 'editor-app'), resolve(dist, 'editor-app'), { recursive: true })
// The donor SPA still renders its own product name, documents its own service
// (globals registry, MQTT bridge, Fastify API) and uses that name as the prefix
// of its localStorage keys. Rewrite the copied build so the published editor
// describes this package, not another project.
const DONOR_REPLACEMENTS = [
  ['"brand-name"},"scxmljs-creator"', '"brand-name"},"State chart"'],
  ['scxmljs-creator:', 'statechart:'],
  // Variable panel help: this package has no globals registry and no MQTT bridge.
  ['Se("变量名以 ")', 'Se("")'],
  ['c("code",null,"gv_")', 'c("code",null,"")'],
  [
    'Se(" 开头时绑定全局变量；需在机器中声明才会生效。无前缀为本机变量，")',
    'Se("所有变量都是本机变量，名称只用于本机表达式引用。")',
  ],
  ['c("code",null,"mqv_")', 'c("code",null,"")'],
  ['Se(" 表示 MQTT 写入的本地变量。")', 'Se("")'],
  // Naming rules: this package has no globals registry, no MQTT bridge, no
  // server clock and no system events, so the donor prefix rules would reject
  // valid names. Drop those branches and keep the structural checks.
  ['Ei(t)?{level:"block",message:"sys. 为系统保留前缀（sys.changed.*），事件不可使用"}:', ''],
  ['Ei(t)?{level:"block",message:"sys. 为系统保留前缀，变量不可使用"}:', ''],
  ['_i(t)?{level:"block",message:"t_ 为时钟保留前缀（仅服务端注入），不可手动 send 或命名事件"}:', ''],
  ['_i(t)?{level:"block",message:"t_ 为时钟保留前缀，变量不可使用"}:', ''],
  ['Kn(t)?{level:"block",message:"g_ 前缀已废弃：全局事件请用 ge_，普通事件请去掉前缀"}:', ''],
  ['Kn(t)?{level:"block",message:"g_ 前缀已废弃：全局变量请用 gv_"}:', ''],
  ['t.startsWith($i)?{level:"block",message:"gv_ 为全局变量前缀，事件请用 ge_ 或无前缀"}:', ''],
  ['t.startsWith(pc)?{level:"block",message:"mqv_ 为 MQTT 本地变量前缀，事件请用 mqe_"}:', ''],
  ['t.startsWith(pc)?{level:"warn",message:"mqv_ 表示 MQTT 写入的本地变量，规则中必须绑定机器"}:', ''],
  ['t.startsWith(Si)||t.startsWith(hc)?{level:"block",message:"ge_/mqe_ 为事件前缀，变量请用 gv_ 或无前缀"}:', ''],
]

async function patchDonorBuild (dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      await patchDonorBuild(file)
      continue
    }
    if (!/\.(js|mjs|css|html|json)$/.test(entry.name)) continue
    const source = await readFile(file, 'utf8')
    let patched = source
    for (const [from, to] of DONOR_REPLACEMENTS) patched = patched.replaceAll(from, to)
    if (patched !== source) await writeFile(file, patched)
  }
}
await patchDonorBuild(resolve(dist, 'editor-app'))
// The donor SPA title still carries the old product name, and its Node-RED bar
// floats over the editor. Override both in dist without hand-editing the
// generated editor-app directory.
const editorAppIndexPath = resolve(dist, 'editor-app/index.html')
const editorAppIndex = await readFile(editorAppIndexPath, 'utf8')
const standaloneOverrideCss = `<style>
/* statechart: dock the Node-RED bar and reserve its height */
html, body { height: 100% !important; }
#app {
  height: calc(100vh - 44px) !important;
  height: calc(100dvh - 44px) !important;
}
#scxml-nodered-bar {
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  max-width: none !important;
  height: 44px;
  box-sizing: border-box;
  padding: 6px 12px !important;
  border-radius: 0 !important;
  border-width: 1px 0 0 !important;
  box-shadow: none !important;
  flex-wrap: nowrap;
  overflow: hidden;
}
#scxml-nodered-bar > span:first-of-type {
  flex: 1;
  min-width: 0;
  max-width: none !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 720px) {
  #scxml-nodered-bar strong { display: none !important; }
}
@media (prefers-color-scheme: dark) {
  #scxml-nodered-bar {
    background: #0f172a !important;
    color: #e2e8f0 !important;
    border-color: #334155 !important;
  }
}
/* The donor "exit edit" control navigates to a gallery that does not exist in
   Node-RED mode; the docked bar already provides "Close". */
.toolbar .exit-btn { display: none !important; }
</style>`
// The donor exposes a "service" view and an "API" playground for the Fastify
// service behind its own product. This package only has Node-RED admin routes,
// so both entry points are hidden in Node-RED mode.
const standaloneOverrideJs = `<script>
(function () {
  var hidden = { "API": 1, "\u670d\u52a1\u7ba1\u7406": 1 };
  function scrub () {
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var el = buttons[i];
      if (hidden[(el.textContent || "").trim()] && el.style.display !== "none") {
        el.style.display = "none";
      }
    }
  }
  function start () {
    scrub();
    new MutationObserver(scrub).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
</script>`
await writeFile(
  editorAppIndexPath,
  editorAppIndex
    .replace(/<title>.*?<\/title>/, '<title>State chart editor — Node-RED</title>')
    .replace('</head>', `${standaloneOverrideCss}</head>`)
    .replace('</body>', `${standaloneOverrideJs}</body>`),
)

// Browser bundle for the P2.5 read-only monitor page.
await build({
  entryPoints: { view: resolve(root, 'src/monitor/view-entry.ts') },
  outdir: resolve(dist, 'monitor'),
  entryNames: 'view',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
})

for (const file of ['index.html', 'monitor.js', 'monitor.css']) {
  await copyFile(resolve(root, 'monitor', file), resolve(dist, 'monitor', file))
}
