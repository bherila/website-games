import { createSolver, exitReachableWithSocketsSealed, solve } from '../engine/solver'
import type { ChicksLevelDef } from '../levels/levelTypes'
import { parseLevel } from '../levels/parseLevel'

function level(grid: readonly string[], extra: Partial<ChicksLevelDef> = {}): ReturnType<typeof parseLevel> {
  return parseLevel({ id: 99, title: 'fixture', par: 1, grid, ...extra })
}

describe('solver', () => {
  test('solves a straight corridor in the minimum number of moves', () => {
    const result = solve(level(['#####', '#@.E#', '#####']))
    expect(result.status).toBe('solved')
    expect(result.solution).toBe('RR')
  })

  test('solves chips + socket ordering', () => {
    const result = solve(level(['#######', '#@cS.E#', '#######']))
    expect(result.status).toBe('solved')
    expect(result.solution?.length).toBe(4)
  })

  test('solves a block-into-water bridge', () => {
    const result = solve(level(['######', '#@X~E#', '######']))
    expect(result.status).toBe('solved')
    expect(result.solution?.length).toBe(3)
  })

  test('uses waits to dodge a deterministic monster', () => {
    const state = level(
      ['######', '#.O..#', '#@.E.#', '#....#', '#....#', '######'],
      { facingOverrides: { '2,1': 'down' } },
    )
    const result = solve(state)
    expect(result.status).toBe('solved')
    expect(result.solution).toContain('W')
  })

  test('reports unsolvable when the exit is walled off', () => {
    const result = solve(level(['######', '#@.#E#', '######']))
    expect(result.status).toBe('unsolvable')
    expect(result.solution).toBeNull()
  })

  test('reports unsolvable after an irreversible softlock (block in corner)', () => {
    const solvable = level(['#####', '#@X.#', '#..E#', '#####'])
    expect(solve(solvable).status).toBe('solved')

    const softlocked = level(['#####', '#.X.#', '#@#E#', '#####'])
    expect(solve(softlocked).status).toBe('unsolvable')
  })

  test('honors the node budget', () => {
    const state = level(['#########', '#@......#', '#.......#', '#......E#', '#########'])
    const result = solve(state, { maxNodes: 2 })
    expect(result.status).toBe('budget')
  })

  test('stepping solver pauses and resumes deterministically', () => {
    const state = level(['#######', '#@...E#', '#######'])
    const solver = createSolver(state)
    let status = solver.step(1)
    while (status === 'running') {
      status = solver.step(1)
    }
    expect(status).toBe('solved')
    expect(solver.result().solution).toBe(solve(state).solution)
  })

  test('sealed-socket reachability flags bypassable sockets', () => {
    const bypassable = level(['#######', '#@cS.E#', '#....E#', '#######'])
    expect(exitReachableWithSocketsSealed(bypassable)).toBe(true)

    const chokepoint = level(['#######', '#@cS.E#', '#######'])
    expect(exitReachableWithSocketsSealed(chokepoint)).toBe(false)
  })

  test('sealed check ignores doors and water (relaxed reachability)', () => {
    const throughDoor = level(['#######', '#@cSRE#', '#######'], {})
    expect(exitReachableWithSocketsSealed(throughDoor)).toBe(false)

    const aroundViaWater = level(['#######', '#@cS.E#', '#~~~~E#', '#######'])
    expect(exitReachableWithSocketsSealed(aroundViaWater)).toBe(true)
  })
})
