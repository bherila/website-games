import {
  applyGateOp,
  buildHudSnapshot,
  computeStars,
  createGameState,
  drainEvents,
  setTargetX,
  tickGame,
} from '../gameEngine'
import type { GatePairDef, HordeDef, LevelDef } from '../gameTypes'
import { MAX_ARMY_SIZE } from '../gameTypes'

function fixture(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 1,
    name: 'Test Sector',
    length: 30,
    forwardSpeed: 2,
    startingArmy: 5,
    gatePairs: [],
    hordes: [],
    starArmyThresholds: [5, 10],
    ...overrides,
  }
}

function pair(overrides: Partial<GatePairDef> = {}): GatePairDef {
  return { id: 'pair', z: 1, left: { op: 'add', value: 5 }, right: { op: 'add', value: 2 }, ...overrides }
}

function horde(overrides: Partial<HordeDef> = {}): HordeDef {
  return { id: 'horde', x: 0, z: 10, count: 4, speed: 0, ...overrides }
}

function disableFire(state: ReturnType<typeof createGameState>): void {
  state.fireCooldown = 9_999
}

describe('applyGateOp', () => {
  it('adds and multiplies with the army cap', () => {
    expect(applyGateOp(4, { op: 'add', value: 5 })).toBe(9)
    expect(applyGateOp(4, { op: 'mul', value: 2 })).toBe(8)
    expect(applyGateOp(399, { op: 'add', value: 5 })).toBe(MAX_ARMY_SIZE)
    expect(applyGateOp(300, { op: 'mul', value: 2 })).toBe(MAX_ARMY_SIZE)
  })

  it('subtracts down to zero and divides down to one', () => {
    expect(applyGateOp(5, { op: 'sub', value: 3 })).toBe(2)
    expect(applyGateOp(5, { op: 'sub', value: 9 })).toBe(0)
    expect(applyGateOp(5, { op: 'div', value: 2 })).toBe(2)
    expect(applyGateOp(1, { op: 'div', value: 3 })).toBe(1)
  })
})

describe('steering', () => {
  it('clamps the drag target to the track', () => {
    const state = createGameState(fixture())
    setTargetX(state, 99)
    expect(state.targetX).toBe(2.6)
    setTargetX(state, -99)
    expect(state.targetX).toBe(-2.6)
  })
})

describe('gate crossing', () => {
  it('applies the left side instantly when crossing at center', () => {
    const state = createGameState(fixture({ gatePairs: [pair()] }))
    disableFire(state)
    for (let frame = 0; frame < 10; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.gatePairs[0]?.resolved).toBe(true)
    expect(state.gatePairs[0]?.chosen).toBe('left')
    expect(state.armySize).toBe(10)
    expect(state.gatesClaimed).toBe(1)
  })

  it('applies the right side when the squad is on the right', () => {
    const state = createGameState(fixture({ gatePairs: [pair()] }))
    disableFire(state)
    state.playerX = 1.3
    state.targetX = 1.3
    for (let frame = 0; frame < 10; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.gatePairs[0]?.chosen).toBe('right')
    expect(state.armySize).toBe(7)
  })

  it('loses the run when a subtract gate empties the squad', () => {
    const state = createGameState(fixture({ gatePairs: [pair({ left: { op: 'sub', value: 10 }, right: { op: 'sub', value: 10 } })] }))
    disableFire(state)
    for (let frame = 0; frame < 10; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.armySize).toBe(0)
    expect(state.status).toBe('lost')
  })

  it('never kills the squad through a divide gate', () => {
    const state = createGameState(fixture({ startingArmy: 1, gatePairs: [pair({ left: { op: 'div', value: 3 }, right: { op: 'div', value: 3 } })] }))
    disableFire(state)
    for (let frame = 0; frame < 10; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.armySize).toBe(1)
    expect(state.status).toBe('playing')
  })
})

describe('firing', () => {
  it('kills horde units with each volley and destroys the horde at zero', () => {
    const state = createGameState(fixture({ startingArmy: 10, hordes: [horde({ z: 8, count: 4 })] }))
    tickGame(state, 0.01)
    expect(state.hordes[0]?.count).toBe(0)
    expect(state.hordes[0]?.status).toBe('destroyed')
    expect(state.kills).toBe(4)
    expect(state.score).toBe(40)
  })

  it('prioritizes the nearest target', () => {
    const state = createGameState(fixture({ startingArmy: 2, hordes: [horde({ id: 'far', z: 8, count: 9 }), horde({ id: 'near', z: 4, count: 9 })] }))
    tickGame(state, 0.01)
    expect(state.hordes.find((entry) => entry.id === 'near')?.count).toBe(8)
    expect(state.hordes.find((entry) => entry.id === 'far')?.count).toBe(9)
  })

  it('upgrades an add gate after three hits', () => {
    const state = createGameState(fixture({ startingArmy: 6, gatePairs: [pair({ z: 10, left: { op: 'add', value: 5 }, right: { op: 'add', value: 5 } })] }))
    state.targetX = -1.3
    state.playerX = -1.3
    tickGame(state, 0.01)
    expect(state.gatePairs[0]?.left.hits).toBe(3)
    expect(state.gatePairs[0]?.left.value).toBe(6)
  })

  it('defuses a subtract gate by shooting it', () => {
    const state = createGameState(fixture({ startingArmy: 6, gatePairs: [pair({ z: 10, left: { op: 'sub', value: 1 }, right: { op: 'sub', value: 9 } })] }))
    state.targetX = -1.3
    state.playerX = -1.3
    tickGame(state, 0.01)
    expect(state.gatePairs[0]?.left.value).toBe(0)
  })

  it('stops shooting fully upgraded gates so fire reaches hordes behind them', () => {
    const state = createGameState(fixture({ startingArmy: 6, gatePairs: [pair({ z: 8 })], hordes: [horde({ z: 12, count: 9 })] }))
    const gatePair = state.gatePairs[0]!
    gatePair.left.hits = 30
    gatePair.right.hits = 30
    tickGame(state, 0.01)
    expect(state.hordes[0]?.count).toBe(6)
    expect(gatePair.left.hits).toBe(30)
  })
})

describe('clashes', () => {
  it('wins a clash when the squad outnumbers the horde', () => {
    const state = createGameState(fixture({ startingArmy: 10, hordes: [horde({ z: 0.5, count: 3 })] }))
    disableFire(state)
    tickGame(state, 0.01)
    expect(state.armySize).toBe(7)
    expect(state.hordes[0]?.status).toBe('destroyed')
    expect(state.kills).toBe(3)
    expect(state.status).toBe('playing')
  })

  it('loses the run when the horde is at least as large', () => {
    const state = createGameState(fixture({ startingArmy: 3, hordes: [horde({ z: 0.5, count: 10 })] }))
    disableFire(state)
    tickGame(state, 0.01)
    expect(state.armySize).toBe(0)
    expect(state.status).toBe('lost')
    expect(state.hordes[0]?.count).toBe(7)
    expect(state.hordes[0]?.status).toBe('active')
  })

  it('destroys the horde on a mutual-wipe tie clash', () => {
    const state = createGameState(fixture({ startingArmy: 3, hordes: [horde({ z: 0.5, count: 3 })] }))
    disableFire(state)
    tickGame(state, 0.01)
    expect(state.status).toBe('lost')
    expect(state.hordes[0]?.count).toBe(0)
    expect(state.hordes[0]?.status).toBe('destroyed')
  })

  it('marks a dodged horde as escaped only after it leaves the view', () => {
    const state = createGameState(fixture({ length: 60, hordes: [horde({ x: 1.5, z: 0.2, count: 4 })] }))
    disableFire(state)
    state.playerX = -1.6
    state.targetX = -1.6
    for (let frame = 0; frame < 20; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.hordes[0]?.status).toBe('active')
    for (let frame = 0; frame < 100; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.hordes[0]?.status).toBe('escaped')
    expect(state.kills).toBe(0)
    expect(state.score).toBe(0)
  })

  it('cannot dodge a boss', () => {
    const state = createGameState(fixture({ startingArmy: 3, hordes: [horde({ x: 0, z: 0.5, count: 50, boss: true })] }))
    disableFire(state)
    state.playerX = -2.5
    state.targetX = -2.5
    tickGame(state, 0.01)
    expect(state.status).toBe('lost')
  })
})

describe('boss pulses', () => {
  it('drains soldiers on the pulse cadence once in range', () => {
    const state = createGameState(fixture({
      forwardSpeed: 0,
      startingArmy: 10,
      hordes: [horde({ z: 10, count: 50, boss: true, pulseInterval: 1, pulseDamage: 2 })],
    }))
    disableFire(state)
    for (let frame = 0; frame < 21; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.armySize).toBe(8)
    for (let frame = 0; frame < 20; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.armySize).toBe(6)
  })

  it('does not pulse while out of range', () => {
    const state = createGameState(fixture({
      forwardSpeed: 0,
      startingArmy: 10,
      hordes: [horde({ z: 20, count: 50, boss: true, pulseInterval: 1, pulseDamage: 2 })],
    }))
    disableFire(state)
    for (let frame = 0; frame < 30; frame += 1) {
      tickGame(state, 0.05)
    }
    expect(state.armySize).toBe(10)
  })
})

describe('win and loss', () => {
  it('wins at the finish line with survivors even if hordes remain', () => {
    const state = createGameState(fixture({ length: 1, hordes: [horde({ x: 1.5, z: 50, count: 40 })] }))
    disableFire(state)
    state.progress = 1
    tickGame(state, 0.01)
    expect(state.status).toBe('won')
    expect(state.score).toBe(50)
  })

  it('computes survivor-based stars', () => {
    const state = createGameState(fixture({ startingArmy: 10 }))
    expect(computeStars(state)).toBe(3)
    state.armySize = 6
    expect(computeStars(state)).toBe(2)
    state.armySize = 2
    expect(computeStars(state)).toBe(1)
  })
})

describe('events', () => {
  it('emits volley, upgrade, and apply events for a shot-up gate and drains them once', () => {
    const state = createGameState(fixture({ startingArmy: 10, gatePairs: [pair({ z: 0.2 })] }))
    tickGame(state, 0.01)
    const events = drainEvents(state)
    expect(events.some((event) => event.type === 'volley' && event.targetKind === 'gate')).toBe(true)
    expect(events.some((event) => event.type === 'gateUpgraded')).toBe(true)
    expect(events.find((event) => event.type === 'gateApplied')).toMatchObject({ side: 'left', op: 'add', value: 6, delta: 6 })
    expect(drainEvents(state)).toHaveLength(0)
  })

  it('emits kill and clash events when fighting a horde', () => {
    const state = createGameState(fixture({ startingArmy: 10, hordes: [horde({ z: 0.5, count: 8 })] }))
    tickGame(state, 0.01)
    const events = drainEvents(state)
    expect(events.find((event) => event.type === 'kills')).toMatchObject({ count: 5 })
    expect(events.find((event) => event.type === 'clash')).toMatchObject({ survived: true, killed: 3 })
    expect(state.status).toBe('playing')
  })

  it('reports the boss in the hud snapshot only once it is near', () => {
    const state = createGameState(fixture({ hordes: [horde({ z: 50, count: 50, boss: true })] }))
    expect(buildHudSnapshot(state).bossCount).toBeNull()
    state.hordes[0]!.z = 10
    expect(buildHudSnapshot(state)).toMatchObject({ bossCount: 50, bossInitialCount: 50 })
    state.hordes[0]!.count = 20
    expect(buildHudSnapshot(state).bossCount).toBe(20)
  })
})
