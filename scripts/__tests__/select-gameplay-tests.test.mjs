import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { collectTests, GAMEPLAY_GAMES, GAMEPLAY_PROJECTS, listGameplayTests, MAX_SHARDS, parseChangedFiles, planShards, readChangedFiles, readDurations, selectGameplayTests, testKey, UNKNOWN_TEST_SECONDS } from '../select-gameplay-tests.mjs'
import { measure, mergeDurations } from '../update-gameplay-durations.mjs'

const modified = (...paths) => paths.map((file) => ({ status: 'M', paths: [file] }))
const select = (...paths) => selectGameplayTests('pull_request', modified(...paths))
const hover = 'resources/js/games/hover/HoverGame.tsx'

test('selects every Tower spec without selecting unrelated games', () => {
  const selection = select('resources/js/games/tower-throwback/useTowerKeyboardShortcuts.ts')
  assert.equal(selection.mode, 'selected')
  assert.deepEqual(selection.specs, GAMEPLAY_GAMES.find((entry) => entry.game === 'tower-throwback').specs)
})

test('multiple affected games run everything; one game’s files stay focused', () => {
  assert.equal(select(hover, 'resources/js/games/tower-throwback/useTowerKeyboardShortcuts.ts').mode, 'full')
  assert.equal(select(hover, 'resources/js/games/hover/HoverScene.tsx').mode, 'selected')
})

test('registered specs and Blade shells select the right game, including Cars naming', () => {
  assert.deepEqual(select('resources/views/games/cars.blade.php'), select('tests/e2e/parking-pickup.spec.ts'))
  for (const entry of GAMEPLAY_GAMES) {
    for (const file of [...entry.ui.map((name) => `resources/js/games/${entry.game}/${name}`),
      `resources/js/games/${entry.game}/index.tsx`, `resources/views/games/${entry.game}.blade.php`,
      ...entry.specs.map((name) => `tests/e2e/${name}`)]) {
      assert.deepEqual(select(file), { mode: 'selected', specs: entry.specs })
    }
  }
})

test('unknown, shared, persistence, engine, dependency and routing changes expand to full', () => {
  for (const file of ['resources/js/games/hover/NewPanel.tsx',
    'resources/js/games/hover/gameProgress.ts', 'resources/js/games/hover/gameTypes.ts',
    'resources/js/games/hover/maps/maps.ts', 'resources/js/games/hover/engine/engine.ts',
    'resources/js/games/_shared/databaseGameData.ts', 'resources/js/games/pwa/sw.ts',
    'resources/js/games/hover/notes.md', 'public/notes.md',
    'resources/views/layouts/game.blade.php', 'routes/web.php', 'pnpm-lock.yaml',
    '.github/workflows/ci.yml', 'tests/e2e/new-game.spec.ts', 'tests/e2e/gameplay-durations.json', 'a\nnewline.ts']) {
    for (const changes of [[hover, file], ['docs/games/hover-homage.md', file], [file]]) {
      const selection = select(...changes)
      assert.equal(selection.mode, 'full', file)
      assert.deepEqual(selection.specs, GAMEPLAY_GAMES.flatMap((entry) => entry.specs))
    }
  }
})

test('only documentation-only PRs select no gameplay; docs beside one game keep that game', () => {
  assert.deepEqual(select('docs/games/hover-homage.md', 'AGENTS.md', 'README.md'), { mode: 'none', specs: [] })
  assert.equal(select('docs/games/hover-homage.md', hover).mode, 'selected')
  assert.equal(selectGameplayTests('pull_request', [{ status: 'D', paths: ['docs/old.md'] }]).mode, 'full')
  assert.equal(selectGameplayTests('push', modified('docs/games/hover-homage.md')).mode, 'full')
})

test('deletions, renames and type changes always run full coverage', () => {
  for (const change of [
    { status: 'D', paths: [hover] },
    { status: 'R100', paths: [hover, 'resources/js/games/hover/HoverScene.tsx'] },
    { status: 'T', paths: [hover] },
  ]) assert.equal(selectGameplayTests('pull_request', [change]).mode, 'full')
  assert.equal(selectGameplayTests('pull_request', [{ status: 'A', paths: [hover] }]).mode, 'selected')
})

test('empty changes and every non-PR run remain full', () => {
  assert.equal(select().mode, 'full')
  for (const event of ['push', 'schedule', 'workflow_dispatch', 'pull_request_target']) {
    assert.equal(selectGameplayTests(event, modified(hover)).mode, 'full')
  }
  assert.throws(() => selectGameplayTests(undefined, []))
  assert.throws(() => selectGameplayTests('pull_request\n', []))
})

const fake = (file, title) => ({ key: testKey('chromium-desktop', file, ['Suite', title]), file })

test('packs every test into exactly one shard, longest first, within the shard cap', () => {
  const tests = [fake('a.spec.ts', 'long'), fake('a.spec.ts', 'short'), fake('b.spec.ts', 'one'), fake('b.spec.ts', 'two'), fake('c.spec.ts', 'three')]
  const seconds = [400, 100, 300, 200, 100]
  const durations = Object.fromEntries(tests.map((test, index) => [test.key, seconds[index]]))
  const plan = planShards(tests, durations, { target: 500, max: 4 })
  assert.equal(plan.shards, 3)
  assert.deepEqual(plan.estimates, [400, 400, 300])
  assert.deepEqual(plan.matrix.include.map((shard) => shard.shard), [1, 2, 3])
  const assigned = plan.matrix.include.flatMap((shard) => shard.tests.split('\n'))
  assert.deepEqual(assigned.sort(), tests.map((test) => test.key).sort())
  assert.equal(planShards(tests, durations, { target: 10, max: 4 }).shards, 4)
  assert.equal(planShards(tests.slice(0, 2), durations, { target: 10, max: 4 }).shards, 2)
  assert.equal(planShards(tests, durations, { target: 5000, max: 4 }).shards, 1)
  assert.throws(() => planShards([], durations))
  assert.throws(() => planShards([tests[0], tests[0]], durations))
})

test('unmeasured tests take their file median, or the default for a new file, and are reported', () => {
  const known = [fake('a.spec.ts', 'one'), fake('a.spec.ts', 'two'), fake('a.spec.ts', 'three')]
  const durations = { [known[0].key]: 100, [known[1].key]: 300, [known[2].key]: 500 }
  const plan = planShards([...known, fake('a.spec.ts', 'new'), fake('z.spec.ts', 'new')], durations, { target: 10_000 })
  assert.deepEqual(plan.estimates, [900 + 300 + UNKNOWN_TEST_SECONDS])
  assert.deepEqual(plan.unknown.sort(), [fake('a.spec.ts', 'new').key, fake('z.spec.ts', 'new').key])
})

// New tests are budgeted, not rejected: CI must measure a test before it can be recorded.
test('Playwright’s own discovery of the gameplay script is scheduled once each within the cap', () => {
  const tests = listGameplayTests()
  const expectedFiles = GAMEPLAY_GAMES.flatMap((entry) => entry.specs)
  assert.deepEqual([...new Set(tests.map((test) => test.file))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), [...expectedFiles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  assert.deepEqual([...new Set(tests.map((test) => test.key.slice(1, test.key.indexOf(']'))))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), [...GAMEPLAY_PROJECTS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  const plan = planShards(tests, readDurations())
  assert.ok(plan.shards <= MAX_SHARDS)
  const assigned = plan.matrix.include.flatMap((shard) => shard.tests.split('\n'))
  assert.equal(assigned.length, tests.length)
  assert.deepEqual(new Set(assigned), new Set(tests.map((test) => test.key)))
})

test('measurements use each test’s final attempt and drop tests no longer listed', () => {
  const report = { suites: [{ file: 'a.spec.ts', title: 'a.spec.ts', specs: [], suites: [{ title: 'Suite', specs: [
    { title: 'flaky', tests: [{ projectName: 'chromium-desktop', results: [{ status: 'failed', duration: 90_000 }, { status: 'passed', duration: 30_400 }] }] },
    { title: 'phone only', tests: [{ projectName: 'chromium-desktop', results: [{ status: 'skipped', duration: 3 }] }] },
  ] }] }] }
  const [flaky, phoneOnly] = collectTests(report).map((test) => test.key)
  assert.equal(flaky, '[chromium-desktop] › a.spec.ts › Suite › flaky')
  const measured = measure([report])
  assert.deepEqual(measured, { [flaky]: 30, [phoneOnly]: 1 })
  const kept = '[chromium-desktop] › b.spec.ts › Suite › kept'
  assert.deepEqual(mergeDurations({ [kept]: 50, gone: 9, [flaky]: 70 }, measured, new Set([flaky, phoneOnly, kept])),
    { [flaky]: 30, [phoneOnly]: 1, [kept]: 50 })
})

test('full registry matches the package gameplay spec and project arguments', () => {
  const command = JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:e2e:gameplay']
  const tokens = command.split(/\s+/)
  assert.deepEqual(tokens.slice(0, 2), ['playwright', 'test'])
  const args = tokens.slice(2)
  // Reject unfamiliar flags or shell syntax until the manifest check is updated
  // explicitly; a newly added spec/project must never disappear from full CI.
  const specs = args.filter((arg) => /^tests\/e2e\/[\w.-]+\.spec\.ts$/.test(arg))
  const projects = args.filter((arg) => /^--project=[\w-]+$/.test(arg))
  assert.equal(specs.length + projects.length, args.length)
  assert.deepEqual(specs.sort(), GAMEPLAY_GAMES.flatMap((game) => game.specs.map((spec) => `tests/e2e/${spec}`)).sort())
  assert.deepEqual(projects.sort(), GAMEPLAY_PROJECTS.map((project) => `--project=${project}`).sort())
})

test('parses NUL-separated paths and rejects incomplete or malformed Git output', () => {
  assert.deepEqual(parseChangedFiles(`M\0${hover}\0R100\0old name.ts\0new name.ts\0`), [
    ...modified(hover), { status: 'R100', paths: ['old name.ts', 'new name.ts'] },
  ])
  assert.deepEqual(parseChangedFiles(''), [])
  for (const malformed of ['M\0file', 'M\0', 'R100\0one\0', 'invalid\0file\0', 'M\0\0']) {
    assert.throws(() => parseChangedFiles(malformed))
  }
})

test('uses actual base/head merge base and fails for invalid refs or Git errors', () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40)
  const changes = readChangedFiles(base, head, (command, args) => {
    assert.equal(command, 'git')
    assert.deepEqual(args, ['diff', '--name-status', '-z', '--no-renames', `${base}...${head}`, '--'])
    return `M\0${hover}\0`
  })
  assert.deepEqual(changes, modified(hover))
  for (const bad of ['', '--help', 'main', `${base}\n`, undefined]) {
    assert.throws(() => readChangedFiles(bad, head))
  }
  assert.throws(() => readChangedFiles(base, head, () => { throw new Error('Git failed') }))
})

test('CLI writes single-line outputs and exits nonzero without outputs on Git failure', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gameplay-selection-'))
  try {
    const output = path.join(dir, 'outputs')
    const env = { ...process.env, GAMEPLAY_EVENT: 'push', GITHUB_OUTPUT: output }
    const run = () => spawnSync(process.execPath, ['scripts/select-gameplay-tests.mjs'], { env, encoding: 'utf8' })
    assert.equal(run().status, 0)
    const lines = new Map(readFileSync(output, 'utf8').trimEnd().split('\n').map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    }))
    assert.equal(lines.get('mode'), 'full')
    const matrix = JSON.parse(lines.get('matrix'))
    assert.equal(lines.get('shards'), String(matrix.include.length))
    assert.equal(matrix.include.flatMap((shard) => shard.tests.split('\n')).length, listGameplayTests().length)
    rmSync(output)
    Object.assign(env, { GAMEPLAY_EVENT: 'pull_request', GAMEPLAY_BASE_SHA: 'a'.repeat(40), GAMEPLAY_HEAD_SHA: 'b'.repeat(40) })
    assert.equal(run().status, 1)
    assert.equal(existsSync(output), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
