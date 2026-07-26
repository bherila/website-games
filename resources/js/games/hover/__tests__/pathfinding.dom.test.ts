import { cellKey } from '../engine/grid'
import { findPath, reachableCells } from '../engine/pathfinding'
import { corridorMap, openMap } from './fixtures'

describe('hover pathfinding', () => {
  test('reachableCells covers every floor cell of a connected map', () => {
    const reachable = reachableCells(openMap, openMap.playerSpawn)
    let floorCount = 0
    for (const row of openMap.rows) {
      for (const ch of row) {
        if (ch === '.') {
          floorCount += 1
        }
      }
    }
    expect(reachable.size).toBe(floorCount)
    expect(reachable.has(`${openMap.enemySpawn.col},${openMap.enemySpawn.row}`)).toBe(true)
  })

  test('reachableCells from a wall cell is empty', () => {
    expect(reachableCells(openMap, { col: 0, row: 0 }).size).toBe(0)
  })

  test('low walls block ground reachability', () => {
    const reachable = reachableCells(openMap, openMap.playerSpawn)
    expect(reachable.has('4,3')).toBe(false)
  })

  test('findPath detours around the high wall in the corridor map', () => {
    const path = findPath(corridorMap, corridorMap.playerSpawn, corridorMap.enemySpawn)
    expect(path).not.toBeNull()
    if (!path) {
      return
    }

    expect(path[0]).toEqual(corridorMap.playerSpawn)
    expect(path[path.length - 1]).toEqual(corridorMap.enemySpawn)
    expect(path.some((cell) => cell.row === 4)).toBe(true)

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]
      const next = path[i]
      if (!prev || !next) {
        throw new Error('sparse path')
      }
      expect(Math.abs(prev.col - next.col) + Math.abs(prev.row - next.row)).toBe(1)
    }
  })

  test('findPath returns the optimal length on an open field', () => {
    const path = findPath(openMap, { col: 1, row: 1 }, { col: 6, row: 4 })
    expect(path).not.toBeNull()
    expect(path).toHaveLength(1 + 5 + 3)
  })

  test('findPath is null to or from wall cells', () => {
    expect(findPath(openMap, openMap.playerSpawn, { col: 0, row: 0 })).toBeNull()
    expect(findPath(openMap, { col: 0, row: 0 }, openMap.playerSpawn)).toBeNull()
  })

  test('findPath detours around a blocked interior cell', () => {
    const start = { col: 2, row: 1 }
    const goal = { col: 2, row: 3 }
    const directPath = findPath(openMap, start, goal)
    expect(directPath).toHaveLength(3)

    const blocked = new Set([cellKey({ col: 2, row: 2 })])
    const path = findPath(openMap, start, goal, blocked)

    expect(path).not.toBeNull()
    if (!path) {
      return
    }
    expect(path[0]).toEqual(start)
    expect(path[path.length - 1]).toEqual(goal)
    expect(path.some((cell) => cell.col === 2 && cell.row === 2)).toBe(false)
    expect(path.length).toBeGreaterThan(directPath?.length ?? 0)
  })

  test('findPath returns null when the goal itself is blocked', () => {
    const blocked = new Set([cellKey(openMap.enemySpawn)])
    expect(findPath(openMap, openMap.playerSpawn, openMap.enemySpawn, blocked)).toBeNull()
  })
})
