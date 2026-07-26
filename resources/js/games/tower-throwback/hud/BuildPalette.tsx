import currency from 'currency.js'
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { isItemAvailable, isShaftAvailable, ITEM_DEFS, SHAFT_DEFS, SHAFT_STAR_REQUIRED } from '../engine/catalog'
import { getMap } from '../engine/maps'
import type { IncomeModel, ItemDef, ItemKind, ShaftDef, ShaftKind, StarLevel } from '../gameTypes'
import { BUILD_TOOL_ICON_URLS } from './hudIcons'

export interface SelectedTool {
  kind: ItemKind | ShaftKind
  isShaft: boolean
}

interface BuildPaletteProps {
  maxStarReached: StarLevel
  mapId: string
  selectedTool: SelectedTool | null
  onSelectTool: (tool: SelectedTool) => void
}

interface PaletteEntry {
  kind: ItemKind | ShaftKind
  isShaft: boolean
  name: string
  cost: number
  perTile: boolean
  starRequired: StarLevel
  locked: boolean
  itemDef: ItemDef | null
  shaftDef: ShaftDef | null
  summary: string | null
}

interface DetailRowProps {
  label: string
  value: string
}

interface PaletteDetailsProps {
  entry: PaletteEntry
}

function entryKey(entry: Pick<PaletteEntry, 'kind' | 'isShaft'>): string {
  return `${entry.isShaft ? 'shaft' : 'item'}-${entry.kind}`
}

function selectedKey(tool: SelectedTool | null): string | null {
  return tool ? entryKey(tool) : null
}

function money(value: number): string {
  return currency(value, { precision: 0 }).format()
}

function incomeDescription(income: IncomeModel): string {
  switch (income.type) {
    case 'rent':
      return `${money(income.perDay)}/day rent`
    case 'perVisit':
      return `${money(income.amount)} per visit`
    case 'perNight':
      return `${money(income.amount)} per night`
    case 'perEvent':
      return `${money(income.amount)} per event`
  }
}

function verticalDescription(def: ItemDef): string {
  switch (def.vertical) {
    case 'groundOnly':
      return 'Ground floor only'
    case 'undergroundOnly':
      return 'Underground only'
    case 'undergroundAllowed':
      return 'Above or underground'
    case 'b10Only':
      return 'B10 only'
    case 'terminalFloor':
      return 'Map endgame floor(s) only'
    case 'anyFloor':
      return 'Any floor'
    default:
      return 'Above ground only'
  }
}

function DetailRow({ label, value }: DetailRowProps): ReactElement {
  return (
    <>
      <dt className="text-white/45">{label}</dt>
      <dd className="text-right tabular-nums text-white/80">{value}</dd>
    </>
  )
}

function PaletteDetails({ entry }: PaletteDetailsProps): ReactElement {
  const item = entry.itemDef
  const shaft = entry.shaftDef

  return (
    <div className="mt-2 border-t border-white/10 pt-2" data-testid="tool-details">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold" data-testid="tool-details-name">
          {entry.name}
        </div>
        <span className="text-[11px] text-amber-200" data-testid="tool-details-star">
          Requires ★{entry.starRequired}
        </span>
      </div>
      {entry.locked && (
        <div className="mt-1 text-[11px] font-semibold text-amber-200" data-testid="tool-details-locked">
          Unlock: requires ★{entry.starRequired}
        </div>
      )}
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        {item && (
          <>
            <DetailRow label="Footprint" value={`${item.width} tiles × ${item.storeys} ${item.storeys === 1 ? 'storey' : 'storeys'}`} />
            <DetailRow label="Cost" value={`${money(item.cost)}${item.perTile ? '/tile' : ''}`} />
            <DetailRow label="Maintenance" value={`${money(item.maintPerDay)}/day`} />
            {item.income && <DetailRow label="Income" value={incomeDescription(item.income)} />}
            {item.capacity !== undefined && <DetailRow label="Capacity" value={item.capacity.toLocaleString()} />}
            {item.noise && <DetailRow label="Noise" value={`${item.noise.level} / ${item.noise.radiusTiles} tiles`} />}
            {item.affinityGroup && <DetailRow label="Affinity" value={item.affinityGroup} />}
            <DetailRow label="Placement" value={verticalDescription(item)} />
          </>
        )}
        {shaft && (
          <>
            <DetailRow label="Width" value={`${shaft.width} tiles`} />
            <DetailRow label="Base cost" value={money(shaft.baseCost)} />
            <DetailRow label="Per floor" value={money(shaft.costPerFloor)} />
            <DetailRow label="Maintenance" value={`${money(shaft.maintPerCarPerDay)}/car/day`} />
            <DetailRow label="Capacity" value={`${shaft.carCapacity}/car`} />
            <DetailRow label="Max cars" value={shaft.maxCars.toLocaleString()} />
            {shaft.maxReachFloors !== undefined && <DetailRow label="Reach" value={`${shaft.maxReachFloors} floors`} />}
            {shaft.maxStops !== undefined && <DetailRow label="Stops" value={`${shaft.maxStops} max`} />}
            {shaft.serviceOnly && <DetailRow label="Service" value="Staff and trash only" />}
            {shaft.exterior && <DetailRow label="Placement" value="Exterior facade" />}
          </>
        )}
      </dl>
    </div>
  )
}

function shaftPaletteSummary(def: ShaftDef): string {
  const riders = def.serviceOnly === true ? 'staff/trash' : 'passengers'
  const limits: string[] = [`${def.carCapacity} ${riders}/car`]
  if (def.maxStops !== undefined) {
    limits.push(`${def.maxStops} stops max`)
  }
  if (def.maxReachFloors !== undefined) {
    limits.push(`${def.maxReachFloors} floors reach`)
  }
  if (def.exterior) {
    limits.push('exterior')
  }
  return limits.join(' · ')
}

interface PaletteCatalog {
  allEntries: PaletteEntry[]
  entriesByKind: Map<ItemKind | ShaftKind, PaletteEntry>
}

function createPaletteCatalog(maxStarReached: StarLevel, mapId: string): PaletteCatalog {
  const map = getMap(mapId)
  const entriesByKind = new Map<ItemKind | ShaftKind, PaletteEntry>()
  const allEntries: PaletteEntry[] = []
  const push = (entry: PaletteEntry): void => {
    entriesByKind.set(entry.kind, entry)
    allEntries.push(entry)
  }

  for (const def of Object.values(ITEM_DEFS)) {
    push({
      kind: def.kind,
      isShaft: false,
      name: def.name,
      cost: def.cost,
      perTile: def.perTile === true,
      starRequired: def.starRequired,
      locked: !isItemAvailable(def.kind, maxStarReached, map),
      itemDef: def,
      shaftDef: null,
      summary: null,
    })
  }
  for (const def of Object.values(SHAFT_DEFS)) {
    push({
      kind: def.kind,
      isShaft: true,
      name: def.name,
      cost: def.baseCost,
      perTile: false,
      starRequired: SHAFT_STAR_REQUIRED[def.kind],
      locked: !isShaftAvailable(def.kind, maxStarReached, map),
      itemDef: null,
      shaftDef: def,
      summary: shaftPaletteSummary(def),
    })
  }

  return { allEntries, entriesByKind }
}

interface PaletteFamilyDefinition {
  id: string
  label: string
  kinds: readonly (ItemKind | ShaftKind)[]
}

interface PaletteTileDefinition {
  id: string
  kinds: readonly (ItemKind | ShaftKind)[]
  label?: string
}

const PALETTE_TILES: readonly PaletteTileDefinition[] = [
  { id: 'slab', kinds: ['slab'] },
  { id: 'lobbies', label: 'Lobbies', kinds: ['lobby', 'skylobby'] },
  { id: 'skybridge', kinds: ['skybridge'] },
  { id: 'stairs', kinds: ['stairs'] },
  { id: 'escalator', kinds: ['escalator'] },
  { id: 'elevators', label: 'Elevators', kinds: ['standard', 'express', 'service', 'glass'] },
  { id: 'offices', label: 'Offices', kinds: ['officeS', 'officeM', 'officeL'] },
  { id: 'apartments', label: 'Apartments', kinds: ['aptStudio', 'apt1br', 'apt2br', 'aptPenthouse'] },
  { id: 'restroom', kinds: ['restroom'] },
  { id: 'shop', kinds: ['shop'] },
  { id: 'dining', label: 'Dining', kinds: ['fastfood', 'foodCourt', 'restaurant', 'fancyRestaurant'] },
  { id: 'movie-theater', kinds: ['movieTheater'] },
  { id: 'wellness', label: 'Wellness', kinds: ['fitness', 'pool', 'spa'] },
  { id: 'events', label: 'Events', kinds: ['conferenceCenter', 'eventSpace'] },
  { id: 'hotel-reception', kinds: ['hotelReception'] },
  { id: 'hotel-rooms', label: 'Hotel rooms', kinds: ['hotel1p', 'hotel2p', 'hotelSuite'] },
  { id: 'housekeeping', kinds: ['housekeeping'] },
  { id: 'waste', label: 'Waste', kinds: ['trashRoom', 'recyclingCenter'] },
  { id: 'parking', label: 'Parking', kinds: ['parkingRamp', 'parkingSpace'] },
  { id: 'subway', kinds: ['subway'] },
  { id: 'security-office', kinds: ['securityOffice'] },
  { id: 'medical-clinic', kinds: ['medicalClinic'] },
  { id: 'cathedral', kinds: ['cathedral'] },
  { id: 'observation-deck', kinds: ['observationDeck'] },
]

interface ToolButtonProps {
  entry: PaletteEntry
  selected: boolean
  compact?: boolean
  onActivate: (entry: PaletteEntry) => void
  onActiveChange: (entry: PaletteEntry | null) => void
}

function ToolButton({ entry, selected, compact = false, onActivate, onActiveChange }: ToolButtonProps): ReactElement {
  const iconUrl = BUILD_TOOL_ICON_URLS[entry.kind]

  return (
    <div
      data-testid={`tool-row-${entry.kind}`}
      onMouseEnter={() => onActiveChange(entry)}
      onMouseLeave={() => onActiveChange(null)}
    >
      <button
        type="button"
        data-testid={`tool-${entry.kind}`}
        aria-disabled={entry.locked}
        aria-pressed={selected}
        onFocus={() => onActiveChange(entry)}
        onBlur={() => onActiveChange(null)}
        onClick={() => {
          if (!entry.locked) {
            onActivate(entry)
          }
        }}
        className={`relative flex w-full rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300 ${
          compact ? 'h-14 flex-col items-center justify-center gap-0.5 px-1 py-1' : 'items-center gap-2 px-2 py-1.5 text-left'
        } ${
          selected
            ? 'bg-emerald-400 text-slate-950'
            : entry.locked
              ? 'cursor-not-allowed bg-white/3 text-white/35'
              : 'bg-white/5 text-white/85 hover:bg-white/12'
        }`}
      >
        {iconUrl && (
          <img
            src={iconUrl}
            alt=""
            aria-hidden="true"
            data-testid={`tool-icon-${entry.kind}`}
            className={`${compact ? 'size-8' : 'size-9'} shrink-0 ${entry.locked ? 'opacity-40' : ''}`}
          />
        )}
        <span className={compact ? 'w-full truncate text-center text-[10px] font-semibold leading-none' : 'min-w-0 flex-1'}>{entry.name}</span>
        {entry.locked && (
          <span
            data-testid={`lock-${entry.kind}`}
            className={`${compact ? 'absolute right-0.5 top-0.5' : ''} rounded bg-slate-950/70 px-1 text-[9px] font-bold text-amber-200`}
          >
            {entry.starRequired}★
          </span>
        )}
        {!compact && !entry.locked && (
          <span className="shrink-0 text-[10px] tabular-nums text-white/60">
            {money(entry.cost)}{entry.perTile ? '/tile' : ''}
          </span>
        )}
        {entry.summary && <span className="sr-only" data-testid={`summary-${entry.kind}`}>{entry.summary}</span>}
        {entry.locked && <span className="sr-only" data-testid={`unlock-reason-${entry.kind}`}>Requires ★{entry.starRequired}</span>}
      </button>
    </div>
  )
}

interface FamilyButtonProps {
  family: PaletteFamilyDefinition
  entries: readonly PaletteEntry[]
  displayEntry: PaletteEntry
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onActiveChange: (entry: PaletteEntry | null) => void
  setTriggerNode: (node: HTMLButtonElement | null) => void
}

function FamilyButton({ family, entries, displayEntry, expanded, selected, onToggle, onActiveChange, setTriggerNode }: FamilyButtonProps): ReactElement {
  const iconUrl = BUILD_TOOL_ICON_URLS[displayEntry.kind]
  const allLocked = entries.every((entry) => entry.locked)
  const requiredStar = Math.min(...entries.map((entry) => entry.starRequired))

  return (
    <button
      ref={setTriggerNode}
      type="button"
      data-testid={`family-${family.id}`}
      aria-expanded={expanded}
      aria-controls={`family-options-${family.id}`}
      aria-label={selected ? `${family.label}, selected ${displayEntry.name}` : family.label}
      onMouseEnter={() => onActiveChange(displayEntry)}
      onMouseLeave={() => onActiveChange(null)}
      onFocus={() => onActiveChange(displayEntry)}
      onBlur={() => onActiveChange(null)}
      onClick={onToggle}
      className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-300 ${
        selected || expanded ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/85 hover:bg-white/12'
      }`}
    >
      {iconUrl && <img src={iconUrl} alt="" aria-hidden="true" className={`size-8 ${allLocked ? 'opacity-40' : ''}`} />}
      <span className="w-full truncate text-center text-[10px] font-semibold leading-none">{family.label}</span>
      <span aria-hidden="true" className="absolute bottom-0.5 right-1 text-[8px]">▾</span>
      {allLocked && <span className="absolute right-0.5 top-0.5 rounded bg-slate-950/70 px-1 text-[9px] font-bold text-amber-200">{requiredStar}★</span>}
    </button>
  )
}

/** Compact build-mode tool grid; closely related variants open in a click/tap flyout. */
export function BuildPalette({ maxStarReached, mapId, selectedTool, onSelectTool }: BuildPaletteProps): ReactElement {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const familyTriggerNodesRef = useRef(new Map<string, HTMLButtonElement>())
  const { allEntries, entriesByKind } = useMemo(
    () => createPaletteCatalog(maxStarReached, mapId),
    [mapId, maxStarReached],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const searchResults = normalizedQuery
    ? allEntries.filter((entry) => `${entry.name} ${entry.summary ?? ''}`.toLowerCase().includes(normalizedQuery))
    : []
  const visibleTiles: readonly PaletteTileDefinition[] = normalizedQuery
    ? searchResults.map((entry) => ({ id: entryKey(entry), kinds: [entry.kind] }))
    : PALETTE_TILES
  const selectedEntryKey = selectedKey(selectedTool)
  const openFamilyDefinition = PALETTE_TILES.find((tile) => tile.id === openFamilyId && tile.kinds.length > 1)
  const openFamilyEntries = openFamilyDefinition?.kinds.map((kind) => entriesByKind.get(kind)).filter((entry): entry is PaletteEntry => entry !== undefined) ?? []

  const closeFamily = useCallback((restoreFocus: boolean): void => {
    const trigger = openFamilyId ? familyTriggerNodesRef.current.get(openFamilyId) : undefined
    setOpenFamilyId(null)
    if (restoreFocus && trigger) {
      requestAnimationFrame(() => trigger.focus())
    }
  }, [openFamilyId])

  useEffect(() => {
    if (openFamilyId === null) {
      return
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!paletteRef.current?.contains(event.target as Node)) {
        closeFamily(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeFamily(true)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeFamily, openFamilyId])

  useEffect(() => {
    if (!openFamilyId) {
      return
    }
    const frameId = requestAnimationFrame(() => {
      const panel = document.getElementById(`family-options-${openFamilyId}`)
      const selectedVariant = panel?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
      const firstVariant = panel?.querySelector<HTMLButtonElement>('button')
      const variantToFocus = selectedVariant ?? firstVariant
      variantToFocus?.focus()
    })
    return () => cancelAnimationFrame(frameId)
  }, [openFamilyId])

  const detailsEntry = allEntries.find((entry) => entryKey(entry) === activeKey)
  const setActiveEntry = (entry: PaletteEntry | null): void => setActiveKey(entry ? entryKey(entry) : null)
  const activateEntry = (entry: PaletteEntry): void => {
    onSelectTool({ kind: entry.kind, isShaft: entry.isShaft })
    closeFamily(true)
  }

  return (
    <div ref={paletteRef} className="relative w-56 rounded-xl bg-slate-950/85 p-2 text-sm shadow-lg backdrop-blur-sm">
      <div data-testid="build-tool-scroll-region" className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain">
        <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-bold tracking-widest text-white/50">
          <span>BUILD TOOLS</span>
          <kbd className="rounded bg-white/10 px-1 tracking-normal text-white/60">B</kbd>
        </div>
        {selectedTool?.isShaft !== true && (
          <div className="mb-2 px-1 text-[11px] font-semibold text-white/55">Shift-drag: build a grid</div>
        )}
        <label className="mb-2 block px-1">
          <span className="sr-only">Search build tools</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpenFamilyId(null)
            }}
            placeholder="Search tools"
            className="w-full rounded-md border border-white/10 bg-slate-950/80 px-2 py-1.5 text-[12px] text-white outline-none placeholder:text-white/35 focus:border-sky-300"
          />
        </label>
        <div className="grid grid-cols-3 gap-1" data-testid="build-tool-grid">
          {visibleTiles.map((tile) => {
            const entries = tile.kinds.map((kind) => entriesByKind.get(kind)).filter((entry): entry is PaletteEntry => entry !== undefined)
            const firstEntry = entries[0]
            if (!firstEntry) {
              return null
            }
            if (entries.length === 1) {
              return <ToolButton key={tile.id} entry={firstEntry} compact selected={entryKey(firstEntry) === selectedEntryKey} onActivate={activateEntry} onActiveChange={setActiveEntry} />
            }

            const family = { id: tile.id, label: tile.label ?? firstEntry.name, kinds: tile.kinds }
            const selectedEntry = entries.find((entry) => entryKey(entry) === selectedEntryKey)
            const displayEntry = selectedEntry ?? entries.find((entry) => !entry.locked) ?? firstEntry
            return (
              <FamilyButton
                key={family.id}
                family={family}
                entries={entries}
                displayEntry={displayEntry}
                expanded={openFamilyId === family.id}
                selected={selectedEntry !== undefined}
              onToggle={() => setOpenFamilyId((current) => current === family.id ? null : family.id)}
              onActiveChange={setActiveEntry}
              setTriggerNode={(node) => {
                if (node) {
                  familyTriggerNodesRef.current.set(family.id, node)
                } else {
                  familyTriggerNodesRef.current.delete(family.id)
                }
              }}
              />
            )
          })}
        </div>
        {normalizedQuery && searchResults.length === 0 && (
          <div className="rounded bg-white/5 px-2 py-3 text-center text-[12px] text-white/55">No matching build tools.</div>
        )}
      </div>
      {openFamilyDefinition && (
        <div
          id={`family-options-${openFamilyDefinition.id}`}
          role="group"
          aria-label={`${openFamilyDefinition.label ?? openFamilyDefinition.id} variants`}
          className="absolute left-0 top-14 z-30 max-h-[calc(100dvh-5rem)] w-56 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-sm sm:left-full sm:ml-2 sm:w-64"
        >
          <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-white/50">{openFamilyDefinition.label}</div>
          <div className="flex flex-col gap-1">
            {openFamilyEntries.map((entry) => (
              <ToolButton
                key={entryKey(entry)}
                entry={entry}
                selected={entryKey(entry) === selectedEntryKey}
                onActivate={activateEntry}
                onActiveChange={setActiveEntry}
              />
            ))}
          </div>
          {detailsEntry && openFamilyEntries.some((entry) => entryKey(entry) === entryKey(detailsEntry)) && <PaletteDetails entry={detailsEntry} />}
        </div>
      )}
      {detailsEntry && !openFamilyDefinition && (
        <div className="absolute left-0 top-14 z-20 w-56 rounded-xl border border-white/10 bg-slate-950/95 px-3 pb-3 shadow-2xl backdrop-blur-sm sm:left-full sm:top-0 sm:ml-2 sm:w-64">
          <PaletteDetails entry={detailsEntry} />
        </div>
      )}
    </div>
  )
}
