/**
 * Local compatibility patches applied to vendored donor files.
 * Keep this in one place so sync/check stay reproducible.
 */
export function patchVendoredFile(file, content) {
  if (file !== 'validator.ts') return content
  return content
    .replace("import { parseSCXML, compile } from '@tinyactors/scxmljs/trusted'\n", '')
    .replace(
      '    const parsed = parseSCXML(source, domParser)\n    await compile(parsed)',
      '    // Node 22.9 cannot require() this ESM entry from CJS; load it lazily.\n' +
        "    const { parseSCXML, compile } = await import('@tinyactors/scxmljs/trusted')\n" +
        '    const parsed = parseSCXML(source, domParser)\n' +
        '    await compile(parsed)',
    )
}
