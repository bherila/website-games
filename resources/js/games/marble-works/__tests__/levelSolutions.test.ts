import { LEVELS } from '../levels/levels'
import { simulateRun } from '../physics/runWorld'
import { renderBoardAscii } from './boardAscii'

/**
 * The physics is deterministic (fixed 1/240 s steps, no randomness), so a headless run
 * proves exactly what a player sees: every level's reference solution brings every marble
 * home and collects every gem within par — a real three-star build — and no level solves
 * itself with an empty board.
 */
describe.each(LEVELS.map((level) => [level.id, level] as const))('level %i', (_id, level) => {
  it('is solved with three stars by its reference solution', () => {
    const result = simulateRun(level, level.solution)
    const picture = `\n${renderBoardAscii(level, level.solution, result.paths)}`

    expect({ status: result.status, gems: result.gems, picture }).toEqual({ status: 'won', gems: level.gems.length, picture })
    expect(level.solution.length).toBeLessThanOrEqual(level.par)
  })

  it('is not solved with an empty board', () => {
    expect(simulateRun(level, []).status).not.toBe('won')
  })

  it('is deterministic', () => {
    const first = simulateRun(level, level.solution)
    const second = simulateRun(level, level.solution)

    expect(second.paths).toEqual(first.paths)
  })
})
