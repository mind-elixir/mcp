#!/usr/bin/env node
/**
 * Pack the MCPB bundle for Smithery / Claude Desktop distribution.
 *
 * Stages a clean directory (manifest.json with version/name synced from
 * package.json, the single-file dist/index.js, icon.png), then runs
 * `mcpb pack`, producing mind-elixir-mcp.mcpb at the repo root.
 *
 * Usage:  pnpm pack:mcpb   (or: node scripts/pack-mcpb.mjs)
 * Prereq: pnpm build (dist/index.js must exist) and Node >= 18
 */
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stage = join(root, '.mcpb-stage')

const dist = join(root, 'dist', 'index.js')
if (!existsSync(dist)) {
  console.error('dist/index.js missing — run `pnpm build` first')
  process.exit(1)
}

// Version/name must match package.json; mcpb/manifest.json is the template.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8'))
manifest.version = pkg.version
manifest.name = pkg.name.replace(/^@mind-elixir\//, '')

// Stage (idempotent — files are overwritten on every run)
mkdirSync(join(stage, 'dist'), { recursive: true })
writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
cpSync(dist, join(stage, 'dist', 'index.js'))
cpSync(join(root, 'app-icon.png'), join(stage, 'icon.png'))

// Pack
const outFile = join(root, 'mind-elixir-mcp.mcpb')
execSync(`npx -y @anthropic-ai/mcpb pack "${stage}" "${outFile}"`, {
  cwd: root,
  stdio: 'inherit',
})

console.log(`\nPacked: ${outFile}`)
console.log('Submit at https://smithery.ai/new (Local tab), or:')
console.log(`npx -y @smithery/cli mcp publish "${outFile}" -n mind-elixir/mcp`)
