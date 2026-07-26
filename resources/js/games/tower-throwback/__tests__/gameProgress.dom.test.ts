import { createEngineState, personTickAccumulatorOf, restorePersonTickAccumulator, stepEngine } from '../engine/engine'
import { restoreHotelRuntime, snapshotHotelRuntime } from '../engine/hotel'
import { restoreIncidentRuntime, snapshotIncidentRuntime } from '../engine/incidents'
import { restoreParkingRuntime, snapshotParkingRuntime } from '../engine/parking'
import { restorePeopleRuntime, snapshotPeopleRuntime } from '../engine/people'
import { restoreScheduleRuntime, snapshotScheduleRuntime } from '../engine/schedules'
import { restoreTrashRuntime, snapshotTrashRuntime } from '../engine/trash'
import { restoreVipRuntime, snapshotVipRuntime } from '../engine/vip'
import {
  claimSandboxSlot,
  clearSandbox,
  createSandboxSessionId,
  defaultProgress,
  dismissGettingStarted,
  dismissObservationDeckHint,
  exportSandbox,
  getOrCreateTabSessionId,
  importSandbox,
  isGettingStartedDismissed,
  isObservationDeckHintDismissed,
  isSandboxSlotOwnedByAnotherTab,
  loadProgress,
  loadSandbox,
  loadSandboxSlotSummaries,
  loadSavedProgress,
  migrateSandboxPayload,
  recordMilestone,
  restoreSandbox,
  saveProgress,
  saveSandbox,
} from '../gameProgress'
import { FLOOR_MAX, type Person, PROGRESS_STORAGE_KEY, SANDBOX_STORAGE_KEY } from '../gameTypes'

const FROZEN_V1_SANDBOX = Object.freeze({
  version: 1,
  mapId: 'city-tower',
  seed: 4242,
  rngState: 987654321,
  clock: { day: 7, minute: 735.5 },
  speed: 4,
  fastMode: false,
  funds: 765432,
  loans: [],
  lobbyHeight: 2,
  star: 1,
  maxStarReached: 1,
  towerAchieved: false,
  milestonesEarned: ['started'],
  vips: [],
  units: [],
  shafts: [],
  structureVersion: 0,
  nextId: 1,
})

describe('tower throwback progress persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns fresh default progress when storage is empty', () => {
    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('round-trips a saved progress object', () => {
    const saved = { version: 2 as const, milestones: ['started', 'star2'] as const }
    saveProgress({ version: 2, milestones: [...saved.milestones] })

    expect(loadSavedProgress()).toEqual({ version: 2, milestones: ['started', 'star2'] })
  })

  it('falls back to defaults on corrupt JSON', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, '{not valid json')

    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('falls back to defaults on a wrong-version payload', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 3, milestones: ['started'] }))

    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('falls back to defaults when a milestone is unrecognized', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, milestones: ['not-a-milestone'] }))

    expect(loadSavedProgress()).toEqual(defaultProgress())
  })

  it('recordMilestone appends a new milestone and persists it', () => {
    const next = recordMilestone('started')

    expect(next.milestones).toEqual(['started'])
    expect(loadSavedProgress()).toEqual(next)
  })

  it('recordMilestone is idempotent for an already-earned milestone', () => {
    recordMilestone('started')
    const next = recordMilestone('started')

    expect(next.milestones).toEqual(['started'])
  })

  it('loadProgress adapts saved milestones to the level-select shape', () => {
    saveProgress({ version: 2, milestones: ['started', 'star3'] })

    expect(loadProgress()).toEqual({ unlockedLevel: 4, stars: { 1: 3, 3: 3 } })
  })

  it('defaults the getting-started checklist to not dismissed', () => {
    expect(isGettingStartedDismissed()).toBe(false)
    expect(loadSavedProgress().gettingStartedDismissed).toBeUndefined()
  })

  it('persists the getting-started dismissal additively without touching milestones', () => {
    recordMilestone('started')
    recordMilestone('star2')

    const next = dismissGettingStarted()

    expect(next.gettingStartedDismissed).toBe(true)
    expect(next.milestones).toEqual(['started', 'star2'])
    expect(isGettingStartedDismissed()).toBe(true)
    // Round-trips through storage.
    expect(loadSavedProgress()).toEqual({ version: 2, milestones: ['started', 'star2'], gettingStartedDismissed: true })
  })

  it('dismissGettingStarted is idempotent', () => {
    dismissGettingStarted()
    const again = dismissGettingStarted()
    expect(again.gettingStartedDismissed).toBe(true)
  })

  it('recording a later milestone preserves an existing dismissal flag', () => {
    dismissGettingStarted()
    const next = recordMilestone('started')
    expect(next.gettingStartedDismissed).toBe(true)
    expect(isGettingStartedDismissed()).toBe(true)
  })

  it('preserves both dismissal flags across either mutation path', () => {
    dismissObservationDeckHint()
    dismissGettingStarted()
    const next = recordMilestone('started')

    expect(next.gettingStartedDismissed).toBe(true)
    expect(next.observationDeckHintDismissed).toBe(true)
    expect(isObservationDeckHintDismissed()).toBe(true)
  })

  it('loadProgress reports level 1 unlocked when nothing has been earned yet', () => {
    expect(loadProgress()).toEqual({ unlockedLevel: 1, stars: {} })
  })

  it('loadProgress unlocks the finale level once the tower milestone is reached', () => {
    saveProgress({ version: 2, milestones: ['started', 'star2', 'star3', 'star4', 'star5', 'tower'] })

    expect(loadProgress().unlockedLevel).toBe(6)
  })
})

describe('sandbox persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  function builtState() {
    const state = createEngineState({ seed: 42, mapId: 'city-tower', lobbyHeight: 2 })
    stepEngine(
      state,
      [
        { type: 'place', kind: 'lobby', floor: 0, x: 100, widthTiles: 40 },
        { type: 'place', kind: 'slab', floor: 2, x: 100, widthTiles: 40 },
        { type: 'placeShaft', kind: 'standard', x: 118, bottomFloor: 0, topFloor: 2 },
        { type: 'place', kind: 'officeS', floor: 2, x: 100 },
        { type: 'place', kind: 'restroom', floor: 2, x: 110 },
      ],
      0,
    )
    const shaft = state.shafts[0]!
    shaft.program.weekday.morningRush = 'expressToTop'
    shaft.cars[0]!.homeFloor = 0
    state.units.find((u) => u.kind === 'officeS')!.rentTier = 'high'
    return state
  }

  function person(id: number): Person {
    return {
      id,
      tier: 'low',
      vip: false,
      state: 'walking',
      floor: 0,
      x: 100,
      patienceLeft: 60,
      irritated: false,
      legs: [],
      legIndex: 0,
      purpose: 'commuteIn',
      tenantUnitId: null,
      destUnitId: null,
    }
  }

  it('migrates the frozen v1 wire fixture sequentially and leaves current payloads unchanged', () => {
    const migrated = migrateSandboxPayload(FROZEN_V1_SANDBOX)

    expect(migrated).toEqual(expect.objectContaining({
      version: 2,
      seed: 4242,
      people: [],
      activeBombThreat: null,
      ledgerToday: { day: 7, lines: {} },
      runtime: expect.objectContaining({ personTickAccumulator: 0 }),
    }))
    expect(migrateSandboxPayload(migrated)).toEqual(migrated)
    expect(migrateSandboxPayload({ ...FROZEN_V1_SANDBOX, version: 3 })).toBeNull()
  })

  it('save → restore round-trips the tower and steps cleanly', () => {
    const state = builtState()
    state.options.disastersEnabled = false
    stepEngine(state, [], 30) // let some sim time pass
    state.vips.push({
      target: 2, state: 'resident', satisfaction: 75,
      unitId: null, cooldownUntilDay: 9, lastReport: ['Waited 12 min for an elevator'],
    })
    state.vips.push({
      target: 'tower', state: 'resident', satisfaction: 80,
      unitId: null, cooldownUntilDay: null, lastReport: [],
    })
    state.towerAchieved = true
    const activePerson = person(state.nextId)
    state.nextId += 1
    state.people.push(activePerson)
    restorePeopleRuntime(state, {
      overflow: [],
      plans: [[activePerson.id, { staff: false, dwellMin: null, returnTo: null }]],
      dwell: [],
      queuedMin: [],
    })
    state.ledgerHistory.push({ day: 0, lines: { 'rent.office': 400 } })
    state.activeBombThreat = { kind: 'bombThreat', floor: 2, x: 105, sweepRemainingMin: null, ransom: 10_000 }
    state.activeRequest = { id: state.nextId, description: 'Build a restroom', wantsKind: 'restroom', nearFloor: 2, expiresDay: 4 }
    state.nextId += 1
    restoreIncidentRuntime(state, { threatDeadlineAbs: 1_000, requestBaseline: [], evalBonusUntilDay: null })
    saveSandbox(state)

    const saved = loadSandbox()
    expect(saved).not.toBeNull()
    const restored = restoreSandbox(saved!)

    expect(restored.funds).toBe(state.funds)
    expect(restored.clock).toEqual(state.clock)
    expect(restored.structureVersion).toBe(state.structureVersion)
    expect(restored.units).toHaveLength(state.units.length)
    expect(restored.units.find((u) => u.kind === 'officeS')?.rentTier).toBe('high')
    expect(restored.shafts[0]?.program.weekday.morningRush).toBe('expressToTop')
    expect(restored.shafts[0]?.cars[0]?.homeFloor).toBe(0)
    expect(restored.people).toEqual(state.people)
    expect(restored.ledgerHistory).toEqual(state.ledgerHistory)
    expect(restored.activeBombThreat).toEqual(state.activeBombThreat)
    expect(restored.activeRequest).toEqual(state.activeRequest)
    expect(restored.vips).toEqual([
      {
        target: 2, state: 'resident', satisfaction: 75,
        unitId: null, cooldownUntilDay: 9, lastReport: ['Waited 12 min for an elevator'],
      },
      {
        target: 'tower', state: 'resident', satisfaction: 80,
        unitId: null, cooldownUntilDay: null, lastReport: [],
      },
    ])
    expect(restored.towerAchieved).toBe(true)
    expect(restored.options.disastersEnabled).toBe(false)
    expect(restored.grid.slab[0]).toBeDefined() // grid rebuilt, not serialized

    // One game-hour of stepping (7.5 real-min at 4×) without errors.
    stepEngine(restored, [{ type: 'setSpeed', speed: 4 }], 0)
    for (let i = 0; i < 90; i++) {
      stepEngine(restored, [], 5)
    }
    expect(restored.funds).toBeGreaterThanOrEqual(0)
  })

  it('defaults legacy saves without disaster options to enabled', () => {
    const state = builtState()
    saveSandbox(state)
    const current = loadSandbox()!
    const legacy = { ...current, version: 1 as const } as Record<string, unknown>
    for (const field of ['options', 'people', 'activeBombThreat', 'activeFire', 'activeRequest', 'ledgerToday', 'ledgerHistory', 'pendingLoanPrompt', 'pendingLoanCommands', 'runtime']) {
      delete legacy[field]
    }
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(legacy))

    const restored = restoreSandbox(loadSandbox()!)

    expect(restored.options.disastersEnabled).toBe(true)
  })

  it('defaults legacy offline damage to explosion and healthy units to no damage kind', () => {
    const state = builtState()
    saveSandbox(state)
    const legacy = loadSandbox()!
    const office = legacy.units.find((unit) => unit.kind === 'officeS')!
    const restroom = legacy.units.find((unit) => unit.kind === 'restroom')!
    office.offline = true
    delete (office as Partial<typeof office>).damageKind
    delete (restroom as Partial<typeof restroom>).damageKind
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(legacy))

    const restored = restoreSandbox(loadSandbox()!)

    expect(restored.units.find((unit) => unit.kind === 'officeS')?.damageKind).toBe('explosion')
    expect(restored.units.find((unit) => unit.kind === 'restroom')?.damageKind).toBeNull()
  })

  it('round-trips a save taken with the cathedral standing above FLOOR_MAX (regression #1626)', () => {
    const state = builtState()
    const office = state.units.find((u) => u.kind === 'officeS')!
    // The cathedral legally overhangs FLOOR_MAX by its upper storeys — placement.ts
    // exempts `kind === 'cathedral'` from the top-floor bound. A save taken while it
    // stands must therefore re-import, not be rejected by parseUnit's FLOOR_MAX guard.
    state.units.push({ ...office, id: state.nextId, kind: 'cathedral', floor: FLOOR_MAX, storeys: 2 })
    state.nextId += 1
    saveSandbox(state)

    const saved = loadSandbox()
    expect(saved).not.toBeNull()
    const restored = restoreSandbox(saved!)

    const cathedral = restored.units.find((u) => u.kind === 'cathedral')
    expect(cathedral).toBeDefined()
    expect(cathedral?.floor).toBe(FLOOR_MAX)
    expect(cathedral?.storeys).toBe(2)
  })

  it('round-trips Niagara with the Observation Deck crown above its terminal floor', () => {
    const state = builtState()
    state.mapId = 'niagara-falls'
    const office = state.units.find((unit) => unit.kind === 'officeS')!
    state.units.push({
      ...office,
      id: state.nextId++,
      kind: 'observationDeck',
      floor: 15,
      x: 171,
      width: 24,
      storeys: 2,
      facing: 'right',
    })
    saveSandbox(state)

    const saved = loadSandbox()
    expect(saved).not.toBeNull()
    const restored = restoreSandbox(saved!)
    expect(restored.mapId).toBe('niagara-falls')
    expect(restored.units.find((unit) => unit.kind === 'observationDeck')).toMatchObject({ floor: 15, storeys: 2, facing: 'right' })
  })

  it('rejects Niagara saves with construction in the waterfall gap or a deck without facing', () => {
    const state = builtState()
    state.mapId = 'niagara-falls'
    saveSandbox(state)

    const gapSave = loadSandbox()!
    gapSave.units[0]!.x = 200
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(gapSave))
    expect(loadSandbox()).toBeNull()

    saveSandbox(state)
    const deckSave = loadSandbox()!
    const office = deckSave.units.find((unit) => unit.kind === 'officeS')!
    deckSave.units.push({ ...office, id: deckSave.nextId++, kind: 'observationDeck', floor: 15, x: 171, width: 24, storeys: 2 })
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(deckSave))
    expect(loadSandbox()).toBeNull()
  })

  it('rejects a deck anchored to neither bank, which overlaps the gap not at all', () => {
    // The anchor test used to sit behind an "overlaps the gap?" guard, so a deck
    // that missed the void entirely skipped it — importable but never placeable.
    const state = builtState()
    state.mapId = 'niagara-falls'
    saveSandbox(state)
    const saved = loadSandbox()!
    const office = saved.units.find((unit) => unit.kind === 'officeS')!
    saved.units.push({
      ...office,
      id: saved.nextId++,
      kind: 'observationDeck',
      floor: 15,
      x: 0,
      width: 24,
      storeys: 2,
      facing: 'right',
    })
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(saved))

    expect(loadSandbox()).toBeNull()
  })

  it('rejects a unit the active map disallows outright', () => {
    const state = builtState()
    saveSandbox(state)
    const saved = loadSandbox()!
    const office = saved.units.find((unit) => unit.kind === 'officeS')!
    // city-tower disallows observationDeck; without a disallowedItems gate this
    // imported cleanly, since city has no exclusions and no endgame-floor rule
    // for a kind that is not its endgameItem.
    saved.units.push({
      ...office,
      id: saved.nextId++,
      kind: 'observationDeck',
      floor: FLOOR_MAX,
      x: 0,
      width: 24,
      storeys: 2,
      facing: 'right',
    })
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(saved))

    expect(loadSandbox()).toBeNull()
  })

  it('rejects a non-endgame unit that crosses the active map terminal floor', () => {
    const state = builtState()
    state.mapId = 'niagara-falls'
    saveSandbox(state)
    const saved = loadSandbox()!
    const office = saved.units.find((unit) => unit.kind === 'officeS')!
    office.floor = 15
    office.storeys = 2
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(saved))

    expect(loadSandbox()).toBeNull()
  })

  it('still rejects a non-cathedral unit whose top storey exceeds FLOOR_MAX (exemption stays narrow)', () => {
    const state = builtState()
    saveSandbox(state)
    const saved = loadSandbox()!
    const office = saved.units.find((u) => u.kind === 'officeS')!
    office.floor = FLOOR_MAX
    office.storeys = 2
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(saved))

    // parseUnit drops the illegal office → parseArray nulls the whole units array → no save.
    expect(loadSandbox()).toBeNull()
  })

  it('returns null for corrupt JSON and wrong versions', () => {
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, '{broken')
    expect(loadSandbox()).toBeNull()

    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify({ version: 3, mapId: 'city-tower' }))
    expect(loadSandbox()).toBeNull()

    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify({ version: 1, mapId: 3 }))
    expect(loadSandbox()).toBeNull()
  })

  it('round-trips named slots without cross-slot bleed', () => {
    const stateA = builtState()
    stateA.clock.day = 3
    stateA.funds = 123_000
    saveSandbox(stateA, 'slot-a')

    const stateB = builtState()
    stateB.clock.day = 9
    stateB.funds = 456_000
    saveSandbox(stateB, 'slot-b')

    expect(loadSandbox('slot-a')?.clock.day).toBe(3)
    expect(loadSandbox('slot-a')?.funds).toBe(123_000)
    expect(loadSandbox('slot-b')?.clock.day).toBe(9)
    expect(loadSandbox('slot-b')?.funds).toBe(456_000)

    const summaries = loadSandboxSlotSummaries()
    expect(summaries.find((slot) => slot.id === 'slot-a')).toEqual(
      expect.objectContaining({ label: 'Slot A', saved: true, day: 3, funds: 123_000 }),
    )
    expect(summaries.find((slot) => slot.id === 'slot-c')).toEqual(
      expect.objectContaining({ label: 'Slot C', saved: false, day: null }),
    )
  })

  it('exported JSON imports into another slot as the same save', () => {
    const state = builtState()
    state.clock.day = 6
    saveSandbox(state, 'slot-a')
    const saved = loadSandbox('slot-a')!
    const result = importSandbox(exportSandbox(saved), 'slot-c')

    expect(result.ok).toBe(true)
    expect(loadSandbox('slot-c')).toEqual(saved)
  })

  it('restores nested state without retaining references to the parsed save', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const saved = loadSandbox('slot-a')!
    const restored = restoreSandbox(saved)

    restored.units[0]!.flags.noRoute = !restored.units[0]!.flags.noRoute
    restored.units[0]!.population.low += 1
    restored.shafts[0]!.program.weekday.morningRush = 'expressToBottom'
    restored.shafts[0]!.stops.push(99)

    expect(saved.units[0]!.flags.noRoute).not.toBe(restored.units[0]!.flags.noRoute)
    expect(saved.units[0]!.population.low).not.toBe(restored.units[0]!.population.low)
    expect(saved.shafts[0]!.program.weekday.morningRush).not.toBe('expressToBottom')
    expect(saved.shafts[0]!.stops).not.toContain(99)
  })

  it('keeps legacy single-key autosaves loadable as the autosave slot', () => {
    const state = builtState()
    saveSandbox(state)

    expect(loadSandbox()).not.toBeNull()
    expect(loadSandbox('autosave')).toEqual(loadSandbox())
    expect(loadSandboxSlotSummaries().find((slot) => slot.id === 'autosave')).toEqual(
      expect.objectContaining({ label: 'Autosave', saved: true }),
    )
  })

  it('rejects corrupt imports and wrong versions without overwriting storage', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const storageKey = `${SANDBOX_STORAGE_KEY}.slot-a`
    const before = window.localStorage.getItem(storageKey)

    expect(importSandbox('{broken', 'slot-a')).toEqual({ ok: false, reason: 'invalidJson' })
    expect(window.localStorage.getItem(storageKey)).toBe(before)

    expect(importSandbox(' '.repeat(5_000_001), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(window.localStorage.getItem(storageKey)).toBe(before)

    expect(importSandbox(JSON.stringify({ version: 3, mapId: 'city-tower' }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(window.localStorage.getItem(storageKey)).toBe(before)
  })

  it('rejects malformed nested sandbox imports without overwriting storage', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const before = loadSandbox('slot-a')!
    const storageKey = `${SANDBOX_STORAGE_KEY}.slot-a`
    const originalBytes = window.localStorage.getItem(storageKey)

    expect(importSandbox(JSON.stringify({ ...before, units: [{ id: 1 }] }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(loadSandbox('slot-a')).toEqual(before)
    expect(window.localStorage.getItem(storageKey)).toBe(originalBytes)

    expect(importSandbox(JSON.stringify({ ...before, star: -1 }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(loadSandbox('slot-a')).toEqual(before)
    expect(window.localStorage.getItem(storageKey)).toBe(originalBytes)

    expect(importSandbox(JSON.stringify({ ...before, shafts: [{ ...before.shafts[0]!, program: { weekday: {} } }] }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(loadSandbox('slot-a')).toEqual(before)
    expect(window.localStorage.getItem(storageKey)).toBe(originalBytes)

    expect(importSandbox(JSON.stringify({ ...before, mapId: 'future-map' }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(window.localStorage.getItem(storageKey)).toBe(originalBytes)

    expect(importSandbox(JSON.stringify({
      ...before,
      shafts: before.shafts.map((shaft) => ({ ...shaft, topFloor: 1_000_000_000 })),
    }), 'slot-a')).toEqual({ ok: false, reason: 'invalidPayload' })
    expect(window.localStorage.getItem(storageKey)).toBe(originalBytes)
  })

  it('defaults missing shaft runtime stats to 0 instead of rejecting the whole save', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const before = loadSandbox('slot-a')!
    // A shaft blob with no `stats` (or garbage stats) must still load — a stale
    // rolling stat is strictly better than a lost tower.
    const noStats = before.shafts.map(({ stats: _stats, ...rest }) => rest)
    const result = importSandbox(JSON.stringify({ ...before, shafts: noStats }), 'slot-a')
    expect(result.ok).toBe(true)
    const reloaded = loadSandbox('slot-a')
    expect(reloaded).not.toBeNull()
    expect(reloaded!.shafts[0]!.stats.avgWaitGameMin).toBe(0)
  })

  it('ignores malformed nested stored saves when building slot summaries', () => {
    window.localStorage.setItem(
      `${SANDBOX_STORAGE_KEY}.slot-a`,
      JSON.stringify({
        version: 1,
        mapId: 'city-tower',
        seed: 42,
        rngState: 1,
        clock: { day: 1, minute: 0 },
        speed: 1,
        funds: 100,
        loans: [],
        lobbyHeight: 1,
        star: -1,
        maxStarReached: 1,
        towerAchieved: false,
        milestonesEarned: ['started'],
        vips: [],
        units: [{ id: 1 }],
        shafts: [],
        structureVersion: 0,
        nextId: 2,
      }),
    )

    expect(loadSandbox('slot-a')).toBeNull()
    expect(loadSandboxSlotSummaries().find((slot) => slot.id === 'slot-a')).toEqual(
      expect.objectContaining({ saved: false, star: null, population: null }),
    )
  })

  it('reports quota-exceeded write failures without changing the existing slot', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const before = window.localStorage.getItem(`${SANDBOX_STORAGE_KEY}.slot-a`)
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    try {
      expect(saveSandbox(state, 'slot-a')).toEqual({ ok: false, reason: 'quotaExceeded' })
      expect(importSandbox(exportSandbox(loadSandbox('slot-a')!), 'slot-a')).toEqual({ ok: false, reason: 'quotaExceeded' })
    } finally {
      spy.mockRestore()
    }

    expect(window.localStorage.getItem(`${SANDBOX_STORAGE_KEY}.slot-a`)).toBe(before)
  })

  it('guards session-owned slots from writes by older tabs', () => {
    const state = builtState()
    const olderTab = createSandboxSessionId()
    const newerTab = createSandboxSessionId()

    expect(saveSandbox(state, 'slot-a', olderTab)).toEqual({ ok: true })
    expect(isSandboxSlotOwnedByAnotherTab('slot-a', olderTab)).toBe(false)
    expect(claimSandboxSlot('slot-a', newerTab)).toEqual({ ok: true })
    expect(isSandboxSlotOwnedByAnotherTab('slot-a', olderTab)).toBe(true)

    state.clock.day = 12
    expect(saveSandbox(state, 'slot-a', olderTab)).toEqual({ ok: false, reason: 'slotOwnedByAnotherTab' })
    expect(loadSandbox('slot-a')?.clock.day).not.toBe(12)

    expect(saveSandbox(state, 'slot-a', newerTab)).toEqual({ ok: true })
    expect(loadSandbox('slot-a')?.clock.day).toBe(12)
  })

  it('getOrCreateTabSessionId is stable across calls (survives a reload within one tab)', () => {
    window.sessionStorage.clear()
    const first = getOrCreateTabSessionId()
    expect(getOrCreateTabSessionId()).toBe(first) // a reload re-reads the tab's stored id
  })

  it('a reloaded tab is not locked out of its own slot (regression: stale-owner false positive)', () => {
    window.sessionStorage.clear()
    const session = getOrCreateTabSessionId()
    const state = builtState()
    expect(saveSandbox(state, 'slot-a', session)).toEqual({ ok: true })

    // Simulate a page reload: the persisted id is re-read, so it still matches the
    // owner marker it wrote — no false "opened in another tab" lockout.
    const afterReload = getOrCreateTabSessionId()
    expect(afterReload).toBe(session)
    expect(isSandboxSlotOwnedByAnotherTab('slot-a', afterReload)).toBe(false)

    state.clock.day = 7
    expect(saveSandbox(state, 'slot-a', afterReload)).toEqual({ ok: true })
    expect(loadSandbox('slot-a')?.clock.day).toBe(7)
  })

  it('clearSandbox removes the save', () => {
    saveSandbox(builtState())
    expect(loadSandbox()).not.toBeNull()
    clearSandbox()
    expect(loadSandbox()).toBeNull()
  })

  it('round-trips a save taken mid-minute (regression: fractional clock.minute)', () => {
    const state = builtState()
    // A real play session almost never pauses on a whole minute — the clock
    // advances by dt-scaled fractions (this exact value came from a stuck save).
    state.clock.minute = 1419.7448799998958
    expect(Number.isInteger(state.clock.minute)).toBe(false)

    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    const reloaded = loadSandbox('slot-a')
    expect(reloaded).not.toBeNull()
    expect(reloaded!.clock.minute).toBe(state.clock.minute)
    expect(loadSandboxSlotSummaries().find((slot) => slot.id === 'slot-a')?.saved).toBe(true)
  })

  it('rejects a clock minute at or beyond the day boundary', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const before = loadSandbox('slot-a')!
    expect(importSandbox(JSON.stringify({ ...before, clock: { day: 1, minute: 1440 } }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(importSandbox(JSON.stringify({ ...before, clock: { day: 1, minute: -0.5 } }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
  })

  it('restoreRng resumes the exact rng sequence', () => {
    const state = builtState()
    for (let i = 0; i < 5; i++) {
      state.rng.next()
    }
    saveSandbox(state)

    // Control: keep consuming the never-saved original.
    const control = [state.rng.next(), state.rng.next(), state.rng.next()]

    const restored = restoreSandbox(loadSandbox()!)
    expect([restored.rng.next(), restored.rng.next(), restored.rng.next()]).toEqual(control)
  })

  it('round-trips a person saved at a fractional stair position', () => {
    const state = builtState()
    const walker = person(state.nextId)
    state.nextId += 1
    walker.floor = 1.375
    walker.x = 109.5
    walker.legs = [{ type: 'stairs', fromFloor: 0, fromX: 109.5, toFloor: 2, toX: 109.5 }]
    state.people.push(walker)
    restorePeopleRuntime(state, {
      overflow: [],
      plans: [[walker.id, { staff: false, dwellMin: null, returnTo: null }]],
      dwell: [],
      queuedMin: [],
    })

    expect(saveSandbox(state, 'slot-a')).toEqual({ ok: true })
    expect(loadSandbox('slot-a')?.people[0]?.floor).toBe(1.375)
    expect(restoreSandbox(loadSandbox('slot-a')!).people[0]?.floor).toBe(1.375)
  })

  it('rejects inconsistent riding passengers and request runtime without changing bytes', () => {
    const state = builtState()
    saveSandbox(state, 'slot-a')
    const saved = loadSandbox('slot-a')!
    const storageKey = `${SANDBOX_STORAGE_KEY}.slot-a`
    const originalBytes = window.localStorage.getItem(storageKey)
    const rider = person(saved.nextId)
    rider.state = 'riding'
    rider.legs = [{
      type: 'elevator',
      fromFloor: 0,
      fromX: saved.shafts[0]!.x,
      toFloor: 2,
      toX: saved.shafts[0]!.x,
      shaftId: saved.shafts[0]!.id,
    }]

    expect(importSandbox(JSON.stringify({ ...saved, people: [rider], nextId: rider.id + 1 }), 'slot-a')).toEqual({
      ok: false,
      reason: 'invalidPayload',
    })
    expect(importSandbox(JSON.stringify({
      ...saved,
      activeRequest: { id: saved.nextId, description: 'Build a restroom', wantsKind: 'restroom', nearFloor: 2, expiresDay: 4 },
      nextId: saved.nextId + 1,
    }), 'slot-a')).toEqual({ ok: false, reason: 'invalidPayload' })
    expect(window.localStorage.getItem(storageKey)).toBe(originalBytes)
  })

  it('save-at-T continuation matches uninterrupted incident and economic state plus event log', () => {
    const uninterrupted = builtState()
    uninterrupted.speed = 4
    const rider = person(uninterrupted.nextId)
    uninterrupted.nextId += 1
    rider.state = 'riding'
    rider.x = uninterrupted.shafts[0]!.x
    rider.legs = [{
      type: 'elevator',
      fromFloor: 0,
      fromX: uninterrupted.shafts[0]!.x,
      toFloor: 2,
      toX: uninterrupted.shafts[0]!.x,
      shaftId: uninterrupted.shafts[0]!.id,
    }]
    uninterrupted.people.push(rider)
    uninterrupted.shafts[0]!.cars[0]!.passengerIds = [rider.id]
    restorePeopleRuntime(uninterrupted, {
      overflow: [],
      plans: [[rider.id, { staff: false, dwellMin: null, returnTo: null }]],
      dwell: [],
      queuedMin: [[rider.id, 2]],
    })
    uninterrupted.activeBombThreat = { kind: 'bombThreat', floor: 2, x: 105, sweepRemainingMin: 20, ransom: 12_000 }
    uninterrupted.activeFire = { kind: 'fire', floor: 2, burningUnitIds: [uninterrupted.units.find((unit) => unit.kind === 'officeS')!.id], spreadRemainingMin: 8, responseRemainingMin: 25 }
    uninterrupted.activeRequest = { id: uninterrupted.nextId, description: 'Build a restroom', wantsKind: 'restroom', nearFloor: 2, expiresDay: 3 }
    uninterrupted.nextId += 1
    restoreIncidentRuntime(uninterrupted, { threatDeadlineAbs: null, requestBaseline: [], evalBonusUntilDay: null })
    uninterrupted.ledgerToday.lines['sales.commerce'] = 321
    uninterrupted.ledgerHistory.push({ day: 0, lines: { 'rent.office': 456 } })
    uninterrupted.pendingLoanPrompt = { shortfall: 10_000, suggested: 50_000 }
    uninterrupted.pendingLoanCommands = [{ type: 'place', kind: 'officeS', floor: 2, x: 112 }]

    for (let index = 0; index < 37; index++) {
      stepEngine(uninterrupted, [], 5)
    }
    saveSandbox(uninterrupted, 'slot-a')
    const resumed = restoreSandbox(loadSandbox('slot-a')!)

    const uninterruptedLog = []
    const resumedLog = []
    for (let index = 0; index < 300; index++) {
      uninterruptedLog.push(stepEngine(uninterrupted, [], 5))
      resumedLog.push(stepEngine(resumed, [], 5))
    }

    expect(resumedLog).toEqual(uninterruptedLog)
    saveSandbox(uninterrupted, 'slot-a')
    saveSandbox(resumed, 'slot-b')
    expect(loadSandbox('slot-b')).toEqual(loadSandbox('slot-a'))
  })

  it('round-trips every consequence-bearing runtime auxiliary store', () => {
    const state = builtState()
    const activePerson = person(state.nextId)
    state.nextId += 1
    activePerson.vip = true
    activePerson.purpose = 'vipVisit'
    state.people.push(activePerson)
    state.activeBombThreat = { kind: 'bombThreat', floor: 2, x: 105, sweepRemainingMin: null, ransom: 10_000 }
    state.activeRequest = { id: state.nextId, description: 'Build a restroom', wantsKind: 'restroom', nearFloor: 2, expiresDay: 5 }
    state.nextId += 1
    restorePersonTickAccumulator(state, 0.0625)
    restoreScheduleRuntime(state, { pending: [[725, [{ tier: 'med', floor: 2, x: 101, toFloor: 0, toX: 100, purpose: 'lunch', tenantUnitId: 4, destUnitId: 2, dwellMin: 30 }]]] })
    restorePeopleRuntime(state, {
      overflow: [{ tier: 'high', floor: 0, x: 100, toFloor: 2, toX: 105, purpose: 'shopping', destUnitId: 4, dwellMin: 15 }],
      plans: [[activePerson.id, { staff: false, dwellMin: 12, returnTo: { floor: 0, x: 100 } }]],
      dwell: [[activePerson.id, 7.5]],
      queuedMin: [[activePerson.id, 2.25]],
    })
    restoreIncidentRuntime(state, { threatDeadlineAbs: 2200, requestBaseline: [2, 4], evalBonusUntilDay: 5 })
    restoreParkingRuntime(state, { stallsByOffice: [[4, [2, 3]]] })
    restoreTrashRuntime(state, { loads: [[4, 6.5], [999_999, 12]] })
    restoreHotelRuntime(state, { pending: [[900, [{ roomId: 4, tier: 'high', direction: 'in' }]]] })
    restoreVipRuntime(state, {
      arrivals: [[2, 2040], ['tower', 3480]],
      visit: {
        target: 2,
        scorecard: { score: 95, report: ['Waited'], amenities: ['restaurant'] },
        stops: [{ floor: 2, x: 100, unitId: 4, amenityKind: 'restaurant', suite: false, final: true }],
        stopIndex: 0,
        personId: activePerson.id,
        atStop: true,
        departAbs: 2100,
        queuedMinutes: 1.5,
        lastLegIndex: 0,
        suiteId: null,
        trashSeen: [4],
      },
    })

    saveSandbox(state)
    const restored = restoreSandbox(loadSandbox()!)

    expect(personTickAccumulatorOf(restored)).toBe(0.0625)
    expect(snapshotScheduleRuntime(restored)).toEqual(snapshotScheduleRuntime(state))
    expect(snapshotPeopleRuntime(restored)).toEqual(snapshotPeopleRuntime(state))
    expect(snapshotIncidentRuntime(restored)).toEqual(snapshotIncidentRuntime(state))
    expect(snapshotParkingRuntime(restored)).toEqual(snapshotParkingRuntime(state))
    expect(snapshotTrashRuntime(restored)).toEqual(snapshotTrashRuntime(state))
    expect(snapshotTrashRuntime(restored).loads).toEqual([[4, 6.5]])
    expect(snapshotHotelRuntime(restored)).toEqual(snapshotHotelRuntime(state))
    expect(snapshotVipRuntime(restored)).toEqual(snapshotVipRuntime(state))
  })
})
