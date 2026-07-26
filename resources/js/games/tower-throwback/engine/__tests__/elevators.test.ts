import type { EngineEvent, EngineState, Person, Shaft } from '../../gameTypes'
import { TUNING } from '../../gameTypes'
import { stepElevators } from '../elevators'
import { spawnPerson, stepPeople } from '../people'
import { makeTestState, placeShaft, placeSlabRow } from './testState'

const DT = 0.05

function towerWithShaft(floors: number, kind: 'standard' | 'service' = 'standard'): { state: EngineState; shaft: Shaft } {
  const state = makeTestState()
  for (let f = 0; f <= floors; f++) {
    placeSlabRow(state, f, 0, 30)
  }
  const id = placeShaft(state, kind, 10, 0, floors)
  const shaft = state.shafts.find((s) => s.id === id)!
  return { state, shaft }
}

function addCar(shaft: Shaft, y = shaft.bottomFloor): void {
  shaft.cars.push({
    index: shaft.cars.length,
    y,
    dir: 0,
    state: 'idle',
    doorTimer: 0,
    homeFloor: null,
    passengerIds: [],
  })
}

function rider(state: EngineState, shaft: Shaft, from: number, to: number, staff = false): Person {
  const person = spawnPerson(state, {
    tier: 'med',
    floor: from,
    x: shaft.x,
    toFloor: to,
    toX: shaft.x,
    purpose: 'shopping',
    staff,
  })
  if (!person) {
    throw new Error('rider spawn failed')
  }
  return person
}

interface LogEntry {
  t: number
  floor: number
  car: number
  on: number[]
  off: number[]
}

/**
 * Golden-log harness: steps elevators in DT game-min ticks, recording every
 * ding as (time, floor, car, boarded ids, alighted ids) by diffing car
 * passenger lists across the tick.
 */
function runLog(
  state: EngineState,
  shaft: Shaft,
  minutes: number,
  spawnAt: (t: number) => void,
): LogEntry[] {
  const log: LogEntry[] = []
  for (let tick = 0; tick * DT < minutes; tick++) {
    const t = tick * DT
    spawnAt(t)
    const before = shaft.cars.map((c) => [...c.passengerIds])
    const events: EngineEvent[] = []
    stepElevators(state, DT, events)
    const dings = events.filter((e) => e.type === 'elevatorDing')
    if (dings.length === 0) {
      continue
    }
    shaft.cars.forEach((car, i) => {
      const on = car.passengerIds.filter((id) => !before[i]!.includes(id))
      const off = before[i]!.filter((id) => !car.passengerIds.includes(id))
      if (on.length > 0 || off.length > 0) {
        const floor = Math.round(car.y)
        log.push({ t: Number((t + DT).toFixed(2)), floor, car: i, on, off })
      }
    })
  }
  return log
}

/**
 * GL-1/GL-2 spawn plan: 12 workers at the lobby in three fixed waves —
 * t=0 → floor 3, t=2 → floor 5, t=4 → floor 7 (4 workers each).
 */
function glSpawner(state: EngineState, shaft: Shaft): (t: number) => void {
  return (t: number) => {
    if (t === 0 || t === 2 || t === 4) {
      const dest = t === 0 ? 3 : t === 2 ? 5 : 7
      for (let i = 0; i < 4; i++) {
        rider(state, shaft, 0, dest)
      }
    }
  }
}

describe('GL-1 — morning rush, balanced program', () => {
  it('produces the hand-verified SCAN sequence', () => {
    const { state, shaft } = towerWithShaft(10)
    addCar(shaft)
    const log = runLog(state, shaft, 10, glSpawner(state, shaft))

    /**
     * Hand-verified SCAN walkthrough (balanced; both cars idle at floor 0;
     * doors = 4+8+4 game-sec = 0.2667 game-min; car speed 10 floors/game-min;
     * person ids start at 13 — slabs 1..11 + shaft 12 take earlier ids):
     * t=0:    wave→3 queues at 0. Both cars idle at cost 0 → tie → car 0.
     *         Boards within the first tick (ding labeled at tick end 0.05).
     * t=0.6:  doors 0→0.2667, travel 3 floors 0.3 → alight at 3 at 0.5667.
     * t=2.05: wave→5. Idle car 1 at 0 (cost 0) beats idle car 0 at 3 (cost 3).
     * t=2.8:  2.0 board + 0.2667 doors + 0.5 travel → alight at 5 at 2.7667.
     * t=4.35: wave→7. Car 0 at 3 (cost 3) beats car 1 at 5 (cost 5); it
     *         deadheads 3→0 (0.3 min) and boards at 4.3.
     * t=5.3:  4.3 + 0.2667 doors + 0.7 travel → alight at 7 at 5.2667.
     */
    expect(log).toEqual([
      { t: 0.05, floor: 0, car: 0, on: [13, 14, 15, 16], off: [] },
      { t: 0.6, floor: 3, car: 0, on: [], off: [13, 14, 15, 16] },
      { t: 2.05, floor: 0, car: 1, on: [17, 18, 19, 20], off: [] },
      { t: 2.8, floor: 5, car: 1, on: [], off: [17, 18, 19, 20] },
      { t: 4.35, floor: 0, car: 0, on: [21, 22, 23, 24], off: [] },
      { t: 5.3, floor: 7, car: 0, on: [], off: [21, 22, 23, 24] },
    ])
  })
})

describe('GL-2 — weekday morningRush expressToTop', () => {
  it('empty cars reposition to the lobby, changing pickup timing', () => {
    const { state, shaft } = towerWithShaft(10)
    addCar(shaft)
    state.clock = { day: 1, minute: 7 * 60 } // weekday morning rush
    shaft.program.weekday.morningRush = 'expressToTop'
    const log = runLog(state, shaft, 10, glSpawner(state, shaft))

    /**
     * Same spawn plan as GL-1; hand-verified differences under expressToTop:
     * after each delivery the empty car drifts straight back to the lowest
     * stop, so car 0 is ALREADY at the lobby when later waves arrive —
     * - t=2.05 wave→5 goes to car 0 (back at 0 since ≈1.17, ties car 1 at
     *   cost 0, lowest index wins) instead of car 1;
     * - t=4.05 wave→7 boards with no 3-floor deadhead (4.35 in GL-1), so the
     *   final dropoff lands at 5.0 instead of 5.3.
     */
    expect(log).toEqual([
      { t: 0.05, floor: 0, car: 0, on: [13, 14, 15, 16], off: [] },
      { t: 0.6, floor: 3, car: 0, on: [], off: [13, 14, 15, 16] },
      { t: 2.05, floor: 0, car: 0, on: [17, 18, 19, 20], off: [] },
      { t: 2.8, floor: 5, car: 0, on: [], off: [17, 18, 19, 20] },
      { t: 4.05, floor: 0, car: 0, on: [21, 22, 23, 24], off: [] },
      { t: 5, floor: 7, car: 0, on: [], off: [21, 22, 23, 24] },
    ])
  })
})

describe('GL-3 — idleAnswerThreshold', () => {
  function setup(threshold: number): { state: EngineState; shaft: Shaft; caller: Person } {
    const { state, shaft } = towerWithShaft(10)
    addCar(shaft)
    shaft.program.idleAnswerThreshold = threshold
    // Car 0 idle at floor 8; car 1 moving up from 0 with a passenger to 6.
    shaft.cars[0]!.y = 8
    const passenger = rider(state, shaft, 0, 6)
    passenger.state = 'riding'
    shaft.cars[1]!.passengerIds.push(passenger.id)
    shaft.cars[1]!.dir = 1
    shaft.cars[1]!.state = 'moving'
    const caller = rider(state, shaft, 7, 0) // hall call at 7, down
    return { state, shaft, caller }
  }

  it('threshold 3: the idle car (6 floors closer) answers', () => {
    const { state, shaft, caller } = setup(3)
    for (let i = 0; i < 100 && caller.state === 'queued'; i++) {
      stepElevators(state, DT, [])
    }
    expect(shaft.cars[0]!.passengerIds).toContain(caller.id)
  })

  it('threshold 15: the moving car answers after its dropoff', () => {
    const { state, shaft, caller } = setup(15)
    for (let i = 0; i < 300 && caller.state === 'queued'; i++) {
      stepElevators(state, DT, [])
    }
    expect(shaft.cars[1]!.passengerIds).toContain(caller.id)
  })
})

describe('SCAN down-peak sweep (the "elevator algorithm")', () => {
  it('rides to the highest down-call without dead stops, then sweeps down boarding floor by floor', () => {
    const { state, shaft } = towerWithShaft(10)
    // Morning down-peak: tenants on 3/5/7 all heading for the lobby.
    const at3 = rider(state, shaft, 3, 0)
    const at5 = rider(state, shaft, 5, 0)
    const at7 = rider(state, shaft, 7, 0)
    const car = shaft.cars[0]!

    const dingFloors: number[] = []
    for (let i = 0; i < 400 && state.people.length > 0; i++) {
      const events: EngineEvent[] = []
      stepElevators(state, DT, events)
      stepPeople(state, DT, [])
      for (const e of events) {
        if (e.type === 'elevatorDing') {
          dingFloors.push(e.floor)
        }
      }
    }
    // Climb passes 3 and 5 without opening doors; first pickup is the TOP call.
    expect(dingFloors).toEqual([7, 5, 3, 0])
    expect(car.passengerIds).toEqual([])
    expect([at3, at5, at7].every((p) => state.people.every((q) => q.id !== p.id) || p.legIndex > 0)).toBe(true)
  })

  it('a full car stops assigning hall calls and expresses to its destinations', () => {
    const { state, shaft } = towerWithShaft(10, 'service') // capacity 10
    // 10 staff at floor 8 fill the car; 2 more wait at floor 4 on the way down.
    const upper = Array.from({ length: 10 }, () => rider(state, shaft, 8, 0, true))
    const lower = Array.from({ length: 2 }, () => rider(state, shaft, 4, 0, true))
    const car = shaft.cars[0]!

    const dingFloors: number[] = []
    for (let i = 0; i < 200 && upper.some((p) => p.state !== 'walking'); i++) {
      const events: EngineEvent[] = []
      stepElevators(state, DT, events)
      for (const e of events) {
        if (e.type === 'elevatorDing') {
          dingFloors.push(e.floor)
        }
      }
    }
    // Boards all 10 at 8 (full), then expresses PAST floor 4 straight to 0.
    expect(dingFloors).toEqual([8, 0])
    expect(car.passengerIds).toEqual([])
    expect(lower.every((p) => p.state === 'queued')).toBe(true)
  })
})

describe('boarding capacity', () => {
  it('boards FIFO to capacity; the rest keep queue head with reduced patience', () => {
    const { state, shaft } = towerWithShaft(5, 'service') // car capacity 10
    const riders = Array.from({ length: 12 }, () => rider(state, shaft, 0, 5, true))
    const before = riders.map((r) => r.patienceLeft)
    for (let i = 0; i < 10; i++) {
      stepElevators(state, DT, [])
    }
    const car = shaft.cars[0]!
    expect(car.passengerIds).toEqual(riders.slice(0, 10).map((r) => r.id))
    expect(riders[10]!.state).toBe('queued')
    expect(riders[10]!.patienceLeft).toBeCloseTo(before[10]! * TUNING.people.reboardPatienceFactor)
    expect(riders[11]!.patienceLeft).toBeCloseTo(before[11]! * TUNING.people.reboardPatienceFactor)

    // After the first trip completes, the leftovers board next.
    for (let i = 0; i < 400 && riders[10]!.state !== 'riding'; i++) {
      stepElevators(state, DT, [])
      stepPeople(state, DT, [])
    }
    expect(car.passengerIds).toEqual([riders[10]!.id, riders[11]!.id])
  })
})

describe('door timing', () => {
  it('doors hold for open + dwell + close before departing', () => {
    const { state, shaft } = towerWithShaft(5)
    rider(state, shaft, 0, 3)
    stepElevators(state, DT, []) // boards, doors start
    const car = shaft.cars[0]!
    expect(car.state).toBe('doors')
    const total = (2 * TUNING.movement.doorCycleSec + shaft.program.doorDwellSec) / 60
    expect(car.doorTimer).toBeCloseTo(total - DT, 5)
    // Still at the floor through the door cycle…
    stepElevators(state, total - 2 * DT, [])
    expect(car.y).toBe(0)
    expect(car.state).toBe('doors')
    // …and moving right after it elapses.
    stepElevators(state, 2 * DT, [])
    expect(car.state).toBe('moving')
    expect(car.y).toBeGreaterThan(0)
  })
})

describe('home floor return', () => {
  it('an idle car returns home only after idleReturnHomeMin', () => {
    const { state, shaft } = towerWithShaft(10)
    const car = shaft.cars[0]!
    car.homeFloor = 5
    stepElevators(state, TUNING.elevators.idleReturnHomeMin - 0.5, [])
    expect(car.y).toBe(0)
    stepElevators(state, 1.5, [])
    expect(car.y).toBeGreaterThan(0)
    stepElevators(state, 1, [])
    expect(car.y).toBe(5)
  })
})

describe('wait stat EMA', () => {
  it('samples REAL queued minutes at each boarding', () => {
    const { state, shaft } = towerWithShaft(5)
    const person = rider(state, shaft, 0, 3)
    stepPeople(state, 6, []) // actually waits 6 game-min in the queue
    stepElevators(state, DT, [])
    expect(person.state).toBe('riding')
    expect(shaft.stats.avgWaitGameMin).toBeCloseTo(TUNING.elevators.waitStatEma * 6)
    // Peak tracks the worst smoothed wait since the last reset (≥ the live avg).
    expect(shaft.stats.peakWaitGameMin).toBeGreaterThanOrEqual(shaft.stats.avgWaitGameMin)
    expect(shaft.stats.peakWaitGameMin).toBeCloseTo(TUNING.elevators.waitStatEma * 6)
  })
})
