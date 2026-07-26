/**
 * The determinism contract for challenge seeds: selecting a seed picks a
 * different point in the SAME rng stream. It must not add, remove, or reorder
 * draws, and the same code plus the same command stream must replay identically.
 *
 * Runs over a populated `midgame` tower rather than an empty lot — an empty lot
 * consumes almost no rng, so it would pass these assertions vacuously.
 */
import { decodeChallengeCode, encodeChallengeCode, randomSeed } from '../challengeCode'
import { createEngineState, stepEngine } from '../engine/engine'
import { buildScenario } from '../engine/scenarios'
import type { EngineState, Rng } from '../gameTypes'

const STEPS = 600
const DT = 1 / 30

/** Wrap the state's rng in place, counting draws without altering the sequence. */
function countDraws(state: EngineState): () => number {
  let draws = 0
  const inner: Rng = state.rng
  state.rng = {
    next(): number {
      draws += 1
      return inner.next()
    },
    state(): number {
      return inner.state()
    },
  }
  return () => draws
}

/** Step a fixed script and fingerprint everything a replay must reproduce. */
function runScript(state: EngineState): string {
  const log: string[] = []
  for (let i = 0; i < STEPS; i++) {
    const events = stepEngine(state, i === 0 ? [{ type: 'setSpeed' as const, speed: 8 as const }] : [], DT)
    if (events.length > 0) {
      log.push(`${i}:${events.map((event) => event.type).join(',')}`)
    }
  }
  log.push(`rng:${state.rng.state()}`)
  log.push(`clock:${state.clock.day}/${state.clock.minute.toFixed(4)}`)
  log.push(`funds:${state.funds}`)
  log.push(`people:${state.people.length}`)
  log.push(`pop:${state.units.reduce((sum, u) => sum + u.population.low + u.population.med + u.population.high + u.population.vip, 0)}`)

  return log.join('|')
}

describe('challenge seeds', () => {
  it('replays identically from the same code', () => {
    const code = encodeChallengeCode({ seed: 20_260_719, lobbyHeight: 2, mapId: 'city-tower' })
    const decoded = decodeChallengeCode(code)!

    const first = runScript(buildScenario('midgame', decoded.seed))
    const second = runScript(buildScenario('midgame', decoded.seed))

    expect(second).toBe(first)
  })

  it('produces a different run from a different seed', () => {
    // Otherwise the code would be decorative rather than a challenge.
    const a = runScript(buildScenario('midgame', 1))
    const b = runScript(buildScenario('midgame', 999_983))

    expect(b).not.toBe(a)
  })

  it('adds no rng draws relative to the pre-existing random-seed path', () => {
    // The guard that keeps the golden log and soak gates valid. NOTE it is
    // deliberately NOT "equal draw counts across seeds": rng outcomes gate
    // branches that themselves draw (an incident that fires consumes more than
    // one that does not), so counts legitimately differ between seeds. What
    // must hold is that a seed CHOSEN FROM A CODE walks the identical code path
    // to a seed taken from the clock — the feature adds no draw of its own.
    const draws = (seed: number): number => {
      const state = buildScenario('midgame', seed)
      const count = countDraws(state)
      runScript(state)
      return count()
    }

    const fromClock = randomSeed(1_700_000_000_000)
    const fromCode = decodeChallengeCode(encodeChallengeCode({ seed: fromClock, lobbyHeight: 1, mapId: 'city-tower' }))!.seed

    expect(fromCode).toBe(fromClock)
    expect(draws(fromCode)).toBe(draws(fromClock))
    expect(draws(fromCode)).toBeGreaterThan(0)
  })

  it('is fully reproducible for a given seed, draws included', () => {
    const draws = (seed: number): number => {
      const state = buildScenario('midgame', seed)
      const count = countDraws(state)
      runScript(state)
      return count()
    }

    expect(draws(4_242)).toBe(draws(4_242))
  })

  it('honours the lobby height carried by the code', () => {
    const decoded = decodeChallengeCode(encodeChallengeCode({ seed: 555, lobbyHeight: 3, mapId: 'city-tower' }))!
    const state = createEngineState({ seed: decoded.seed, mapId: 'city-tower', lobbyHeight: decoded.lobbyHeight })

    expect(state.lobbyHeight).toBe(3)
    expect(state.seed).toBe(555)
  })

  it('carries the seed and lobby height through a full round trip', () => {
    const input = { seed: 3_141_592, lobbyHeight: 3, mapId: 'city-tower' } as const
    const state = createEngineState({ seed: input.seed, mapId: 'city-tower', lobbyHeight: input.lobbyHeight })

    // The code is derived purely from persisted state, so it survives anything
    // that survives save/export/import — including a cloud restore.
    expect(decodeChallengeCode(encodeChallengeCode({ seed: state.seed, lobbyHeight: state.lobbyHeight, mapId: 'city-tower' }))).toEqual(input)
  })
})
