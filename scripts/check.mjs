import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

async function walk(root) {
  const out = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(path)
  }
  return out
}

const files = [...await walk('src'), ...await walk('tests'), ...await walk('scripts')]
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`syntax checked ${files.length} files`)
