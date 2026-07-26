import { solve } from '../engine/solver'
import type { GameState, TileKind } from '../engine/types'
import { LEVELS } from '../levels'
import { parseLevel } from '../levels/parseLevel'

/**
 * Mechanic-necessity gate (persistent): every mechanic present in a level
 * must be genuinely overcome on ANY winning route. For each mechanic class,
 * mutate it out of the level (doors become walls, boots vanish, buttons go
 * dead, …) and re-solve — if the level is still winnable, the mechanic is
 * decorative/bypassable and the level is broken. Levels may have many
 * solutions; what this forbids is a solution that sidesteps an obstacle.
 * (Sockets are covered separately by the chokepoint check in solver.test.ts.)
 */

const NECESSITY_MAX_NODES = 200_000

function withTiles(state: GameState, map: (tile: TileKind) => TileKind): GameState {
  return { ...state, tiles: state.tiles.map(map) }
}

interface NecessityCheck {
  readonly name: string
  readonly applies: (state: GameState) => boolean
  /** Removes the mechanic's benefit; the level must then be unsolvable. */
  readonly mutate: (state: GameState) => GameState
}

const NECESSITY_CHECKS: readonly NecessityCheck[] = [
  ...(['Red', 'Green', 'Blue', 'Yellow'] as const).map((color): NecessityCheck => ({
    name: `${color.toLowerCase()} doors gate the route (doors sealed)`,
    applies: (state) => state.tiles.includes(`door${color}` as TileKind),
    mutate: (state) => withTiles(state, (tile) => (tile === `door${color}` ? 'wall' : tile)),
  })),
  ...(['flippers', 'fireBoots', 'skates', 'suctionBoots'] as const).map((boot): NecessityCheck => ({
    name: `${boot} are required (boots removed)`,
    applies: (state) => state.tiles.includes(boot),
    mutate: (state) => withTiles(state, (tile) => (tile === boot ? 'floor' : tile)),
  })),
  {
    name: 'blocks are required (blocks removed)',
    applies: (state) => state.blocks.length > 0,
    mutate: (state) => ({ ...state, blocks: [] }),
  },
  {
    name: 'teleports are required (teleports sealed)',
    applies: (state) => state.tiles.includes('teleport'),
    mutate: (state) => ({
      ...withTiles(state, (tile) => (tile === 'teleport' ? 'wall' : tile)),
      teleports: [],
    }),
  },
  {
    name: 'toggle machinery is required (green buttons dead)',
    applies: (state) => state.tiles.includes('buttonGreen'),
    mutate: (state) => withTiles(state, (tile) => (tile === 'buttonGreen' ? 'floor' : tile)),
  },
  {
    name: 'tank reversal is required (blue buttons dead)',
    applies: (state) => state.tiles.includes('buttonBlue'),
    mutate: (state) => withTiles(state, (tile) => (tile === 'buttonBlue' ? 'floor' : tile)),
  },
  {
    name: 'cloning is required (red buttons dead)',
    applies: (state) => state.tiles.includes('buttonRed'),
    mutate: (state) => withTiles(state, (tile) => (tile === 'buttonRed' ? 'floor' : tile)),
  },
  {
    name: 'dirt is on the critical path (dirt hardened)',
    applies: (state) => state.tiles.includes('dirt'),
    mutate: (state) => withTiles(state, (tile) => (tile === 'dirt' ? 'wall' : tile)),
  },
]

describe('mechanic necessity gate', () => {
  for (const def of LEVELS) {
    const state = parseLevel(def)
    const applicable = NECESSITY_CHECKS.filter((check) => check.applies(state))

    for (const check of applicable) {
      test(`level ${def.id} '${def.title}': ${check.name}`, () => {
        const result = solve(check.mutate(state), { maxNodes: NECESSITY_MAX_NODES })
        if (result.status === 'solved') {
          throw new Error(
            `BYPASSABLE: still solvable in ${result.solution?.length ?? 0} moves with this mechanic removed — ` +
              'every mechanic present must be genuinely overcome (multiple solutions are fine; skipping an obstacle is not)',
          )
        }
        expect(['unsolvable', 'budget']).toContain(result.status)
      })
    }
  }
})
