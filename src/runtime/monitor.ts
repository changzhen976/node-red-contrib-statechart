import fs from 'node:fs'
import path from 'node:path'
import { getMachine, listMachines } from '../nodes/machine'

interface MonitorMachine {
  id: string
  name: string
  source: string
  graphVersion: string
  monitorShowVars: boolean
  isRunning(): boolean
  getCurrentState(): {
    states: string[]
    vars: Record<string, unknown>
    changed: boolean
    ts: number
  } | null
}

function normalizeAdminRoot(value: unknown): string {
  const root = typeof value === 'string' && value ? value : '/'
  return root.endsWith('/') ? root : `${root}/`
}

/**
 * Read-only monitor routes. They are intentionally not behind
 * RED.auth.needsPermission: the page is meant to load in an editor iframe,
 * which does not carry the editor's bearer token. Bind Node-RED to a private
 * tailnet interface and treat this as a trusted-network view.
 */
export function registerMonitor(RED: any): void {
  if (!RED.httpAdmin || RED.__scxmlMonitorRegistered) return
  RED.__scxmlMonitorRegistered = true

  const monitorDir = path.join(__dirname, 'monitor')
  const assetBase = `${normalizeAdminRoot(RED.settings?.httpAdminRoot)}scxmljs/assets/`
  const htmlPath = path.join(monitorDir, 'index.html')

  const sendHtml = (_req: any, res: any): void => {
    try {
      // Read per request so rebuilding the package's monitor page does not
      // require a Node-RED restart.
      const html = fs.readFileSync(htmlPath, 'utf8').replaceAll('__ASSET_BASE__', assetBase)
      res.set('Cache-Control', 'no-store')
      res.type('text/html').send(html)
    } catch (err) {
      RED.log?.warn?.(`[scxml] monitor page is unavailable: ${err instanceof Error ? err.message : String(err)}`)
      res.status(503).type('text/plain').send('SCXML monitor assets are not built')
    }
  }

  RED.httpAdmin.get('/scxmljs/monitor', sendHtml)
  RED.httpAdmin.get('/scxmljs/monitor/', sendHtml)

  RED.httpAdmin.get('/scxmljs/api/machines', (_req: any, res: any) => {
    const machines = listMachines().map((machine: MonitorMachine) => {
      const state = machine.getCurrentState()
      return {
        id: machine.id,
        name: machine.name,
        running: machine.isRunning(),
        states: state?.states ?? [],
        ts: state?.ts ?? Date.now(),
      }
    })
    res.set('Cache-Control', 'no-store')
    res.json(machines)
  })

  RED.httpAdmin.get('/scxmljs/api/machines/:id', (req: any, res: any) => {
    const machine = getMachine(req.params.id) as MonitorMachine | undefined
    if (!machine) {
      res.status(404).json({ error: 'machine not found' })
      return
    }
    const state = machine.getCurrentState()
    const body: Record<string, unknown> = {
      id: machine.id,
      name: machine.name,
      running: machine.isRunning(),
      states: state?.states ?? [],
      changed: state?.changed ?? false,
      ts: state?.ts ?? Date.now(),
      version: machine.graphVersion,
    }
    if (machine.monitorShowVars) body.vars = state?.vars ?? {}
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  RED.httpAdmin.get('/scxmljs/api/machines/:id/graph', (req: any, res: any) => {
    const machine = getMachine(req.params.id) as MonitorMachine | undefined
    if (!machine) {
      res.status(404).json({ error: 'machine not found' })
      return
    }
    res.set('Cache-Control', 'no-store')
    res.set('X-SCXML-Version', machine.graphVersion)
    res.type('application/xml').send(machine.source)
  })

  RED.httpAdmin.get('/scxmljs/assets/*', (req: any, res: any) => {
    const relative = String(req.params[0] ?? '')
    const file = path.resolve(monitorDir, relative)
    if (!file.startsWith(`${monitorDir}${path.sep}`)) {
      res.status(404).end()
      return
    }
    res.sendFile(file, (err: Error) => {
      if (err && !res.headersSent) res.status(404).end()
    })
  })
}
