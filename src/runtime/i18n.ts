/** Node-RED runtime message helper (server language, not editor-language). */
const NS = 'node-red-contrib-scxmljs/scxml'

export function runtimeT(RED: any, key: string, params?: Record<string, unknown>): string {
  try {
    const value = RED?._?.(`${NS}:${key}`, params)
    return typeof value === 'string' && value !== `${NS}:${key}` ? value : key
  } catch {
    return key
  }
}

/** Status text is a key; the Node-RED editor translates it with node._(). */
export function runtimeStatus(key: string): string {
  return `status.${key}`
}
