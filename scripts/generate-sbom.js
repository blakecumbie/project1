#!/usr/bin/env node
/**
 * Emit a CycloneDX 1.5 SBOM for every dependency that ships in the build.
 *
 * Output: dist/sbom.json (created if `dist/` does not exist).
 *
 * Run:  npm run sbom
 *
 * The SBOM should be archived alongside every release artifact and uploaded
 * to the corporate vulnerability-management system.
 */

const { spawnSync } = require('node:child_process')
const { mkdirSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const OUT_DIR = join(ROOT, 'dist')
const OUT_FILE = join(OUT_DIR, 'sbom.json')

function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  console.log(`[sbom] generating CycloneDX SBOM at ${OUT_FILE}`)
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      '@cyclonedx/cyclonedx-npm@^1.19',
      '--output-format', 'JSON',
      '--output-file', OUT_FILE,
      // Production tree only — the SBOM should not reference dev tooling
      // because they don't ship in the installer.
      '--omit', 'dev',
      '--spec-version', '1.5'
    ],
    { stdio: 'inherit', cwd: ROOT, env: process.env }
  )

  if (result.status !== 0) {
    console.error('[sbom] cyclonedx-npm failed')
    process.exit(result.status ?? 1)
  }
  console.log('[sbom] done')
}

main()
