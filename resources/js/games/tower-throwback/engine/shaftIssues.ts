import type { Shaft } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { shaftDef } from './catalog'
import type { IssueSeverity } from './unitIssues'

/** The existing vacancy-attribution edge: waits at or above this are damaging. */
export const ELEVATOR_CROWDED_WAIT_MIN = 15

export interface ShaftIssue {
  key: string
  severity: IssueSeverity
  label: string
  hint: string
}

export function recommendedEnabledStops(shaft: Shaft): number {
  const span = Math.max(1, shaft.topFloor - shaft.bottomFloor + 1)
  const maxStops = shaftDef(shaft.kind).maxStops
  const recommended = Math.max(2, Math.ceil(span / 8))
  return Math.min(shaft.stops.length, maxStops ?? recommended, recommended)
}

/** Active, player-actionable shaft problems, most severe first in stable order. */
export function shaftIssues(shaft: Shaft): ShaftIssue[] {
  const issues: ShaftIssue[] = []
  if (shaft.cars.length === 0) {
    issues.push({
      key: 'noCars',
      severity: 'critical',
      label: 'No elevator cars',
      hint: 'Add a car so this shaft can carry riders.',
    })
  }
  if (shaft.enabledStops.length < 2) {
    issues.push({
      key: 'noService',
      severity: 'critical',
      label: 'No usable service',
      hint: 'Enable at least two stops so riders have somewhere to travel.',
    })
  }
  if (shaft.stats.avgWaitGameMin >= ELEVATOR_CROWDED_WAIT_MIN) {
    issues.push({
      key: 'congested',
      severity: 'critical',
      label: `Severe congestion — ${shaft.stats.avgWaitGameMin.toFixed(1)} min wait`,
      hint: 'Add cars or a relief shaft, then tune stops and home floors.',
    })
  } else if (shaft.stats.avgWaitGameMin >= TUNING.elevators.waitGraceMin) {
    issues.push({
      key: 'waitRising',
      severity: 'warning',
      label: `Waits rising — ${shaft.stats.avgWaitGameMin.toFixed(1)} min`,
      hint: 'Watch the congestion overlay; add capacity or tune routing before tenants lose patience.',
    })
  }
  if (shaft.enabledStops.length >= 2 && shaft.enabledStops.length < recommendedEnabledStops(shaft)) {
    issues.push({
      key: 'sparseStops',
      severity: 'warning',
      label: `Sparse service — ${shaft.enabledStops.length} enabled stops`,
      hint: 'Enable more landings across the shaft span so riders can reach it directly.',
    })
  }
  return issues
}
