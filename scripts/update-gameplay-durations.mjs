#!/usr/bin/env node
/**
 * Refresh tests/e2e/gameplay-durations.json from CI's Playwright JSON results, so the
 * gameplay selector keeps balancing shards by measured time:
 *
 *   gh run download <run-id> --pattern 'gameplay-playwright-report-*' --dir /tmp/gameplay
 *   node scripts/update-gameplay-durations.mjs /tmp/gameplay
 *
 * Measured tests take their final attempt's duration; tests the reports did not run keep
 * their previous value, and tests the gameplay script no longer lists are dropped.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectTests, DURATIONS_FILE, listGameplayTests, readDurations } from './select-gameplay-tests.mjs'

export const RESULTS_FILE = 'playwright-results.json'

function findResults(target) {
  if (!statSync(target).isDirectory()) return [target]
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name)
    if (entry.isDirectory()) return findResults(child)
    return entry.name === RESULTS_FILE ? [child] : []
  })
}

export function measure(reports) {
  const measured = {}
  for (const report of reports) {
    for (const { key, results } of collectTests(report)) {
      const last = results.at(-1)
      if (last && ['passed', 'failed', 'timedOut', 'skipped'].includes(last.status)) measured[key] = Math.max(1, Math.round(last.duration / 1000))
    }
  }
  return measured
}

export function mergeDurations(previous, measured, listed) {
  return Object.fromEntries([...listed].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).flatMap((key) => {
    const seconds = measured[key] ?? previous[key]
    return seconds === undefined ? [] : [[key, seconds]]
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).flatMap(findResults)
  if (files.length === 0) {
    console.error(`No ${RESULTS_FILE} found; pass the downloaded gameplay report directories.`)
    process.exit(1)
  }
  const measured = measure(files.map((file) => JSON.parse(readFileSync(file, 'utf8'))))
  const listed = new Set(listGameplayTests().map((test) => test.key))
  const durations = mergeDurations(readDurations(), measured, listed)
  writeFileSync(DURATIONS_FILE, `${JSON.stringify(durations, null, 2)}\n`)
  const missing = [...listed].filter((key) => !(key in durations)).length
  console.log(`Measured ${Object.keys(measured).length} test(s) from ${files.length} report(s); ${missing} listed test(s) remain unmeasured.`)
}
