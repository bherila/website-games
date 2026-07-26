import { makeTestState } from '../../engine/__tests__/testState'
import { stepEngine } from '../../engine/engine'
import type { DirectionPriority, EngineState, Shaft, ShaftProgram } from '../../gameTypes'
import { defaultShaftProgram, TUNING } from '../../gameTypes'
import { programForPreset, sparseStopsWarning } from '../shaftProgramPresets'

const PRIORITIES: readonly DirectionPriority[] = ['balanced', 'expressToTop', 'expressToBottom']

function makeShaft(overrides: Partial<Shaft> = {}): Shaft {
  return {
    id: 12,
    kind: 'standard',
    x: 20,
    bottomFloor: 0,
    topFloor: 24,
    stops: [0, 4, 8, 12, 16, 20, 24],
    enabledStops: [0, 8, 16, 24],
    cars: [{ index: 0, y: 0, dir: 0, state: 'idle', doorTimer: 0, homeFloor: null, passengerIds: [] }],
    program: defaultShaftProgram(),
    stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
    ...overrides,
  }
}

function assertValidProgram(program: ShaftProgram): void {
  for (const slots of [program.weekday, program.weekend]) {
    expect(PRIORITIES).toContain(slots.morningRush)
    expect(PRIORITIES).toContain(slots.daytime)
    expect(PRIORITIES).toContain(slots.eveningRush)
    expect(PRIORITIES).toContain(slots.night)
  }
  expect(program.idleAnswerThreshold).toBeGreaterThanOrEqual(0)
  expect(program.idleAnswerThreshold).toBeLessThanOrEqual(TUNING.elevators.idleAnswerMax)
  expect(program.doorDwellSec).toBeGreaterThanOrEqual(0)
  expect(program.doorDwellSec).toBeLessThanOrEqual(TUNING.elevators.doorDwellMaxSec)
}

function applyProgram(state: EngineState, shaft: Shaft, program: ShaftProgram): void {
  state.shafts.push(shaft)
  stepEngine(state, [{ type: 'setShaftProgram', shaftId: shaft.id, program }], 0)
}

describe('shaft program presets', () => {
  it('builds documented preset values accepted by the existing setShaftProgram command', () => {
    const expected = {
      rush: {
        ...defaultShaftProgram(),
        weekday: { ...defaultShaftProgram().weekday, morningRush: 'expressToTop', eveningRush: 'expressToBottom' },
      },
      balanced: defaultShaftProgram(),
      offHoursLobby: {
        ...defaultShaftProgram(),
        weekday: { ...defaultShaftProgram().weekday, night: 'expressToBottom' },
        weekend: { ...defaultShaftProgram().weekend, night: 'expressToBottom' },
      },
    } satisfies Record<ReturnType<typeof presetIds>[number], ShaftProgram>

    for (const id of presetIds()) {
      const program = programForPreset(id)
      assertValidProgram(program)
      expect(program).toEqual(expected[id])

      const state = makeTestState()
      const shaft = makeShaft()
      applyProgram(state, shaft, program)
      expect(state.shafts[0]?.program).toEqual(program)
    }
  })

  it('warns when enabled stops are sparse at threshold edges', () => {
    expect(sparseStopsWarning(makeShaft({ enabledStops: [0, 8, 16, 24] }))).toBeNull()
    expect(sparseStopsWarning(makeShaft({ enabledStops: [0, 12, 24] }))).toContain('Only 3 stops')
  })

  it('caps express shaft stop recommendations at maxStops', () => {
    const stops = [0, 10, 20, 30, 40, 50, 60, 70, 79]
    expect(sparseStopsWarning(makeShaft({ kind: 'express', topFloor: 79, stops, enabledStops: [0, 20, 40, 60, 79] }))).toBeNull()
    expect(sparseStopsWarning(makeShaft({ kind: 'express', topFloor: 79, stops, enabledStops: [0, 20, 40, 79] }))).toContain(
      'Only 4 stops',
    )
  })
})

function presetIds(): Array<'rush' | 'balanced' | 'offHoursLobby'> {
  return ['rush', 'balanced', 'offHoursLobby']
}
