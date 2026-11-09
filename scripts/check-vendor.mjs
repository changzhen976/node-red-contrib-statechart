/** Verify vendored core matches the donor (ignoring the one-line header). */
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const donorRoot = resolve(root, '..', 'scxml-creator')
const vendor = resolve(root, 'src/vendor/scxml-core')
const files = ['model.ts', 'serializer.ts', 'action-parse.ts', 'validator.ts', 'naming.ts', 'scxml-import.ts']

let failed = false
for (const file of files) {
  const ours = await readFile(resolve(vendor, file), 'utf8')
  const theirs = await readFile(resolve(donorRoot, 'src/core', file), 'utf8')
  const stripped = ours.split('\n').slice(1).join('\n')
  if (stripped !== theirs) {
    console.error(`vendor drift: ${file}`)
    failed = true
  }
}
const commit = execFileSync('git', ['-C', donorRoot, 'log', '-1', '--format=%h', '--', 'src/core'], { encoding: 'utf8' }).trim()
console.log(failed ? 'vendor check failed' : `vendor matches donor core @ ${commit}`)
process.exit(failed ? 1 : 0)
