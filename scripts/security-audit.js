#!/usr/bin/env node
/**
 * Strict CVE gate. Fails the build if any HIGH or CRITICAL advisory is
 * present in production dependencies.
 *
 * Wire into CI like:
 *
 *   - run: npm ci
 *   - run: npm run security:full
 *
 * Exit codes:
 *   0 — clean
 *   1 — CVE found
 *   2 — npm audit could not be parsed (treat as failure)
 */

const { spawnSync } = require('node:child_process')

function main() {
  console.log('[audit] running `npm audit --omit=dev --audit-level=high --json`')

  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--omit=dev', '--audit-level=high', '--json'],
    { encoding: 'utf-8' }
  )

  // npm audit exits non-zero when vulnerabilities are found. We don't trust
  // the exit code alone — we parse and re-decide.
  let report
  try {
    report = JSON.parse(result.stdout || '{}')
  } catch (err) {
    console.error('[audit] could not parse npm audit JSON output')
    console.error(result.stdout)
    console.error(result.stderr)
    process.exit(2)
  }

  const meta = report.metadata?.vulnerabilities ?? {}
  const high = Number(meta.high ?? 0)
  const critical = Number(meta.critical ?? 0)
  const moderate = Number(meta.moderate ?? 0)
  const low = Number(meta.low ?? 0)
  const info = Number(meta.info ?? 0)

  const summary = `low=${low} info=${info} moderate=${moderate} high=${high} critical=${critical}`
  console.log(`[audit] vulnerability summary: ${summary}`)

  if (critical > 0 || high > 0) {
    console.error('[audit] FAILED: high or critical CVE present in production dependencies')
    if (report.vulnerabilities) {
      const offenders = Object.entries(report.vulnerabilities)
        .filter(([, v]) => v?.severity === 'high' || v?.severity === 'critical')
        .map(([name, v]) => `  - ${name} (${v.severity})`)
        .join('\n')
      if (offenders) console.error(offenders)
    }
    process.exit(1)
  }

  console.log('[audit] OK — no high or critical CVEs')
  process.exit(0)
}

main()
