import { stepEngine } from '../engine'
import { buildScenario } from '../scenarios'
import { populationOf } from '../stars'

function digestEvents(eventLog: string[]): string {
  let hash = 2_166_136_261
  for (const character of eventLog.join('\n')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function fixedSeedFingerprint(seed: number) {
  const state = buildScenario('niagara', seed)
  const eventLog: string[] = []

  for (let step = 0; step < 900; step += 1) {
    const commands = step === 0 ? [{ type: 'setSpeed' as const, speed: 4 as const }] : []
    const events = stepEngine(state, commands, 1 / 30)
    if (events.length > 0) {
      eventLog.push(`${step}:${JSON.stringify(events)}`)
    }
  }

  return {
    mapId: state.mapId,
    clock: `${state.clock.day}/${state.clock.minute.toFixed(4)}`,
    funds: state.funds,
    population: populationOf(state),
    people: state.people.length,
    rngState: state.rng.state(),
    structureVersion: state.structureVersion,
    eventDigest: digestEvents(eventLog),
  }
}

describe('Niagara Falls fixed-seed golden run', () => {
  it('replays identically and matches the committed fingerprint', () => {
    const first = fixedSeedFingerprint(1676)
    const second = fixedSeedFingerprint(1676)

    expect(second).toEqual(first)
    expect(first).toEqual({
      mapId: 'niagara-falls',
      clock: '3/660.0000',
      funds: 1268917.5,
      population: 100,
      people: 0,
      rngState: 194241358,
      structureVersion: 73,
      eventDigest: '2a5280f9',
    })
  })
})
