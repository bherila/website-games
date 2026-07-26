/**
 * Elevators — collective-control SCAN, hall-call assignment, doors, and the
 * rolling wait stat. Consumes NO rng.
 *
 * Hall calls are DERIVED from queued people every tick (no hidden queue state —
 * snapshot-safe and impossible to desync). Queue order is person-id ascending:
 * ids grow monotonically with spawn time, so this is the deterministic
 * approximation of arrival-FIFO; left-behind boarders keep their (lower) ids
 * and therefore their place at the head, with patience × reboardPatienceFactor.
 *
 * SCAN: a car serves stops (passenger destinations + assigned hall calls) in
 * its travel direction until none remain ahead, then reverses, else idles.
 * Stops are DIRECTION-MATCHED: a moving car only opens its doors where a
 * passenger alights or a hall call in its continuing direction waits. Calls in
 * the opposite direction act as the reversal point instead — the car rides to
 * the FARTHEST such call (the classic morning down-peak: climb to the top
 * call, then sweep down boarding floor by floor). A car at capacity receives
 * no hall-call assignments, so it expresses straight to its passengers'
 * destinations.
 * Direction priority (program slot via clock.directionPriorityFor) does two
 * things: favored calls look priorityCostBonusFloors closer during idle target
 * selection, and an empty idle car repositions toward the favored end of the
 * shaft (expressToTop → lowest stop for morning up-traffic, expressToBottom →
 * highest) — the repositioning is what makes rush programs matter when all
 * traffic starts at the lobby. An idle car answers a fresh call over a moving
 * candidate only if it is ≥ idleAnswerThreshold floors closer (ties → lowest
 * car index). Cars with a homeFloor return to it after idleReturnHomeMin idle
 * game-minutes; while idle, Car.doorTimer doubles as the idle-minute
 * accumulator (documented reuse — Car has no separate idle field).
 *
 * Ownership split with people.ts: boarding flips queued→riding; alighting
 * advances legIndex and sets 'walking' — people.ts finishes the journey.
 */

import type { Car, DirectionPriority, EngineEvent, EngineState, Person, Shaft } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { shaftDef } from './catalog'
import { directionPriorityFor } from './clock'
import { consumeQueuedMinutes } from './people'

interface HallCall {
  floor: number
  dir: -1 | 1
  people: Person[]
}

type PersonIndex = Map<number, Person>

const EPS = 1e-6

function doorTotalMin(shaft: Shaft): number {
  return (2 * TUNING.movement.doorCycleSec + shaft.program.doorDwellSec) / 60
}

function currentLeg(person: Person) {
  return person.legs[person.legIndex]
}

/** Derive hall calls for one shaft from queued people, id order (≈ arrival FIFO). */
function deriveCalls(people: Person[], shaft: Shaft): HallCall[] {
  const byKey = new Map<string, HallCall>()
  for (const person of people) {
    if (person.state !== 'queued') {
      continue
    }
    const leg = currentLeg(person)
    if (leg?.type !== 'elevator' || leg.shaftId !== shaft.id) {
      continue
    }
    const dir: -1 | 1 = leg.toFloor > leg.fromFloor ? 1 : -1
    const key = `${leg.fromFloor}:${dir}`
    const call = byKey.get(key)
    if (call) {
      call.people.push(person)
    } else {
      byKey.set(key, { floor: leg.fromFloor, dir, people: [person] })
    }
  }
  return [...byKey.values()].sort((a, b) => a.floor - b.floor || b.dir - a.dir)
}

function favored(call: { floor: number; dir: number }, priority: DirectionPriority, shaft: Shaft): boolean {
  const lowest = shaft.enabledStops[0] ?? shaft.bottomFloor
  if (priority === 'expressToTop') {
    return call.dir === 1 && call.floor <= lowest
  }
  if (priority === 'expressToBottom') {
    return call.dir === -1 && call.floor > lowest
  }
  return false
}

function passengerDestinations(index: PersonIndex, car: Car): number[] {
  const dests: number[] = []
  for (const id of car.passengerIds) {
    const person = index.get(id)
    const leg = person ? currentLeg(person) : undefined
    if (leg?.type === 'elevator') {
      dests.push(leg.toFloor)
    }
  }
  return dests
}

function movingToward(car: Car, floor: number): boolean {
  if (car.dir === 0) {
    return false
  }
  return (floor - car.y) * car.dir > -EPS
}

/**
 * Assign each hall call to its best candidate car for this tick. Candidates:
 * stop-enabled, spare capacity, idle or moving toward the call. Cost =
 * |Δfloors|; an idle car beats the best moving candidate only when ≥
 * idleAnswerThreshold floors closer; ties → lowest car index. A full car gets
 * nothing — it expresses to its passengers' destinations until seats free up.
 */
function assignCalls(state: EngineState, shaft: Shaft, calls: HallCall[]): Map<number, HallCall[]> {
  const capacity = shaftDef(shaft.kind).carCapacity
  const assigned = new Map<number, HallCall[]>()
  for (const call of calls) {
    if (!shaft.enabledStops.includes(call.floor)) {
      continue
    }
    let bestMoving: { index: number; cost: number } | null = null
    let bestIdle: { index: number; cost: number } | null = null
    for (const car of shaft.cars) {
      if (car.passengerIds.length >= capacity) {
        continue
      }
      const idle = car.dir === 0
      if (!idle && !movingToward(car, call.floor)) {
        continue
      }
      const cost = Math.abs(car.y - call.floor)
      if (idle) {
        if (!bestIdle || cost < bestIdle.cost) {
          bestIdle = { index: car.index, cost }
        }
      } else if (!bestMoving || cost < bestMoving.cost) {
        bestMoving = { index: car.index, cost }
      }
    }
    let winner: number | null = null
    if (bestIdle && bestMoving) {
      winner = bestMoving.cost - bestIdle.cost >= shaft.program.idleAnswerThreshold ? bestIdle.index : bestMoving.index
    } else if (bestIdle) {
      winner = bestIdle.index
    } else if (bestMoving) {
      winner = bestMoving.index
    }
    if (winner !== null) {
      const list = assigned.get(winner)
      if (list) {
        list.push(call)
      } else {
        assigned.set(winner, [call])
      }
    }
  }
  return assigned
}

function stopsFor(index: PersonIndex, car: Car, assigned: HallCall[] | undefined): number[] {
  const stops = new Set<number>(passengerDestinations(index, car))
  for (const call of assigned ?? []) {
    stops.add(call.floor)
  }
  return [...stops].sort((a, b) => a - b)
}

/**
 * SCAN target selection. A moving car heads for the nearest floor ahead with
 * SERVICEABLE work — a passenger destination or a hall call matching its
 * travel direction. Opposite-direction calls ahead are never intermediate
 * stops; when they are the only work left ahead, the FARTHEST one becomes the
 * reversal point (ride to the extreme, flip, sweep back boarding floor by
 * floor). With nothing ahead the car reverses toward the nearest work behind.
 * Idle cars pick the nearest work, weighing favored-direction hall calls
 * priorityCostBonusFloors closer — the per-call −3 during ASSIGNMENT is a
 * uniform shift over all candidate cars and cannot change which car wins a
 * single call, so target selection (plus idle repositioning) is where the
 * program bias observably acts.
 */
function nextTarget(
  car: Car,
  dests: number[],
  assigned: HallCall[],
  priority: DirectionPriority,
  shaft: Shaft,
): number | null {
  const destSet = new Set(dests)
  const floors = [...new Set([...dests, ...assigned.map((c) => c.floor)])]
  if (floors.length === 0) {
    return null
  }
  const d = car.dir
  if (d !== 0) {
    const serviceable = (f: number): boolean => destSet.has(f) || assigned.some((c) => c.floor === f && c.dir === d)
    const here = floors.find((f) => Math.abs(f - car.y) <= EPS && serviceable(f))
    if (here !== undefined) {
      return here
    }
    const aheadSame = floors.filter((f) => (f - car.y) * d > EPS && serviceable(f))
    if (aheadSame.length > 0) {
      return d === 1 ? Math.min(...aheadSame) : Math.max(...aheadSame)
    }
    const aheadOpp = assigned.filter((c) => (c.floor - car.y) * d > EPS && c.dir === -d).map((c) => c.floor)
    if (aheadOpp.length > 0) {
      return d === 1 ? Math.max(...aheadOpp) : Math.min(...aheadOpp)
    }
    const behind = floors.filter((f) => (f - car.y) * d < -EPS)
    if (behind.length > 0) {
      return d === 1 ? Math.max(...behind) : Math.min(...behind)
    }
    return null
  }
  const atHere = floors.find((f) => Math.abs(f - car.y) <= EPS)
  if (atHere !== undefined) {
    return atHere
  }
  let best: number | null = null
  let bestCost = Infinity
  for (const floor of floors) {
    const call = assigned.find((c) => c.floor === floor)
    const bonus = call && favored(call, priority, shaft) ? TUNING.elevators.priorityCostBonusFloors : 0
    const cost = Math.abs(floor - car.y) - bonus
    if (cost < bestCost - EPS) {
      best = floor
      bestCost = cost
    }
  }
  return best
}

/** Where an empty idle car drifts under a rush program (no explicit homeFloor). */
function repositionTarget(shaft: Shaft, priority: DirectionPriority): number | null {
  if (priority === 'expressToTop') {
    return shaft.enabledStops[0] ?? null
  }
  if (priority === 'expressToBottom') {
    return shaft.enabledStops[shaft.enabledStops.length - 1] ?? null
  }
  return null
}

function sampleWaitStat(state: EngineState, shaft: Shaft, person: Person): void {
  const waited = consumeQueuedMinutes(state, person.id)
  const alpha = TUNING.elevators.waitStatEma
  shaft.stats.avgWaitGameMin += alpha * (waited - shaft.stats.avgWaitGameMin)
  // Track the worst smoothed wait since the last daily pass so the eval sees
  // rush-hour congestion even when it's read during an off-peak lull. Reset in
  // occupancyPass (max is order-insensitive → determinism holds).
  shaft.stats.peakWaitGameMin = Math.max(shaft.stats.peakWaitGameMin, shaft.stats.avgWaitGameMin)
}

/**
 * Serve a stop: alight, pick the continuing direction, board FIFO to capacity.
 * Returns true when anyone moved through the doors (→ ding).
 */
function serveStop(
  state: EngineState,
  index: PersonIndex,
  shaft: Shaft,
  car: Car,
  calls: HallCall[],
  assigned: HallCall[] | undefined,
): boolean {
  const capacity = shaftDef(shaft.kind).carCapacity
  const floor = Math.round(car.y)
  let activity = false

  for (const id of [...car.passengerIds]) {
    const person = index.get(id)
    if (!person) {
      car.passengerIds = car.passengerIds.filter((pid) => pid !== id)
      continue
    }
    const leg = currentLeg(person)
    if (leg?.type === 'elevator' && leg.toFloor === floor) {
      car.passengerIds = car.passengerIds.filter((pid) => pid !== id)
      person.floor = floor
      person.x = leg.toX
      person.legIndex += 1
      person.state = 'walking'
      activity = true
    }
  }

  const remaining = stopsFor(index, car, assigned).filter((f) => Math.abs(f - floor) > EPS)
  const aheadUp = remaining.some((f) => f > floor)
  const aheadDown = remaining.some((f) => f < floor)
  let continueDir: -1 | 0 | 1
  if (car.dir === -1) {
    continueDir = aheadDown ? -1 : aheadUp ? 1 : 0
  } else {
    continueDir = aheadUp ? 1 : aheadDown ? -1 : 0
  }

  const callsHere = calls.filter((c) => c.floor === floor)
  let boardDir: -1 | 0 | 1 = continueDir
  if (boardDir === 0) {
    const firstCall = callsHere.find((c) => c.people.some((p) => p.state === 'queued'))
    boardDir = firstCall ? firstCall.dir : 0
  }
  let boarded = 0
  if (boardDir !== 0) {
    const queue = callsHere.find((c) => c.dir === boardDir)
    if (queue) {
      for (const person of queue.people) {
        if (person.state !== 'queued') {
          continue
        }
        if (car.passengerIds.length >= capacity) {
          person.patienceLeft *= TUNING.people.reboardPatienceFactor
          continue
        }
        sampleWaitStat(state, shaft, person)
        person.state = 'riding'
        car.passengerIds.push(person.id)
        boarded += 1
        activity = true
      }
    }
  }

  if (assigned) {
    for (let i = assigned.length - 1; i >= 0; i--) {
      if (assigned[i]!.floor === floor) {
        assigned.splice(i, 1)
      }
    }
  }
  car.dir = continueDir !== 0 ? continueDir : boarded > 0 ? boardDir : 0
  return activity
}

function stepCar(
  state: EngineState,
  index: PersonIndex,
  shaft: Shaft,
  car: Car,
  dtGameMin: number,
  calls: HallCall[],
  assigned: HallCall[] | undefined,
  events: EngineEvent[],
): void {
  const priority = directionPriorityFor(shaft.program, state.clock)
  const speed = TUNING.movement.carFloorsPerGameMin
  let t = dtGameMin
  let guard = 0
  while (t > EPS && ++guard <= 200) {
    if (car.state === 'doors') {
      const spent = Math.min(t, car.doorTimer)
      car.doorTimer -= spent
      t -= spent
      if (car.doorTimer <= EPS) {
        car.doorTimer = 0
        car.state = car.dir === 0 ? 'idle' : 'moving'
      }
      continue
    }
    if (car.state === 'moving') {
      const target = nextTarget(car, passengerDestinations(index, car), assigned ?? [], priority, shaft)
      if (target === null) {
        car.dir = 0
        car.state = 'idle'
        car.doorTimer = 0
        continue
      }
      if (Math.abs(target - car.y) <= EPS) {
        car.y = target
        if (serveStop(state, index, shaft, car, calls, assigned)) {
          events.push({ type: 'elevatorDing', floor: target })
        }
        car.state = 'doors'
        car.doorTimer = doorTotalMin(shaft)
        continue
      }
      const dir = target > car.y ? 1 : -1
      car.dir = dir
      const step = Math.min(Math.abs(target - car.y), speed * t)
      car.y += dir * step
      t -= step / speed
      continue
    }
    // idle
    if (stopsFor(index, car, assigned).length > 0) {
      car.state = 'moving'
      car.doorTimer = 0
      continue
    }
    const drift = repositionTarget(shaft, priority)
    if (drift !== null && Math.abs(drift - car.y) > EPS && car.passengerIds.length === 0) {
      const dir = drift > car.y ? 1 : -1
      const step = Math.min(Math.abs(drift - car.y), speed * t)
      car.y += dir * step
      t -= step / speed
      continue
    }
    if (car.homeFloor !== null && Math.abs(car.homeFloor - car.y) > EPS) {
      if (car.doorTimer < TUNING.elevators.idleReturnHomeMin) {
        const wait = Math.min(t, TUNING.elevators.idleReturnHomeMin - car.doorTimer)
        car.doorTimer += wait
        t -= wait
        continue
      }
      const dir = car.homeFloor > car.y ? 1 : -1
      const step = Math.min(Math.abs(car.homeFloor - car.y), speed * t)
      car.y += dir * step
      t -= step / speed
      continue
    }
    t = 0
  }
}

/** Advance every shaft (ascending id), cars by index. Consumes NO rng. */
export function stepElevators(state: EngineState, dtGameMin: number, events: EngineEvent[]): void {
  if (dtGameMin <= 0) {
    return
  }
  const people = state.people // id-ascending by EngineState invariant
  const index: PersonIndex = new Map(people.map((p) => [p.id, p]))
  for (const shaft of state.shafts) {
    const calls = deriveCalls(people, shaft)
    const assigned = assignCalls(state, shaft, calls)
    for (const car of shaft.cars) {
      stepCar(state, index, shaft, car, dtGameMin, calls, assigned.get(car.index), events)
    }
  }
}
