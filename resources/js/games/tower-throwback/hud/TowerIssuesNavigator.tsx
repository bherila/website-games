import type { ReactElement } from 'react'

import { itemDef } from '../engine/catalog'
import { type IssueSeverity, unitIssues } from '../engine/unitIssues'
import { floorLabel } from '../floorLabels'
import type { Unit } from '../gameTypes'

const MAX_VISIBLE_ISSUES = 100

export interface TowerIssueEntry {
  unitId: number
  floor: number
  severity: IssueSeverity
  issueCount: number
  label: string
}

export interface TowerIssueResult {
  entries: TowerIssueEntry[]
  total: number
  hidden: number
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
}

export function deriveTowerIssueEntries(units: readonly Unit[]): TowerIssueResult {
  const allEntries: TowerIssueEntry[] = []

  for (const unit of units) {
    const issues = unitIssues(unit)
    const worst = issues[0]
    if (!worst) {
      continue
    }
    allEntries.push({
      unitId: unit.id,
      floor: unit.floor,
      severity: worst.severity,
      issueCount: issues.length,
      label: `${itemDef(unit.kind).name} — ${worst.label}`,
    })
  }

  allEntries.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || left.floor - right.floor || left.unitId - right.unitId,
  )

  return {
    entries: allEntries.slice(0, MAX_VISIBLE_ISSUES),
    total: allEntries.length,
    hidden: Math.max(0, allEntries.length - MAX_VISIBLE_ISSUES),
  }
}

interface TowerIssuesNavigatorProps {
  units: readonly Unit[]
  onSelectUnit: (unitId: number) => void
  onViewFloor: (floor: number) => void
}

export function TowerIssuesNavigator({ units, onSelectUnit, onViewFloor }: TowerIssuesNavigatorProps): ReactElement | null {
  const result = deriveTowerIssueEntries(units)
  if (result.total === 0) {
    return null
  }

  return (
    <details className="pointer-events-auto w-64 rounded-lg border border-white/15 bg-slate-950/90 text-left shadow-lg">
      <summary
        className="cursor-pointer select-none px-3 py-2 text-[12px] font-bold text-white/85"
        data-testid="tower-issues-summary"
      >
        Tower issues · {result.total}
      </summary>
      <div className="max-h-64 overflow-y-auto border-t border-white/10 p-2">
        <ul className="flex flex-col gap-1" aria-label="Tower issues">
          {result.entries.map((entry) => (
            <li key={entry.unitId}>
              <button
                type="button"
                data-testid={`tower-issue-${entry.unitId}`}
                onClick={() => {
                  onSelectUnit(entry.unitId)
                  onViewFloor(entry.floor)
                }}
                className={`w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10 ${
                  entry.severity === 'critical' ? 'text-red-200' : 'text-amber-200'
                }`}
              >
                <span className="font-bold">{floorLabel(entry.floor)}</span>
                {' · '}
                {entry.label}
                {entry.issueCount > 1 ? ` · ${entry.issueCount} issues` : ''}
              </button>
            </li>
          ))}
        </ul>
        {result.hidden > 0 && <p className="pt-2 text-[10px] text-white/50">+{result.hidden.toLocaleString()} more issues</p>}
      </div>
    </details>
  )
}
