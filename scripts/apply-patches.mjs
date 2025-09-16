#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const patchesDir = join(__dirname, '..', '.codex', 'patches')

let patchFiles = []

try {
  patchFiles = readdirSync(patchesDir)
    .map((name) => ({ name, path: join(patchesDir, name) }))
    .filter((entry) => entry.name.endsWith('.patch') && statSync(entry.path).isFile())
    .sort((a, b) => a.name.localeCompare(b.name))
} catch (error) {
  console.error(`Unable to read patches directory: ${error.message}`)
  process.exit(1)
}

if (patchFiles.length === 0) {
  console.log(`No patch files found in ${patchesDir}`)
  process.exit(0)
}

const shouldApply = process.argv.includes('--apply')

for (const patch of patchFiles) {
  console.log(`${shouldApply ? 'Applying' : 'Checking'} ${patch.name}...`)
  const args = ['apply']
  if (!shouldApply) {
    args.push('--check')
  }
  args.push(patch.path)

  const result = spawnSync('git', args, { stdio: 'inherit' })

  if (result.status !== 0) {
    const mode = shouldApply ? 'apply' : 'check'
    console.error(`git ${mode} failed for ${patch.name}`)
    process.exit(result.status ?? 1)
  }
}

if (shouldApply) {
  console.log('All patches applied successfully.')
} else {
  console.log('Dry-run complete. Re-run with --apply to write changes.')
}
