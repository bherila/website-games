import { ELEMENT_IDS } from '../catalog'
import { callNextWave, createGameState, drainEvents, orderBuild, orderUpgrade, pickElement, placementProblem, tickGame } from '../gameEngine'
import type { GameEvent, GameState } from '../gameTypes'
import { COLS, ROWS } from '../gameTypes'
import { LEVELS } from '../levels'
import { computeField } from '../pathfinding'
import { MAX_RUN_BYTES, parseRunSnapshot, restoreRun, snapshotRun } from '../runSnapshot'

function advance(state: GameState, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) tickGame(state, 1 / 60)
}

function roundTrip(state: GameState): GameState {
  const saved = parseRunSnapshot(JSON.parse(JSON.stringify(snapshotRun(state))))
  expect(saved).not.toBeNull()
  if (!saved) throw new Error('Fixture snapshot was invalid')
  const restored = restoreRun(saved)
  expect(snapshotRun(restored)).toEqual(snapshotRun(state))
  return restored
}

function sameContinuation(original: GameState, restored: GameState, ticks = 1200): void {
  drainEvents(original)
  const before: GameEvent[] = []
  const after: GameEvent[] = []
  for (let tick = 0; tick < ticks; tick += 1) {
    if (original.pendingPicks) {
      const element = ELEMENT_IDS.find((entry) => !original.unlocked.includes(entry))
      if (element) { pickElement(original, element); pickElement(restored, element) }
    }
    tickGame(original, 1 / 60)
    tickGame(restored, 1 / 60)
    before.push(...drainEvents(original))
    after.push(...drainEvents(restored))
  }
  expect(after).toEqual(before)
  expect(snapshotRun(restored)).toEqual(snapshotRun(original))
  expect(restored.random()).toBe(original.random())
}

it('continues live enemies, projectile flights, dropped coins, queued jobs, upgrades and status effects exactly', () => {
  const state = createGameState(LEVELS[0]!, 934)
  state.gold = 1000
  state.hero.x = 6.5
  state.hero.y = 4.5
  expect(orderBuild(state, 'arrow', 6, 4)).toBe(true)
  advance(state, 90)
  state.hero.x = 10.5; state.hero.y = 18.5
  callNextWave(state)
  for (let tick = 0; tick < 900 && !(state.coins.length && state.projectiles.length && state.enemies.length); tick += 1) advance(state, 1)
  expect(state.coins.length).toBeGreaterThan(0)
  expect(state.projectiles.length).toBeGreaterThan(0)
  expect(state.enemies.length).toBeGreaterThan(0)
  const target = state.enemies[0]!
  target.burnTimer = 1.2; target.burnDps = 2
  target.poisonTimer = 3; target.poisonStacks = 2; target.poisonDps = 1
  target.slowTimer = 2; target.slowFactor = 0.7
  expect(orderUpgrade(state, state.buildings[0]!.id)).toBe(true)
  expect(orderBuild(state, 'wall', 3, 8)).toBe(true)
  const restored = roundTrip(state)
  expect(restored.buildingAt[4 * COLS + 6]).toBe(restored.buildings[0])
  expect(restored.buildings[0]).not.toBe(state.buildings[0])
  expect(restored.openField).not.toBe(state.openField)
  sameContinuation(state, restored)
})

it('preserves a partly constructed building and pending element choice', () => {
  const state = createGameState(LEVELS[0]!)
  state.hero.x = 3.5; state.hero.y = 8.5
  orderBuild(state, 'arrow', 3, 8)
  advance(state, 10)
  expect(state.buildings[0]!.progress).toBeGreaterThan(0)
  expect(state.buildings[0]!.progress).toBeLessThan(1)
  state.pendingPicks = 1
  sameContinuation(state, roundTrip(state), 300)
})

it('keeps the historical breach cache while a damaged and repaired wall is being attacked', () => {
  const state = createGameState(LEVELS[0]!, 7)
  state.nextWaveIn = 1_000_000
  state.hero.speedLevel = 3
  for (let col = 0; col < COLS; col += 1) expect(orderBuild(state, 'wall', col, 14)).toBe(true)
  for (let tick = 0; tick < 3000 && state.plans.length; tick += 1) advance(state, 1)
  expect(state.plans).toHaveLength(0)
  expect(state.pathBlocked).toBe(true)
  const wall = state.buildings.find((entry) => entry.col === 6)!
  wall.hp = 60
  state.hero.x = 6.5; state.hero.y = 13.5
  advance(state, 6)
  expect(wall.hp).toBeGreaterThan(60)
  state.hero.x = 2.5; state.hero.y = 18.5
  callNextWave(state)
  for (let tick = 0; tick < 1500 && !state.enemies.some((entry) => entry.attackingId !== null); tick += 1) advance(state, 1)
  expect(state.enemies.some((entry) => entry.attackingId !== null)).toBe(true)
  const recomputed = computeField(state.exits.map((exit) => exit.row * COLS + exit.col), state.rules.breach)
  expect(Array.from(recomputed)).not.toEqual(Array.from(state.breachField))
  sameContinuation(state, roundTrip(state), 900)
})

it.each(['version', 'level', 'field', 'duplicate-id', 'dangling-plan', 'nan', 'prototype'] as const)('refuses a %s-corrupted snapshot', (corruption) => {
  const state = createGameState(LEVELS[0]!)
  state.hero.x = 3.5; state.hero.y = 8.5
  orderBuild(state, 'arrow', 3, 8)
  advance(state, 10)
  const snapshot = snapshotRun(state)
  const value: Record<string, unknown> = { ...snapshot }
  if (corruption === 'version') value.version = 999
  if (corruption === 'level') value.levelId = 999
  if (corruption === 'field') value.breachField = [0]
  if (corruption === 'duplicate-id') value.coins = [{ id: snapshot.buildings[0]!.id, x: 1, y: 1, value: 1, age: 0, settle: 0 }]
  if (corruption === 'dangling-plan') value.plans = snapshot.plans.map((entry) => ({ ...entry, buildingId: 900 }))
  if (corruption === 'nan') value.clock = Number.NaN
  if (corruption === 'prototype') value.buildings = [{ ...snapshot.buildings[0], tower: '__proto__' }]
  expect(parseRunSnapshot(value)).toBeNull()
})

it('ignores untrusted extra fields and never aliases a restored snapshot', () => {
  const state = createGameState(LEVELS[0]!)
  const raw = JSON.parse(JSON.stringify(snapshotRun(state))) as Record<string, unknown>
  raw.rules = { open: 'untrusted' }
  raw.buildingAt = ['untrusted']
  const saved = parseRunSnapshot(raw)!
  const restored = restoreRun(saved)
  saved.hero.x = 0
  expect(restored.hero.x).not.toBe(0)
  expect(typeof restored.rules.open.cost).toBe('function')
  expect(restored.buildingAt.every((entry) => entry === null)).toBe(true)
})


it('fits the account-save budget with every campaign enemy alive and a full wall board', () => {
  const state = createGameState(LEVELS[7]!, 77)
  state.gold = 100_000
  state.hero.speedLevel = 3
  while (state.waveNumber < state.waves.length || state.spawnQueue.length) {
    if (state.pendingPicks) {
      const element = ELEMENT_IDS.find((entry) => !state.unlocked.includes(entry))
      if (element) pickElement(state, element)
    }
    if (state.nextWaveIn !== null) callNextWave(state)
    tickGame(state, 1 / 60)
    // Hold every spawn alive to bound the densest possible campaign snapshot.
    for (const enemy of state.enemies) enemy.speed = 0
  }
  for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) {
    if (placementProblem(state, 'wall', col, row)) continue
    state.hero.x = col + 0.5; state.hero.y = row + 0.5
    orderBuild(state, 'wall', col, row)
    advance(state, 20)
  }
  const snapshot = snapshotRun(state)
  expect(state.enemies.length).toBeGreaterThan(200)
  expect(state.buildings.length).toBeGreaterThan(180)
  expect(JSON.stringify(snapshot).length).toBeLessThan(MAX_RUN_BYTES)
  expect(parseRunSnapshot(snapshot)).not.toBeNull()
})
