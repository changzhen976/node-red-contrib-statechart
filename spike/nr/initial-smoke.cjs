const helper = require('node-red-node-test-helper')
const nodeModule = require('./scxml-spike.js')
helper.init(require.resolve('node-red'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  await new Promise((res, rej) => helper.startServer((e) => (e ? rej(e) : res())))
  globalThis.__sinkMsgs = []
  const flow = [
    { id: 'n1', type: 'scxml-spike', name: 'spike', autoStart: true, wires: [['n2']] },
    { id: 'n2', type: 'scxml-sink' },
  ]
  await new Promise((res, rej) => helper.load(nodeModule, flow, (e) => (e ? rej(e) : res())))
  await sleep(400)
  console.log('INITIAL_MSGS=', JSON.stringify(globalThis.__sinkMsgs))
  await helper.unload()
  await new Promise((res) => helper.stopServer(res))
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
