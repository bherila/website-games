import { TUNING } from '../../gameTypes'
import { stepEngine } from '../engine'
import { buildScenario } from '../scenarios'
import { populationOf } from '../stars'

interface SoakSummary {
  clock: string
  funds: number
  population: number
  peakPeople: number
  rngState: number
  settlements: number
  meanStepMs: number
}

function runNiagaraSoak(seed: number): SoakSummary {
  const state = buildScenario('niagara', seed)
  expect(state.mapId).toBe('niagara-falls')

  stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0)
  const endDay = state.clock.day + 30
  let peakPeople = state.people.length
  let settlements = 0
  let elapsedMs = 0
  let chunks = 0

  while (state.clock.day < endDay) {
    const before = performance.now()
    const events = stepEngine(state, [], 5)
    elapsedMs += performance.now() - before
    chunks += 1
    settlements += events.filter((event) => event.type === 'settlement').length
    peakPeople = Math.max(peakPeople, state.people.length)
  }

  return {
    clock: `${state.clock.day}/${state.clock.minute.toFixed(4)}`,
    funds: state.funds,
    population: populationOf(state),
    peakPeople,
    rngState: state.rng.state(),
    settlements,
    meanStepMs: elapsedMs / chunks,
  }
}

describe('Niagara Falls 30-day soak', () => {
  it('stays solvent and bounded while replaying deterministically', () => {
    const first = runNiagaraSoak(1676)
    const second = runNiagaraSoak(1676)

    expect({ ...second, meanStepMs: 0 }).toEqual({ ...first, meanStepMs: 0 })
    expect(first.funds).toBeGreaterThan(0)
    expect(first.population).toBeGreaterThan(20)
    expect(first.peakPeople).toBeGreaterThan(10)
    expect(first.peakPeople).toBeLessThanOrEqual(TUNING.people.maxActive)
    expect(first.settlements).toBeGreaterThanOrEqual(29)
    expect(first.meanStepMs).toBeLessThan(50)
  }, 600_000)
})
