import { type RentTier, TUNING, type Unit } from '../gameTypes'
import { itemDef } from './catalog'

export interface WeeklyTenantStress {
  marks: number
  threshold: number
}

/** Exact end-of-week move-out threshold for a tenant's selected rent tier. */
export function weeklyStressThreshold(rentTier: RentTier): number {
  return Math.ceil(TUNING.stress.weeklyMarksBase * TUNING.rent.toleranceMultiplier[rentTier])
}

/** Read-only weekly stress state for tenants governed by occupancy's weekly pass. */
export function weeklyTenantStress(unit: Unit): WeeklyTenantStress | null {
  const category = itemDef(unit.kind).category
  if (!unit.occupied || unit.population.vip > 0 || (category !== 'office' && category !== 'residential')) {
    return null
  }
  return { marks: unit.stressMarks, threshold: weeklyStressThreshold(unit.rentTier) }
}
