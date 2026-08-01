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

  it('tells a single-landing shaft to add and refresh a landing', () => {
    const issue = shaftIssues(shaft({
      topFloor: 0,
      stops: [0],
      enabledStops: [0],
    })).find((candidate) => candidate.key === 'noService')

    expect(issue).toMatchObject({ label: 'Only one landing' })
    expect(issue?.hint).toMatch(/add another reachable landing/i)
    expect(issue?.hint).toMatch(/resize or refresh/i)
  })

  it('still tells a multi-landing shaft to enable a second stop', () => {
    const issue = shaftIssues(shaft({ enabledStops: [0] })).find((candidate) => candidate.key === 'noService')

    expect(issue).toMatchObject({ label: 'No usable service' })
    expect(issue?.hint).toMatch(/enable at least two stops/i)
  })

  it('reuses patience and vacancy thresholds against the daily peak wait', () => {
    expect(shaftIssues(shaft({ stats: { avgWaitGameMin: 1, peakWaitGameMin: 5 } }))[0]).toMatchObject({
      key: 'waitRising', severity: 'warning',
    })
    const critical = shaftIssues(shaft({ stats: { avgWaitGameMin: 2, peakWaitGameMin: ELEVATOR_CROWDED_WAIT_MIN } }))[0]
    expect(critical).toMatchObject({
      key: 'congested', severity: 'critical',
    })
    expect(critical?.label).toContain(`${ELEVATOR_CROWDED_WAIT_MIN.toFixed(1)} min peak wait`)
    expect(critical?.hint).toContain('Live average: 2.0 min')

    expect(shaftIssues(shaft({ stats: { avgWaitGameMin: 20, peakWaitGameMin: 0 } }))).toEqual([])
  })

  it('warns on sparse but still usable stop programs', () => {
    const tall = shaft({ topFloor: 32, stops: Array.from({ length: 33 }, (_, floor) => floor), enabledStops: [0, 32] })
    expect(shaftIssues(tall)).toContainEqual(expect.objectContaining({ key: 'sparseStops', severity: 'warning' }))
  })
})
