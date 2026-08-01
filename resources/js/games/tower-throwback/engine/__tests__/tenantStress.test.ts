import type { Unit } from '../../gameTypes'
import { weeklyStressThreshold, weeklyTenantStress } from '../tenantStress'

function tenant(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    kind: 'officeS',
    floor: 1,
    x: 1,
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

describe('weekly tenant stress', () => {
  it('uses the exact rent-tier thresholds consumed by the weekly pass', () => {
    expect(weeklyStressThreshold('low')).toBe(5)
    expect(weeklyStressThreshold('avg')).toBe(3)
    expect(weeklyStressThreshold('high')).toBe(3)
  })

  it('exposes only occupied non-VIP office and residential tenants', () => {
    expect(weeklyTenantStress(tenant({ stressMarks: 2 }))).toEqual({ marks: 2, threshold: 3 })
    expect(weeklyTenantStress(tenant({ kind: 'aptStudio', rentTier: 'low' }))).toEqual({ marks: 0, threshold: 5 })
    expect(weeklyTenantStress(tenant({ kind: 'shop' }))).toBeNull()
    expect(weeklyTenantStress(tenant({ occupied: false }))).toBeNull()
    expect(weeklyTenantStress(tenant({ population: { low: 0, med: 0, high: 0, vip: 1 } }))).toBeNull()
  })
})
