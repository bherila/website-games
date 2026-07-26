import { createDroneBrain } from '../engine/droneAi'
import type { CraftState, EngineState, Flag, Pod, Trap, Vec2 } from '../gameTypes'
import { CRAFT_RADIUS, FLAG_START_VALUE } from '../gameTypes'
import type { MapDef, MapTheme } from '../maps/mapTypes'
import { cellCenter, createMapDef } from '../maps/mapTypes'

export const testTheme: MapTheme = {
  name: 'Test Arena',
  skyTopColor: 0x000000,
  skyBottomColor: 0x111111,
  fogColor: 0x222222,
  fogDensity: 0.01,
  floorColorA: 0x333333,
  floorColorB: 0x444444,
  wallColorA: 0x555555,
  wallColorB: 0x666666,
  lowWallColor: 0x777777,
  accentColor: 0x888888,
  lightColor: 0xffffff,
  ambientIntensity: 0.5,
  directionalIntensity: 1,
  wallTexture: 'stone',
}

/** Mostly-open 9×7 arena with a single low wall near the middle. */
export const openMap: MapDef = createMapDef({
  id: 'castle',
  rows: [
    '#########',
    '#P.....E#',
    '#.......#',
    '#...-...#',
    '#.......#',
    '#.......#',
    '#########',
  ],
  theme: testTheme,
})

/** A vertical high wall forces an A* detour through the bottom corridor. */
export const corridorMap: MapDef = createMapDef({
  id: 'city',
  rows: [
    '#########',
    '#P..#..E#',
    '#...#...#',
    '#...#...#',
    '#.......#',
    '#########',
  ],
  theme: testTheme,
})

export function makeCraft(pos: Vec2, overrides: Partial<CraftState> = {}): CraftState {
  return {
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    heading: 0,
    angularVel: 0,
    altitude: 0,
    verticalVel: 0,
    airborne: false,
    radius: CRAFT_RADIUS,
    speedEffect: null,
    hasJumpPower: false,
    stuckSec: 0,
    trapGraceSec: 0,
    arrowGraceSec: 0,
    ...overrides,
  }
}

export function makeFlag(map: MapDef, id: number, team: 'blue' | 'red', cell: { col: number; row: number }): Flag {
  return { id, team, cell, pos: cellCenter(map, cell), collected: false }
}

export function makePod(map: MapDef, id: number, kind: Pod['kind'], cell: { col: number; row: number }): Pod {
  return { id, kind, cell, pos: cellCenter(map, cell), active: true, respawnSec: 0 }
}

export function makeTrap(map: MapDef, id: number, cell: { col: number; row: number }): Trap {
  return { id, cell, pos: cellCenter(map, cell) }
}

export function makeState(
  map: MapDef,
  overrides: Partial<Pick<EngineState, 'flags' | 'pods' | 'traps' | 'cycle' | 'roundIndex' | 'score'>> = {},
): EngineState {
  const playerPos = cellCenter(map, map.playerSpawn)
  const dronePos = cellCenter(map, map.enemySpawn)

  return {
    map,
    cycle: overrides.cycle ?? 1,
    roundIndex: overrides.roundIndex ?? 0,
    lossesOnMap: 0,
    player: makeCraft(playerPos),
    drone: makeCraft(dronePos),
    droneBrain: createDroneBrain(),
    flags: overrides.flags ?? [],
    pods: overrides.pods ?? [],
    traps: overrides.traps ?? [],
    score: overrides.score ?? 0,
    mapScore: 0,
    flagValue: FLAG_START_VALUE,
    elapsedSec: 0,
    outcome: 'playing',
    prevJumpHeld: false,
  }
}
