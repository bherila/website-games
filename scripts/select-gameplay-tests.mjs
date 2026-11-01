#!/usr/bin/env node
/** Conservative PR selection: unrecognised changes always run the full suite. */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Audited UI modules have no consumers outside their game. Do not replace this
// with folder globs: gameProgress/gameTypes/levels are imported by shared code.
export const GAMEPLAY_GAMES = [
  { game: '2048', ui: ['Game2048.tsx'], specs: ['2048.journey.spec.ts'] },
  { game: 'block-blaster', ui: ['BlockBlasterGame.tsx', 'BlockBlasterScene.tsx'], specs: ['block-blaster.spec.ts'] },
  { game: 'cars', ui: ['CarsGame.tsx', 'CarsScene.tsx'], specs: ['parking-pickup.spec.ts'] },
  { game: 'chicks-challenge', ui: ['ChicksGame.tsx', 'ChicksScene.tsx'], specs: ['chicks-challenge.spec.ts'] },
  { game: 'hover', ui: ['HoverGame.tsx', 'HoverScene.tsx'], specs: ['hover.spec.ts'] },
  { game: 'marble-sort', ui: ['MarbleSortGame.tsx', 'MarbleSortScene.tsx'], specs: ['marble-sort.spec.ts'] },
  { game: 'marble-works', ui: ['MarbleWorksGame.tsx', 'MarbleWorksScene.tsx'], specs: ['marble-works.spec.ts'] },
  { game: 'plate-escape', ui: ['PlateEscapeGame.tsx', 'PlateEscapeScene.tsx'], specs: ['plate-escape.spec.ts', 'plate-escape-harbor.spec.ts', 'plate-escape-railway.spec.ts', 'plate-escape-clockworks.spec.ts', 'plate-escape-fair.spec.ts'] },
  { game: 'math-horde', ui: ['MathHordeGame.tsx', 'MathHordeScene.tsx'], specs: ['math-horde.spec.ts'] },
  { game: 'tower-2', ui: ['Tower2Game.tsx', 'Tower2Scene.tsx'], specs: ['tower-2.spec.ts'] },
  {
    game: 'tower-throwback',
    ui: ['TowerGame.tsx', 'TowerScene.tsx', 'useTowerKeyboardShortcuts.ts'],
    specs: ['tower-throwback.visual.spec.ts', 'tower-throwback.drawcalls.spec.ts', 'tower-throwback.journey.spec.ts'],
  },
]

export const GAMEPLAY_PROJECTS = ['chromium-desktop', 'chromium-mobile-375']

// Shards are packed from measured per-test seconds (tests/e2e/gameplay-durations.json,
// refreshed by scripts/update-gameplay-durations.mjs) rather than whole files: one
// Plate Escape arc is a single 5–7 minute test, so file units left groups at 18–21
// minutes. Each shard aims for TARGET_SHARD_SECONDS, capped so a full run leaves
// room in the account's concurrent-job limit. A test missing from the measurements
// is budgeted at its file's median, or UNKNOWN_TEST_SECONDS for a new file.
export const TARGET_SHARD_SECONDS = 480
export const MAX_SHARDS = 8
export const UNKNOWN_TEST_SECONDS = 120
export const DURATIONS_FILE = 'tests/e2e/gameplay-durations.json'

const gamesByPath = new Map(GAMEPLAY_GAMES.flatMap((entry) => [
  ...entry.ui.map((file) => `resources/js/games/${entry.game}/${file}`),
  `resources/js/games/${entry.game}/index.tsx`,
  `resources/views/games/${entry.game}.blade.php`,
  ...entry.specs.map((file) => `tests/e2e/${file}`),
].map((file) => [file, entry])))

const ALL_SPECS = GAMEPLAY_GAMES.flatMap((entry) => entry.specs)

/** Prose that no page, build or spec reads; Markdown under resources/ or public/ could be bundled. */
export function isInertPath(file) {
  return file.startsWith('docs/') || (file.endsWith('.md') && !/^(?:resources|public)\//.test(file))
}

/** Parse git --name-status -z without treating whitespace in filenames as syntax. */
export function parseChangedFiles(output) {
  if (output === '') return []
  if (!output.endsWith('\0')) throw new Error('Incomplete Git change list.')
  const fields = output.slice(0, -1).split('\0')
  const changes = []
  for (let index = 0; index < fields.length;) {
    const status = fields[index++]
    if (!/^(?:[AMDTUXB]|[RC]\d{1,3})$/.test(status)) throw new Error('Invalid Git change status.')
    const count = /^[RC]/.test(status) ? 2 : 1
    const paths = fields.slice(index, index + count)
    if (paths.length !== count || paths.some((file) => !file)) throw new Error('Missing Git change path.')
    changes.push({ status, paths })
    index += count
  }
  return changes
}

export function selectGameplayTests(eventName, changes) {
  if (typeof eventName !== 'string' || !eventName || /[^a-z_]/.test(eventName)) throw new Error('Missing or invalid workflow event.')
  const full = { mode: 'full', specs: ALL_SPECS }
  if (eventName !== 'pull_request' || changes.length === 0) return full
  const selected = new Set()
  let inert = 0
  for (const { status, paths } of changes) {
    // Deletions, renames, type changes and conflicts need the full suite, even
    // when their paths were previously eligible for a focused check.
    if (!['A', 'M'].includes(status) || paths.length !== 1) return full
    if (isInertPath(paths[0])) {
      inert++
      continue
    }
    const entry = gamesByPath.get(paths[0])
    if (!entry) return full
    selected.add(entry)
  }
  if (inert === changes.length) return { mode: 'none', specs: [] }
  // A change reaching several games is treated as shared code.
  if (selected.size !== 1) return full
  return { mode: 'selected', specs: [...selected][0].specs }
}

/** The test-list line Playwright's --test-list accepts, also the durations key. */
export const testKey = (project, file, titlePath) => [`[${project}]`, file, ...titlePath].join(' › ')

/** Flatten a Playwright JSON report (from --list or a run) into one entry per project test. */
export function collectTests(report) {
  const tests = []
  const walk = (suite, file, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const run of spec.tests) {
        tests.push({ key: testKey(run.projectName, file, [...titles, spec.title]), file, results: run.results ?? [] })
      }
    }
    for (const child of suite.suites ?? []) walk(child, file, [...titles, child.title])
  }
  for (const suite of report.suites ?? []) walk(suite, suite.file, [])
  return tests
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}

/** Longest-first greedy packing of every test into exactly one shard. */
export function planShards(tests, durations, { target = TARGET_SHARD_SECONDS, max = MAX_SHARDS } = {}) {
  if (tests.length === 0) throw new Error('No gameplay tests to schedule.')
  if (new Set(tests.map((test) => test.key)).size !== tests.length) throw new Error('Duplicate gameplay test.')
  const knownByFile = new Map()
  for (const { key, file } of tests) {
    if (Number.isFinite(durations[key])) knownByFile.set(file, [...knownByFile.get(file) ?? [], durations[key]])
  }
  const estimated = tests.map(({ key, file }) => ({
    key,
    seconds: durations[key] ?? (knownByFile.has(file) ? median(knownByFile.get(file)) : UNKNOWN_TEST_SECONDS),
    known: key in durations,
  })).sort((a, b) => b.seconds - a.seconds || (a.key < b.key ? -1 : 1))
  const total = estimated.reduce((sum, test) => sum + test.seconds, 0)
  const count = Math.max(1, Math.min(max, tests.length, Math.ceil(total / target)))
  const shards = Array.from({ length: count }, (_, index) => ({ shard: index + 1, seconds: 0, keys: [] }))
  for (const test of estimated) {
    const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best))
    lightest.seconds += test.seconds
    lightest.keys.push(test.key)
  }
  return {
    shards: count,
    unknown: estimated.filter((test) => !test.known).map((test) => test.key),
    estimates: shards.map((shard) => Math.round(shard.seconds)),
    matrix: { include: shards.map((shard) => ({ shard: shard.shard, tests: shard.keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('\n') })) },
  }
}

/** Every test the gameplay package script would run, as Playwright itself discovers them. */
export function listGameplayTests(run = execFileSync) {
  const output = run('pnpm', ['--silent', 'run', 'test:e2e:gameplay', '--list', '--reporter=json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  })
  return collectTests(JSON.parse(output))
}

export function readDurations(file = DURATIONS_FILE) {
  const durations = JSON.parse(readFileSync(file, 'utf8'))
  for (const [key, seconds] of Object.entries(durations)) {
    if (!(typeof seconds === 'number' && seconds > 0)) throw new Error(`Invalid duration for ${key}.`)
  }
  return durations
}

export function readChangedFiles(base, head, runGit = execFileSync) {
  if (![base, head].every((sha) => typeof sha === 'string' && [40, 64].includes(sha.length) && !/[^a-f0-9]/.test(sha))) {
    throw new Error('PR base and head must be full commit hashes.')
  }
  // Three-dot compares the actual PR head with its merge base, including fork
  // PRs. No rename detection means a move is a deletion plus an addition.
  const output = runGit('git', ['diff', '--name-status', '-z', '--no-renames', `${base}...${head}`, '--'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  return parseChangedFiles(output)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const eventName = process.env.GAMEPLAY_EVENT
    const changes = eventName === 'pull_request'
      ? readChangedFiles(process.env.GAMEPLAY_BASE_SHA, process.env.GAMEPLAY_HEAD_SHA)
      : []
    const selection = selectGameplayTests(eventName, changes)
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.')
    // A skipped matrix job never expands its matrix, but the output must still parse.
    let outputs = { mode: 'none', shards: '0', matrix: { include: [{ shard: 0, tests: '' }] } }
    if (selection.mode !== 'none') {
      const specs = new Set(selection.specs)
      const plan = planShards(listGameplayTests().filter((test) => specs.has(test.file)), readDurations())
      outputs = { mode: selection.mode, shards: String(plan.shards), matrix: plan.matrix }
      console.log(`Estimated seconds per shard: ${plan.estimates.join(', ')}.`)
      if (plan.unknown.length) {
        console.log(`::warning::${plan.unknown.length} gameplay test(s) have no measured duration; refresh ${DURATIONS_FILE}.`)
      }
    }
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs)
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}\n`).join(''))
    console.log(`Gameplay selection: ${outputs.mode}; ${outputs.shards} shard(s).`)
  } catch {
    // Git, discovery or measurement failures must block the aggregate gate; never silently omit checks.
    console.error('::error::Unable to determine gameplay checks safely.')
    process.exitCode = 1
  }
}
