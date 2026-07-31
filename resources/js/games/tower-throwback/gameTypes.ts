/**
 * Tower Throwback — the shared contract.
 *
 * Every engine/scene/hud module codes against this file. The engine is headless
 * (no three.js or React imports anywhere under `engine/`); commands go in,
 * `EngineEvent[]` come out. All gameplay tuning lives in the `TUNING` block and
 * `engine/catalog.ts`, mirroring the normative numbers in
 * `docs/games/tower-throwback.md` — if code and spec disagree, fix one to match
 * the other in the same commit.
 */

export const GAME_ID = 'tower-throwback'

export const PROGRESS_STORAGE_KEY = 'bwh.tower-throwback.progress.v1'

export const SANDBOX_STORAGE_KEY = 'bwh.tower-throwback.sandbox.v1'

export const SANDBOX_SLOT_IDS = ['autosave', 'slot-a', 'slot-b', 'slot-c'] as const

export type SandboxSlotId = (typeof SANDBOX_SLOT_IDS)[number]

export const SANDBOX_SLOT_LABELS: Record<SandboxSlotId, string> = {
  autosave: 'Autosave',
  'slot-a': 'Slot A',
  'slot-b': 'Slot B',
  'slot-c': 'Slot C',
}

// ── Catalog-card milestones ────────────────────────────────────────────────

export type TowerMilestone = 'started' | 'star2' | 'star3' | 'star4' | 'star5' | 'tower'

/** Milestone order — index + 1 doubles as the catalog's synthetic "level" number. */
export const MILESTONE_ORDER: readonly TowerMilestone[] = ['started', 'star2', 'star3', 'star4', 'star5', 'tower']

export const TOTAL_MILESTONES = MILESTONE_ORDER.length

// ── Grid ───────────────────────────────────────────────────────────────────

export const GRID_WIDTH = 375
/**
 * GRID STORAGE bound, not a playable bound. The typed-array layers span
 * FLOOR_MIN..FLOOR_MAX and every map lives inside that one allocation, so this
 * must be at least as deep as the deepest map. Niagara Falls reaches B30.
 *
 * A map's PLAYABLE range is `MapDefinition.floorRange`, which is what placement
 * enforces — CITY_TOWER deliberately pins its own floor at -10 rather than
 * tracking this constant, so widening the world does not widen the city lot.
 */
export const FLOOR_MIN = -30
export const FLOOR_MAX = 99
export const FLOOR_COUNT = FLOOR_MAX - FLOOR_MIN + 1

/**
 * Flat typed-array layers, index = (floor − FLOOR_MIN) × GRID_WIDTH + x.
 * `unit`/`shaft` store entityId + 1 (0 = empty). Rebuilt from entity lists on
 * load — never serialized. Shafts may overlap lobby/skylobby tiles but never
 * unit tiles; that rule is a one-line check across these layers.
 */
export interface GridLayers {
  slab: Uint8Array
  unit: Int32Array
  shaft: Int32Array
}

// ── Items & shafts ─────────────────────────────────────────────────────────

export type ItemKind =
  | 'slab' | 'lobby' | 'skylobby' | 'skybridge' | 'stairs' | 'escalator'
  | 'officeS' | 'officeM' | 'officeL'
  | 'aptStudio' | 'apt1br' | 'apt2br' | 'aptPenthouse'
  | 'restroom' | 'shop' | 'fastfood' | 'foodCourt' | 'restaurant' | 'fancyRestaurant'
  | 'movieTheater' | 'fitness' | 'pool' | 'spa' | 'conferenceCenter' | 'eventSpace'
  | 'hotelReception' | 'hotel1p' | 'hotel2p' | 'hotelSuite' | 'housekeeping'
  | 'trashRoom' | 'recyclingCenter' | 'parkingRamp' | 'parkingSpace' | 'subway'
  | 'securityOffice' | 'medicalClinic' | 'cathedral' | 'observationDeck'

export type ShaftKind = 'standard' | 'express' | 'service' | 'glass'

export type ItemCategory =
  | 'structure' | 'transit' | 'office' | 'residential' | 'commerce'
  | 'hotel' | 'services' | 'special'

export type StarLevel = 1 | 2 | 3 | 4 | 5

export type IncomeModel =
  | { type: 'rent'; perDay: number }
  | { type: 'perVisit'; amount: number }
  | { type: 'perNight'; amount: number }
  | { type: 'perEvent'; amount: number }

export interface NoiseProfile {
  level: number
  radiusTiles: number
}

export interface ItemDef {
  kind: ItemKind
  name: string
  category: ItemCategory
  /** Footprint in tiles; per-tile items (slab/lobby/skylobby/skybridge) use width 1 and `perTile`. */
  width: number
  storeys: 1 | 2
  cost: number
  perTile?: boolean
  maintPerDay: number
  income?: IncomeModel
  /** Workers / residents / concurrent customers, per the balance table. */
  capacity?: number
  starRequired: StarLevel
  /** Where the item may be placed vertically. Default: above-ground only. */
  vertical?: 'groundOnly' | 'undergroundOnly' | 'undergroundAllowed' | 'b10Only' | 'terminalFloor' | 'anyFloor'
  /** May extend upper storeys beyond the map's terminal playable floor. */
  allowsFloorRangeOverhang?: boolean
  /** Rightmost tiles that must project beyond the supporting floor edge. */
  cantileverTiles?: number
  noise?: NoiseProfile
  /** Like-with-like district grouping; ≥3 same-group units on a floor earn the affinity bonus. */
  affinityGroup?: 'office' | 'residential' | 'food' | 'retail' | 'entertainment' | 'hotel'
  /** Noise sensitivity multiplier when this unit is a noise RECEIVER (default 0). */
  noiseSensitivity?: number
  /**
   * Operates (goes `occupied`) whenever routable, like commerce, instead of
   * leasing to tenants. Used by service units that earn per-visit (the clinic).
   */
  operates?: boolean
}

export interface ShaftDef {
  kind: ShaftKind
  name: string
  width: number
  baseCost: number
  costPerFloor: number
  maintPerCarPerDay: number
  carCapacity: number
  maxCars: number
  carCost: number
  /** Standard elevators: max floors spanned. */
  maxReachFloors?: number
  /** Express elevators: max enabled stops. */
  maxStops?: number
  /** Glass: occupies a reserved exterior facade column instead of slab tiles. */
  exterior?: boolean
  /** Service: staff/trash journeys only — never passengers. */
  serviceOnly?: boolean
}

export type UnitGrade = 'standard' | 'luxury' | 'recycling'

export interface UpgradePath {
  id: string
  /** Unit kinds this upgrade can be applied to. */
  appliesTo: readonly ItemKind[]
  /** Either transforms the kind… */
  toKind?: ItemKind
  /** …or sets a grade flag on the same kind. */
  toGrade?: UnitGrade
  cost: number
  starRequired: StarLevel
  label: string
}

// ── People & income tiers ──────────────────────────────────────────────────

export type IncomeTier = 'low' | 'med' | 'high' | 'vip'

export interface TierCounts {
  low: number
  med: number
  high: number
  vip: number
}

export type PersonState = 'walking' | 'queued' | 'riding'

export type JourneyPurpose =
  | 'commuteIn' | 'commuteOut' | 'lunch' | 'errand' | 'shopping' | 'amenity'
  | 'hotelCheckIn' | 'hotelCheckOut' | 'housekeeping' | 'trashHaul' | 'vipVisit'

export type LegType = 'walk' | 'elevator' | 'stairs' | 'escalator' | 'skybridge'

export interface JourneyLeg {
  type: LegType
  fromFloor: number
  fromX: number
  toFloor: number
  toX: number
  /** Set for elevator legs. */
  shaftId?: number
}

export interface Person {
  id: number
  tier: IncomeTier
  vip: boolean
  state: PersonState
  floor: number
  x: number
  /** Remaining queue patience in game-minutes; expiry → irritated + stress mark. */
  patienceLeft: number
  irritated: boolean
  legs: JourneyLeg[]
  legIndex: number
  purpose: JourneyPurpose
  /** Tenant unit for stress-mark attribution (worker's office, resident's apt, guest's room). */
  tenantUnitId: number | null
  destUnitId: number | null
}

// ── Units ──────────────────────────────────────────────────────────────────

export type RentTier = 'low' | 'avg' | 'high'

export type VacancyReason =
  | 'elevatorCrowded' | 'tooNoisy' | 'noRestroom' | 'rentTooHigh'
  | 'noRoute' | 'hotelDirty' | 'noReception' | 'lowEval' | 'incidentDamage'

export type DamageKind = 'explosion' | 'fire'

export interface UnitFlags {
  noRestroom: boolean
  noRoute: boolean
  noReception: boolean
  trashOverflow: boolean
}

export interface Unit {
  id: number
  kind: ItemKind
  floor: number
  x: number
  width: number
  /** Optional horizontal art/support orientation; omitted by legacy saves. */
  facing?: 'left' | 'right'
  /** 3 only for a lobby at lobbyHeight 3 — the atrium occupies its upper floors. */
  storeys: 1 | 2 | 3
  grade: UnitGrade
  rentTier: RentTier
  occupied: boolean
  /** Dormant occupants by income tier — Person objects exist only mid-journey. */
  population: TierCounts
  /** Cached desirability 0–100 from the occupancy pass. */
  evalScore: number
  stressMarks: number
  /** Consecutive daily occupancy passes below the leasability threshold; vacates at TUNING.stress.lowEvalRiskDays. */
  lowEvalDays: number
  vacancyReason: VacancyReason | null
  flags: UnitFlags
  /** Hotel rooms: dirty after checkout until housekeeping cleans. */
  dirty: boolean
  infested: boolean
  /** Incident damage — offline units earn nothing until repaired. */
  offline: boolean
  damageKind: DamageKind | null
  /** Exclusive game-day boundary for the post-repair incident eval penalty. */
  incidentPenaltyUntilDay: number | null
}

// ── Elevators ──────────────────────────────────────────────────────────────

export type DirectionPriority = 'balanced' | 'expressToTop' | 'expressToBottom'

/** Program time slots; see PHASE_TO_PROGRAM_SLOT for the phase mapping. */
export type ProgramSlot = 'morningRush' | 'daytime' | 'eveningRush' | 'night'

export type ProgramSlots = Record<ProgramSlot, DirectionPriority>

export interface ShaftProgram {
  weekday: ProgramSlots
  weekend: ProgramSlots
  /** Idle car answers a hall call only if ≥ this many floors closer than any moving car (0–15). */
  idleAnswerThreshold: number
  /** Game-seconds doors stay open before departing (0–30). */
  doorDwellSec: number
}

export type CarState = 'idle' | 'moving' | 'doors'

export interface Car {
  index: number
  /** Continuous position in floor units. */
  y: number
  dir: -1 | 0 | 1
  state: CarState
  doorTimer: number
  homeFloor: number | null
  passengerIds: number[]
}

export interface Shaft {
  id: number
  kind: ShaftKind
  x: number
  bottomFloor: number
  topFloor: number
  /** Floors with a physical landing, sorted ascending. */
  stops: number[]
  /** Player-toggleable subset of `stops` the cars will serve. */
  enabledStops: number[]
  cars: Car[]
  program: ShaftProgram
  /**
   * Runtime rolling stats — elevators.ts maintains, occupancy eval reads.
   * `avgWaitGameMin` is the live EMA (drives the heatmap overlay);
   * `peakWaitGameMin` is the worst avg since the last daily pass (drives the
   * eval, so rush-hour congestion still bites when the 08:00 pass samples a lull).
   */
  stats: { avgWaitGameMin: number; peakWaitGameMin: number }
}

// ── Clock ──────────────────────────────────────────────────────────────────

export type GameSpeed = 0 | 1 | 2 | 4 | 8 | 16

export interface GameClock {
  /** 1-based; weekday = ((day − 1) % 7) + 1; days 6–7 are the weekend. */
  day: number
  /** 0..1439 minutes since midnight. */
  minute: number
}

export type DayPhase =
  | 'night' | 'morningRush' | 'day' | 'lunch' | 'afternoon' | 'eveningRush' | 'evening'

export const PHASE_TO_PROGRAM_SLOT: Record<DayPhase, ProgramSlot> = {
  night: 'night',
  morningRush: 'morningRush',
  day: 'daytime',
  lunch: 'daytime',
  afternoon: 'daytime',
  eveningRush: 'eveningRush',
  evening: 'night',
}

// ── VIP ────────────────────────────────────────────────────────────────────

export type VipTarget = 2 | 3 | 4 | 5 | 'tower'

export type VipState = 'pending' | 'visiting' | 'resident' | 'movedOut'

export type VipGoalStatus = 'notArmed' | 'armed' | 'pending' | 'visiting' | 'cooldown' | 'resident' | 'movedOut'

export interface VipRecord {
  target: VipTarget
  state: VipState
  /** Visit score (during visit) then ongoing resident satisfaction. */
  satisfaction: number
  unitId: number | null
  /** Game-day the next visit may re-arm after a failed/lost attempt. */
  cooldownUntilDay: number | null
  /** Human-readable complaint lines from the last failed visit / move-out. */
  lastReport: string[]
}

// ── Economy ────────────────────────────────────────────────────────────────

export type LedgerLine =
  | 'rent.office' | 'rent.residential'
  | 'sales.commerce' | 'sales.amenity' | 'sales.medical' | 'hotel.nights' | 'events.income'
  | 'maint.transit' | 'maint.commerce' | 'maint.hotel' | 'maint.services' | 'maint.structure'
  | 'construction' | 'demolition.refund' | 'repairs'
  | 'loan.principal' | 'loan.repayment'
  | 'bonus.star' | 'bonus.vip' | 'incident.cost'

export interface DayLedger {
  day: number
  lines: Partial<Record<LedgerLine, number>>
}

export interface Loan {
  id: number
  principal: number
  outstanding: number
}

// ── Incidents & requests ───────────────────────────────────────────────────

export type IncidentKind = 'bombThreat' | 'cockroach' | 'fire'

export interface BombThreatState {
  kind: 'bombThreat'
  floor: number
  x: number
  /** Game-minutes remaining if a sweep is running; null while awaiting the player's choice. */
  sweepRemainingMin: number | null
  ransom: number
}

export interface FireState {
  kind: 'fire'
  floor: number
  burningUnitIds: number[]
  spreadRemainingMin: number
  responseRemainingMin: number
}

export interface TenantRequest {
  id: number
  description: string
  /** What fulfils it, checked against placements. */
  wantsKind: ItemKind | ShaftKind
  nearFloor: number
  expiresDay: number
}

// ── Maps ───────────────────────────────────────────────────────────────────

export interface SpawnSource {
  type: 'street' | 'subway'
  share: number
}

export interface HorizontalBuildExclusion {
  /** Inclusive tile column at the left edge. */
  xMin: number
  /** Exclusive tile column at the right edge. */
  xMaxExclusive: number
  label: string
}

export interface MapDefinition {
  /** Save key — see the warning in `engine/maps.ts`; changing this orphans saves. */
  id: string
  /** Display name; safe to change. */
  name: string
  /** Stable base36 char identifying this map in a challenge code. Never reuse. */
  codeKey: string
  /** One-line description for the map picker. */
  blurb: string
  lobbyAnchorFloor: number
  /**
   * NOT IMPLEMENTED for `'down'`. No production code reads this field; every
   * directional rule is hard-coded against floor 0 or the global FLOOR_MIN /
   * FLOOR_MAX. `getMap` throws on a `'down'` map rather than letting it
   * half-work. See the Niagara Falls epic.
   */
  buildDirection: 'up' | 'down'
  floorRange: { min: number; max: number }
  /** Map-authored vertical voids that ordinary construction cannot occupy. */
  horizontalBuildExclusions?: readonly HorizontalBuildExclusion[]
  /** Kinds unavailable on this map regardless of star (e.g. no subway on a falls map). */
  disallowedItems: readonly (ItemKind | ShaftKind)[]
  /** Map-specific prestige structure that arms the final TOWER visit. */
  endgameItem: ItemKind
  /** Valid start floors for that structure; defaults to the upper terminal floor. */
  endgamePlacementFloors?: readonly number[]
  spawnSources: readonly SpawnSource[]
  undergroundAllowed: boolean
  /**
   * Whether floors below the lobby carry EXCAVATION economics — higher cost and
   * a star gate. Defaults to true (the city-lot assumption). A cliff-face map
   * sets false: descending open air is not digging, and gating a falls map's
   * defining floors behind 3★ would put its whole identity in the late game.
   */
  excavationBelowAnchor?: boolean
  paletteTheme: string
}

// ── Engine state ───────────────────────────────────────────────────────────

/** Seeded mulberry32; `state()` exposes the internal counter for snapshots. */
export interface Rng {
  next(): number
  state(): number
}

export interface EngineOptions {
  disastersEnabled: boolean
}

/**
 * INVARIANT: the entity arrays (`units`, `shafts`, `people`, `loans`) are
 * id-ASCENDING at all times — entities append with monotonically increasing
 * ids (`nextId`) and every removal splices/filters in place, preserving order.
 * Plain array-order iteration therefore IS deterministic id order; hot paths
 * must not copy+sort.
 */
export interface EngineState {
  mapId: string
  seed: number
  rng: Rng
  clock: GameClock
  speed: GameSpeed
  /** SimTower-style fast-forward: when on and activity is low, time runs at up to 48×. */
  fastMode: boolean
  options: EngineOptions
  funds: number
  loans: Loan[]
  lobbyHeight: 1 | 2 | 3
  star: StarLevel
  maxStarReached: StarLevel
  towerAchieved: boolean
  units: Unit[]
  shafts: Shaft[]
  people: Person[]
  vips: VipRecord[]
  activeBombThreat: BombThreatState | null
  activeFire: FireState | null
  activeRequest: TenantRequest | null
  ledgerToday: DayLedger
  /** Most recent settled days, newest first, capped at TUNING.economy.ledgerHistoryDays. */
  ledgerHistory: DayLedger[]
  milestonesEarned: TowerMilestone[]
  /** Pending loan offer awaiting player accept/decline; sim pauses spending, never goes < 0. */
  pendingLoanPrompt: { shortfall: number; suggested: number } | null
  /** Unfunded build commands (bulk placement cells, shaft resize) that resume after accepting the loan. */
  pendingLoanCommands: PendingLoanCommand[]
  /** Bumped on any build/demolish — drives static-mesh + route-cache rebuilds. */
  structureVersion: number
  nextId: number
  /** Runtime caches — rebuilt from entities, never serialized. */
  grid: GridLayers
}

// ── Commands (player input → engine) ───────────────────────────────────────

export type EngineCommand =
  | { type: 'place'; kind: ItemKind; floor: number; x: number; widthTiles?: number }
  | { type: 'placeShaft'; kind: ShaftKind; x: number; bottomFloor: number; topFloor: number }
  | { type: 'resizeShaft'; shaftId: number; bottomFloor: number; topFloor: number }
  | { type: 'addCar'; shaftId: number }
  | { type: 'demolishUnit'; unitId: number }
  | { type: 'demolishShaft'; shaftId: number }
  | { type: 'setRentTier'; unitId: number; tier: RentTier }
  | { type: 'applyUpgrade'; unitId: number; upgradeId: string }
  | { type: 'setShaftProgram'; shaftId: number; program: ShaftProgram }
  | { type: 'setStopEnabled'; shaftId: number; floor: number; enabled: boolean }
  | { type: 'setCarHomeFloor'; shaftId: number; carIndex: number; floor: number | null }
  | { type: 'setSpeed'; speed: GameSpeed }
  | { type: 'setFastMode'; enabled: boolean }
  | { type: 'setDisastersEnabled'; enabled: boolean }
  | { type: 'acceptLoan'; amount: number }
  | { type: 'declineLoan' }
  | { type: 'resolveBombThreat'; choice: 'ransom' | 'sweep' }
  | { type: 'respondToFire'; choice: 'dispatch' | 'firebreak' | 'wait' }
  | { type: 'pestControl'; unitId: number }
  | { type: 'repairUnit'; unitId: number }

export type PlacementCommand = Extract<EngineCommand, { type: 'place' } | { type: 'placeShaft' }>

/** Commands the loan flow can park and replay after the player accepts the shortfall loan. */
export type PendingLoanCommand = PlacementCommand | Extract<EngineCommand, { type: 'resizeShaft' }>

// ── Events (engine → shell/audio/toasts) ───────────────────────────────────

export type EngineEvent =
  | { type: 'placed'; kind: ItemKind | ShaftKind; cost: number; unitId?: number; shaftId?: number }
  | { type: 'placementRejected'; kind: ItemKind | ShaftKind; reason: string }
  | { type: 'demolished'; refund: number }
  | { type: 'upgraded'; unitId: number; upgradeId: string; cost: number }
  | { type: 'starUp'; star: StarLevel; bonus: number; unlocked: readonly (ItemKind | ShaftKind)[] }
  | { type: 'starLost'; star: StarLevel; report: string[] }
  | { type: 'towerAchieved' }
  | { type: 'milestone'; milestone: TowerMilestone }
  | { type: 'vipArrived'; target: VipTarget }
  | { type: 'vipResult'; target: VipTarget; success: boolean; score: number; bonus: number; report: string[] }
  | { type: 'vipMovedIn'; target: VipTarget; unitId: number }
  | { type: 'vipMovedOut'; target: VipTarget; report: string[] }
  | { type: 'loanPrompt'; shortfall: number; suggested: number }
  | { type: 'loanTaken'; amount: number }
  | { type: 'loanRepaid'; loanId: number }
  | { type: 'settlement'; day: number; net: number }
  | { type: 'unitLeased'; unitId: number }
  | { type: 'unitVacated'; unitId: number; reason: VacancyReason }
  | { type: 'incidentStarted'; kind: IncidentKind; floor: number }
  | { type: 'incidentResolved'; kind: IncidentKind; outcome: string }
  | { type: 'explosion'; floor: number; damagedUnitIds: number[] }
  | { type: 'tenantRequest'; request: TenantRequest }
  | { type: 'requestFulfilled'; requestId: number; reward: number }
  | { type: 'requestExpired'; requestId: number }
  | { type: 'elevatorDing'; floor: number }
  | { type: 'cash'; amount: number }

// ── Module seam contracts ──────────────────────────────────────────────────

export interface PlacementResultOk {
  ok: true
  cost: number
}

export interface PlacementResultErr {
  ok: false
  reason: string
}

export type PlacementResult = PlacementResultOk | PlacementResultErr

/**
 * Seam signatures (implemented in the named module):
 *
 *   engine/engine.ts     createEngineState(opts: {seed, mapId, lobbyHeight}): EngineState
 *                        stepEngine(state, commands: EngineCommand[], dtSec): EngineEvent[]
 *   engine/placement.ts  validatePlacement(state, cmd: place|placeShaft cmd): PlacementResult
 *                        applyPlacement / validateDemolish / applyDemolish
 *   engine/routing.ts    findRoute(state, fromFloor, fromX, toFloor, toX, opts): JourneyLeg[] | null
 *                        (≤ TUNING.routing.maxElevatorLegs elevator legs; service shafts only
 *                        when opts.staff; invalidate cache on structureVersion change)
 *   engine/elevators.ts  stepElevators(state, dtGameMin, events): void   (consumes NO rng)
 *   engine/people.ts     stepPeople(state, dtGameMin, events): void      (8 Hz gated by caller)
 *   engine/clock.ts      advanceClock / phaseOf(minute): DayPhase / isWeekend(day)
 *   engine/economy.ts    accrue(state, line, amount) / settleMidnight(state, events)
 *   engine/occupancy.ts  evalUnit(state, unit): number / occupancyPass(state, events)  (daily)
 *   engine/heatmaps.ts   noiseField(state): Float32Array / congestionField(state): Float32Array
 */

// ── HUD snapshot (10 Hz) ───────────────────────────────────────────────────

export interface HudSnapshot {
  mapId: string
  funds: number
  netYesterday: number
  population: number
  star: StarLevel
  maxStarReached: StarLevel
  starProgress: {
    nextStar: StarLevel
    threshold: number
    remaining: number
    progress: number
  } | null
  vipGoal: {
    target: VipTarget
    status: VipGoalStatus
    blockedReason: string | null
    cooldownUntilDay: number | null
  } | null
  towerAchieved: boolean
  endgame: {
    kind: ItemKind
    name: string
    floorLabel: string
    built: boolean
  }
  day: number
  minute: number
  phase: DayPhase
  weekend: boolean
  speed: GameSpeed
  /** User's fast-forward toggle. */
  fastMode: boolean
  /** Speed multiplier the engine is applying after dynamic fast-mode rules. */
  effectiveSpeed: number
  /** True when fast mode is actively boosting time right now (low activity). */
  fastModeActive: boolean
  disastersEnabled: boolean
  activePeople: number
  peopleCap: { active: number; max: number; atCap: boolean }
  trafficUnderstated: boolean
  vipInBuilding: boolean
  pendingLoanPrompt: { shortfall: number; suggested: number } | null
  activeIncident: IncidentKind | null
}

// ── TUNING — normative numbers (single source, mirrored in the spec doc) ───

export const TUNING = {
  time: {
    dt: 1 / 60,
    maxSubsteps: 5,
    gameMinutesPerRealSecond: 2,
    personTickHz: 8,
    hudHz: 10,
  },
  people: {
    maxActive: 2000,
    patienceByTier: { low: 120, med: 90, high: 60, vip: 40 },
    reboardPatienceFactor: 0.75,
    stairsMaxFloors: 4,
    visitorTierMix: { low: 0.5, med: 0.35, high: 0.15 },
  },
  movement: {
    walkTilesPerGameMin: 60,
    stairsFloorsPerGameMin: 2,
    escalatorFloorsPerGameMin: 4,
    carFloorsPerGameMin: 10,
    /** Door open/close animation on each side of the dwell, game-seconds. */
    doorCycleSec: 4,
  },
  rent: {
    incomeMultiplier: { low: 0.8, avg: 1.0, high: 1.25 },
    toleranceMultiplier: { low: 1.5, avg: 1.0, high: 0.7 },
    leasabilityThreshold: { low: 35, avg: 50, high: 65 },
    /** Income-tier mix of tenants a rent tier attracts (office/apartment leasing). */
    tenantTierMix: {
      low: { low: 0.7, med: 0.3, high: 0 },
      avg: { low: 0.2, med: 0.6, high: 0.2 },
      high: { low: 0, med: 0.3, high: 0.7 },
    },
  },
  /**
   * Medical clinic — an earning services amenity. Copay is player-adjustable via
   * the unit's rentTier (reused as a copay tier): a higher copay multiplies the
   * per-visit charge but shrinks how far patients will travel (fewer patients).
   * Clinics draw infrequent visits from office workers (business hours) and
   * residents (evening); patients travel farther than for gym/pool/spa amenities.
   */
  clinic: {
    copayMultiplier: { low: 0.5, avg: 1.0, high: 2.0 },
    /** Max floor distance a patient will travel to a clinic, by copay tier. */
    copayReachFloors: { low: 30, avg: 20, high: 12 },
    /** Per-occupant daily probability of a clinic visit. */
    workerDailyP: 0.03,
    residentDailyP: 0.03,
    workerWindow: { start: 9 * 60, end: 17 * 60 },
    residentWindow: { start: 17 * 60, end: 21 * 60 },
    dwellMin: 40,
  },
  evalWeights: {
    base: 60,
    amenityCap: 20,
    amenityRadiusTiles: 20,
    amenityRadiusFloors: 6,
    /** Local prestige from the active map's operational endgame landmark. */
    landmarkBonus: 5,
    landmarkRadiusTiles: 20,
    landmarkRadiusFloors: 6,
    /** Niagara-only lateral sightline to the map-authored waterfall void. */
    fallsViewBonus: 5,
    fallsViewRadiusTiles: 30,
    affinityBonus: 5,
    affinityMinUnits: 3,
    /** Indexed by lobby height 1/2/3. */
    superLobbyBonus: [0, 0, 3, 6],
    glassBonus: 3,
    glassRadiusTiles: 8,
    /** Live/work: residential eval bonus while the tower offers in-tower jobs. */
    liveWorkBonus: 4,
    /** Jobs threshold: occupied office seats ≥ this share of tower residents. */
    liveWorkMinJobShare: 0.25,
    /**
     * Peak-wait multiplier. Lowered from 1.5 → 1.0 when the congestion term
     * switched to the daily PEAK wait (~2× the old instantaneous 08:00 sample),
     * so a congested floor is penalized comparably to before but the penalty now
     * bites even when the pass samples a lull.
     */
    congestionFactor: 1.0,
    congestionCap: 25,
    /** Full eval drag on an office with no reachable same-floor restroom. */
    restroomComfortPenalty: 12,
    /** A restroom within this many tiles is "well-served" (0 drag); past it the drag grades up to full at restroomRangeTiles. */
    restroomComfortFreeTiles: 12,
    trashPenalty: 10,
    trashRadiusTiles: 16,
    dirtyPenalty: 15,
    incidentPenalty: 10,
    incidentPenaltyDays: 3,
    noiseCap: 30,
  },
  noise: {
    /** Index 0 = same floor; later entries are vertical falloff by floor. */
    floorPropagation: [1, 0.5, 0.25],
  },
  stress: {
    weeklyMarksBase: 3,
    lowEvalRiskDays: 3,
  },
  elevators: {
    idleAnswerDefault: 3,
    idleAnswerMax: 15,
    doorDwellDefaultSec: 8,
    doorDwellMaxSec: 30,
    idleReturnHomeMin: 5,
    priorityCostBonusFloors: 3,
    waitGraceMin: 5,
    /** EMA smoothing for Shaft.stats.avgWaitGameMin (sampled at each boarding). */
    waitStatEma: 0.1,
    /**
     * Fraction the live avgWaitGameMin relaxes toward 0 each daily pass a shaft
     * saw NO boardings — so a demolished-source shaft's stale wait doesn't linger
     * on the heatmap forever (or re-seed a high peak from one sparse boarding).
     */
    idleWaitDecayPerPass: 0.34,
  },
  spawn: {
    shopperBasePerHour: 2,
    shopperCommerceExponent: 0.7,
    weekendShopperFactor: 1.5,
    lunchTripP: 0.7,
    residentCommuteShare: 0.8,
    weekendErrandP: 0.5,
    subwayShare: 0.3,
    hotelOccBase: 0.4,
    hotelOccPerStar: 0.05,
    hotelOccEvalFactor: 0.2,
    hotelOccMax: 0.9,
  },
  hotel: {
    /** Game-minutes a housekeeper spends cleaning inside a room. */
    cleanMinutes: 30,
    /** Concurrent staff a housekeeping unit can field. */
    housekeepersPerUnit: 4,
    /** Nightly-rate multiplier for luxury-grade rooms. */
    luxuryRateFactor: 1.6,
    /** Lowest income tier a luxury room accepts ('vip' guests land in Phase 10). */
    luxuryMinTier: 'high',
  },
  trash: {
    /** Trash units generated per occupant per day at midnight. */
    perOccupantPerDay: 1,
    /** Trash units a trash room holds before overflowing. */
    trashRoomCapacity: 120,
    /** Load factor with a recycling-grade room or a recycling center (halves accumulation). */
    recyclingHaulFactor: 0.5,
    /** Staff haul journeys per trash room at the 04:00 emptying. */
    haulersPerTrashRoom: 2,
  },
  commerce: {
    /** Diners/game-hour 17:00–21:00 = base × (1 + star) × restaurantCount^0.7. */
    eveningDinerBasePerHour: 3,
    /** Daily showtime minutes (19:00, 21:00). */
    theaterShowtimeMinutes: [1140, 1260],
    /** Extra weekend matinee showtime (14:00 Sat/Sun). */
    weekendMatineeMinute: 840,
    theaterBatchBase: 20,
    /** Showtime crowd = base + perStar × star (subject to the LOD cap). */
    theaterBatchPerStar: 10,
    /** Daily amenity-visit probability per resident/guest (med+). */
    fitnessDailyP: 0.1,
    /** (med+) */
    poolDailyP: 0.08,
    /** (high+) */
    spaDailyP: 0.05,
    /** Weekday attendees/day (med/high), two batches at 09:00 and 13:00. */
    conferenceAttendeesPerStar: 15,
    /** Weekend event start (18:00). */
    eventMinute: 1080,
    /** Posted per event ('events.income'). */
    eventIncome: 5000,
    /** High-tier visitors routed through the tower to the event space. */
    eventVisitors: 30,
  },
  vip: {
    successThreshold: 70,
    waitPenaltyPerMin: 3,
    noiseExposurePenalty: 10,
    noiseExposureThreshold: 15,
    dirtyRoomPenalty: 20,
    trashSightPenalty: 10,
    amenityBonus: 5,
    amenityBonusCap: 15,
    cooldownDays: 3,
    residentStart: 80,
    residentGoodWeekDelta: 5,
    residentBadWeekDelta: -10,
    residentStressWeekDelta: -5,
    residentEvalGood: 70,
    moveOutBelow: 40,
  },
  economy: {
    startingFunds: 2_000_000,
    starUpBonusPerStar: 100_000,
    vipSuccessBonusPerStar: 50_000,
    vipFailBonus: 10_000,
    demolitionRefundRate: 0.5,
    loanIncrement: 100_000,
    loanDailyRepayRate: 0.05,
    passByShopP: 0.15,
    passByFastFoodP: 0.1,
    passByIncomeFactor: 0.5,
    paybackInvariantDays: 90,
    ledgerHistoryDays: 30,
  },
  parking: {
    spacesPerSuite: 1,
    officesPerSpace: 4,
    shortfallOfficeEvalPenalty: 5,
  },
  stars: {
    popThresholds: { 2: 300, 3: 1000, 4: 5000, 5: 10_000 } as Record<2 | 3 | 4 | 5, number>,
    /** Underground excavation (any floor < 0) unlocks at this star. */
    undergroundStar: 3,
  },
  incidents: {
    bombPPerStar: 0.004,
    bombPopDivisor: 500_000,
    bombPCap: 0.03,
    ransomPerStar: 50_000,
    sweepBaseMin: 30,
    sweepPerCoverageMin: 4,
    noSecurityExplosionP: 0.25,
    explosionSpanTiles: 12,
    repairCostPerTile: 2000,
    fire: {
      baseDailyP: 0.00002,
      kitchenWeight: 4,
      damagedWeight: 2,
      spreadIntervalGameMin: 15,
      repairPerTile: 2500,
      starGate: 4,
      /** Paid fire-brigade dispatch: flat call-out plus a per-burning-unit charge. */
      dispatchBase: 3000,
      dispatchPerUnit: 1500,
    },
    roachSpawnP: 0.05,
    roachEvalThreshold: 40,
    roachSpreadP: 0.15,
    roachAdjacencyTiles: 6,
    roachNeighborEvalPenalty: 10,
    pestControlCost: 5000,
    requestWindowDays: 7,
    requestReward: 25_000,
    requestEvalBonus: 3,
    requestEvalBonusDays: 7,
  },
  routing: {
    maxElevatorLegs: 2,
  },
  grid: {
    adjacencyTiles: 3,
    restroomRangeTiles: 32,
    skylobbyMinWidth: 12,
    skylobbyMinFloor: 5,
  },
} as const

export const DEFAULT_PROGRAM_SLOTS: ProgramSlots = {
  morningRush: 'balanced',
  daytime: 'balanced',
  eveningRush: 'balanced',
  night: 'balanced',
}

export function defaultShaftProgram(): ShaftProgram {
  return {
    weekday: { ...DEFAULT_PROGRAM_SLOTS },
    weekend: { ...DEFAULT_PROGRAM_SLOTS },
    idleAnswerThreshold: TUNING.elevators.idleAnswerDefault,
    doorDwellSec: TUNING.elevators.doorDwellDefaultSec,
  }
}
