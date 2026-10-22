#!/usr/bin/env node
/** Conservative PR selection: unrecognised changes always run the full suite. */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
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
  { game: 'math-horde', ui: ['MathHordeGame.tsx', 'MathHordeScene.tsx'], specs: ['math-horde.spec.ts'] },
  {
    game: 'tower-throwback',
    ui: ['TowerGame.tsx', 'TowerScene.tsx', 'useTowerKeyboardShortcuts.ts'],
    specs: ['tower-throwback.visual.spec.ts', 'tower-throwback.drawcalls.spec.ts', 'tower-throwback.journey.spec.ts'],
  },
]

const DESKTOP = 'chromium-desktop'
const MOBILE = 'chromium-mobile-375'
export const GAMEPLAY_PROJECTS = [DESKTOP, MOBILE]

// Measured on GitHub's ARM runners, then balanced by complete project/file
// units. The baseline estimates are 171, 173, 175 and 173 seconds; retain every
// unit, including the currently skipped mobile Tower journey. Shared by CI and
// weekly regression; update these assignments when measured durations drift.
export const FULL_GAMEPLAY_GROUPS = [
  [
    [DESKTOP, 'tower-throwback.visual.spec.ts'],
    [MOBILE, 'block-blaster.spec.ts'],
    [DESKTOP, 'math-horde.spec.ts'],
    [MOBILE, 'chicks-challenge.spec.ts'],
    [MOBILE, 'tower-throwback.journey.spec.ts'],
  ],
  [
    [MOBILE, 'tower-throwback.visual.spec.ts'],
    [DESKTOP, 'parking-pickup.spec.ts'],
    [DESKTOP, 'hover.spec.ts'],
    [MOBILE, 'marble-works.spec.ts'],
    [MOBILE, '2048.journey.spec.ts'],
  ],
  [
    [MOBILE, 'parking-pickup.spec.ts'],
    [MOBILE, 'marble-sort.spec.ts'],
    [DESKTOP, 'block-blaster.spec.ts'],
    [MOBILE, 'hover.spec.ts'],
    [DESKTOP, 'tower-throwback.drawcalls.spec.ts'],
    [DESKTOP, 'chicks-challenge.spec.ts'],
  ],
  [
    [DESKTOP, 'marble-sort.spec.ts'],
    [DESKTOP, 'tower-throwback.journey.spec.ts'],
    [MOBILE, 'math-horde.spec.ts'],
    [DESKTOP, 'marble-works.spec.ts'],
    [MOBILE, 'tower-throwback.drawcalls.spec.ts'],
    [DESKTOP, '2048.journey.spec.ts'],
  ],
]

const gamesByPath = new Map(GAMEPLAY_GAMES.flatMap((entry) => [
  ...entry.ui.map((file) => `resources/js/games/${entry.game}/${file}`),
  `resources/js/games/${entry.game}/index.tsx`,
  `resources/views/games/${entry.game}.blade.php`,
  ...entry.specs.map((file) => `tests/e2e/${file}`),
].map((file) => [file, entry])))

function fullSelection() {
  const include = FULL_GAMEPLAY_GROUPS.map((units, index) => ({
    shard: index + 1,
    grep: `^(?:${units.map(([project, spec]) => `${project}\\s+${spec.replaceAll('.', '\\.')}`).join('|')})(?:\\s|$)`,
  }))
  return { mode: 'full', matrix: { include }, shards: include.length, grep: '' }
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
  if (eventName !== 'pull_request' || changes.length === 0) return fullSelection()
  const selected = new Set()
  for (const { status, paths } of changes) {
    // Deletions, renames, type changes and conflicts need the full suite, even
    // when their paths were previously eligible for a focused check.
    if (!['A', 'M'].includes(status) || paths.length !== 1) return fullSelection()
    const entry = gamesByPath.get(paths[0])
    if (!entry) return fullSelection()
    selected.add(entry)
  }
  // Broad PRs retain the measured parallel groups instead of serialising
  // multiple games on the focused runner.
  if (selected.size !== 1) return fullSelection()
  const specs = GAMEPLAY_GAMES.filter((entry) => selected.has(entry)).flatMap((entry) => entry.specs)
  // Playwright grep includes each test's filename. Positional file filters
  // would extend the package script's existing list instead of narrowing it.
  const grep = `(?:^|\\s)(?:${specs.map((file) => file.replaceAll('.', '\\.')).join('|')})(?:\\s|$)`
  return {
    mode: 'selected', matrix: { include: [{ shard: 1, grep }] }, shards: 1, grep,
  }
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
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(selection)
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}\n`).join(''))
    console.log(`Gameplay selection: ${selection.mode}; ${selection.shards} shard(s).`)
  } catch {
    // Git failures must block the aggregate gate; never silently omit checks.
    console.error('::error::Unable to determine gameplay checks safely.')
    process.exitCode = 1
  }
}
