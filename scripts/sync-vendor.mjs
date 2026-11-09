/**
 * Copy the pure core of ../scxml-creator into src/vendor/scxml-core.
 * The donor is an application, not a library; vendoring keeps our published
 * package free of a sibling-checkout dependency.
 *
 * Usage: npm run sync:vendor
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { patchVendoredFile } from './vendor-patch.mjs'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const donorRoot = resolve(root, '..', 'scxml-creator')
const donorCore = resolve(donorRoot, 'src/core')
const target = resolve(root, 'src/vendor/scxml-core')

const files = [
  'model.ts',
  'serializer.ts',
  'action-parse.ts',
  'validator.ts',
  'naming.ts',
  'scxml-import.ts',
]

const commit = execFileSync('git', ['-C', donorRoot, 'log', '-1', '--format=%h', '--', 'src/core'], {
  encoding: 'utf8',
}).trim()
const date = execFileSync('git', ['-C', donorRoot, 'log', '-1', '--format=%ad', '--date=short', '--', 'src/core'], {
  encoding: 'utf8',
}).trim()

await mkdir(target, { recursive: true })
for (const file of files) {
  const source = patchVendoredFile(file, await readFile(resolve(donorCore, file), 'utf8'))
  const header = `// vendored from scxml-creator@${commit} (${date}); do not edit\n`
  await writeFile(resolve(target, file), header + source)
  console.log(`sync ${file}`)
}

await writeFile(
  resolve(target, 'UPSTREAM.md'),
  `# Vendor upstream\n\n` +
    `- Source: \`../scxml-creator/src/core\`\n` +
    `- Commit: \`${commit}\` (${date})\n` +
    `- License: MIT (donor LICENSE; see ../scxml-creator/LICENSE)\n` +
    `- Synced by: \`npm run sync:vendor\`\n\n` +
    `Files: ${files.map((f) => `\`${f}\``).join(', ')}.\n\n` +
    `Do not edit these files by hand. Update the donor and re-run the sync script.\n` +
    `Local patch: validator.ts uses dynamic import so Node 22.9 CJS does not require() an ESM entry.\n`,
)
console.log(`vendor synced at ${commit}`)
