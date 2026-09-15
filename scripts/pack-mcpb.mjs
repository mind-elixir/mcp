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
import { cpSync, mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
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

// Pack.
// Smithery's stdio-release validation requires tools[].inputSchema, but the
// strict @anthropic-ai/mcpb packer rejects that key ("Unrecognized key(s)").
// The MCPB format itself is just a zip with manifest.json at the root, so we
// zip the staged directory directly. (@anthropic-ai/mcpb validate will flag
// the extra key — expected, see PUBLISHING.md.)
const outFile = join(root, 'mind-elixir-mcp.mcpb')
rmSync(outFile, { force: true })
execSync(`zip -qr "${outFile}" .`, { cwd: stage, stdio: 'inherit' })

console.log(`\nPacked: ${outFile}`)
console.log('Submit at https://smithery.ai/new (Local tab), or:')
console.log(`npx -y @smithery/cli mcp publish "${outFile}" -n mind-elixir/mcp`)
