import { act, renderHook } from '@testing-library/react'

import { type EngineEvent, type HudSnapshot } from '../../gameTypes'
import { AUDIO_IGNORED_EVENT_TYPES, useGameSounds } from '../useGameSounds'

jest.mock('../sfx', () => ({
  placeThunk: jest.fn(),
  placementRejectedBuzz: jest.fn(),
  demolishCrunch: jest.fn(),
  elevatorDing: jest.fn(),
  doorHiss: jest.fn(),
  explosionBoom: jest.fn(),
  cashTick: jest.fn(),
  starFanfare: jest.fn(),
  vipFanfare: jest.fn(),
  towerBell: jest.fn(),
  warningBlip: jest.fn(),
  loanChime: jest.fn(),
  startCrowdMurmur: jest.fn(),
  stopCrowdMurmur: jest.fn(),
  setCrowdMurmurIntensity: jest.fn(),
  startNightCrickets: jest.fn(),
  stopNightCrickets: jest.fn(),
}))

import * as sfx from '../sfx'

const MUTE_STORAGE_KEY = 'bwh.tower-throwback.audio-muted.v1'

function snapshot(overrides: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    mapId: 'city-tower',
    funds: 1_000_000,
    netYesterday: 0,
    population: 0,
    star: 1,
    maxStarReached: 1,
    starProgress: {
      nextStar: 2,
      threshold: 300,
      remaining: 300,
      progress: 0,
    },
    vipGoal: {
      target: 2,
      status: 'notArmed',
      blockedReason: null,
      cooldownUntilDay: null,
    },
    towerAchieved: false,
    endgame: { kind: 'cathedral', name: 'Cathedral', floorLabel: '99', built: false },
    day: 1,
    minute: 600,
    phase: 'day',
    weekend: false,
    speed: 1,
    fastMode: false,
    fastModeActive: false,
    disastersEnabled: true,
    activePeople: 0,
    peopleCap: { active: 0, max: 2000, atCap: false },
    trafficUnderstated: false,
    vipInBuilding: false,
    pendingLoanPrompt: null,
    activeIncident: null,
    ...overrides,
  }
}

describe('useGameSounds', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
  })

  it('fires the matching recipe for each event type', () => {
    const { result } = renderHook(() => useGameSounds(null))

    const events: EngineEvent[] = [
      { type: 'placed', kind: 'officeM', cost: 10 },
      { type: 'demolished', refund: 5 },
      { type: 'starUp', star: 2, bonus: 100, unlocked: [] },
      { type: 'vipArrived', target: 'tower' },
      { type: 'vipMovedIn', target: 2, unitId: 7 },
      { type: 'towerAchieved' },
      { type: 'loanTaken', amount: 5000 },
      { type: 'loanPrompt', shortfall: 100, suggested: 200 },
    ]

    act(() => {
      result.current.playEvents(events)
    })

    expect(sfx.placeThunk).toHaveBeenCalledTimes(1)
    expect(sfx.demolishCrunch).toHaveBeenCalledTimes(1)
    expect(sfx.starFanfare).toHaveBeenCalledTimes(1)
    expect(sfx.vipFanfare).toHaveBeenCalledTimes(2)
    expect(sfx.towerBell).toHaveBeenCalledTimes(1)
    expect(sfx.loanChime).toHaveBeenCalledTimes(2)
  })

  it('plays the new explosion and placement rejection recipes once per event', () => {
    const { result } = renderHook(() => useGameSounds(null))

    act(() => {
      result.current.playEvents([
        { type: 'explosion', floor: 4, damagedUnitIds: [1, 2] },
        { type: 'placementRejected', kind: 'officeS', reason: 'Can only be built on plain floor space' },
      ])
    })

    expect(sfx.explosionBoom).toHaveBeenCalledTimes(1)
    expect(sfx.placementRejectedBuzz).toHaveBeenCalledTimes(1)
  })

  it('throttles elevator dings to drop extras in a burst', () => {
    const { result } = renderHook(() => useGameSounds(null))

    const dings: EngineEvent[] = Array.from({ length: 8 }, (_, floor) => ({
      type: 'elevatorDing',
      floor,
    }))

    act(() => {
      result.current.playEvents(dings)
    })

    expect(sfx.elevatorDing).toHaveBeenCalledTimes(1)
    expect(sfx.doorHiss).toHaveBeenCalledTimes(1)
  })

  it('throttles warning blips across incident/vacancy/star-loss events', () => {
    const { result } = renderHook(() => useGameSounds(null))

    const warnings: EngineEvent[] = [
      { type: 'starLost', star: 1, report: [] },
      { type: 'incidentStarted', kind: 'cockroach', floor: 3 },
      { type: 'unitVacated', unitId: 9, reason: 'tooNoisy' },
    ]

    act(() => {
      result.current.playEvents(warnings)
    })

    expect(sfx.warningBlip).toHaveBeenCalledTimes(1)
  })

  it('starts/stops the crowd murmur on people transitions and tracks intensity', () => {
    const { rerender } = renderHook(({ s }) => useGameSounds(s), {
      initialProps: { s: snapshot({ activePeople: 0 }) },
    })

    expect(sfx.startCrowdMurmur).not.toHaveBeenCalled()

    rerender({ s: snapshot({ activePeople: 250 }) })
    expect(sfx.startCrowdMurmur).toHaveBeenCalledTimes(1)
    expect(sfx.setCrowdMurmurIntensity).toHaveBeenLastCalledWith(0.5)

    rerender({ s: snapshot({ activePeople: 1000 }) })
    expect(sfx.setCrowdMurmurIntensity).toHaveBeenLastCalledWith(1)
    expect(sfx.startCrowdMurmur).toHaveBeenCalledTimes(1)

    rerender({ s: snapshot({ activePeople: 0 }) })
    expect(sfx.stopCrowdMurmur).toHaveBeenCalledTimes(1)
    expect(sfx.setCrowdMurmurIntensity).toHaveBeenLastCalledWith(0)
  })

  it('fades night crickets in and out on phase transitions', () => {
    const { rerender } = renderHook(({ s }) => useGameSounds(s), {
      initialProps: { s: snapshot({ phase: 'day' }) },
    })

    expect(sfx.startNightCrickets).not.toHaveBeenCalled()

    rerender({ s: snapshot({ phase: 'night' }) })
    expect(sfx.startNightCrickets).toHaveBeenCalledTimes(1)

    rerender({ s: snapshot({ phase: 'eveningRush' }) })
    expect(sfx.stopNightCrickets).toHaveBeenCalledTimes(1)
  })

  it('round-trips mute through localStorage', () => {
    const { result } = renderHook(() => useGameSounds(null))

    expect(result.current.muted).toBe(false)

    act(() => {
      result.current.toggleMute()
    })
    expect(result.current.muted).toBe(true)
    expect(window.localStorage.getItem(MUTE_STORAGE_KEY)).toBe('1')

    act(() => {
      result.current.toggleMute()
    })
    expect(result.current.muted).toBe(false)
    expect(window.localStorage.getItem(MUTE_STORAGE_KEY)).toBe('0')
  })

  it('classifies every engine event as handled or explicitly ignored', () => {
    const samples = {
      placed: { type: 'placed', kind: 'officeM', cost: 10 },
      placementRejected: { type: 'placementRejected', kind: 'officeS', reason: 'blocked' },
      demolished: { type: 'demolished', refund: 5 },
      upgraded: { type: 'upgraded', unitId: 1, upgradeId: 'fastfood-to-restaurant', cost: 40_000 },
      starUp: { type: 'starUp', star: 2, bonus: 200_000, unlocked: [] },
      starLost: { type: 'starLost', star: 1, report: [] },
      towerAchieved: { type: 'towerAchieved' },
      milestone: { type: 'milestone', milestone: 'star2' },
      vipArrived: { type: 'vipArrived', target: 2 },
      vipResult: { type: 'vipResult', target: 2, success: false, score: 60, bonus: 10_000, report: [] },
      vipMovedIn: { type: 'vipMovedIn', target: 2, unitId: 7 },
      vipMovedOut: { type: 'vipMovedOut', target: 2, report: [] },
      loanPrompt: { type: 'loanPrompt', shortfall: 100, suggested: 100_000 },
      loanTaken: { type: 'loanTaken', amount: 100_000 },
      loanRepaid: { type: 'loanRepaid', loanId: 1 },
      settlement: { type: 'settlement', day: 2, net: 1000 },
      unitLeased: { type: 'unitLeased', unitId: 1 },
      unitVacated: { type: 'unitVacated', unitId: 1, reason: 'tooNoisy' },
      incidentStarted: { type: 'incidentStarted', kind: 'bombThreat', floor: 3 },
      incidentResolved: { type: 'incidentResolved', kind: 'bombThreat', outcome: 'swept' },
      explosion: { type: 'explosion', floor: 4, damagedUnitIds: [] },
      tenantRequest: {
        type: 'tenantRequest',
        request: { id: 1, description: 'Need a shop', wantsKind: 'shop', nearFloor: 2, expiresDay: 5 },
      },
      requestFulfilled: { type: 'requestFulfilled', requestId: 1, reward: 25_000 },
      requestExpired: { type: 'requestExpired', requestId: 1 },
      elevatorDing: { type: 'elevatorDing', floor: 1 },
      cash: { type: 'cash', amount: 25 },
    } satisfies Record<EngineEvent['type'], EngineEvent>
    const handled = new Set<EngineEvent['type']>([
      'placed',
      'placementRejected',
      'demolished',
      'starUp',
      'starLost',
      'towerAchieved',
      'vipArrived',
      'vipMovedIn',
      'loanPrompt',
      'loanTaken',
      'unitVacated',
      'incidentStarted',
      'explosion',
      'elevatorDing',
      'cash',
    ])

    for (const event of Object.values(samples)) {
      expect(handled.has(event.type) || AUDIO_IGNORED_EVENT_TYPES.has(event.type)).toBe(true)
    }
  })
})
