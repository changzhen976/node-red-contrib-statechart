/**
 * 最小 Node-RED 5 冒烟节点（CJS 入口 + 动态 import ESM 依赖）。
 * 目的：验证 Node-RED 运行时能加载 CJS 节点，并在节点内 import 纯 ESM 引擎。
 */
module.exports = function (RED) {
  function ScxmlSpikeNode(config) {
    RED.nodes.createNode(this, config)
    const node = this
    let session = null
    let initPromise = null

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <datamodel><data id="ticks" expr="0"/></datamodel>
  <state id="idle">
    <onentry><script><![CDATA[ticks = ticks + 1;]]></script></onentry>
    <transition event="start" target="running"/>
  </state>
  <state id="running">
    <transition event="stop" target="idle"/>
  </state>
</scxml>`

    node.status({ fill: 'grey', shape: 'ring', text: 'loading' })

    async function ensureSession() {
      const { createSession } = await import('@tinyactors/scxmljs')
      const { DOMParser } = await import('@xmldom/xmldom')
      const domParser = new DOMParser()
      session = await createSession(xml, { domParser })
      session.addEventListener('macrostep', () => {
        node.send({ payload: session.activeStateIds(), topic: 'state', vars: session.snapshot() })
      })
      session.addEventListener('error', (e) => {
        node.error(new Error(`${e.kind}: ${e.message}`))
      })
      session.start()
      node.status({ fill: 'green', shape: 'dot', text: 'ready' })
      return session
    }

    if (config.autoStart) {
      setImmediate(() => {
        initPromise ||= ensureSession()
        initPromise.catch((err) => node.error(err))
      })
    }

    node.on('input', async (msg) => {
      initPromise ||= ensureSession()
      try {
        await initPromise
        session.send(msg.topic || 'start', msg.payload)
      } catch (err) {
        node.error(err, msg)
      }
    })

    node.on('close', function (removed, done) {
      console.log('[spike] close called, removed=', removed)
      try {
        session?.dispose()
        session = null
        initPromise = null
      } finally {
        done()
      }
    })
  }
  RED.nodes.registerType('scxml-spike', ScxmlSpikeNode)

  function SinkNode(config) {
    RED.nodes.createNode(this, config)
    this.on('input', (msg) => {
      globalThis.__sinkMsgs ||= []
      globalThis.__sinkMsgs.push({ topic: msg.topic, payload: msg.payload, vars: msg.vars })
    })
  }
  RED.nodes.registerType('scxml-sink', SinkNode)
}
