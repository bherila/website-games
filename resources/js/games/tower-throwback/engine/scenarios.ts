/**
 * Canned towers for visual tests and scene development. Every scenario is
 * built through validated placement commands (a rejection throws) plus real
 * stepEngine time advancement. Disaster-only scenarios then stage explicit
 * presentation state after building the reachable tower around it.
 *
 * Starter/midgame stick to 1★ items. Endgame raises the rating to 3★ through
 * the engine's own applyStarUp (visual tests never grind population) before
 * excavating — underground placement is 3★-gated per the spec.
 */

import type { EngineCommand, EngineState, ItemKind } from '../gameTypes'
import { shaftDef } from './catalog'
import { createEngineState, stepEngine } from './engine'
import { spawnPerson } from './people'
import { applyStarUp } from './stars'

export type ScenarioName = 'starter' | 'midgame' | 'endgame' | 'fullCar' | 'damage' | 'fire' | 'activityDay' | 'activityNight'

function run(state: EngineState, commands: EngineCommand[]): void {
  const events = stepEngine(state, commands, 0)
  const failure = events.find((e) => e.type === 'placementRejected' || e.type === 'loanPrompt')
  if (failure) {
    throw new Error(`scenario build failed: ${JSON.stringify(failure)}`)
  }
}

function place(kind: ItemKind, floor: number, x: number, widthTiles?: number): EngineCommand {
  return widthTiles === undefined ? { type: 'place', kind, floor, x } : { type: 'place', kind, floor, x, widthTiles }
}

/** Advance whole game-days through the real engine loop (speed 4, 5 s steps). */
function advanceDays(state: EngineState, days: number): void {
  const targetDay = state.clock.day + days
  const targetMinute = state.clock.minute
  stepEngine(state, [{ type: 'setSpeed', speed: 4 }], 0)
  let guard = 0
  while (state.clock.day < targetDay || (state.clock.day === targetDay && state.clock.minute < targetMinute)) {
    stepEngine(state, [], 5)
    if (++guard > 100_000) {
      throw new Error('advanceDays never reached target')
    }
  }
  stepEngine(state, [{ type: 'setSpeed', speed: 1 }], 0)
}

function buildStarter(state: EngineState): void {
  run(state, [place('lobby', 0, 150, 40)])
  const commands: EngineCommand[] = []
  for (let f = 1; f <= 3; f++) {
    commands.push(place('slab', f, 150, 40))
  }
  commands.push({ type: 'placeShaft', kind: 'standard', x: 168, bottomFloor: 0, topFloor: 3 })
  commands.push(place('officeS', 1, 150), place('officeS', 1, 156), place('restroom', 1, 176))
  commands.push(place('officeS', 2, 150), place('restroom', 2, 176))
  commands.push(place('fastfood', 3, 150), place('shop', 3, 172))
  run(state, commands)
}

/**
 * Midgame/endgame use lobbyHeight 2, so floor 1 is the lobby atrium — slabs
 * start at floor 2, resting on the atrium top.
 */
function buildMidgame(state: EngineState): void {
  run(state, [place('lobby', 0, 130, 80)])
  const commands: EngineCommand[] = []
  for (let f = 2; f <= 15; f++) {
    if (f === 10) {
      commands.push(place('skylobby', 10, 130, 80))
    } else {
      commands.push(place('slab', f, 130, 80))
    }
  }
  commands.push({ type: 'placeShaft', kind: 'standard', x: 150, bottomFloor: 0, topFloor: 10 })
  commands.push({ type: 'placeShaft', kind: 'standard', x: 180, bottomFloor: 10, topFloor: 15 })
  commands.push({ type: 'placeShaft', kind: 'express', x: 200, bottomFloor: 0, topFloor: 15 })
  for (const f of [2, 3, 4, 5]) {
    commands.push(place('officeS', f, 130), place('officeS', f, 136), place('officeS', f, 142), place('restroom', f, 160))
  }
  commands.push(place('fastfood', 6, 130), place('shop', 6, 154), place('shop', 6, 164), place('fastfood', 6, 184))
  for (const f of [7, 8, 9]) {
    commands.push(place('aptStudio', f, 130), place('aptStudio', f, 134), place('aptStudio', f, 138), place('aptStudio', f, 142))
  }
  for (const f of [11, 12, 13, 14]) {
    commands.push(place('aptStudio', f, 130), place('aptStudio', f, 134), place('officeS', f, 140), place('restroom', f, 154))
  }
  commands.push(place('shop', 15, 130), place('fastfood', 15, 164))
  run(state, commands)
  advanceDays(state, 3)
}

function buildEndgame(state: EngineState): void {
  applyStarUp(state, [])
  applyStarUp(state, [])
  run(state, [place('lobby', 0, 120, 60)])
  const commands: EngineCommand[] = []
  for (let f = 2; f <= 40; f++) {
    if (f === 12) {
      commands.push(place('skylobby', 12, 120, 60))
    } else {
      commands.push(place('slab', f, 120, 60))
    }
  }
  for (let f = -1; f >= -3; f--) {
    commands.push(place('slab', f, 130, 30))
  }
  commands.push({ type: 'placeShaft', kind: 'express', x: 156, bottomFloor: 0, topFloor: 40 })
  commands.push({ type: 'placeShaft', kind: 'standard', x: 140, bottomFloor: 0, topFloor: 12 })
  commands.push({ type: 'placeShaft', kind: 'standard', x: 170, bottomFloor: 12, topFloor: 26 })
  for (const f of [2, 3, 4]) {
    commands.push(place('officeS', f, 120), place('officeS', f, 126), place('officeS', f, 132), place('restroom', f, 146))
  }
  commands.push(place('fastfood', 6, 120), place('shop', 6, 144), place('shop', 6, 160))
  for (const f of [13, 14, 15, 16]) {
    commands.push(place('aptStudio', f, 120), place('aptStudio', f, 124), place('aptStudio', f, 128))
  }
  commands.push(place('shop', 27, 120), place('fastfood', 27, 130))
  for (const f of [28, 29]) {
    commands.push(place('aptStudio', f, 120), place('aptStudio', f, 124), place('officeS', f, 130), place('restroom', f, 144))
  }
  commands.push(place('shop', -1, 130))
  run(state, commands)
  advanceDays(state, 2)
}

function buildFullCar(state: EngineState): void {
  run(state, [place('lobby', 0, 150, 40)])
  const commands: EngineCommand[] = []
  for (let floor = 1; floor <= 30; floor += 1) {
    commands.push(place('slab', floor, 150, 40))
  }
  commands.push({ type: 'placeShaft', kind: 'standard', x: 168, bottomFloor: 0, topFloor: 30 })
  run(state, commands)

  for (let index = 0; index < shaftDef('standard').carCapacity; index += 1) {
    const person = spawnPerson(state, {
      tier: 'low',
      floor: 0,
      x: 150,
      toFloor: 30,
      toX: 150,
      purpose: 'commuteIn',
    })
    if (!person) {
      throw new Error('full-car scenario could not spawn a passenger')
    }
  }

  stepEngine(state, [], 0.5)
  if (state.shafts[0]?.cars[0]?.passengerIds.length !== shaftDef('standard').carCapacity) {
    throw new Error('full-car scenario did not fill the car')
  }
}

function buildDamage(state: EngineState): void {
  buildStarter(state)
  const explosion = state.units.find((unit) => unit.kind === 'officeS' && unit.floor === 1)
  const fire = state.units.find((unit) => unit.kind === 'officeS' && unit.floor === 2)
  if (!explosion || !fire) {
    throw new Error('damage scenario could not find both office rows')
  }
  explosion.offline = true
  explosion.damageKind = 'explosion'
  fire.offline = true
  fire.damageKind = 'fire'
}

function buildActiveFire(state: EngineState): void {
  buildMidgame(state)
  const burning = state.units
    .filter((unit) => unit.kind === 'officeS' && unit.floor === 2)
    .sort((a, b) => a.id - b.id)
    .slice(0, 2)
  if (burning.length !== 2) {
    throw new Error('fire scenario could not find adjacent offices')
  }
  state.activeFire = {
    kind: 'fire',
    floor: 2,
    burningUnitIds: burning.map((unit) => unit.id),
    spreadRemainingMin: 7,
    responseRemainingMin: 12,
  }
}

function buildActivity(state: EngineState, minute: number): void {
  buildStarter(state)
  run(state, [
    place('aptStudio', 2, 156),
    place('aptStudio', 2, 160),
    place('aptStudio', 2, 164),
  ])
  state.clock.day = 4
  state.clock.minute = minute
  for (const unit of state.units) {
    if (['officeS', 'aptStudio', 'fastfood', 'restroom'].includes(unit.kind)) {
      unit.occupied = unit.kind !== 'restroom'
    }
  }
  if (minute >= 7 * 60 && minute < 22 * 60) {
    const fastFood = state.units.find((unit) => unit.kind === 'fastfood')
    if (fastFood) {
      state.people.push({
        id: state.nextId++,
        tier: 'med',
        vip: false,
        state: 'walking',
        floor: fastFood.floor,
        x: fastFood.x + fastFood.width / 2,
        patienceLeft: 60,
        irritated: false,
        legs: [],
        legIndex: 0,
        purpose: 'shopping',
        tenantUnitId: null,
        destUnitId: fastFood.id,
      })
    }
  }
}

export function buildScenario(name: ScenarioName, seed: number): EngineState {
  const lobbyHeight = ['midgame', 'endgame', 'fire'].includes(name) ? 2 : 1
  const state = createEngineState({ seed, mapId: 'city-tower', lobbyHeight })
  if (name === 'starter') {
    buildStarter(state)
  } else if (name === 'midgame') {
    buildMidgame(state)
  } else if (name === 'endgame') {
    buildEndgame(state)
  } else if (name === 'fullCar') {
    buildFullCar(state)
  } else if (name === 'damage') {
    buildDamage(state)
  } else if (name === 'fire') {
    buildActiveFire(state)
  } else {
    buildActivity(state, name === 'activityNight' ? 23 * 60 : 12 * 60)
  }
  return state
}
