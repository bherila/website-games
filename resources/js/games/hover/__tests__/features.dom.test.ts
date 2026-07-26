import { stepEngine } from '../engine/engine'
import { canStep, MAX_DRIVE_CLIMB } from '../engine/pathfinding'
import { resolveWallCollisions, stepCraftPhysics } from '../engine/physics'
import { createRng } from '../engine/rng'
import { spawnRound } from '../engine/spawning'
import type { EngineEvent, EngineState } from '../gameTypes'
import { ARROW_BOOST_SPEED, DT, SLOW_DOWN_MULTIPLIER, TRAP_GRACE_SEC, TRAP_HOLD_SEC } from '../gameTypes'
import type { InputState } from '../input/inputState'
import { MAPS } from '../maps/maps'
import { cellCenter, createMapDef, groundHeightAt } from '../maps/mapTypes'
import { makeCraft, makeFlag, makeState, makeTrap, openMap, testTheme } from './fixtures'

const IDLE: InputState = { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
const FORWARD: InputState = { thrust: 1, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }

function runSeconds(state: EngineState, input: InputState, seconds: number): EngineEvent[] {
  const events: EngineEvent[] = []
  for (let t = 0; t < seconds; t += DT) {
    events.push(...stepEngine(state, input, DT))
  }
  return events
}

/** Drive-graph BFS honoring a blocked set, for trap-placement assertions. */
function bfs(map: (typeof MAPS)[number], start: { col: number; row: number }, blocked: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>([`${start.col},${start.row}`])
  const queue = [start]
  while (queue.length > 0) {
    const cell = queue.shift()
    if (!cell) {
      break
    }
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const col = cell.col + dc
      const row = cell.row + dr
      const key = `${col},${row}`
      if (!seen.has(key) && !blocked.has(key) && canStep(map, cell, col, row, MAX_DRIVE_CLIMB)) {
        seen.add(key)
        queue.push({ col, row })
      }
    }
  }
  return seen
}

/**
 * A round with no flags resolves instantly, freezing the engine — every
 * stepEngine-driven test needs live flags. The red flag sits on a low wall
 * the drone can't path to, so the drone never ends the round mid-test.
 */
function liveFlags(map: Parameters<typeof makeFlag>[0], redCell: { col: number; row: number }): EngineState['flags'] {
  return [makeFlag(map, 0, 'blue', { col: 1, row: map.rows.length - 2 }), makeFlag(map, 1, 'red', redCell)]
}

/** Ramp at col 5 climbs east onto a platform at col 6 (sealed to its east). */
const rampMap = createMapDef({
  id: 'castle',
  rows: [
    '#########',
    '#P...>=##',
    '#.......#',
    '#..-...E#',
    '#########',
  ],
  theme: testTheme,
})

/** One east-pointing arrow pad in the middle of an open room. */
const arrowMap = createMapDef({
  id: 'city',
  rows: [
    '#########',
    '#P......#',
    '#...6...#',
    '#......E#',
    '#########',
  ],
  theme: testTheme,
})

describe('sticky traps', () => {
  test('a grounded craft crossing a trap is glued for the hold time, then released with grace', () => {
    const trap = makeTrap(openMap, 0, { col: 4, row: 4 })
    const state = makeState(openMap, { traps: [trap], flags: liveFlags(openMap, { col: 4, row: 3 }) })
    state.player.pos = { ...trap.pos }

    const events = runSeconds(state, FORWARD, 0.1)

    expect(events.some((event) => event.kind === 'trapped' && event.actor === 'player')).toBe(true)
    expect(state.player.stuckSec).toBeGreaterThan(TRAP_HOLD_SEC - 0.2)
    expect(Math.hypot(state.player.vel.x, state.player.vel.z)).toBe(0)

    const during = runSeconds(state, FORWARD, 1)
    expect(during.some((event) => event.kind === 'trapped')).toBe(false)
    expect(Math.hypot(state.player.vel.x, state.player.vel.z)).toBe(0)

    runSeconds(state, FORWARD, TRAP_HOLD_SEC)
    expect(state.player.stuckSec).toBe(0)
    expect(state.player.trapGraceSec).toBeGreaterThan(0)
    expect(state.player.trapGraceSec).toBeLessThanOrEqual(TRAP_GRACE_SEC)
  })

  test('an airborne craft sails over a trap', () => {
    const trap = makeTrap(openMap, 0, { col: 4, row: 4 })
    const state = makeState(openMap, { traps: [trap], flags: liveFlags(openMap, { col: 4, row: 3 }) })
    state.player.pos = { ...trap.pos }
    state.player.altitude = 1.5
    state.player.airborne = true
    state.player.verticalVel = 3

    const events = runSeconds(state, IDLE, 0.05)

    expect(events.some((event) => event.kind === 'trapped')).toBe(false)
    expect(state.player.stuckSec).toBe(0)
  })

  test('jumping off a trap edge is not grabbed mid-launch', () => {
    const trap = makeTrap(openMap, 0, { col: 4, row: 4 })
    const state = makeState(openMap, { traps: [trap], flags: liveFlags(openMap, { col: 4, row: 3 }) })
    state.player.pos = { ...trap.pos }
    state.player.pos.x -= 1.2
    state.player.hasJumpPower = true
    state.player.vel = { x: 8, z: 0 }

    // Jump on the very first step, then coast across the trap airborne.
    const first = stepEngine(state, { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: true }, DT)
    expect(first.some((event) => event.kind === 'jump')).toBe(true)
    const rest = runSeconds(state, IDLE, 0.3)

    expect(first.some((event) => event.kind === 'trapped')).toBe(false)
    expect(rest.some((event) => event.kind === 'trapped')).toBe(false)
  })

  test('traps never spawn on cells that cut a flag off from either spawn', () => {
    for (const map of MAPS) {
      for (const seed of [1, 7, 42, 99]) {
        const { flags, traps } = spawnRound(map, 3, createRng(seed))
        const blocked = new Set(traps.map((trap) => `${trap.cell.col},${trap.cell.row}`))
        for (const spawn of [map.playerSpawn, map.enemySpawn]) {
          const reached = bfs(map, spawn, blocked)
          for (const flag of flags) {
            expect(reached.has(`${flag.cell.col},${flag.cell.row}`)).toBe(true)
          }
        }
      }
    }
  })

  test('the drone gets stuck too', () => {
    const trap = makeTrap(openMap, 0, { col: 4, row: 4 })
    const state = makeState(openMap, { traps: [trap], flags: liveFlags(openMap, { col: 4, row: 3 }) })
    state.drone.pos = { ...trap.pos }

    const events = runSeconds(state, IDLE, 0.1)

    expect(events.some((event) => event.kind === 'trapped' && event.actor === 'drone')).toBe(true)
    expect(state.drone.stuckSec).toBeGreaterThan(0)
  })
})

describe('directional arrow pads', () => {
  test('crossing a pad snaps heading east and boosts velocity, once per crossing', () => {
    const state = makeState(arrowMap, { flags: liveFlags(arrowMap, { col: 7, row: 1 }) })
    const pad = arrowMap.arrowPads[0]
    if (!pad) {
      throw new Error('arrowMap must have a pad')
    }
    state.player.pos = { ...cellCenter(arrowMap, pad.cell) }
    state.player.heading = Math.PI / 2

    const events = runSeconds(state, IDLE, 0.05)

    expect(events.filter((event) => event.kind === 'arrow' && event.actor === 'player')).toHaveLength(1)
    expect(state.player.vel.x).toBeGreaterThan(ARROW_BOOST_SPEED * 0.8)
    expect(Math.abs(state.player.vel.z)).toBeLessThan(0.5)
    expect(state.player.arrowGraceSec).toBeGreaterThan(0)
  })

  test('a slowed craft still gets the full arrow fling (boost overrides slow)', () => {
    const state = makeState(arrowMap, { flags: liveFlags(arrowMap, { col: 7, row: 1 }) })
    const pad = arrowMap.arrowPads[0]
    if (!pad) {
      throw new Error('arrowMap must have a pad')
    }
    state.player.pos = { ...cellCenter(arrowMap, pad.cell) }
    state.player.speedEffect = { kind: 'slow', multiplier: SLOW_DOWN_MULTIPLIER, remainingSec: 5 }

    runSeconds(state, IDLE, 0.05)

    expect(state.player.speedEffect?.kind).toBe('boost')
    expect(state.player.vel.x).toBeGreaterThan(ARROW_BOOST_SPEED * 0.8)
  })

  test('arrow pads are parsed off the grid into arrowPads', () => {
    expect(arrowMap.arrowPads).toHaveLength(1)
    expect(arrowMap.arrowPads[0]?.dir).toBe('east')
    expect(arrowMap.rows[2]?.[4]).toBe('.')
  })
})

describe('ramps and platforms', () => {
  test('driving up a ramp raises the craft to platform height, no jump needed', () => {
    const state = makeState(rampMap, { flags: liveFlags(rampMap, { col: 3, row: 3 }) })
    state.player.pos = { ...cellCenter(rampMap, { col: 3, row: 1 }) }
    state.player.heading = -Math.PI / 2

    runSeconds(state, FORWARD, 1.2)

    expect(state.player.altitude).toBeGreaterThan(rampMap.lowWallHeight * 0.8)
    expect(state.player.airborne).toBe(false)
  })

  test('driving off a platform edge falls to the floor with a landing', () => {
    const state = makeState(rampMap, { flags: liveFlags(rampMap, { col: 3, row: 3 }) })
    state.player.pos = { ...cellCenter(rampMap, { col: 6, row: 1 }) }
    state.player.altitude = rampMap.lowWallHeight
    state.player.heading = Math.PI

    const events = runSeconds(state, FORWARD, 1.5)

    expect(events.some((event) => event.kind === 'land' && event.actor === 'player')).toBe(true)
    expect(state.player.altitude).toBe(0)
  })

  test('groundHeightAt interpolates along a ramp and tops out on platforms and low walls', () => {
    const cellSize = rampMap.cellSize
    expect(groundHeightAt(rampMap, 6.5 * cellSize, 1.5 * cellSize)).toBe(rampMap.lowWallHeight)
    expect(groundHeightAt(rampMap, 3.5 * cellSize, 3.5 * cellSize)).toBe(rampMap.lowWallHeight)
    const low = groundHeightAt(rampMap, 5.1 * cellSize, 1.5 * cellSize)
    const high = groundHeightAt(rampMap, 5.9 * cellSize, 1.5 * cellSize)
    expect(low).toBeGreaterThanOrEqual(0)
    expect(low).toBeLessThan(high)
    expect(high).toBeLessThanOrEqual(rampMap.lowWallHeight)
  })

  test('low walls stay strictly solid below their top (jump gates are full height)', () => {
    const cellSize = rampMap.cellSize
    const midJump = makeCraft(
      { x: 3.5 * cellSize, z: 4 * cellSize + 0.6 },
      { altitude: rampMap.lowWallHeight - 0.3, airborne: true, vel: { x: 0, z: -5 } },
    )

    expect(resolveWallCollisions(midJump, rampMap)).toBeGreaterThan(0)

    const abovePeak = makeCraft(
      { x: 3.5 * cellSize, z: 4 * cellSize + 0.6 },
      { altitude: rampMap.lowWallHeight + 0.1, airborne: true, vel: { x: 0, z: -5 } },
    )
    expect(resolveWallCollisions(abovePeak, rampMap)).toBe(0)
  })

  test('ramp side faces are solid — no lateral teleport onto the slope', () => {
    const cellSize = rampMap.cellSize
    const craft = makeCraft(
      { x: 5.8 * cellSize, z: 2.5 * cellSize + cellSize * 0.45 },
      { vel: { x: 0, z: -6 } },
    )
    craft.pos.z = 1.99 * cellSize

    const impact = resolveWallCollisions(craft, rampMap)

    expect(impact).toBeGreaterThan(0)
    expect(craft.altitude).toBe(0)
  })

  test('pathfinding cannot enter a ramp sideways or climb its uphill face from the floor', () => {
    expect(canStep(rampMap, { col: 5, row: 2 }, 5, 1, MAX_DRIVE_CLIMB)).toBe(false)
    expect(canStep(rampMap, { col: 4, row: 1 }, 5, 1, MAX_DRIVE_CLIMB)).toBe(true)
    expect(canStep(rampMap, { col: 5, row: 1 }, 6, 1, MAX_DRIVE_CLIMB)).toBe(true)
  })

  test('a craft with jump power can land on and ride a low wall top', () => {
    const cellSize = rampMap.cellSize
    const craft = makeCraft(
      { x: 3.5 * cellSize, z: 3.5 * cellSize },
      { altitude: rampMap.lowWallHeight + 0.4, airborne: true, verticalVel: -1 },
    )

    for (let i = 0; i < 240 && craft.airborne; i++) {
      stepCraftPhysics(craft, IDLE, rampMap, DT, false)
    }

    expect(craft.airborne).toBe(false)
    expect(craft.altitude).toBe(rampMap.lowWallHeight)
  })
})
