import { applyMove } from '../engine/applyMove'
import { solve } from '../engine/solver'
import type { GameState, MoveIntent, TileKind } from '../engine/types'
import { getLevelById } from '../levels'
import { parseLevel } from '../levels/parseLevel'

/**
 * Focused gates for the levels added or redrawn in the 2026-10 variety pass
 * (7, 8, 12, 22, 23, 24 and the Encore phase 41-45). The pack-wide gates in
 * solver.test.ts / necessity.test.ts already prove each is solvable at par and
 * that every door, boot, block, teleport and button is load-bearing. These add
 * what those gates cannot see: the sliding terrain each level is built around
 * must shape the route, and the ordering traps the levels teach must be real.
 */

const FORCE_FLOORS: readonly TileKind[] = ['forceUp', 'forceDown', 'forceLeft', 'forceRight']
const ICE: readonly TileKind[] = ['ice', 'iceNW', 'iceNE', 'iceSW', 'iceSE']

function start(id: number): GameState {
  const def = getLevelById(id)
  if (!def) {
    throw new Error(`level ${id} missing`)
  }

  return parseLevel(def)
}

function flatten(state: GameState, kinds: readonly TileKind[]): GameState {
  return { ...state, tiles: state.tiles.map((tile) => (kinds.includes(tile) ? 'floor' : tile)) }
}

function play(state: GameState, moves: string): GameState {
  const intents: Record<string, MoveIntent> = { U: 'up', D: 'down', L: 'left', R: 'right', W: 'wait' }
  return [...moves].reduce((current, char) => {
    const result = applyMove(current, intents[char] as MoveIntent)
    if (!result.accepted) {
      throw new Error(`move ${char} rejected`)
    }

    return result.state
  }, state)
}

describe('variety pass: sliding terrain shapes the route', () => {
  const cases: readonly [number, string, readonly TileKind[]][] = [
    [22, 'force floors', FORCE_FLOORS],
    [24, 'force floors', FORCE_FLOORS],
    [41, 'ice', ICE],
    [42, 'force floors', FORCE_FLOORS],
    [45, 'ice', ICE],
    [45, 'force floors', FORCE_FLOORS],
  ]

  for (const [id, label, kinds] of cases) {
    test(`level ${id}: flattening its ${label} makes it unsolvable or a different route`, () => {
      const state = start(id)
      expect(state.tiles.some((tile) => kinds.includes(tile))).toBe(true)

      const par = getLevelById(id)?.par
      const result = solve(flatten(state, kinds), { maxNodes: 200_000 })
      if (result.status === 'solved') {
        expect(result.solution?.length).not.toBe(par)
      } else {
        expect(['unsolvable', 'budget']).toContain(result.status)
      }
    })
  }
})

describe('variety pass: ordering traps are real', () => {
  test('level 23: riding a middle chute before emptying the side bins is a dead end', () => {
    // Along the top hall to the x=7 chute, then down it into the middle bin.
    const state = play(start(23), 'RRRRRRD')
    expect(state.alive).toBe(true)
    expect(solve(state).status).toBe('unsolvable')
  })

  test('level 23: the trap is the one-way chutes, not the walls', () => {
    // The same opening on a board whose chutes are plain floor can walk back out.
    const state = play(flatten(start(23), FORCE_FLOORS), 'RRRRRRDDDDDD')
    expect(solve(state).status).toBe('solved')
  })

  test('level 42: feeding the block to the button before fetching the toggle-gated chip is a dead end', () => {
    // Push the block right onto the belt column, then down: the belt carries it onto
    // the green button, which closes the open toggle in front of the lower chip.
    const state = play(start(42), 'DRRURD')
    expect(state.blocks[0]?.pos).toEqual({ x: 8, y: 5 })
    expect(solve(state).status).toBe('unsolvable')
  })
})

/**
 * Levels 37, 39 and 40 used to be 27-29 tiles wide, over 80% wall, and mostly
 * walking under a follow camera. They are now compact boards a phone shows whole.
 *
 * The level 40 checks solve with the ball removed. 40 has no buttons, so its
 * ball can only block and kill: a mutation that leaves the ball-free board
 * unsolvable leaves the real board unsolvable too, and the ball-free search stays
 * well inside a node budget that the ball's timing would otherwise exhaust.
 */
describe('compact mastery redraws (37, 39, 40)', () => {
  const withoutMonsters = (state: GameState): GameState => ({ ...state, monsters: [] })
  const parOf = (state: GameState): number | null => {
    const result = solve(state, { maxNodes: 200_000 })
    expect(result.status).toBe('solved')

    return result.solution?.length ?? null
  }

  test.each([37, 39])('level %i fits a phone without the follow camera', (id) => {
    const state = start(id)
    expect(state.width).toBeLessThanOrEqual(13)
    expect(state.height).toBeLessThanOrEqual(15)
  })

  test('level 37: the ball on the ice costs moves, so it must be timed', () => {
    expect(parOf(withoutMonsters(start(37)))).toBeLessThan(getLevelById(37)?.par ?? 0)
  })

  test('level 37: the ice routes the tour (flattened, it is a different, shorter walk)', () => {
    expect(parOf(flatten(start(37), ICE))).not.toBe(getLevelById(37)?.par)
  })

  test('level 39: pressing the red button before the toggle-gated chip is a dead end', () => {
    // Bridge the water with the block, walk to the red button, then let the cloned
    // tank reach the green button: the open toggle in front of the corner chip shuts.
    const state = play(start(39), 'RRRRRRRRDRWWWWWWW')
    expect(state.tiles[3 * state.width + 10]).toBe('toggleClosed')
    expect(state.tiles[3 * state.width + 11]).toBe('chip')
    expect(solve(state).status).toBe('unsolvable')
  })

})
