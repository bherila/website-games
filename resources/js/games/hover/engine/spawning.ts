import type { Flag, GridPos, Pod, PodKind, Trap } from '../gameTypes'
import { flagCountForCycle, podCountForCycle, trapCountForCycle } from '../gameTypes'
import type { MapDef } from '../maps/mapTypes'
import { cellCenter } from '../maps/mapTypes'
import { cellKey, floorCells, gridDistance } from './grid'
import { reachableCells } from './pathfinding'
import type { Rng } from './rng'
import { pickWeighted, randomInt } from './rng'

const SPAWN_CLEARANCE_CELLS = 4
const FLAG_SPACING_CELLS = 5
const POD_SPACING_CELLS = 2
const TRAP_SPACING_CELLS = 3
const ATTEMPTS_PER_RELAXATION = 200

const POD_WEIGHTS: ReadonlyArray<{ value: PodKind; weight: number }> = [
  { value: 'speedUp', weight: 40 },
  { value: 'jump', weight: 35 },
  { value: 'slowDown', weight: 25 },
]

export interface SpawnedRound {
  flags: Flag[]
  pods: Pod[]
  traps: Trap[]
}

/**
 * Places an equal number of blue and red flags plus powerup pods on random
 * floor cells that are ground-reachable from the player spawn (the maps
 * tests guarantee both spawns share one component), keeping everything a
 * minimum distance from spawns and from each other. Spacing constraints are
 * progressively relaxed so cramped maps can never spin forever.
 */
export function spawnRound(map: MapDef, cycle: number, rng: Rng): SpawnedRound {
  const reachable = reachableCells(map, map.playerSpawn)
  const arrowCells = new Set(map.arrowPads.map((pad) => cellKey(pad.cell)))
  const candidates = floorCells(map).filter(
    (cell) =>
      reachable.has(cellKey(cell)) &&
      !arrowCells.has(cellKey(cell)) &&
      gridDistance(cell, map.playerSpawn) >= SPAWN_CLEARANCE_CELLS &&
      gridDistance(cell, map.enemySpawn) >= SPAWN_CLEARANCE_CELLS,
  )

  const flagCount = flagCountForCycle(cycle)
  const podCount = podCountForCycle(cycle)
  const taken: GridPos[] = []

  const flags: Flag[] = []
  for (let i = 0; i < flagCount * 2; i++) {
    const cell = pickCell(candidates, taken, FLAG_SPACING_CELLS, rng)
    taken.push(cell)
    flags.push({
      id: i,
      team: i % 2 === 0 ? 'blue' : 'red',
      cell,
      pos: cellCenter(map, cell),
      collected: false,
    })
  }

  const pods: Pod[] = []
  for (let i = 0; i < podCount; i++) {
    const cell = pickCell(candidates, taken, POD_SPACING_CELLS, rng)
    taken.push(cell)
    pods.push({
      id: i,
      kind: pickWeighted(rng, POD_WEIGHTS),
      cell,
      pos: cellCenter(map, cell),
      active: true,
      respawnSec: 0,
    })
  }

  const traps: Trap[] = []
  const flagKeys = flags.map((flag) => cellKey(flag.cell))
  for (let i = 0; i < trapCountForCycle(cycle); i++) {
    const cell = pickTrapCell(map, candidates, taken, traps, flagKeys, rng)
    if (!cell) {
      break
    }
    taken.push(cell)
    traps.push({ id: traps.length, cell, pos: cellCenter(map, cell) })
  }

  return { flags, pods, traps }
}

const TRAP_PLACEMENT_ATTEMPTS = 40

/**
 * Picks a trap cell that keeps every flag reachable from BOTH spawns with
 * all traps treated as blocked — the drone routes around traps, so a trap
 * on a sole-access choke (e.g. a keep's only ground door) would strand its
 * flags and break the AI. Returns null when no safe cell is found (fewer
 * traps beat a broken round).
 */
function pickTrapCell(
  map: MapDef,
  candidates: readonly GridPos[],
  taken: readonly GridPos[],
  traps: readonly Trap[],
  flagKeys: readonly string[],
  rng: Rng,
): GridPos | null {
  for (let attempt = 0; attempt < TRAP_PLACEMENT_ATTEMPTS; attempt++) {
    const cell = pickCell(candidates, taken, TRAP_SPACING_CELLS, rng)
    const blocked = new Set([...traps.map((trap) => cellKey(trap.cell)), cellKey(cell)])
    const fromPlayer = reachableCells(map, map.playerSpawn, { blocked })
    const fromEnemy = reachableCells(map, map.enemySpawn, { blocked })
    if (flagKeys.every((key) => fromPlayer.has(key) && fromEnemy.has(key))) {
      return cell
    }
  }
  return null
}

function pickCell(candidates: readonly GridPos[], taken: readonly GridPos[], spacing: number, rng: Rng): GridPos {
  if (candidates.length === 0) {
    throw new Error('spawnRound: map has no candidate cells')
  }

  for (let minSpacing = spacing; minSpacing >= 1; minSpacing--) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_RELAXATION; attempt++) {
      const cell = candidates[randomInt(rng, candidates.length)]
      if (!cell) {
        continue
      }
      const tooClose = taken.some((existing) => gridDistance(existing, cell) < minSpacing)
      if (!tooClose) {
        return cell
      }
    }
  }

  const untaken = candidates.filter((cell) => !taken.some((existing) => existing.col === cell.col && existing.row === cell.row))
  // When every candidate is taken (pathological tiny map), stacking entities
  // on a shared cell beats failing the round; real maps never get here.
  const fallback = untaken[randomInt(rng, untaken.length)] ?? candidates[randomInt(rng, candidates.length)]
  if (!fallback) {
    throw new Error('spawnRound: could not place entity even with relaxed spacing')
  }
  return fallback
}
