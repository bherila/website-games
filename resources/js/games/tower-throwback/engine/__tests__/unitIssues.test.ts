import type { Unit } from '../../gameTypes'
import { unitIssues, worstUnitSeverity } from '../unitIssues'

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    kind: 'officeS',
    floor: 1,
    x: 100,
    width: 6,
    storeys: 1,
    grade: 'standard',
    rentTier: 'avg',
    occupied: true,
    population: { low: 1, med: 0, high: 0, vip: 0 },
    evalScore: 70,
    stressMarks: 0,
    lowEvalDays: 0,
    vacancyReason: null,
    flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: false },
    dirty: false,
    infested: false,
    offline: false,
    damageKind: null,
    incidentPenaltyUntilDay: null,
    ...overrides,
  }
}

describe('unitIssues', () => {
  it('reports no issues for a healthy occupied unit', () => {
    expect(unitIssues(unit())).toEqual([])
    expect(worstUnitSeverity(unit())).toBeNull()
  })

  it('flags offline / infested / no-route as critical', () => {
    expect(unitIssues(unit({ offline: true })).some((i) => i.key === 'offline' && i.severity === 'critical')).toBe(true)
    expect(unitIssues(unit({ infested: true })).some((i) => i.key === 'infested' && i.severity === 'critical')).toBe(true)
    expect(
      unitIssues(unit({ flags: { noRestroom: false, noRoute: true, noReception: false, trashOverflow: false } })).some(
        (i) => i.key === 'noRoute' && i.severity === 'critical',
      ),
    ).toBe(true)
  })

  it('treats an already-vacated (fixable-reason) unit as critical with a reason hint', () => {
    const issues = unitIssues(unit({ occupied: false, vacancyReason: 'noRestroom' }))
    const vacant = issues.find((i) => i.key === 'vacant')
    expect(vacant?.severity).toBe('critical')
    expect(vacant?.hint).toMatch(/restroom/i)
  })

  it('warns (not critical) on soft problems while the tenant is still in place', () => {
    const dirty = unitIssues(unit({ dirty: true }))
    expect(dirty.find((i) => i.key === 'dirty')?.severity).toBe('warning')

    const noRestroom = unitIssues(unit({ flags: { noRestroom: true, noRoute: false, noReception: false, trashOverflow: false } }))
    expect(noRestroom.find((i) => i.key === 'noRestroom')?.severity).toBe('warning')
    expect(worstUnitSeverity(unit({ dirty: true }))).toBe('warning')
  })

  it('escalates to critical as a unit nears vacancy (lowEvalDays at the risk edge)', () => {
    // lowEvalRiskDays is 3 → day 2 (>= 3-1) is the "about to vacate" edge.
    expect(unitIssues(unit({ lowEvalDays: 1 })).find((i) => i.key === 'lowEval')?.severity).toBe('warning')
    expect(unitIssues(unit({ lowEvalDays: 2 })).some((i) => i.key === 'vacating' && i.severity === 'critical')).toBe(true)
    expect(worstUnitSeverity(unit({ lowEvalDays: 2 }))).toBe('critical')
  })

  it.each([
    ['low', 5],
    ['avg', 3],
    ['high', 3],
  ] as const)('warns at threshold-1 and escalates at the %s-rent weekly stress threshold', (rentTier, threshold) => {
    const warning = unitIssues(unit({ rentTier, stressMarks: threshold - 1 })).find((issue) => issue.key === 'weeklyStress')
    expect(warning).toMatchObject({ severity: 'warning' })
    expect(warning?.label).toContain(`${threshold - 1}/${threshold}`)

    const critical = unitIssues(unit({ rentTier, stressMarks: threshold })).find((issue) => issue.key === 'weeklyStressCritical')
    expect(critical).toMatchObject({ severity: 'critical' })
    expect(critical?.label).toContain(`${threshold}/${threshold}`)
    if (rentTier === 'low') {
      expect(critical?.hint).toMatch(/unavoidable/i)
    } else {
      expect(critical?.hint).toMatch(/lower rent to the low tier/i)
      expect(critical?.hint).toMatch(/future marks/i)
    }
  })

  it('does not report weekly stress for zero marks, non-tenants, or VIP homes', () => {
    expect(unitIssues(unit()).some((issue) => issue.key.startsWith('weeklyStress'))).toBe(false)
    expect(unitIssues(unit({ kind: 'shop', stressMarks: 99 })).some((issue) => issue.key.startsWith('weeklyStress'))).toBe(false)
    expect(unitIssues(unit({ stressMarks: 99, population: { low: 0, med: 0, high: 0, vip: 1 } })).some((issue) => issue.key.startsWith('weeklyStress'))).toBe(false)
  })

  it('critical outranks warning in worstUnitSeverity', () => {
    const u = unit({ offline: true, dirty: true })
    expect(worstUnitSeverity(u)).toBe('critical')
  })

  it('gives parking stalls a ramp-specific message, not the generic lobby-route hint', () => {
    const stall = unit({
      kind: 'parkingSpace',
      flags: { noRestroom: false, noRoute: true, noReception: false, trashOverflow: false },
    })
    const issues = unitIssues(stall)
    expect(issues.some((i) => i.key === 'noRoute')).toBe(false)
    const ramp = issues.find((i) => i.key === 'noRamp')
    expect(ramp?.severity).toBe('critical')
    expect(ramp?.hint).toMatch(/ramp/i)

    // A normal unit still gets the passenger-route hint.
    const office = unit({ flags: { noRestroom: false, noRoute: true, noReception: false, trashOverflow: false } })
    expect(unitIssues(office).some((i) => i.key === 'noRoute')).toBe(true)
  })
})
