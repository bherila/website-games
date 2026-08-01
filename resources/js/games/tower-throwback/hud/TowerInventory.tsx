import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { itemDef, shaftDef } from '../engine/catalog'
import { shaftIssues } from '../engine/shaftIssues'
import { unitIssues } from '../engine/unitIssues'
import { floorLabel } from '../floorLabels'
import type { Shaft, Unit } from '../gameTypes'
import { BUILD_TOOL_ICON_URLS } from './hudIcons'

const INVENTORY_PAGE_SIZE = 100

export interface TowerInventoryEntry {
  type: 'unit' | 'shaft'
  id: number
  floor: number
  x: number
  label: string
  occupancy: string
  issue: string | null
  iconUrl: string
}

export interface TowerInventoryFloor {
  floor: number
  entries: TowerInventoryEntry[]
}

function population(unit: Unit): number {
  return unit.population.low + unit.population.med + unit.population.high + unit.population.vip
}

function unitOccupancy(unit: Unit): string {
  const definition = itemDef(unit.kind)
  if (definition.capacity === undefined) {
    return 'Built'
  }
  return unit.occupied
    ? `Occupied · ${population(unit).toLocaleString()} ${population(unit) === 1 ? 'person' : 'people'}`
    : 'Vacant'
}

function shaftOccupancy(shaft: Shaft): string {
  const cars = shaft.cars.length
  return `${floorLabel(shaft.bottomFloor)}–${floorLabel(shaft.topFloor)} · ${cars.toLocaleString()} ${cars === 1 ? 'car' : 'cars'}`
}

/**
 * Read-only inventory derivation. Shafts live in the group for their bottom
 * floor and state their full vertical range, so one entity has one stable row.
 */
export function deriveTowerInventory(units: readonly Unit[], shafts: readonly Shaft[]): TowerInventoryFloor[] {
  const byFloor = new Map<number, TowerInventoryEntry[]>()
  const add = (entry: TowerInventoryEntry): void => {
    const entries = byFloor.get(entry.floor)
    if (entries) {
      entries.push(entry)
    } else {
      byFloor.set(entry.floor, [entry])
    }
  }

  for (const unit of units) {
    add({
      type: 'unit',
      id: unit.id,
      floor: unit.floor,
      x: unit.x,
      label: itemDef(unit.kind).name,
      occupancy: unitOccupancy(unit),
      issue: unitIssues(unit)[0]?.label ?? null,
      iconUrl: BUILD_TOOL_ICON_URLS[unit.kind],
    })
  }
  for (const shaft of shafts) {
    add({
      type: 'shaft',
      id: shaft.id,
      floor: shaft.bottomFloor,
      x: shaft.x,
      label: shaftDef(shaft.kind).name,
      occupancy: shaftOccupancy(shaft),
      issue: shaftIssues(shaft)[0]?.label ?? null,
      iconUrl: BUILD_TOOL_ICON_URLS[shaft.kind],
    })
  }

  return [...byFloor.entries()]
    .sort(([left], [right]) => right - left)
    .map(([floor, entries]) => ({
      floor,
      entries: entries.sort(
        (left, right) =>
          left.x - right.x
          || (left.type === right.type ? 0 : left.type === 'unit' ? -1 : 1)
          || left.id - right.id,
      ),
    }))
}

interface TowerInventoryProps {
  units: readonly Unit[]
  shafts: readonly Shaft[]
  onClose: () => void
  onSelectUnit: (unitId: number) => void
  onSelectShaft: (shaftId: number) => void
  onViewFloor: (floor: number) => void
  onFocusInspector: () => void
  onRestoreFocus: () => void
}

export function TowerInventory({
  units,
  shafts,
  onClose,
  onSelectUnit,
  onSelectShaft,
  onViewFloor,
  onFocusInspector,
  onRestoreFocus,
}: TowerInventoryProps): ReactElement {
  const groups = deriveTowerInventory(units, shafts)
  const [expandedFloor, setExpandedFloor] = useState<number | null>(groups[0]?.floor ?? null)
  const [visibleCounts, setVisibleCounts] = useState<Record<number, number>>({})
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(() => {
    onClose()
    onRestoreFocus()
  }, [onClose, onRestoreFocus])

  useEffect(() => {
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  const choose = (entry: TowerInventoryEntry): void => {
    if (entry.type === 'unit') {
      onSelectUnit(entry.id)
    } else {
      onSelectShaft(entry.id)
    }
    onViewFloor(entry.floor)
    onClose()
    onFocusInspector()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tower-inventory-title"
        className="flex max-h-[90vh] w-[44rem] max-w-full flex-col rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h2 id="tower-inventory-title" className="text-xl font-black tracking-tight">Tower inventory</h2>
            <p className="pt-1 text-sm text-white/60">
              {units.length.toLocaleString()} units · {shafts.length.toLocaleString()} shafts
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close tower inventory"
            onClick={close}
            className="rounded-md bg-white/10 px-2.5 py-1 text-sm font-bold text-white/80 hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {groups.length === 0 ? (
            <p className="rounded-lg bg-white/5 p-4 text-sm text-white/60">Nothing has been built yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((group) => {
                const label = floorLabel(group.floor)
                const expanded = expandedFloor === group.floor
                const visibleCount = Math.min(visibleCounts[group.floor] ?? INVENTORY_PAGE_SIZE, group.entries.length)
                const visibleEntries = group.entries.slice(0, visibleCount)
                return (
                  <section key={group.floor} aria-labelledby={`inventory-floor-${group.floor}`}>
                    <h3 id={`inventory-floor-${group.floor}`}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`inventory-floor-items-${group.floor}`}
                        onClick={() => setExpandedFloor((current) => current === group.floor ? null : group.floor)}
                        className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-left text-sm font-bold hover:bg-white/10"
                      >
                        <span>{label}</span>
                        <span className="text-xs font-medium text-white/55">
                          {group.entries.length.toLocaleString()} {group.entries.length === 1 ? 'item' : 'items'}
                        </span>
                      </button>
                    </h3>
                    {expanded && (
                      <div id={`inventory-floor-items-${group.floor}`} className="px-2 pb-2">
                        <ul aria-label={`Items on ${label}`} className="divide-y divide-white/10">
                          {visibleEntries.map((entry) => (
                            <li key={`${entry.type}-${entry.id}`} data-testid="tower-inventory-entry" className="py-2">
                              <button
                                type="button"
                                aria-label={`Select ${entry.label} on ${label}`}
                                onClick={() => choose(entry)}
                                className="w-full rounded px-2 py-1 text-left hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300"
                              >
                                <span className="flex items-start gap-2">
                                  <img src={entry.iconUrl} alt="" aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
                                  <span>
                                    <span className="block text-sm font-bold text-white/90">{entry.label}</span>
                                    <span className="block text-xs text-white/60">{entry.occupancy}</span>
                                    {entry.issue && <span className="block text-xs font-semibold text-red-200">{entry.issue}</span>}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center justify-between gap-3 pt-2 text-xs text-white/55">
                          <span>Showing {visibleCount.toLocaleString()} of {group.entries.length.toLocaleString()}</span>
                          {visibleCount < group.entries.length && (
                            <button
                              type="button"
                              onClick={() => setVisibleCounts((counts) => ({
                                ...counts,
                                [group.floor]: Math.min(visibleCount + INVENTORY_PAGE_SIZE, group.entries.length),
                              }))}
                              className="rounded bg-white/10 px-2 py-1 font-semibold text-white/80 hover:bg-white/20"
                            >
                              Show next {Math.min(INVENTORY_PAGE_SIZE, group.entries.length - visibleCount).toLocaleString()} items
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
