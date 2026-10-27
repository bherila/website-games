import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { FULL_GAMEPLAY_GROUPS, GAMEPLAY_GAMES, GAMEPLAY_PROJECTS, parseChangedFiles, readChangedFiles, selectGameplayTests } from '../select-gameplay-tests.mjs'

const modified = (...paths) => paths.map((file) => ({ status: 'M', paths: [file] }))
const select = (...paths) => selectGameplayTests('pull_request', modified(...paths))
const hover = 'resources/js/games/hover/HoverGame.tsx'

test('selects every Tower spec without selecting unrelated games', () => {
  const selection = select('resources/js/games/tower-throwback/useTowerKeyboardShortcuts.ts')
  assert.equal(selection.mode, 'selected')
  assert.deepEqual(selection.matrix, { include: [{ shard: 1, grep: selection.grep }] })
  const match = new RegExp(selection.grep)
  for (const entry of GAMEPLAY_GAMES) {
    for (const spec of entry.specs) {
      assert.equal(match.test(`chromium-desktop ${spec} suite test`), entry.game === 'tower-throwback')
      assert.equal(match.test(`prefix-${spec} suite test`), false)
    }
  }
})

test('multiple affected games retain the balanced full groups', () => {
  assert.equal(select(hover, 'resources/js/games/tower-throwback/useTowerKeyboardShortcuts.ts').mode, 'full')
  assert.equal(select(hover, 'resources/js/games/hover/HoverScene.tsx').mode, 'selected')
})

test('registered specs and Blade shells select the right game, including Cars naming', () => {
  assert.equal(select('resources/views/games/cars.blade.php').grep, select('tests/e2e/parking-pickup.spec.ts').grep)
  for (const entry of GAMEPLAY_GAMES) {
    for (const file of [...entry.ui.map((name) => `resources/js/games/${entry.game}/${name}`),
      `resources/js/games/${entry.game}/index.tsx`, `resources/views/games/${entry.game}.blade.php`,
      ...entry.specs.map((name) => `tests/e2e/${name}`)]) {
      assert.equal(select(file).mode, 'selected')
    }
  }
})

test('unknown, shared, persistence, engine, dependency and routing changes expand to full', () => {
  for (const file of ['docs/games/hover-homage.md', 'resources/js/games/hover/NewPanel.tsx',
    'resources/js/games/hover/gameProgress.ts', 'resources/js/games/hover/gameTypes.ts',
    'resources/js/games/hover/maps/maps.ts', 'resources/js/games/hover/engine/engine.ts',
    'resources/js/games/_shared/databaseGameData.ts', 'resources/js/games/pwa/sw.ts',
    'resources/views/layouts/game.blade.php', 'routes/web.php', 'pnpm-lock.yaml',
    '.github/workflows/ci.yml', 'tests/e2e/new-game.spec.ts', 'a\nnewline.ts']) {
    const selection = select(hover, file)
    assert.equal(selection.mode, 'full', file)
    assert.equal(selection.grep, '')
    assert.deepEqual(selection.matrix.include.map((group) => group.shard), [1, 2, 3, 4])
  }
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

test('full groups cover every registered project/file exactly once and reject unrelated titles', () => {
  const expected = GAMEPLAY_PROJECTS.flatMap((project) => GAMEPLAY_GAMES.flatMap((game) => game.specs.map((spec) => [project, spec])))
  assert.equal(expected.length, 32)
  assert.deepEqual(FULL_GAMEPLAY_GROUPS.flat().map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
  const selection = selectGameplayTests('schedule', [])
  assert.equal(selection.matrix.include.length, 4)
  for (const [project, spec] of expected) {
    const matching = selection.matrix.include.filter((group) => new RegExp(group.grep).test(`${project} ${spec} suite test`))
    assert.equal(matching.length, 1, `${project}/${spec}`)
  }
  for (const group of selection.matrix.include) {
    const match = new RegExp(group.grep)
    assert.equal(match.test('webkit-mobile-375 hover.spec.ts suite test'), false)
    assert.equal(match.test('chromium-desktop other.spec.ts suite test'), false)
    assert.equal(match.test('prefix-chromium-desktop hover.spec.ts suite test'), false)
  }
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
    assert.equal(lines.get('shards'), '4')
    assert.equal(lines.get('grep'), '')
    assert.deepEqual(JSON.parse(lines.get('matrix')), selectGameplayTests('push', []).matrix)
    rmSync(output)
    Object.assign(env, { GAMEPLAY_EVENT: 'pull_request', GAMEPLAY_BASE_SHA: 'a'.repeat(40), GAMEPLAY_HEAD_SHA: 'b'.repeat(40) })
    assert.equal(run().status, 1)
    assert.equal(existsSync(output), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
