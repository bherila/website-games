import { defaultShaftProgram, type Shaft } from '../../gameTypes'
import { ELEVATOR_CROWDED_WAIT_MIN, shaftIssues } from '../shaftIssues'

function shaft(overrides: Partial<Shaft> = {}): Shaft {
  return {
    id: 1,
    kind: 'standard',
    x: 4,
    bottomFloor: 0,
    topFloor: 8,
    stops: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    enabledStops: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    cars: [{ index: 0, y: 0, dir: 0, state: 'idle', doorTimer: 0, homeFloor: null, passengerIds: [] }],
    program: defaultShaftProgram(),
    stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
    ...overrides,
  }
}

describe('shaftIssues', () => {
  it('keeps healthy and idle shafts out of diagnostics', () => {
    expect(shaftIssues(shaft())).toEqual([])
  })

  it('reports unusable service and absent capacity as critical', () => {
    const issues = shaftIssues(shaft({ cars: [], enabledStops: [0] }))
    expect(issues.map((issue) => [issue.key, issue.severity])).toEqual([
      ['noCars', 'critical'],
      ['noService', 'critical'],
    ])
  })

  it('reuses patience and vacancy thresholds for warning and critical waits', () => {
    expect(shaftIssues(shaft({ stats: { avgWaitGameMin: 5, peakWaitGameMin: 5 } }))[0]).toMatchObject({
      key: 'waitRising', severity: 'warning',
    })
    expect(shaftIssues(shaft({ stats: { avgWaitGameMin: ELEVATOR_CROWDED_WAIT_MIN, peakWaitGameMin: 20 } }))[0]).toMatchObject({
      key: 'congested', severity: 'critical',
    })
  })

  it('warns on sparse but still usable stop programs', () => {
    const tall = shaft({ topFloor: 32, stops: Array.from({ length: 33 }, (_, floor) => floor), enabledStops: [0, 32] })
    expect(shaftIssues(tall)).toContainEqual(expect.objectContaining({ key: 'sparseStops', severity: 'warning' }))
  })
})
