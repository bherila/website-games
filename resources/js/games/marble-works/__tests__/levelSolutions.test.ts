import { LEVELS } from '../levels/levels'
import { RUN_TIMEOUT_S } from '../physics/constants'
import { simulateRun } from '../physics/runWorld'
import { renderBoardAscii } from './boardAscii'

/**
 * The physics is deterministic (fixed 1/240 s steps, no randomness), so a headless run
 * proves exactly what a player sees: every level's reference solution lands the marble in
 * the basket, and no level solves itself with an empty board.
 */
describe.each(LEVELS.map((level) => [level.id, level] as const))('level %i', (_id, level) => {
  it('is solved by its reference solution', () => {
    const result = simulateRun(level, level.solution)
    const picture = `\n${renderBoardAscii(level, level.solution, result.path)}`

    expect({ status: result.status, picture }).toEqual({ status: 'won', picture })
    expect(result.elapsed).toBeLessThan(RUN_TIMEOUT_S)
  })

  it('is not solved with an empty board', () => {
    const result = simulateRun(level, [])

    expect(result.status).not.toBe('won')
  })

  it('is deterministic', () => {
    const first = simulateRun(level, level.solution)
    const second = simulateRun(level, level.solution)

    expect(second.path).toEqual(first.path)
  })
})
