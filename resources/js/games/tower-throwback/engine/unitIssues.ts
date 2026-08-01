/**
 * Pure derivation of a unit's active "issues" — the problems a player should
 * resolve before a tenant leaves. Shared by the inspect panel (full list with
 * fix hints) and the map issues overlay (worst severity → badge color), so both
 * agree on what counts as a warning vs a critical problem.
 *
 * Severity model (per design):
 *   critical (red)  — losing or already-lost tenant / earning nothing:
 *                     offline, infested, no route, imminent/actual vacancy.
 *   warning (yellow) — act soon, tenant still in place: no restroom/reception,
 *                     trash overflow, dirty room, desirability slipping.
 */

import type { Unit, VacancyReason } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { weeklyTenantStress } from './tenantStress'

export type IssueSeverity = 'warning' | 'critical'

export interface UnitIssue {
  key: string
  severity: IssueSeverity
  label: string
  /** One-line, actionable guidance (diagnostics only — no auto-resolve). */
  hint: string
}

const VACANCY_ISSUE: Record<VacancyReason, { label: string; hint: string }> = {
  elevatorCrowded: { label: 'Vacant — elevators too crowded', hint: 'Add elevator capacity or tune routing so waits drop.' },
  tooNoisy: { label: 'Vacant — too noisy', hint: 'Move noisy neighbors away or add distance/floors between them.' },
  noRestroom: { label: 'Vacant — no restroom nearby', hint: `Place a restroom within ${TUNING.grid.restroomRangeTiles} tiles on this floor.` },
  rentTooHigh: { label: 'Vacant — rent too high', hint: 'Lower the rent tier to re-lease.' },
  noRoute: { label: 'Vacant — no route to the lobby', hint: 'Connect a passenger elevator or stairs down to the lobby.' },
  hotelDirty: { label: 'Vacant — room left dirty', hint: 'Ensure a reception and a service elevator so housekeeping can clean it.' },
  noReception: { label: 'Vacant — no hotel reception', hint: 'Add a hotel reception so rooms can operate.' },
  lowEval: { label: 'Vacant — poor conditions', hint: 'Raise desirability (amenities, quiet, restroom nearby) to re-lease.' },
  incidentDamage: { label: 'Vacant — incident damage', hint: 'Repair the unit to bring it back online before re-leasing.' },
}

/** Active issues for a unit, most severe first, in a stable order. */
export function unitIssues(unit: Unit): UnitIssue[] {
  const issues: UnitIssue[] = []

  if (unit.offline) {
    issues.push({ key: 'offline', severity: 'critical', label: 'Damaged — offline', hint: 'Repair it to bring the unit back online and earning.' })
  }
  if (unit.infested) {
    issues.push({ key: 'infested', severity: 'critical', label: 'Infested', hint: 'Call pest control to clear the infestation.' })
  }
  if (unit.flags.noRoute) {
    // Parking stalls reuse noRoute to mean "not ramp-served" — a different fix
    // (a contiguous parking-ramp chain), not passenger transit to the lobby.
    if (unit.kind === 'parkingSpace') {
      issues.push({ key: 'noRamp', severity: 'critical', label: 'Not ramp-served', hint: 'Extend a contiguous parking-ramp chain to reach these stalls.' })
    } else {
      issues.push({ key: 'noRoute', severity: 'critical', label: 'No route to the lobby', hint: 'Connect a passenger elevator or stairs down to the lobby.' })
    }
  }

  if (!unit.occupied && unit.vacancyReason) {
    const v = VACANCY_ISSUE[unit.vacancyReason]
    issues.push({ key: 'vacant', severity: 'critical', label: v.label, hint: v.hint })
  } else if (unit.occupied && unit.lowEvalDays >= TUNING.stress.lowEvalRiskDays - 1) {
    issues.push({
      key: 'vacating',
      severity: 'critical',
      label: 'About to vacate — low desirability',
      hint: 'Raise desirability now (amenities, quieter location, restroom nearby) before the tenant leaves.',
    })
  }

  const weeklyStress = weeklyTenantStress(unit)
  if (weeklyStress && weeklyStress.marks >= weeklyStress.threshold) {
    issues.push({
      key: 'weeklyStressCritical',
      severity: 'critical',
      label: `Weekly stress at move-out risk — ${weeklyStress.marks}/${weeklyStress.threshold}`,
      hint: 'Reduce elevator waits before the weekly reset or this tenant may leave.',
    })
  }

  if (unit.flags.noRestroom) {
    issues.push({
      key: 'noRestroom',
      severity: 'warning',
      label: 'No restroom on the floor',
      hint: `Lowers desirability — place a restroom within ${TUNING.grid.restroomRangeTiles} tiles on this floor to lift the eval.`,
    })
  }
  if (unit.flags.noReception) {
    issues.push({ key: 'noReception', severity: 'warning', label: 'No hotel reception', hint: 'Add a hotel reception so rooms can be serviced.' })
  }
  if (unit.flags.trashOverflow) {
    issues.push({ key: 'trashOverflow', severity: 'warning', label: 'Trash overflowing nearby', hint: 'Add or service a trash room to clear the overflow.' })
  }
  if (unit.dirty) {
    issues.push({ key: 'dirty', severity: 'warning', label: 'Room needs cleaning', hint: 'Housekeeping will clean it — ensure a reception and a service elevator can reach.' })
  } else if (unit.occupied && unit.lowEvalDays > 0 && unit.lowEvalDays < TUNING.stress.lowEvalRiskDays - 1) {
    issues.push({ key: 'lowEval', severity: 'warning', label: 'Desirability slipping', hint: 'Improve nearby amenities or reduce noise before tenants leave.' })
  }
  if (weeklyStress && weeklyStress.marks > 0 && weeklyStress.marks < weeklyStress.threshold) {
    issues.push({
      key: 'weeklyStress',
      severity: 'warning',
      label: `Elevator stress building — ${weeklyStress.marks}/${weeklyStress.threshold}`,
      hint: 'Tenants record failed elevator trips until the weekly reset; reduce waits before the threshold is reached.',
    })
  }

  return issues
}

/** The worst severity among a unit's issues, or null if the unit is healthy. */
export function worstUnitSeverity(unit: Unit): IssueSeverity | null {
  const issues = unitIssues(unit)
  if (issues.some((issue) => issue.severity === 'critical')) {
    return 'critical'
  }
  return issues.length > 0 ? 'warning' : null
}
