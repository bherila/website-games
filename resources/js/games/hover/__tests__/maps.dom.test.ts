import { canStep, MAX_DRIVE_CLIMB, MAX_JUMP_CLIMB } from '../engine/pathfinding'
import { mapForRound, MAPS, TOTAL_LEVELS } from '../maps/maps'
import type { MapDef } from '../maps/mapTypes'
import { cellKindAt } from '../maps/mapTypes'

/**
 * BFS over the walkable surface graph using the engine's own traversal rule
 * (edge-height aware: ramps enterable only via their ends, climbs capped,
 * descents free) so these invariants stay in lockstep with pathfinding.
 */
function reachableCells(map: MapDef, start: { col: number; row: number }, maxClimb: number): Set<string> {
  const key = (col: number, row: number): string => `${col},${row}`
  const seen = new Set<string>([key(start.col, start.row)])
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
      if (seen.has(key(col, row)) || !canStep(map, cell, col, row, maxClimb)) {
        continue
      }
      seen.add(key(col, row))
      queue.push({ col, row })
    }
  }

  return seen
}

const DRIVE_CLIMB = MAX_DRIVE_CLIMB
const JUMP_CLIMB = MAX_JUMP_CLIMB

function cellsOfKinds(map: MapDef, kinds: ReadonlyArray<ReturnType<typeof cellKindAt>>): Array<{ col: number; row: number }> {
  const cells: Array<{ col: number; row: number }> = []
  for (let row = 0; row < map.rows.length; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (kinds.includes(cellKindAt(map, col, row))) {
        cells.push({ col, row })
      }
    }
  }
  return cells
}

describe('hover maps', () => {
  test('ships exactly the advertised number of maps with unique ids', () => {
    expect(TOTAL_LEVELS).toBe(7)
    expect(MAPS).toHaveLength(TOTAL_LEVELS)
    expect(new Set(MAPS.map((map) => map.id)).size).toBe(MAPS.length)
  })

  test('mapForRound cycles through the maps', () => {
    expect(mapForRound(0).id).toBe('castle')
    expect(mapForRound(1).id).toBe('city')
    expect(mapForRound(2).id).toBe('sewer')
    expect(mapForRound(3).id).toBe('neon')
    expect(mapForRound(4).id).toBe('glacier')
    expect(mapForRound(5).id).toBe('garden')
    expect(mapForRound(6).id).toBe('temple')
    expect(mapForRound(7).id).toBe('castle')
    expect(mapForRound(11).id).toBe('glacier')
  })

  test.each(MAPS.map((map) => [map.id, map] as const))('%s: border is sealed with high walls', (_id, map) => {
    const lastRow = map.rows.length - 1
    for (let col = 0; col < map.cols; col++) {
      expect(cellKindAt(map, col, 0)).toBe('wallHigh')
      expect(cellKindAt(map, col, lastRow)).toBe('wallHigh')
    }
    for (let row = 0; row < map.rows.length; row++) {
      expect(cellKindAt(map, 0, row)).toBe('wallHigh')
      expect(cellKindAt(map, map.cols - 1, row)).toBe('wallHigh')
    }
  })

  test.each(MAPS.map((map) => [map.id, map] as const))('%s: spawns are distinct floor cells', (_id, map) => {
    expect(cellKindAt(map, map.playerSpawn.col, map.playerSpawn.row)).toBe('floor')
    expect(cellKindAt(map, map.enemySpawn.col, map.enemySpawn.row)).toBe('floor')
    expect(map.playerSpawn).not.toEqual(map.enemySpawn)
  })

  test.each(MAPS.map((map) => [map.id, map] as const))(
    '%s: every floor cell is drivable from both spawns without jumping',
    (_id, map) => {
      const floors = cellsOfKinds(map, ['floor'])
      // Directed traversal (one-way drops) means player-side reachability no
      // longer implies drone-side reachability — check both spawns.
      for (const spawn of [map.playerSpawn, map.enemySpawn]) {
        const reached = reachableCells(map, spawn, DRIVE_CLIMB)
        const unreachable = floors.filter((cell) => !reached.has(`${cell.col},${cell.row}`))
        expect(unreachable).toEqual([])
      }
    },
  )

  test.each(MAPS.map((map) => [map.id, map] as const))(
    '%s: every platform and ramp is reachable with jump power',
    (_id, map) => {
      const walkable = cellsOfKinds(map, ['floor', 'platform', 'ramp'])
      const withJump = reachableCells(map, map.playerSpawn, JUMP_CLIMB)
      const unreachable = walkable.filter((cell) => !withJump.has(`${cell.col},${cell.row}`))
      expect(unreachable).toEqual([])
    },
  )

  test.each(MAPS.map((map) => [map.id, map] as const))('%s: has jumpable low walls', (_id, map) => {
    const lowWallCount = map.rows.join('').split('').filter((ch) => ch === '-').length
    expect(lowWallCount).toBeGreaterThan(0)
  })

  test.each(MAPS.map((map) => [map.id, map] as const))('%s: arrow pads sit on distinct floor cells', (_id, map) => {
    const keys = new Set(map.arrowPads.map((pad) => `${pad.cell.col},${pad.cell.row}`))
    expect(keys.size).toBe(map.arrowPads.length)
    for (const pad of map.arrowPads) {
      expect(cellKindAt(map, pad.cell.col, pad.cell.row)).toBe('floor')
    }
  })

  test('castle carries the homage furniture: arrow circuit, ramparts, ramps', () => {
    const castle = MAPS[0]
    if (!castle) {
      throw new Error('missing castle map')
    }
    expect(castle.arrowPads.map((pad) => pad.dir).sort()).toEqual(['east', 'north', 'south', 'west'])
    expect(cellsOfKinds(castle, ['platform']).length).toBeGreaterThan(20)
    expect(cellsOfKinds(castle, ['ramp']).length).toBeGreaterThanOrEqual(8)
  })

  test('neon center platform requires jump power (not drivable)', () => {
    const neon = MAPS[3]
    if (!neon) {
      throw new Error('missing neon map')
    }
    const platforms = cellsOfKinds(neon, ['platform'])
    expect(platforms.length).toBeGreaterThan(0)
    const drivable = reachableCells(neon, neon.playerSpawn, DRIVE_CLIMB)
    for (const cell of platforms) {
      expect(drivable.has(`${cell.col},${cell.row}`)).toBe(false)
    }
  })

  test('glacier floe platform is drivable via its ramp', () => {
    const glacier = MAPS[4]
    if (!glacier) {
      throw new Error('missing glacier map')
    }
    const platforms = cellsOfKinds(glacier, ['platform'])
    expect(platforms.length).toBeGreaterThan(0)
    const drivable = reachableCells(glacier, glacier.playerSpawn, DRIVE_CLIMB)
    for (const cell of platforms) {
      expect(drivable.has(`${cell.col},${cell.row}`)).toBe(true)
    }
  })
})
