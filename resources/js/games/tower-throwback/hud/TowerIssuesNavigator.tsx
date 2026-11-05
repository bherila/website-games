import { type ReactElement, useEffect, useRef, useState } from 'react'

import { itemDef, shaftDef } from '../engine/catalog'
import { shaftIssues } from '../engine/shaftIssues'
import { type IssueSeverity, unitIssues } from '../engine/unitIssues'
import { floorLabel } from '../floorLabels'
import type { Shaft, Unit } from '../gameTypes'
import { BUILD_TOOL_ICON_URLS } from './hudIcons'

const MAX_VISIBLE_ISSUES = 100

export interface TowerIssueEntry {
  type: 'unit' | 'shaft'
  id: number
  floor: number
  severity: IssueSeverity
  issueCount: number
  label: string
  iconUrl: string
}

export interface TowerIssueResult {
  entries: TowerIssueEntry[]
  total: number
  hidden: number
  page: number
  pageCount: number
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
}

export function deriveTowerIssueEntries(units: readonly Unit[], shafts: readonly Shaft[] = [], page = 0): TowerIssueResult {
  const allEntries: TowerIssueEntry[] = []

  for (const unit of units) {
    const issues = unitIssues(unit)
    const worst = issues[0]
    if (!worst) {
      continue
    }
    allEntries.push({
      type: 'unit',
      id: unit.id,
      floor: unit.floor,
      severity: worst.severity,
      issueCount: issues.length,
      label: `${itemDef(unit.kind).name} — ${worst.label}`,
      iconUrl: BUILD_TOOL_ICON_URLS[unit.kind],
    })
  }
  for (const shaft of shafts) {
    const issues = shaftIssues(shaft)
    const worst = issues[0]
    if (!worst) {
      continue
    }
    allEntries.push({
      type: 'shaft',
      id: shaft.id,
      floor: shaft.bottomFloor,
      severity: worst.severity,
      issueCount: issues.length,
      label: `${shaftDef(shaft.kind).name} — ${worst.label}`,
      iconUrl: BUILD_TOOL_ICON_URLS[shaft.kind],
    })
  }

  allEntries.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
      || left.floor - right.floor
      || (left.type === right.type ? 0 : left.type === 'unit' ? -1 : 1)
      || left.id - right.id,
  )

  const pageCount = Math.max(1, Math.ceil(allEntries.length / MAX_VISIBLE_ISSUES))
  const visiblePage = Math.max(0, Math.min(page, pageCount - 1))
  return {
    entries: allEntries.slice(visiblePage * MAX_VISIBLE_ISSUES, (visiblePage + 1) * MAX_VISIBLE_ISSUES),
    page: visiblePage,
    pageCount,
    total: allEntries.length,
    hidden: Math.max(0, allEntries.length - MAX_VISIBLE_ISSUES),
  }
}

interface TowerIssuesNavigatorProps {
  units: readonly Unit[]
  shafts: readonly Shaft[]
  onSelectUnit: (unitId: number) => void
  onSelectShaft: (shaftId: number) => void
  onViewFloor: (floor: number) => void
}

export function TowerIssuesNavigator({ units, shafts, onSelectUnit, onSelectShaft, onViewFloor }: TowerIssuesNavigatorProps): ReactElement | null {
  const [page, setPage] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const focusPageRef = useRef(false)
  const focusedIssueRef = useRef<string | null>(null)
  const result = deriveTowerIssueEntries(units, shafts, page)
  if (page !== result.page) {
    setPage(result.page)
  }
  useEffect(() => {
    const focusedIssueRemoved = focusedIssueRef.current !== null
      && !listRef.current?.querySelector(`[data-testid="${focusedIssueRef.current}"]`)
    if (focusPageRef.current || (focusedIssueRemoved && document.activeElement === document.body)) {
      focusPageRef.current = false
      listRef.current?.querySelector('button')?.focus()
    }
  }, [page, result.page, result.entries])
  const changePage = (nextPage: number): void => {
    focusPageRef.current = true
    setPage(nextPage)
  }
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
        <ul
          ref={listRef}
          className="flex flex-col gap-1"
          aria-label="Tower issues"
          onFocusCapture={(event) => { focusedIssueRef.current = (event.target as HTMLElement).dataset.testid ?? null }}
          onBlurCapture={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusedIssueRef.current = null
          }}
        >
          {result.entries.map((entry) => (
            <li key={`${entry.type}-${entry.id}`}>
              <button
                type="button"
                data-testid={`tower-issue-${entry.type}-${entry.id}`}
                onClick={() => {
                  if (entry.type === 'unit') {
                    onSelectUnit(entry.id)
                  } else {
                    onSelectShaft(entry.id)
                  }
                  onViewFloor(entry.floor)
                }}
                className={`w-full min-w-0 break-words rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10 ${
                  entry.severity === 'critical' ? 'text-red-200' : 'text-amber-200'
                }`}
              >
                <span className="flex items-start gap-1.5">
                  <img src={entry.iconUrl} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-bold">{floorLabel(entry.floor)}</span>
                    {' · '}
                    {entry.label}
                    {entry.issueCount > 1 ? ` · ${entry.issueCount} issues` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {result.pageCount > 1 && (
          <nav aria-label="Tower issue pages" className="flex flex-wrap items-center justify-between gap-1 pt-2 text-[11px] text-white/70">
            <button
              type="button"
              disabled={result.page === 0}
              onClick={() => changePage(result.page - 1)}
              className="min-h-11 min-w-11 rounded bg-white/10 px-2 disabled:opacity-40"
            >
              Previous
            </button>
            <span aria-live="polite">Page {result.page + 1} of {result.pageCount}</span>
            <button
              type="button"
              disabled={result.page === result.pageCount - 1}
              onClick={() => changePage(result.page + 1)}
              className="min-h-11 min-w-11 rounded bg-white/10 px-2 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        )}
      </div>
    </details>
  )
}
