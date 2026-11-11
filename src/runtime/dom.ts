import type { DOMParserLike } from '@tinyactors/scxmljs/trusted'

let domParserPromise: Promise<DOMParserLike> | null = null

/** happy-dom is deliberately not used: xmldom is smaller and supports CDATA. */
export function getDomParser(): Promise<DOMParserLike> {
  domParserPromise ??= (async () => {
    const { DOMParser } = await import('@xmldom/xmldom')
    const parser = new DOMParser({
      onError(level: string, message: string) {
        if (level !== 'warning') throw new Error(message)
      },
    })
    return parser as unknown as DOMParserLike
  })()
  return domParserPromise
}
