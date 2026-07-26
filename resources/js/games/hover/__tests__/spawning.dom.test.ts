import { cellKey, gridDistance } from '../engine/grid'
import { reachableCells } from '../engine/pathfinding'
import { createRng } from '../engine/rng'
import { spawnRound } from '../engine/spawning'
import { flagCountForCycle, podCountForCycle, trapCountForCycle } from '../gameTypes'
import { MAPS } from '../maps/maps'
import { openMap } from './fixtures'

describe('hover spawning', () => {
  test('is deterministic for a fixed seed', () => {
    const a = spawnRound(openMap, 1, createRng(1234))
    const b = spawnRound(openMap, 1, createRng(1234))
    expect(a).toEqual(b)
  })

  test('different seeds produce different layouts', () => {
    const a = spawnRound(openMap, 1, createRng(1))
    const b = spawnRound(openMap, 1, createRng(2))
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b))
  })

  test.each(MAPS.map((map) => [map.id, map] as const))(
    '%s: spawns the right counts, all reachable, away from spawns',
    (_id, map) => {
      for (const cycle of [1, 2, 5]) {
        const rng = createRng(42 + cycle)
        const { flags, pods, traps } = spawnRound(map, cycle, rng)
        const reachable = reachableCells(map, map.playerSpawn)

        expect(flags.filter((flag) => flag.team === 'blue')).toHaveLength(flagCountForCycle(cycle))
        expect(flags.filter((flag) => flag.team === 'red')).toHaveLength(flagCountForCycle(cycle))
        expect(pods).toHaveLength(podCountForCycle(cycle))
        expect(traps).toHaveLength(trapCountForCycle(cycle))

        for (const entity of [...flags, ...pods, ...traps]) {
          expect(reachable.has(cellKey(entity.cell))).toBe(true)
          expect(gridDistance(entity.cell, map.playerSpawn)).toBeGreaterThanOrEqual(4)
          expect(gridDistance(entity.cell, map.enemySpawn)).toBeGreaterThanOrEqual(4)
        }
      }
    },
  )

  test('castle: traps do not share a cell with flags or pods', () => {
    const castle = MAPS[0]
    if (!castle) {
      throw new Error('missing castle map')
    }
    const { flags, pods, traps } = spawnRound(castle, 1, createRng(7))
    const takenKeys = new Set([...flags, ...pods].map((entity) => cellKey(entity.cell)))

    expect(traps.length).toBeGreaterThan(0)
    for (const trap of traps) {
      expect(takenKeys.has(cellKey(trap.cell))).toBe(false)
    }
  })

  test('flag counts scale with cycle and cap at 9', () => {
    expect(flagCountForCycle(1)).toBe(3)
    expect(flagCountForCycle(2)).toBe(4)
    expect(flagCountForCycle(7)).toBe(9)
    expect(flagCountForCycle(50)).toBe(9)
  })

  test('keeps placements on distinct cells when the map has room', () => {
    const castle = MAPS[0]
    if (!castle) {
      throw new Error('missing castle map')
    }
    const { flags, pods } = spawnRound(castle, 9, createRng(7))
    const keys = new Set([...flags, ...pods].map((entity) => cellKey(entity.cell)))
    expect(keys.size).toBe(flags.length + pods.length)
  })

  test('relaxes spacing instead of failing on a cramped map', () => {
    const { flags, pods } = spawnRound(openMap, 9, createRng(7))
    expect(flags).toHaveLength(18)
    expect(pods).toHaveLength(8)
  })
})
