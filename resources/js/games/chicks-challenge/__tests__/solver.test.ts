import { exitReachableWithSocketsSealed, solve } from '../engine/solver'
import type { GameState } from '../engine/types'
import { LEVELS } from '../levels'
import { parseLevel } from '../levels/parseLevel'
import { PHASE_OPENER_IDS } from '../levels/validation'

/**
 * The keystone acceptance gate (docs "Testing" criteria C + C3): the
 * deterministic A* solver must solve every shipped level within budget
 * (machine-proof of solvability, no hardcoded solutions), par must equal
 * the solver's result, every socket must be a physical chokepoint, and each
 * level must clear the calibrated quality floors — detour factor (par ÷
 * manhattan start→exit; kills walk-at-the-exit corridors) and solver nodes
 * expanded (search effort ≈ real decisions; a forced path expands ~1 node
 * per move). Phase capstones (ids ×5) must carry their phase's difficulty.
 */

interface QualityFloors {
  readonly nodes: number
  readonly detour: number
}

/** Phase openers are deliberate near-tutorials and get a lenient floor. */
const OPENER_FLOORS: QualityFloors = { nodes: 15, detour: 1.2 }

/**
 * Calibrated just below the accepted pack (2026-07-07 quality pass) so
 * regressions fail loudly. Slide phases (4-6) run structurally lower node
 * counts because one input traverses many tiles.
 */
const PHASE_FLOORS: Readonly<Record<number, QualityFloors>> = {
  1: { nodes: 100, detour: 2.0 },
  2: { nodes: 500, detour: 1.8 },
  3: { nodes: 150, detour: 2.2 },
  4: { nodes: 80, detour: 1.3 },
  5: { nodes: 150, detour: 1.5 },
  6: { nodes: 50, detour: 1.2 },
  7: { nodes: 300, detour: 2.2 },
  8: { nodes: 500, detour: 3.0 },
}

/** Capstone (last level of a phase) must expand ≥ this × the phase's max. */
const CAPSTONE_DOMINANCE = 0.8

function phaseOf(id: number): number {
  return Math.ceil(id / 5)
}

function manhattanToNearestExit(state: GameState): number {
  let nearest = Number.MAX_SAFE_INTEGER
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (state.tiles[y * state.width + x] === 'exit') {
        nearest = Math.min(nearest, Math.abs(x - state.player.pos.x) + Math.abs(y - state.player.pos.y))
      }
    }
  }

  return nearest === Number.MAX_SAFE_INTEGER ? 1 : Math.max(1, nearest)
}

const nodesByLevelId = new Map<number, number>()

describe('solver gate', () => {
  test('the pack has levels', () => {
    expect(LEVELS.length).toBeGreaterThan(0)
  })

  for (const def of LEVELS) {
    test(`level ${def.id} '${def.title}' is solver-solvable, par matches, quality floors hold`, () => {
      const state = parseLevel(def)
      const result = solve(state)
      expect(result.status).toBe('solved')
      const length = result.solution?.length ?? 0
      if (length !== def.par) {
        throw new Error(
          `level ${def.id}: stored par ${def.par} !== solver length ${length} (nodes ${result.nodesExpanded}) — update par to ${length}`,
        )
      }

      nodesByLevelId.set(def.id, result.nodesExpanded)

      const floors = PHASE_OPENER_IDS.includes(def.id)
        ? OPENER_FLOORS
        : PHASE_FLOORS[phaseOf(def.id)] ?? OPENER_FLOORS
      const detour = def.par / manhattanToNearestExit(state)
      if (result.nodesExpanded < floors.nodes) {
        throw new Error(
          `level ${def.id}: only ${result.nodesExpanded} solver nodes (floor ${floors.nodes}) — the route is too forced; add real decisions`,
        )
      }
      if (detour < floors.detour) {
        throw new Error(
          `level ${def.id}: detour factor ${detour.toFixed(2)} (floor ${floors.detour}) — the exit is too direct; add required detours`,
        )
      }
    })
  }

  for (const def of LEVELS.filter((level) => level.grid.some((row) => row.includes('S')))) {
    test(`level ${def.id} '${def.title}' socket is a physical chokepoint (no bypass)`, () => {
      expect(exitReachableWithSocketsSealed(parseLevel(def))).toBe(false)
    })
  }

  for (let phase = 1; phase * 5 <= LEVELS.length; phase++) {
    test(`phase ${phase} capstone carries the phase's difficulty`, () => {
      const capstoneId = phase * 5
      const capstoneNodes = nodesByLevelId.get(capstoneId) ?? 0
      const phaseMax = Math.max(
        ...Array.from({ length: 4 }, (_, index) => nodesByLevelId.get(phase * 5 - 4 + index) ?? 0),
      )
      expect(capstoneNodes).toBeGreaterThanOrEqual(phaseMax * CAPSTONE_DOMINANCE)
    })
  }
})
