/** Node-RED 5 集成冒烟：test-helper 加载 CJS 节点，驱动状态机。 */
const helper = require('node-red-node-test-helper')
const nodeModule = require('./scxml-spike.js')

helper.init(require.resolve('node-red'))

const startServer = () =>
  new Promise((resolve, reject) =>
    helper.startServer((err) => (err ? reject(err) : resolve())),
  )
const stopServer = () => new Promise((resolve) => helper.stopServer(resolve))
const load = (flow) =>
  new Promise((resolve, reject) =>
    helper.load(nodeModule, flow, (err) => (err ? reject(err) : resolve())),
  )
const unload = () => helper.unload()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const flow = [
    { id: 'n1', type: 'scxml-spike', name: 'spike', wires: [['n2']] },
    { id: 'n2', type: 'helper' },
  ]
  const t = () => process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length
  console.log('T0=', t())
  const seen = []
  const errors = []
  await startServer()
  console.log('T_after_server=', t())
  await load(flow)
  console.log('T_after_load=', t())
  const n2 = helper.getNode('n2')
  const n1 = helper.getNode('n1')
  n2.on('input', (msg) => seen.push(msg))
  n1.on('call:error', (e) => errors.push(e))

  n1.receive({ topic: 'start', payload: { from: 'nr' } })
  for (let i = 0; i < 100 && !seen.some((m) => Array.isArray(m.payload) && m.payload.includes('running')); i++) {
    await sleep(20)
  }
  n1.receive({ topic: 'stop' })
  for (let i = 0; i < 100 && !seen.some((m) => Array.isArray(m.payload) && m.payload.includes('idle') && seen.indexOf(m) > 0); i++) {
    await sleep(20)
  }
  console.log('SEEN=', JSON.stringify(seen.map((m) => ({ topic: m.topic, payload: m.payload }))))
  console.log('ERRORS=', errors.length)
  await unload()
  await sleep(50)
  console.log('T_after_unload=', t())
  console.log('TIMEOUTS_AFTER_UNLOAD=', process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length)
  await stopServer()
  await sleep(50)
  console.log('T_after_stop=', t())
  process.exit(seen.some((m) => m.payload?.includes?.('running')) && errors.length === 0 ? 0 : 1)
})().catch((err) => {
  console.error('SMOKE FAILED', err)
  process.exit(1)
})
