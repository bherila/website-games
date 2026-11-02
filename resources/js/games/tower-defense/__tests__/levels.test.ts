import { ELEMENTS, ENEMIES } from '../catalog'
import { createGameState, drainEvents, pickElement, tickGame } from '../gameEngine'
import { COLS, ROWS } from '../gameTypes'
import { buildWaves, LEVELS, TOTAL_LEVELS } from '../levels'
import { cellIndex } from '../pathfinding'
import { runPilot, STEP } from './pilot'

describe('the campaign', () => {
  it.each(LEVELS.map((level) => [level.title, level] as const))('%s is well formed', (_title, level) => {
    expect(level.map).toHaveLength(ROWS)
    for (const row of level.map) {
      expect(row).toHaveLength(COLS)
    }
    expect(LEVELS[level.id - 1]).toBe(level)
    const state = createGameState(level)
    expect(state.spawns.length).toBeGreaterThan(0)
    expect(state.exits.length).toBe(1)
    // Every spawn starts with a way to the keep, and there is room to build on.
    expect(state.pathBlocked).toBe(false)
    for (const { col, row } of state.spawns) {
      expect(Number.isFinite(state.openField[cellIndex(col, row)])).toBe(true)
    }
    expect(state.terrain.filter((cell) => cell === 'ground').length).toBeGreaterThan(120)
    // The hero never starts stranded on rock or water.
    expect(['ground', 'pad', 'spawn', 'exit']).toContain(state.terrain[cellIndex(Math.floor(state.hero.x), Math.floor(state.hero.y))])
  })

  it('has exactly the levels the save data allows', () => {
    expect(TOTAL_LEVELS).toBe(8)
    expect(LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it.each(LEVELS.map((level) => [level.title, level] as const))('%s gets harder each wave', (_title, level) => {
    const waves = buildWaves(level)
    expect(waves).toHaveLength(level.waves)
    const threat = waves.map((wave) => wave.groups.reduce((sum, group) => sum + (group.count * ENEMIES[group.kind].hp * wave.hpMultiplier), 0))
    const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(average(threat.slice(-3))).toBeGreaterThan(average(threat.slice(0, 3)) * 3)
    for (let index = 1; index < waves.length; index += 1) {
      const current = waves[index]
      const previous = waves[index - 1]
      expect(current?.hpMultiplier).toBeGreaterThan(previous?.hpMultiplier ?? Infinity)
    }
    expect(waves.filter((wave) => wave.boss).map((wave) => wave.number)).toEqual(waves.map((wave) => wave.number).filter((number) => number % 5 === 0))
    for (const wave of waves) {
      if (wave.element) {
        expect(ELEMENTS[wave.element]).toBeDefined()
      }
    }
  })

  it('introduces enemies gradually and shows every kind in the longest level', () => {
    const waves = buildWaves(LEVELS[LEVELS.length - 1] ?? LEVELS[0]!)
    expect(waves[0]?.groups.map((group) => group.kind)).toEqual(['grunt'])
    expect(waves[1]?.element).toBeNull()
    expect(new Set(waves.flatMap((wave) => wave.groups.map((group) => group.kind)))).toEqual(new Set(Object.keys(ENEMIES)))
  })
})

describe('balance, played headlessly', () => {
  it.each(LEVELS.map((level) => [level.title, level] as const))('%s falls to a player who does nothing', (_title, level) => {
    const state = createGameState(level)
    for (let elapsed = 0; elapsed < 900 && state.status === 'playing'; elapsed += STEP) {
      if (state.pendingPicks > 0) {
        pickElement(state, ['fire', 'water', 'nature', 'earth', 'light', 'dark'].find((element) => !state.unlocked.includes(element as never)) as never)
      }
      tickGame(state, STEP)
      drainEvents(state)
    }
    expect(state.status).toBe('lost')
    expect(state.waveNumber).toBeLessThanOrEqual(5)
  })

  // This pilot never mazes or matches elements, so a win leaves a real player headroom.
  it.each(LEVELS.map((level) => [level.title, level] as const))('%s can be won by a plain tower-and-coin player', (_title, level) => {
    const { state } = runPilot(level)
    expect({ wave: state.waveNumber, status: state.status }).toEqual({ wave: level.waves, status: 'won' })
    expect(state.lives).toBeGreaterThanOrEqual(3)
    expect(state.goldCollected).toBeGreaterThan(level.startGold)
  })

  it('later levels are harder than the first ones', () => {
    const first = runPilot(LEVELS[0] ?? LEVELS[1]!, { maxTowers: 4 })
    const last = runPilot(LEVELS[LEVELS.length - 1] ?? LEVELS[0]!, { maxTowers: 4 })
    expect(first.state.status).toBe('won')
    expect(last.state.status).toBe('lost')
  })

  it('collecting coins matters: a hero who ignores them does worse', () => {
    const level = LEVELS[3] ?? LEVELS[0]!
    const diligent = runPilot(level)
    const idle = runPilot(level, { coinEffort: 0 })
    expect(diligent.state.goldCollected).toBeGreaterThan(idle.state.goldCollected)
    expect(diligent.state.waveNumber * 100 + diligent.state.lives).toBeGreaterThan((idle.state.waveNumber * 100) + idle.state.lives)
  })
})
