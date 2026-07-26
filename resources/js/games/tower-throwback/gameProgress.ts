import type { LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { isRecord, parseArray, parseInteger, parseNumber, parseString, safeLocalStorage } from '../_shared/progressParsers'
import { ITEM_DEFS, itemDef, SHAFT_DEFS } from './engine/catalog'
import { personTickAccumulatorOf, restorePersonTickAccumulator } from './engine/engine'
import { createGridLayers, rebuildGrid } from './engine/grid'
import { type HotelRuntimeSnapshot, restoreHotelRuntime, snapshotHotelRuntime } from './engine/hotel'
import { type IncidentRuntimeSnapshot, restoreIncidentRuntime, snapshotIncidentRuntime } from './engine/incidents'
import { cantileverFacing, endgamePlacementFloors, intersectingBuildExclusion } from './engine/mapGeometry'
import { getMap, isKnownMapId } from './engine/maps'
import { type ParkingRuntimeSnapshot, restoreParkingRuntime, snapshotParkingRuntime } from './engine/parking'
import { type PeopleRuntimeSnapshot, restorePeopleRuntime, snapshotPeopleRuntime } from './engine/people'
import { restoreRng } from './engine/rng'
import { restoreScheduleRuntime, type ScheduleRuntimeSnapshot, snapshotScheduleRuntime } from './engine/schedules'
import { restoreTrashRuntime, snapshotTrashRuntime, type TrashRuntimeSnapshot } from './engine/trash'
import { restoreVipRuntime, snapshotVipRuntime, type VipRuntimeSnapshot } from './engine/vip'
import type {
  BombThreatState,
  Car,
  CarState,
  DamageKind,
  DayLedger,
  DirectionPriority,
  EngineOptions,
  EngineState,
  FireState,
  GameClock,
  GameSpeed,
  IncomeTier,
  ItemKind,
  JourneyLeg,
  JourneyPurpose,
  LedgerLine,
  Loan,
  PendingLoanCommand,
  Person,
  PersonState,
  RentTier,
  Shaft,
  ShaftKind,
  ShaftProgram,
  StarLevel,
  TenantRequest,
  TierCounts,
  TowerMilestone,
  Unit,
  UnitFlags,
  UnitGrade,
  VacancyReason,
  VipRecord,
  VipState,
  VipTarget,
} from './gameTypes'
import {
  FLOOR_MAX,
  FLOOR_MIN,
  GRID_WIDTH,
  MILESTONE_ORDER,
  PROGRESS_STORAGE_KEY,
  SANDBOX_SLOT_IDS,
  SANDBOX_SLOT_LABELS,
  SANDBOX_STORAGE_KEY,
  type SandboxSlotId,
  TOTAL_MILESTONES,
  TUNING,
} from './gameTypes'
import { MAX_SANDBOX_JSON_CHARS } from './saveBudget'

const MAX_ENTITY_COUNT = (FLOOR_MAX - FLOOR_MIN + 1) * GRID_WIDTH

export interface SavedTowerProgress {
  version: 2
  milestones: TowerMilestone[]
  /**
   * UI preference (additive, versioned): the first-session getting-started
   * checklist was dismissed by the player. Absent/false ⇒ not dismissed. Only
   * serialized when true so pre-existing saves round-trip byte-for-byte.
   */
  gettingStartedDismissed?: boolean
  /** Additive UI preference for Niagara's terminal-floor cantilever hint. */
  observationDeckHintDismissed?: boolean
}

export function defaultProgress(): SavedTowerProgress {
  return { version: 2, milestones: [] }
}

export function loadSavedProgress(): SavedTowerProgress {
  const storage = safeLocalStorage()
  if (!storage) {
    return defaultProgress()
  }

  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) {
      return defaultProgress()
    }

    return parseSavedProgress(JSON.parse(raw)) ?? defaultProgress()
  } catch {
    return defaultProgress()
  }
}

export function saveProgress(progress: SavedTowerProgress): void {
  const storage = safeLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Storage full/unavailable — progress is best-effort.
  }
}

export function resetProgress(): void {
  saveProgress(defaultProgress())
}

/**
 * Records a milestone: idempotent (recording an already-earned milestone is a
 * no-op) and order-independent — the sim can report milestones out of order.
 */
export function recordMilestone(milestone: TowerMilestone): SavedTowerProgress {
  const progress = loadSavedProgress()
  if (progress.milestones.includes(milestone)) {
    return progress
  }

  const next = withUiPreferences({ version: 2, milestones: [...progress.milestones, milestone] }, progress)
  saveProgress(next)

  return next
}

/** True once the player has dismissed the first-session getting-started checklist. */
export function isGettingStartedDismissed(): boolean {
  return loadSavedProgress().gettingStartedDismissed === true
}

/**
 * Persist the getting-started dismissal additively: milestones and every other
 * existing field are preserved, only the preference flag is added.
 */
export function dismissGettingStarted(): SavedTowerProgress {
  const progress = loadSavedProgress()
  if (progress.gettingStartedDismissed) {
    return progress
  }

  const next = withUiPreferences({ version: 2, milestones: [...progress.milestones] }, {
    ...progress,
    gettingStartedDismissed: true,
  })
  saveProgress(next)

  return next
}

export function isObservationDeckHintDismissed(): boolean {
  return loadSavedProgress().observationDeckHintDismissed === true
}

/** Persist only the Niagara hint preference while preserving every sibling field. */
export function dismissObservationDeckHint(): SavedTowerProgress {
  const progress = loadSavedProgress()
  if (progress.observationDeckHintDismissed) {
    return progress
  }

  const next = withUiPreferences({ version: 2, milestones: [...progress.milestones] }, {
    ...progress,
    observationDeckHintDismissed: true,
  })
  saveProgress(next)

  return next
}

/** Re-attach true UI flags only, so old/unset progress remains field-for-field identical. */
function withUiPreferences(progress: SavedTowerProgress, preferences: Pick<SavedTowerProgress, 'gettingStartedDismissed' | 'observationDeckHintDismissed'>): SavedTowerProgress {
  const withGettingStarted = preferences.gettingStartedDismissed
    ? { ...progress, gettingStartedDismissed: true as const }
    : progress
  return preferences.observationDeckHintDismissed
    ? { ...withGettingStarted, observationDeckHintDismissed: true }
    : withGettingStarted
}

function parseSavedProgress(value: unknown): SavedTowerProgress | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    return null
  }

  const milestones = parseMilestones(value.milestones)
  if (milestones === null) {
    return null
  }

  return withUiPreferences({ version: 2, milestones }, {
    gettingStartedDismissed: value.gettingStartedDismissed === true,
    observationDeckHintDismissed: value.observationDeckHintDismissed === true,
  })
}

function parseMilestones(value: unknown): TowerMilestone[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const milestones: TowerMilestone[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !MILESTONE_ORDER.includes(entry as TowerMilestone)) {
      return null
    }

    milestones.push(entry as TowerMilestone)
  }

  return milestones
}

/**
 * Catalog adapter: Tower Throwback has no discrete levels, so the Game
 * Select card treats each milestone as a synthetic "level" (index + 1) worth
 * full stars once reached, mirroring `hover/gameProgress.ts`'s map adapter.
 */
export function loadProgress(): LevelSelectProgress {
  const saved = loadSavedProgress()
  const stars: Record<number, number> = {}
  let unlockedLevel = 1

  MILESTONE_ORDER.forEach((milestone, index) => {
    if (saved.milestones.includes(milestone)) {
      stars[index + 1] = 3
      unlockedLevel = Math.max(unlockedLevel, Math.min(TOTAL_MILESTONES, index + 2))
    }
  })

  return { unlockedLevel, stars }
}

// ── Sandbox persistence ──────────────────────────────────────────────────────
//
// Sandbox snapshots are stored under the legacy autosave key plus named slot
// keys. Raw versions are discriminated before sequential migration to the
// current contract. Corrupt JSON or an unknown version is rejected without
// mutating the stored bytes.

export interface SavedSandboxV1 {
  version: 1
  mapId: string
  seed: number
  /** Internal mulberry32 counter from state.rng.state() — resumes the stream. */
  rngState: number
  clock: GameClock
  speed: GameSpeed
  fastMode: boolean
  /** Optional only at the storage boundary so pre-option v1 saves remain valid. */
  options?: EngineOptions
  funds: number
  loans: Loan[]
  lobbyHeight: 1 | 2 | 3
  star: StarLevel
  maxStarReached: StarLevel
  towerAchieved: boolean
  milestonesEarned: TowerMilestone[]
  vips: VipRecord[]
  units: Unit[]
  shafts: Shaft[]
  structureVersion: number
  nextId: number
}

export interface SavedRuntimeState {
  personTickAccumulator: number
  schedules: ScheduleRuntimeSnapshot
  people: PeopleRuntimeSnapshot
  incidents: IncidentRuntimeSnapshot
  parking: ParkingRuntimeSnapshot
  trash: TrashRuntimeSnapshot
  hotel: HotelRuntimeSnapshot
  vip: VipRuntimeSnapshot
}

export interface SavedSandbox {
  version: 2
  mapId: string
  seed: number
  rngState: number
  clock: GameClock
  speed: GameSpeed
  fastMode: boolean
  options: EngineOptions
  funds: number
  loans: Loan[]
  lobbyHeight: 1 | 2 | 3
  star: StarLevel
  maxStarReached: StarLevel
  towerAchieved: boolean
  milestonesEarned: TowerMilestone[]
  vips: VipRecord[]
  units: Unit[]
  shafts: Shaft[]
  people: Person[]
  activeBombThreat: BombThreatState | null
  activeFire: FireState | null
  activeRequest: TenantRequest | null
  ledgerToday: DayLedger
  ledgerHistory: DayLedger[]
  pendingLoanPrompt: { shortfall: number; suggested: number } | null
  pendingLoanCommands: PendingLoanCommand[]
  runtime: SavedRuntimeState
  structureVersion: number
  nextId: number
}

export interface SandboxSlotSummary {
  id: SandboxSlotId
  label: string
  saved: boolean
  loadFailure: 'unknownMap' | null
  day: number | null
  star: StarLevel | null
  population: number | null
  funds: number | null
}

export type SandboxWriteResult =
  | { ok: true }
  | { ok: false; reason: 'storageUnavailable' | 'quotaExceeded' | 'slotOwnedByAnotherTab' }

export type SandboxImportResult =
  | { ok: true; saved: SavedSandbox }
  | { ok: false; reason: 'invalidJson' | 'invalidPayload' | 'storageUnavailable' | 'quotaExceeded' }

function sandboxStorageKey(slotId: SandboxSlotId): string {
  return slotId === 'autosave' ? SANDBOX_STORAGE_KEY : `${SANDBOX_STORAGE_KEY}.${slotId}`
}

export function sandboxOwnerStorageKey(slotId: SandboxSlotId): string {
  return `${sandboxStorageKey(slotId)}.owner`
}

export function createSandboxSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const TAB_SESSION_STORAGE_KEY = `${SANDBOX_STORAGE_KEY}.tabSession`

/**
 * A per-TAB session id that is stable across page reloads. Kept in
 * sessionStorage (scoped to one tab and preserved through F5) rather than
 * regenerated on every mount — otherwise a reloaded tab gets a new id, sees the
 * owner marker it wrote before as belonging to "another tab", and locks itself
 * out of saving. A genuinely separate tab still gets its own id, so real
 * multi-tab conflicts are still detected.
 */
export function getOrCreateTabSessionId(): string {
  if (typeof window === 'undefined') {
    return createSandboxSessionId()
  }
  try {
    const existing = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)
    if (existing) {
      return existing
    }
    const id = createSandboxSessionId()
    window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, id)
    return id
  } catch {
    return createSandboxSessionId()
  }
}

export function claimSandboxSlot(slotId: SandboxSlotId, sessionId: string): SandboxWriteResult {
  const storage = safeLocalStorage()
  if (!storage) {
    return { ok: false, reason: 'storageUnavailable' }
  }

  try {
    storage.setItem(sandboxOwnerStorageKey(slotId), sessionId)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quotaExceeded' }
  }
}

export function isSandboxSlotOwnedByAnotherTab(slotId: SandboxSlotId, sessionId: string): boolean {
  const storage = safeLocalStorage()
  if (!storage) {
    return false
  }

  try {
    const owner = storage.getItem(sandboxOwnerStorageKey(slotId))
    return owner !== null && owner !== sessionId
  } catch {
    return false
  }
}

function sandboxFromState(state: EngineState): SavedSandbox {
  return {
    version: 2,
    mapId: state.mapId,
    seed: state.seed,
    rngState: state.rng.state(),
    clock: { ...state.clock },
    speed: state.speed,
    fastMode: state.fastMode,
    options: { ...state.options },
    funds: state.funds,
    loans: state.loans.map((loan) => ({ ...loan })),
    lobbyHeight: state.lobbyHeight,
    star: state.star,
    maxStarReached: state.maxStarReached,
    towerAchieved: state.towerAchieved,
    milestonesEarned: [...state.milestonesEarned],
    vips: state.vips.map((vip) => ({ ...vip, lastReport: [...vip.lastReport] })),
    units: state.units.map((unit) => ({
      ...unit,
      population: { ...unit.population },
      flags: { ...unit.flags },
    })),
    shafts: state.shafts.map((shaft) => ({
      ...shaft,
      stops: [...shaft.stops],
      enabledStops: [...shaft.enabledStops],
      cars: shaft.cars.map((car) => ({ ...car, passengerIds: [...car.passengerIds] })),
      program: {
        weekday: { ...shaft.program.weekday },
        weekend: { ...shaft.program.weekend },
        idleAnswerThreshold: shaft.program.idleAnswerThreshold,
        doorDwellSec: shaft.program.doorDwellSec,
      },
      stats: { ...shaft.stats },
    })),
    people: state.people.map((person) => ({ ...person, legs: person.legs.map((leg) => ({ ...leg })) })),
    activeBombThreat: state.activeBombThreat ? { ...state.activeBombThreat } : null,
    activeFire: state.activeFire ? { ...state.activeFire, burningUnitIds: [...state.activeFire.burningUnitIds] } : null,
    activeRequest: state.activeRequest ? { ...state.activeRequest } : null,
    ledgerToday: { day: state.ledgerToday.day, lines: { ...state.ledgerToday.lines } },
    ledgerHistory: state.ledgerHistory.map((ledger) => ({ day: ledger.day, lines: { ...ledger.lines } })),
    pendingLoanPrompt: state.pendingLoanPrompt ? { ...state.pendingLoanPrompt } : null,
    pendingLoanCommands: state.pendingLoanCommands.map((command) => ({ ...command })),
    runtime: {
      personTickAccumulator: personTickAccumulatorOf(state),
      schedules: snapshotScheduleRuntime(state),
      people: snapshotPeopleRuntime(state),
      incidents: snapshotIncidentRuntime(state),
      parking: snapshotParkingRuntime(state),
      trash: snapshotTrashRuntime(state),
      hotel: snapshotHotelRuntime(state),
      vip: snapshotVipRuntime(state),
    },
    structureVersion: state.structureVersion,
    nextId: state.nextId,
  }
}

function writeSandbox(saved: SavedSandbox, slotId: SandboxSlotId, sessionId?: string): SandboxWriteResult {
  const storage = safeLocalStorage()
  if (!storage) {
    return { ok: false, reason: 'storageUnavailable' }
  }
  if (sessionId && isSandboxSlotOwnedByAnotherTab(slotId, sessionId)) {
    return { ok: false, reason: 'slotOwnedByAnotherTab' }
  }
  try {
    const serialized = JSON.stringify(saved)
    if (serialized.length > MAX_SANDBOX_JSON_CHARS) {
      return { ok: false, reason: 'quotaExceeded' }
    }
    storage.setItem(sandboxStorageKey(slotId), serialized)
    if (sessionId) {
      storage.setItem(sandboxOwnerStorageKey(slotId), sessionId)
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'quotaExceeded' }
  }
}

export function saveSandbox(state: EngineState, slotId: SandboxSlotId = 'autosave', sessionId?: string): SandboxWriteResult {
  return writeSandbox(sandboxFromState(state), slotId, sessionId)
}

export function loadSandbox(slotId: SandboxSlotId = 'autosave'): SavedSandbox | null {
  const storage = safeLocalStorage()
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(sandboxStorageKey(slotId))
    if (!raw) {
      return null
    }
    if (raw.length > MAX_SANDBOX_JSON_CHARS) {
      return null
    }
    return parseSandbox(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Why a slot failed to load, when the answer is more useful than "unreadable".
 *
 * A save built on a map this build does not have is INTACT — it just needs a
 * newer version. Reporting that as "empty or unreadable" tells the player their
 * tower is gone when it is not, which is the worst possible wrong answer.
 */
export function sandboxLoadFailure(slotId: SandboxSlotId = 'autosave'): 'unknownMap' | null {
  const storage = safeLocalStorage()
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(sandboxStorageKey(slotId))
    if (!raw || raw.length > MAX_SANDBOX_JSON_CHARS) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    const mapId = typeof parsed === 'object' && parsed !== null ? (parsed as { mapId?: unknown }).mapId : undefined

    return typeof mapId === 'string' && !isKnownMapId(mapId) ? 'unknownMap' : null
  } catch {
    return null
  }
}

export function clearSandbox(slotId: SandboxSlotId = 'autosave'): void {
  const storage = safeLocalStorage()
  storage?.removeItem(sandboxStorageKey(slotId))
  storage?.removeItem(sandboxOwnerStorageKey(slotId))
}

export function loadSandboxSlotSummaries(): SandboxSlotSummary[] {
  return SANDBOX_SLOT_IDS.map((slotId) => {
    const saved = loadSandbox(slotId)
    if (!saved) {
      return {
        id: slotId,
        label: SANDBOX_SLOT_LABELS[slotId],
        saved: false,
        loadFailure: sandboxLoadFailure(slotId),
        day: null,
        star: null,
        population: null,
        funds: null,
      }
    }

    return {
      id: slotId,
      label: SANDBOX_SLOT_LABELS[slotId],
      saved: true,
      loadFailure: null,
      day: saved.clock.day,
      star: saved.star,
      population: saved.units.reduce((sum, unit) => sum + unit.population.low + unit.population.med + unit.population.high + unit.population.vip, 0),
      funds: saved.funds,
    }
  })
}

export function exportSandbox(saved: SavedSandbox): string {
  return JSON.stringify(saved, null, 2)
}

export function importSandbox(raw: string, slotId: SandboxSlotId): SandboxImportResult {
  if (raw.length > MAX_SANDBOX_JSON_CHARS) {
    return { ok: false, reason: 'invalidPayload' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalidJson' }
  }

  const saved = parseSandbox(parsed)
  if (!saved) {
    return { ok: false, reason: 'invalidPayload' }
  }

  const writeResult = writeSandbox(saved, slotId)
  if (!writeResult.ok) {
    switch (writeResult.reason) {
      case 'storageUnavailable':
        return { ok: false, reason: 'storageUnavailable' }
      case 'quotaExceeded':
        return { ok: false, reason: 'quotaExceeded' }
      case 'slotOwnedByAnotherTab':
        return { ok: false, reason: 'storageUnavailable' }
    }
  }

  return { ok: true, saved }
}

/** Rehydrate a migrated current-version sandbox into a runnable EngineState. */
export function restoreSandbox(saved: SavedSandbox): EngineState {
  const state: EngineState = {
    mapId: saved.mapId,
    seed: saved.seed,
    rng: restoreRng(saved.rngState),
    clock: { ...saved.clock },
    speed: saved.speed,
    fastMode: saved.fastMode,
    options: { disastersEnabled: saved.options?.disastersEnabled ?? true },
    funds: saved.funds,
    loans: saved.loans.map((loan) => ({ ...loan })),
    lobbyHeight: saved.lobbyHeight,
    star: saved.star,
    maxStarReached: saved.maxStarReached,
    towerAchieved: saved.towerAchieved,
    units: saved.units.map((unit) => ({
      ...unit,
      population: { ...unit.population },
      flags: { ...unit.flags },
    })),
    shafts: saved.shafts.map((shaft) => ({
      ...shaft,
      stops: [...shaft.stops],
      enabledStops: [...shaft.enabledStops],
      cars: shaft.cars.map((car) => ({ ...car, passengerIds: [...car.passengerIds] })),
      program: {
        weekday: { ...shaft.program.weekday },
        weekend: { ...shaft.program.weekend },
        idleAnswerThreshold: shaft.program.idleAnswerThreshold,
        doorDwellSec: shaft.program.doorDwellSec,
      },
      stats: { ...shaft.stats },
    })),
    people: saved.people.map((person) => ({ ...person, legs: person.legs.map((leg) => ({ ...leg })) })),
    vips: saved.vips.map((vip) => ({ ...vip, lastReport: [...vip.lastReport] })),
    activeBombThreat: saved.activeBombThreat ? { ...saved.activeBombThreat } : null,
    activeFire: saved.activeFire ? { ...saved.activeFire, burningUnitIds: [...saved.activeFire.burningUnitIds] } : null,
    activeRequest: saved.activeRequest ? { ...saved.activeRequest } : null,
    ledgerToday: { day: saved.ledgerToday.day, lines: { ...saved.ledgerToday.lines } },
    ledgerHistory: saved.ledgerHistory.map((ledger) => ({ day: ledger.day, lines: { ...ledger.lines } })),
    milestonesEarned: [...saved.milestonesEarned],
    pendingLoanPrompt: saved.pendingLoanPrompt ? { ...saved.pendingLoanPrompt } : null,
    pendingLoanCommands: saved.pendingLoanCommands.map((command) => ({ ...command })),
    structureVersion: saved.structureVersion,
    nextId: saved.nextId,
    grid: createGridLayers(),
  }
  rebuildGrid(state)
  restorePersonTickAccumulator(state, saved.runtime.personTickAccumulator)
  restoreScheduleRuntime(state, saved.runtime.schedules)
  restorePeopleRuntime(state, saved.runtime.people)
  restoreIncidentRuntime(state, saved.runtime.incidents)
  restoreParkingRuntime(state, saved.runtime.parking)
  restoreTrashRuntime(state, saved.runtime.trash)
  restoreHotelRuntime(state, saved.runtime.hotel)
  restoreVipRuntime(state, saved.runtime.vip)
  return state
}

/** Decode one raw wire payload and migrate it through every intervening version. */
export function migrateSandboxPayload(value: unknown): SavedSandbox | null {
  if (!isRecord(value)) {
    return null
  }

  switch (value.version) {
    case 1: {
      const v1 = parseSandboxV1(value)
      if (!v1) {
        return null
      }
      const migrated = migrateSandboxV1ToV2(v1)
      return validateSandboxConsistency(migrated) ? migrated : null
    }
    case 2: {
      const current = parseSandboxV2(value)
      return current && validateSandboxConsistency(current) ? current : null
    }
    default:
      return null
  }
}

function parseSandbox(value: unknown): SavedSandbox | null {
  return migrateSandboxPayload(value)
}

function migrateSandboxV1ToV2(saved: SavedSandboxV1): SavedSandbox {
  return {
    ...saved,
    version: 2,
    options: saved.options ?? { disastersEnabled: true },
    people: [],
    activeBombThreat: null,
    activeFire: null,
    activeRequest: null,
    ledgerToday: { day: saved.clock.day, lines: {} },
    ledgerHistory: [],
    pendingLoanPrompt: null,
    pendingLoanCommands: [],
    runtime: emptyRuntimeState(),
  }
}

function emptyRuntimeState(): SavedRuntimeState {
  return {
    personTickAccumulator: 0,
    schedules: { pending: [] },
    people: { overflow: [], plans: [], dwell: [], queuedMin: [] },
    incidents: { threatDeadlineAbs: null, requestBaseline: null, evalBonusUntilDay: null },
    parking: { stallsByOffice: [] },
    trash: { loads: [] },
    hotel: { pending: [] },
    vip: { arrivals: [], visit: null },
  }
}

function parseSandboxV2(value: unknown): SavedSandbox | null {
  if (!isRecord(value) || value.version !== 2 || value.options === undefined) {
    return null
  }

  const base = parseSandboxV1({ ...value, version: 1 })
  const people = parseArray(value.people, parsePerson)
  const activeBombThreat = parseNullable(value.activeBombThreat, parseBombThreat)
  const activeFire = parseNullable(value.activeFire, parseFire)
  const activeRequest = parseNullable(value.activeRequest, parseTenantRequest)
  const ledgerToday = parseDayLedger(value.ledgerToday)
  const ledgerHistory = parseArray(value.ledgerHistory, parseDayLedger)
  const pendingLoanPrompt = parseNullable(value.pendingLoanPrompt, parseLoanPrompt)
  const pendingLoanCommands = parseArray(value.pendingLoanCommands, parsePendingLoanCommand)
  const runtime = parseRuntimeState(value.runtime)
  if (
    base === null ||
    people === null ||
    activeBombThreat === undefined ||
    activeFire === undefined ||
    activeRequest === undefined ||
    ledgerToday === null ||
    ledgerHistory === null ||
    pendingLoanPrompt === undefined ||
    pendingLoanCommands === null ||
    runtime === null
  ) {
    return null
  }

  return {
    ...base,
    version: 2,
    options: base.options ?? { disastersEnabled: true },
    people,
    activeBombThreat,
    activeFire,
    activeRequest,
    ledgerToday,
    ledgerHistory,
    pendingLoanPrompt,
    pendingLoanCommands,
    runtime,
  }
}

function parseNullable<T>(value: unknown, parser: (entry: unknown) => T | null): T | null | undefined {
  return value === null ? null : parser(value) ?? undefined
}

function parseJourneyLeg(value: unknown): JourneyLeg | null {
  if (!isRecord(value)) {
    return null
  }
  const type = isOneOf(['walk', 'elevator', 'stairs', 'escalator', 'skybridge'] as const, value.type) ? value.type : null
  const fromFloor = parseInteger(value.fromFloor)
  const fromX = parseNumber(value.fromX)
  const toFloor = parseInteger(value.toFloor)
  const toX = parseNumber(value.toX)
  const shaftId = value.shaftId === undefined ? undefined : parseInteger(value.shaftId, 1) ?? null
  if (
    type === null ||
    fromFloor === null ||
    fromX === null ||
    toFloor === null ||
    toX === null ||
    shaftId === null ||
    !isFloor(fromFloor) ||
    !isFloor(toFloor) ||
    !isX(fromX) ||
    !isX(toX)
  ) {
    return null
  }
  return shaftId === undefined ? { type, fromFloor, fromX, toFloor, toX } : { type, fromFloor, fromX, toFloor, toX, shaftId }
}

function parseJourneyPurpose(value: unknown): JourneyPurpose | null {
  return isOneOf(
    ['commuteIn', 'commuteOut', 'lunch', 'errand', 'shopping', 'amenity', 'hotelCheckIn', 'hotelCheckOut', 'housekeeping', 'trashHaul', 'vipVisit'] as const,
    value,
  ) ? value : null
}

function parsePerson(value: unknown): Person | null {
  if (!isRecord(value)) {
    return null
  }
  const id = parseInteger(value.id, 1)
  const tier = parseIncomeTier(value.tier)
  const vip = parseBoolean(value.vip)
  const state = isOneOf(['walking', 'queued', 'riding'] as const, value.state) ? value.state as PersonState : null
  const floor = parseNumber(value.floor)
  const x = parseNumber(value.x)
  const patienceLeft = parseNumber(value.patienceLeft)
  const irritated = parseBoolean(value.irritated)
  const legs = parseArray(value.legs, parseJourneyLeg)
  const legIndex = parseInteger(value.legIndex, 0)
  const purpose = parseJourneyPurpose(value.purpose)
  const tenantUnitId = parseNullableInteger(value.tenantUnitId)
  const destUnitId = parseNullableInteger(value.destUnitId)
  if (id === null || tier === null || vip === null || state === null || floor === null || x === null || !isFloor(floor) || !isX(x) || patienceLeft === null || patienceLeft < 0 || irritated === null || legs === null || legIndex === null || legIndex > legs.length || purpose === null || tenantUnitId === undefined || destUnitId === undefined) {
    return null
  }
  return { id, tier, vip, state, floor, x, patienceLeft, irritated, legs, legIndex, purpose, tenantUnitId, destUnitId }
}

function parseBombThreat(value: unknown): BombThreatState | null {
  if (!isRecord(value) || value.kind !== 'bombThreat') {
    return null
  }
  const floor = parseInteger(value.floor)
  const x = parseNumber(value.x)
  const sweepRemainingMin = parseNullableNumber(value.sweepRemainingMin)
  const ransom = parseNumber(value.ransom)
  return floor === null || !isFloor(floor) || x === null || !isX(x) || sweepRemainingMin === undefined || (sweepRemainingMin !== null && sweepRemainingMin < 0) || ransom === null || ransom < 0
    ? null
    : { kind: 'bombThreat', floor, x, sweepRemainingMin, ransom }
}

function parseFire(value: unknown): FireState | null {
  if (!isRecord(value) || value.kind !== 'fire') {
    return null
  }
  const floor = parseInteger(value.floor)
  const burningUnitIds = parseArray(value.burningUnitIds, (entry) => parseInteger(entry, 1))
  const spreadRemainingMin = parseNumber(value.spreadRemainingMin)
  const responseRemainingMin = parseNumber(value.responseRemainingMin)
  return floor === null || !isFloor(floor) || burningUnitIds === null || new Set(burningUnitIds).size !== burningUnitIds.length || spreadRemainingMin === null || spreadRemainingMin < 0 || responseRemainingMin === null || responseRemainingMin < 0
    ? null
    : { kind: 'fire', floor, burningUnitIds, spreadRemainingMin, responseRemainingMin }
}

function parseTenantRequest(value: unknown): TenantRequest | null {
  if (!isRecord(value)) {
    return null
  }
  const id = parseInteger(value.id, 1)
  const description = parseString(value.description)
  const wantsKind = parseItemKind(value.wantsKind) ?? parseShaftKind(value.wantsKind)
  const nearFloor = parseInteger(value.nearFloor)
  const expiresDay = parseInteger(value.expiresDay, 1)
  return id === null || description === null || wantsKind === null || nearFloor === null || !isFloor(nearFloor) || expiresDay === null
    ? null
    : { id, description, wantsKind, nearFloor, expiresDay }
}

const LEDGER_LINES: readonly LedgerLine[] = [
  'rent.office', 'rent.residential', 'sales.commerce', 'sales.amenity', 'sales.medical', 'hotel.nights', 'events.income',
  'maint.transit', 'maint.commerce', 'maint.hotel', 'maint.services', 'maint.structure', 'construction', 'demolition.refund',
  'repairs', 'loan.principal', 'loan.repayment', 'bonus.star', 'bonus.vip', 'incident.cost',
]

function parseDayLedger(value: unknown): DayLedger | null {
  if (!isRecord(value) || !isRecord(value.lines)) {
    return null
  }
  const day = parseInteger(value.day, 0)
  const lines: DayLedger['lines'] = {}
  for (const [key, rawAmount] of Object.entries(value.lines)) {
    if (!LEDGER_LINES.includes(key as LedgerLine)) {
      return null
    }
    const amount = parseNumber(rawAmount)
    if (amount === null) {
      return null
    }
    lines[key as LedgerLine] = amount
  }
  return day === null ? null : { day, lines }
}

function parseLoanPrompt(value: unknown): { shortfall: number; suggested: number } | null {
  if (!isRecord(value)) {
    return null
  }
  const shortfall = parseNumber(value.shortfall)
  const suggested = parseNumber(value.suggested)
  return shortfall === null || suggested === null ? null : { shortfall, suggested }
}

function parsePendingLoanCommand(value: unknown): PendingLoanCommand | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.type === 'place') {
    const kind = parseItemKind(value.kind)
    const floor = parseInteger(value.floor)
    const x = parseInteger(value.x, 0)
    const widthTiles = value.widthTiles === undefined ? undefined : parseInteger(value.widthTiles, 1) ?? null
    return kind === null || floor === null || x === null || widthTiles === null ? null : { type: 'place', kind, floor, x, ...(widthTiles === undefined ? {} : { widthTiles }) }
  }
  if (value.type === 'placeShaft') {
    const kind = parseShaftKind(value.kind)
    const x = parseInteger(value.x, 0)
    const bottomFloor = parseInteger(value.bottomFloor)
    const topFloor = parseInteger(value.topFloor)
    return kind === null || x === null || bottomFloor === null || topFloor === null ? null : { type: 'placeShaft', kind, x, bottomFloor, topFloor }
  }
  if (value.type === 'resizeShaft') {
    const shaftId = parseInteger(value.shaftId, 1)
    const bottomFloor = parseInteger(value.bottomFloor)
    const topFloor = parseInteger(value.topFloor)
    return shaftId === null || bottomFloor === null || topFloor === null ? null : { type: 'resizeShaft', shaftId, bottomFloor, topFloor }
  }
  return null
}

function parseRuntimeState(value: unknown): SavedRuntimeState | null {
  if (!isRecord(value)) {
    return null
  }
  const personTickAccumulator = parseNumber(value.personTickAccumulator)
  const schedules = parseScheduleRuntime(value.schedules)
  const people = parsePeopleRuntime(value.people)
  const incidents = parseIncidentRuntime(value.incidents)
  const parking = parseNumberArrayMap(value.parking, 'stallsByOffice', true)
  const trash = parseNumberMap(value.trash, 'loads')
  const hotel = parseHotelRuntime(value.hotel)
  const vip = parseVipRuntime(value.vip)
  if (personTickAccumulator === null || personTickAccumulator < 0 || personTickAccumulator >= 1 / TUNING.time.personTickHz || schedules === null || people === null || incidents === null || parking === null || trash === null || hotel === null || vip === null) {
    return null
  }
  return { personTickAccumulator, schedules, people, incidents, parking: { stallsByOffice: parking }, trash: { loads: trash }, hotel, vip }
}

function parsePairs<T>(value: unknown, parseValue: (entry: unknown) => T | null): Array<[number, T]> | null {
  if (!Array.isArray(value)) {
    return null
  }
  const result: Array<[number, T]> = []
  const seen = new Set<number>()
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return null
    }
    const key = parseInteger(pair[0], 0)
    const parsed = parseValue(pair[1])
    if (key === null || parsed === null || seen.has(key)) {
      return null
    }
    seen.add(key)
    result.push([key, parsed])
  }
  return result
}

function parseSpawn(value: unknown, purposes?: readonly JourneyPurpose[]): PeopleRuntimeSnapshot['overflow'][number] | null {
  if (!isRecord(value)) {
    return null
  }
  const tier = parseIncomeTier(value.tier)
  const vip = value.vip === undefined ? undefined : parseBoolean(value.vip)
  const floor = parseInteger(value.floor)
  const x = parseNumber(value.x)
  const toFloor = parseInteger(value.toFloor)
  const toX = parseNumber(value.toX)
  const purpose = parseJourneyPurpose(value.purpose)
  const tenantUnitId = value.tenantUnitId === undefined ? undefined : parseNullableInteger(value.tenantUnitId)
  const destUnitId = value.destUnitId === undefined ? undefined : parseNullableInteger(value.destUnitId)
  const staff = value.staff === undefined ? undefined : parseBoolean(value.staff)
  const dwellMin = value.dwellMin === undefined ? undefined : parseNumber(value.dwellMin)
  if (tier === null || vip === null || floor === null || !isFloor(floor) || x === null || !isX(x) || toFloor === null || !isFloor(toFloor) || toX === null || !isX(toX) || purpose === null || (purposes && !purposes.includes(purpose)) || tenantUnitId === undefined && value.tenantUnitId !== undefined || destUnitId === undefined && value.destUnitId !== undefined || staff === null || dwellMin === null || (dwellMin !== undefined && dwellMin < 0)) {
    return null
  }
  return { tier, ...(vip === undefined ? {} : { vip }), floor, x, toFloor, toX, purpose, ...(tenantUnitId === undefined ? {} : { tenantUnitId }), ...(destUnitId === undefined ? {} : { destUnitId }), ...(staff === undefined ? {} : { staff }), ...(dwellMin === undefined ? {} : { dwellMin }) }
}

function parseScheduleRuntime(value: unknown): ScheduleRuntimeSnapshot | null {
  if (!isRecord(value)) {
    return null
  }
  const pending = parsePairs(value.pending, (entries) => parseArray(entries, (entry) => parseSpawn(entry, ['lunch', 'errand', 'amenity'])))
  return pending === null || pending.some(([minute]) => minute >= 1440) ? null : { pending: pending as ScheduleRuntimeSnapshot['pending'] }
}

function parsePeopleRuntime(value: unknown): PeopleRuntimeSnapshot | null {
  if (!isRecord(value)) {
    return null
  }
  const overflow = parseArray(value.overflow, parseSpawn)
  const plans = parsePairs(value.plans, (entry) => {
    if (!isRecord(entry)) return null
    const staff = parseBoolean(entry.staff)
    const dwellMin = parseNullableNumber(entry.dwellMin)
    const returnTo = parseNullable(entry.returnTo, (point) => {
      if (!isRecord(point)) return null
      const floor = parseInteger(point.floor)
      const x = parseNumber(point.x)
      return floor === null || x === null ? null : { floor, x }
    })
    return staff === null || dwellMin === undefined || returnTo === undefined ? null : { staff, dwellMin, returnTo }
  })
  const dwell = parsePairs(value.dwell, parseNumber)
  const queuedMin = parsePairs(value.queuedMin, parseNumber)
  return overflow === null || plans === null || dwell === null || dwell.some(([, minutes]) => minutes < 0) || queuedMin === null || queuedMin.some(([, minutes]) => minutes < 0) ? null : { overflow, plans, dwell, queuedMin }
}

function parseIncidentRuntime(value: unknown): IncidentRuntimeSnapshot | null {
  if (!isRecord(value)) return null
  const threatDeadlineAbs = parseNullableNumber(value.threatDeadlineAbs)
  const requestBaseline = value.requestBaseline === null ? null : parseArray(value.requestBaseline, (entry) => parseInteger(entry, 1))
  const evalBonusUntilDay = parseNullableNumber(value.evalBonusUntilDay)
  return threatDeadlineAbs === undefined || requestBaseline === null && value.requestBaseline !== null || (requestBaseline !== null && new Set(requestBaseline).size !== requestBaseline.length) || evalBonusUntilDay === undefined
    ? null
    : { threatDeadlineAbs, requestBaseline, evalBonusUntilDay }
}

function parseNumberArrayMap(value: unknown, field: string, integers: boolean): Array<[number, number[]]> | null {
  if (!isRecord(value)) return null
  return parsePairs(value[field], (entry) => parseArray(entry, (item) => integers ? parseInteger(item, 1) : parseNumber(item)))
}

function parseNumberMap(value: unknown, field: string): Array<[number, number]> | null {
  if (!isRecord(value)) return null
  return parsePairs(value[field], (entry) => {
    const parsed = parseNumber(entry)
    return parsed !== null && parsed >= 0 ? parsed : null
  })
}

function parseHotelRuntime(value: unknown): HotelRuntimeSnapshot | null {
  if (!isRecord(value)) return null
  const pending = parsePairs(value.pending, (entries) => parseArray(entries, (entry) => {
    if (!isRecord(entry)) return null
    const roomId = parseInteger(entry.roomId, 1)
    const tier = parseIncomeTier(entry.tier)
    const direction = isOneOf(['in', 'out'] as const, entry.direction) ? entry.direction : null
    return roomId === null || tier === null || direction === null ? null : { roomId, tier, direction }
  }))
  return pending === null || pending.some(([minute]) => minute >= 1440) ? null : { pending }
}

function parseVipRuntime(value: unknown): VipRuntimeSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.arrivals)) return null
  const arrivals: VipRuntimeSnapshot['arrivals'] = []
  const arrivalTargets = new Set<VipTarget>()
  for (const pair of value.arrivals) {
    if (!Array.isArray(pair) || pair.length !== 2) return null
    const target = parseVipTarget(pair[0])
    const minute = parseNumber(pair[1])
    if (target === null || minute === null || minute < 0 || arrivalTargets.has(target)) return null
    arrivalTargets.add(target)
    arrivals.push([target, minute])
  }
  const visit = parseNullable(value.visit, parseVipVisit)
  return visit === undefined ? null : { arrivals, visit }
}

function parseVipVisit(value: unknown): NonNullable<VipRuntimeSnapshot['visit']> | null {
  if (!isRecord(value) || !isRecord(value.scorecard)) return null
  const target = parseVipTarget(value.target)
  const score = parseNumber(value.scorecard.score)
  const report = parseArray(value.scorecard.report, parseString)
  const amenities = parseArray(value.scorecard.amenities, parseItemKind)
  const stops = parseArray(value.stops, (entry) => {
    if (!isRecord(entry)) return null
    const floor = parseInteger(entry.floor)
    const x = parseNumber(entry.x)
    const unitId = parseNullableInteger(entry.unitId)
    const amenityKind = entry.amenityKind === null ? null : parseItemKind(entry.amenityKind)
    const suite = parseBoolean(entry.suite)
    const final = parseBoolean(entry.final)
    return floor === null || x === null || unitId === undefined || amenityKind === null && entry.amenityKind !== null || suite === null || final === null ? null : { floor, x, unitId, amenityKind, suite, final }
  })
  const stopIndex = parseInteger(value.stopIndex, 0)
  const personId = parseNullableInteger(value.personId)
  const atStop = parseBoolean(value.atStop)
  const departAbs = parseNullableNumber(value.departAbs)
  const queuedMinutes = parseNumber(value.queuedMinutes)
  const lastLegIndex = parseInteger(value.lastLegIndex)
  const suiteId = parseNullableInteger(value.suiteId)
  const trashSeen = parseArray(value.trashSeen, (entry) => parseInteger(entry, 1))
  if (target === null || score === null || report === null || amenities === null || new Set(amenities).size !== amenities.length || stops === null || stopIndex === null || personId === undefined || atStop === null || departAbs === undefined || queuedMinutes === null || queuedMinutes < 0 || lastLegIndex === null || suiteId === undefined || trashSeen === null || new Set(trashSeen).size !== trashSeen.length) return null
  return { target, scorecard: { score, report, amenities }, stops, stopIndex, personId, atStop, departAbs, queuedMinutes, lastLegIndex, suiteId, trashSeen }
}

function parseSandboxV1(value: unknown): SavedSandboxV1 | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const mapId = parseString(value.mapId)
  const seed = parseUint32(value.seed)
  const rngState = parseUint32(value.rngState)
  const clock = parseGameClock(value.clock)
  const speed = parseGameSpeed(value.speed)
  // Optional: older saves predate fast mode, so a missing flag defaults to off
  // rather than rejecting the whole save.
  const fastMode = parseBoolean(value.fastMode) ?? false
  const options = parseEngineOptions(value.options)
  const funds = parseNumber(value.funds)
  const loans = parseArray(value.loans, parseLoan)
  const lobbyHeight = parseLobbyHeight(value.lobbyHeight)
  const star = parseStarLevel(value.star)
  const maxStarReached = parseStarLevel(value.maxStarReached)
  const towerAchieved = parseBoolean(value.towerAchieved)
  const milestonesEarned = parseMilestones(value.milestonesEarned)
  const vips = parseArray(value.vips, parseVipRecord)
  const units = parseArray(value.units, parseUnit)
  const shafts = parseArray(value.shafts, parseShaft)
  const structureVersion = parseInteger(value.structureVersion, 0)
  const nextId = parseInteger(value.nextId, 1)

  if (
    mapId === null ||
    seed === null ||
    rngState === null ||
    clock === null ||
    speed === null ||
    options === null ||
    funds === null ||
    loans === null ||
    lobbyHeight === null ||
    star === null ||
    maxStarReached === null ||
    towerAchieved === null ||
    milestonesEarned === null ||
    vips === null ||
    units === null ||
    shafts === null ||
    structureVersion === null ||
    nextId === null
  ) {
    return null
  }

  return {
    version: 1,
    mapId,
    seed,
    rngState,
    clock,
    speed,
    fastMode,
    options,
    funds,
    loans,
    lobbyHeight,
    star,
    maxStarReached,
    towerAchieved,
    milestonesEarned,
    vips,
    units,
    shafts,
    structureVersion,
    nextId,
  }
}

function parseEngineOptions(value: unknown): EngineOptions | null {
  if (value === undefined) {
    return { disastersEnabled: true }
  }
  if (!isRecord(value)) {
    return null
  }
  const disastersEnabled = parseBoolean(value.disastersEnabled)
  return disastersEnabled === null ? null : { disastersEnabled }
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function parseUint32(value: unknown): number | null {
  const parsed = parseInteger(value, 0)
  return parsed !== null && parsed <= 0xffffffff ? parsed : null
}

function isFloor(value: number): boolean {
  return value >= FLOOR_MIN && value <= FLOOR_MAX
}

function isX(value: number): boolean {
  return value >= 0 && value < GRID_WIDTH
}

function isOneOf<T extends string | number>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T)
}

function parseGameClock(value: unknown): GameClock | null {
  if (!isRecord(value)) {
    return null
  }

  const day = parseInteger(value.day, 1)
  // The clock advances by dt-scaled *fractional* game-minutes, so a save taken
  // mid-minute stores e.g. 1419.7448. Parsing minute as an integer rejected the
  // whole save (write succeeded → green banner, but re-parse → null → the slot
  // read back as unsaved and Load/Export/Clear stayed disabled). Accept any real
  // minute in [0, MINUTES_PER_DAY).
  const minute = parseNumber(value.minute)
  if (day === null || minute === null || minute < 0 || minute >= 1440) {
    return null
  }

  return { day, minute }
}

function parseGameSpeed(value: unknown): GameSpeed | null {
  return isOneOf([0, 1, 2, 4, 8, 16] as const, value) ? value : null
}

function parseLobbyHeight(value: unknown): 1 | 2 | 3 | null {
  return isOneOf([1, 2, 3] as const, value) ? value : null
}

function parseStarLevel(value: unknown): StarLevel | null {
  return isOneOf([1, 2, 3, 4, 5] as const, value) ? value : null
}

function parseItemKind(value: unknown): ItemKind | null {
  return typeof value === 'string' && value in ITEM_DEFS ? (value as ItemKind) : null
}

function parseShaftKind(value: unknown): ShaftKind | null {
  return typeof value === 'string' && value in SHAFT_DEFS ? (value as ShaftKind) : null
}

function parseIncomeTier(value: unknown): IncomeTier | null {
  return isOneOf(['low', 'med', 'high', 'vip'] as const, value) ? value : null
}

function parseUnitGrade(value: unknown): UnitGrade | null {
  return isOneOf(['standard', 'luxury', 'recycling'] as const, value) ? value : null
}

function parseRentTier(value: unknown): RentTier | null {
  return isOneOf(['low', 'avg', 'high'] as const, value) ? value : null
}

function parseVacancyReason(value: unknown): VacancyReason | null | undefined {
  if (value === null) {
    return null
  }

  return isOneOf(['elevatorCrowded', 'tooNoisy', 'noRestroom', 'rentTooHigh', 'noRoute', 'hotelDirty', 'noReception', 'lowEval', 'incidentDamage'] as const, value)
    ? value
    : undefined
}

function parseDamageKind(value: unknown): DamageKind | null | undefined {
  if (value === null) {
    return null
  }
  return isOneOf(['explosion', 'fire'] as const, value) ? value : undefined
}

function parseDirectionPriority(value: unknown): DirectionPriority | null {
  return isOneOf(['balanced', 'expressToTop', 'expressToBottom'] as const, value) ? value : null
}

function parseVipTarget(value: unknown): VipTarget | null {
  return isOneOf([2, 3, 4, 5, 'tower'] as const, value) ? value : null
}

function parseVipState(value: unknown): VipState | null {
  return isOneOf(['pending', 'visiting', 'resident', 'movedOut'] as const, value) ? value : null
}

function parseCarState(value: unknown): CarState | null {
  return isOneOf(['idle', 'moving', 'doors'] as const, value) ? value : null
}

function parseNullableInteger(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }

  return parseInteger(value) ?? undefined
}

function parseNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }

  return parseNumber(value) ?? undefined
}

function parseTierCounts(value: unknown): TierCounts | null {
  if (!isRecord(value)) {
    return null
  }

  const low = parseInteger(value.low, 0)
  const med = parseInteger(value.med, 0)
  const high = parseInteger(value.high, 0)
  const vip = parseInteger(value.vip, 0)
  if (low === null || med === null || high === null || vip === null) {
    return null
  }

  return { low, med, high, vip }
}

function parseUnitFlags(value: unknown): UnitFlags | null {
  if (!isRecord(value)) {
    return null
  }

  const noRestroom = parseBoolean(value.noRestroom)
  const noRoute = parseBoolean(value.noRoute)
  const noReception = parseBoolean(value.noReception)
  const trashOverflow = parseBoolean(value.trashOverflow)
  if (noRestroom === null || noRoute === null || noReception === null || trashOverflow === null) {
    return null
  }

  return { noRestroom, noRoute, noReception, trashOverflow }
}

function parseLoan(value: unknown): Loan | null {
  if (!isRecord(value)) {
    return null
  }

  const id = parseInteger(value.id, 1)
  const principal = parseNumber(value.principal)
  const outstanding = parseNumber(value.outstanding)
  if (id === null || principal === null || outstanding === null) {
    return null
  }

  return { id, principal, outstanding }
}

function parseProgramSlots(value: unknown): ShaftProgram['weekday'] | null {
  if (!isRecord(value)) {
    return null
  }

  const morningRush = parseDirectionPriority(value.morningRush)
  const daytime = parseDirectionPriority(value.daytime)
  const eveningRush = parseDirectionPriority(value.eveningRush)
  const night = parseDirectionPriority(value.night)
  if (morningRush === null || daytime === null || eveningRush === null || night === null) {
    return null
  }

  return { morningRush, daytime, eveningRush, night }
}

function parseShaftProgram(value: unknown): ShaftProgram | null {
  if (!isRecord(value)) {
    return null
  }

  const weekday = parseProgramSlots(value.weekday)
  const weekend = parseProgramSlots(value.weekend)
  const idleAnswerThreshold = parseInteger(value.idleAnswerThreshold, 0)
  const doorDwellSec = parseInteger(value.doorDwellSec, 0)
  if (weekday === null || weekend === null || idleAnswerThreshold === null || doorDwellSec === null) {
    return null
  }

  return { weekday, weekend, idleAnswerThreshold, doorDwellSec }
}

function parseCar(value: unknown): Car | null {
  if (!isRecord(value)) {
    return null
  }

  const index = parseInteger(value.index, 0)
  const y = parseNumber(value.y)
  const dir = isOneOf([-1, 0, 1] as const, value.dir) ? value.dir : null
  const state = parseCarState(value.state)
  const doorTimer = parseNumber(value.doorTimer)
  const homeFloor = parseNullableInteger(value.homeFloor)
  const passengerIds = parseArray(value.passengerIds, (item) => parseInteger(item, 1))
  if (index === null || y === null || dir === null || state === null || doorTimer === null || homeFloor === undefined || passengerIds === null) {
    return null
  }

  return { index, y, dir, state, doorTimer, homeFloor, passengerIds }
}

function parseUnit(value: unknown): Unit | null {
  if (!isRecord(value)) {
    return null
  }

  const id = parseInteger(value.id, 1)
  const kind = parseItemKind(value.kind)
  const floor = parseInteger(value.floor)
  const x = parseInteger(value.x, 0)
  const width = parseInteger(value.width, 1)
  const facing = value.facing === undefined
    ? undefined
    : value.facing === 'left' || value.facing === 'right'
      ? value.facing
      : null
  const storeys = isOneOf([1, 2, 3] as const, value.storeys) ? value.storeys : null
  const grade = parseUnitGrade(value.grade)
  const rentTier = parseRentTier(value.rentTier)
  const occupied = parseBoolean(value.occupied)
  const population = parseTierCounts(value.population)
  const evalScore = parseNumber(value.evalScore)
  const stressMarks = parseInteger(value.stressMarks, 0)
  const lowEvalDays = parseInteger(value.lowEvalDays, 0)
  const vacancyReason = parseVacancyReason(value.vacancyReason)
  const flags = parseUnitFlags(value.flags)
  const dirty = parseBoolean(value.dirty)
  const infested = parseBoolean(value.infested)
  const offline = parseBoolean(value.offline)
  const damageKind = value.damageKind === undefined ? (offline ? 'explosion' : null) : parseDamageKind(value.damageKind)
  const incidentPenaltyUntilDay = value.incidentPenaltyUntilDay === undefined
    ? null
    : parseNullableInteger(value.incidentPenaltyUntilDay)
  if (
    id === null ||
    kind === null ||
    floor === null ||
    x === null ||
    width === null ||
    facing === null ||
    storeys === null ||
    grade === null ||
    rentTier === null ||
    occupied === null ||
    population === null ||
    evalScore === null ||
    stressMarks === null ||
    lowEvalDays === null ||
    vacancyReason === undefined ||
    flags === null ||
    dirty === null ||
    infested === null ||
    offline === null ||
    damageKind === undefined ||
    incidentPenaltyUntilDay === undefined
  ) {
    return null
  }

  // Prestige structures may extend their crown one storey beyond the terminal
  // playable floor. At New York's global-storage ceiling that also exceeds
  // FLOOR_MAX, so the catalog-owned placement exception must be mirrored here.
  const topExceedsMax = floor + storeys - 1 > FLOOR_MAX
  if (!isFloor(floor) || !isX(x) || width > GRID_WIDTH - x || (topExceedsMax && !itemDef(kind).allowsFloorRangeOverhang)) {
    return null
  }

  return {
    id,
    kind,
    floor,
    x,
    width,
    ...(facing === undefined ? {} : { facing }),
    storeys,
    grade,
    rentTier,
    occupied,
    population,
    evalScore,
    stressMarks,
    lowEvalDays,
    vacancyReason,
    flags,
    dirty,
    infested,
    offline,
    damageKind,
    incidentPenaltyUntilDay,
  }
}

function parseShaft(value: unknown): Shaft | null {
  if (!isRecord(value)) {
    return null
  }

  const id = parseInteger(value.id, 1)
  const kind = parseShaftKind(value.kind)
  const x = parseInteger(value.x, 0)
  const bottomFloor = parseInteger(value.bottomFloor)
  const topFloor = parseInteger(value.topFloor)
  const stops = parseArray(value.stops, (item) => parseInteger(item))
  const enabledStops = parseArray(value.enabledStops, (item) => parseInteger(item))
  const cars = parseArray(value.cars, parseCar)
  const program = parseShaftProgram(value.program)
  // Runtime rolling stats default to 0 rather than rejecting the whole save — a
  // stale/missing stat is strictly better than a lost tower, and these values
  // re-derive within a game-day of play.
  const stats = isRecord(value.stats) ? value.stats : {}
  const avgWaitGameMin = parseNumber(stats.avgWaitGameMin) ?? 0
  const peakWaitGameMin = parseNumber(stats.peakWaitGameMin) ?? 0
  if (
    id === null ||
    kind === null ||
    x === null ||
    bottomFloor === null ||
    topFloor === null ||
    stops === null ||
    enabledStops === null ||
    cars === null ||
    program === null
  ) {
    return null
  }

  const shaftWidth = SHAFT_DEFS[kind].width
  if (
    !isFloor(bottomFloor) ||
    !isFloor(topFloor) ||
    bottomFloor > topFloor ||
    !isX(x) ||
    shaftWidth > GRID_WIDTH - x ||
    !isStrictlyAscending(stops) ||
    stops.some((stop) => stop < bottomFloor || stop > topFloor) ||
    !isStrictlyAscending(enabledStops) ||
    enabledStops.some((stop) => !stops.includes(stop)) ||
    cars.length > SHAFT_DEFS[kind].maxCars ||
    cars.some((car, index) => car.index !== index || car.y < bottomFloor || car.y > topFloor || car.passengerIds.length > SHAFT_DEFS[kind].carCapacity)
  ) {
    return null
  }

  return { id, kind, x, bottomFloor, topFloor, stops, enabledStops, cars, program, stats: { avgWaitGameMin, peakWaitGameMin } }
}

function parseVipRecord(value: unknown): VipRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const target = parseVipTarget(value.target)
  const state = parseVipState(value.state)
  const satisfaction = parseNumber(value.satisfaction)
  const unitId = parseNullableInteger(value.unitId)
  const cooldownUntilDay = parseNullableInteger(value.cooldownUntilDay)
  const lastReport = parseArray(value.lastReport, parseString)
  if (target === null || state === null || satisfaction === null || unitId === undefined || cooldownUntilDay === undefined || lastReport === null) {
    return null
  }

  return { target, state, satisfaction, unitId, cooldownUntilDay, lastReport }
}

function isStrictlyAscending(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]!)
}

function validateSandboxConsistency(saved: SavedSandbox): boolean {
  if (!isKnownMapId(saved.mapId)) {
    return false
  }
  const map = getMap(saved.mapId)
  if (saved.units.some((unit) => (
    unit.floor < map.floorRange.min
    || unit.floor > map.floorRange.max
    || (unit.floor + unit.storeys - 1 > map.floorRange.max && !itemDef(unit.kind).allowsFloorRangeOverhang)
    || (unit.kind === map.endgameItem && !endgamePlacementFloors(map).includes(unit.floor))
  ))) {
    return false
  }
  if (saved.units.some((unit) => map.disallowedItems.includes(unit.kind))
    || saved.shafts.some((shaft) => map.disallowedItems.includes(shaft.kind))) {
    return false
  }
  if (saved.units.some((unit) => {
    const cantileverTiles = itemDef(unit.kind).cantileverTiles ?? 0
    if (cantileverTiles > 0) {
      // Unconditional, exactly as placement derives it. Gating this on "does the
      // footprint overlap the void" would let a deck anchored to neither bank
      // import while staying unplaceable, since it overlaps nothing at all.
      return unit.facing !== cantileverFacing(map, unit.x, unit.x + unit.width, cantileverTiles)
    }
    const exclusion = intersectingBuildExclusion(map, unit.x, unit.x + unit.width)
    if (!exclusion) {
      return false
    }
    if (unit.kind === 'skybridge') {
      return unit.x > exclusion.xMin || unit.x + unit.width < exclusion.xMaxExclusive
    }
    return true
  })) {
    return false
  }
  if (saved.shafts.some((shaft) => (
    intersectingBuildExclusion(map, shaft.x, shaft.x + SHAFT_DEFS[shaft.kind].width) !== null
  ))) {
    return false
  }
  if (
    saved.units.length > MAX_ENTITY_COUNT ||
    saved.shafts.length > MAX_ENTITY_COUNT ||
    saved.people.length > TUNING.people.maxActive ||
    saved.loans.length > MAX_ENTITY_COUNT ||
    saved.ledgerHistory.length > TUNING.economy.ledgerHistoryDays
  ) {
    return false
  }

  const ids = new Set<number>()
  let greatestId = 0
  const register = (id: number): boolean => {
    if (ids.has(id)) {
      return false
    }
    ids.add(id)
    greatestId = Math.max(greatestId, id)
    return true
  }
  const registerOrdered = (entries: readonly { id: number }[]): boolean => {
    if (!isStrictlyAscending(entries.map((entry) => entry.id))) {
      return false
    }
    return entries.every((entry) => register(entry.id))
  }

  if (!registerOrdered(saved.units) || !registerOrdered(saved.shafts) || !registerOrdered(saved.people) || !registerOrdered(saved.loans)) {
    return false
  }
  if (saved.activeRequest && !register(saved.activeRequest.id)) {
    return false
  }
  if (saved.nextId <= greatestId) {
    return false
  }

  const peopleById = new Map(saved.people.map((person) => [person.id, person]))
  const passengers = new Set<number>()
  for (const shaft of saved.shafts) {
    for (const car of shaft.cars) {
      for (const personId of car.passengerIds) {
        const person = peopleById.get(personId)
        const leg = person?.legs[person.legIndex]
        if (!person || person.state !== 'riding' || leg?.type !== 'elevator' || leg.shaftId !== shaft.id || passengers.has(personId)) {
          return false
        }
        passengers.add(personId)
      }
    }
  }
  if (saved.people.some((person) => person.state === 'riding' && !passengers.has(person.id))) {
    return false
  }

  const unitsById = new Map(saved.units.map((unit) => [unit.id, unit]))
  if (saved.activeFire && saved.activeFire.burningUnitIds.some((id) => unitsById.get(id)?.floor !== saved.activeFire?.floor)) {
    return false
  }
  const incidentRuntime = saved.runtime.incidents
  if ((saved.activeRequest === null) !== (incidentRuntime.requestBaseline === null)) {
    return false
  }
  if (saved.activeBombThreat === null) {
    if (incidentRuntime.threatDeadlineAbs !== null) {
      return false
    }
  } else if ((saved.activeBombThreat.sweepRemainingMin === null) !== (incidentRuntime.threatDeadlineAbs !== null)) {
    return false
  }

  const parkedStallIds = saved.runtime.parking.stallsByOffice.flatMap(([, stallIds]) => stallIds)
  if (new Set(parkedStallIds).size !== parkedStallIds.length) {
    return false
  }

  const vipTargets = saved.vips.map((vip) => vip.target)
  if (new Set(vipTargets).size !== vipTargets.length) {
    return false
  }

  return true
}
