import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * Desert Temple: a vast hypostyle hall — offset rows of single-cell pillars
 * to slalom through — around a central sanctum walled entirely with jumpable
 * ('-') sandstone, with ground doors at its north and south ends.
 */
export const templeMap: MapDef = createMapDef({
  id: 'temple',
  rows: [
    '###########################',
    '#P........................#',
    '#.........................#',
    '#...#...#...#...#...#...#.#',
    '#.........................#',
    '#.....#...#...#...#...#...#',
    '#.........................#',
    '#...#...#.---.---.#...#...#',
    '#.........-.....-.........#',
    '#.....#...-.....-...#.....#',
    '#.........-.....-.........#',
    '#...#...#.---.---.#...#...#',
    '#.........................#',
    '#.....#...#...#...#...#...#',
    '#.........................#',
    '#...#...#...#...#...#...#.#',
    '#.........................#',
    '#........................E#',
    '###########################',
  ],
  theme: {
    name: 'Desert Temple',
    skyTopColor: 0x66b7f0,
    skyBottomColor: 0xffd9a0,
    fogColor: 0xdfc191,
    fogDensity: 0.0085,
    floorColorA: 0xd9b678,
    floorColorB: 0xcaa768,
    wallColorA: 0xe0bc82,
    wallColorB: 0xc39a5c,
    lowWallColor: 0xeccf96,
    accentColor: 0xff9d2e,
    lightColor: 0xfff0d0,
    ambientIntensity: 0.6,
    directionalIntensity: 1.7,
    wallTexture: 'sandstone',
    weather: 'sandstorm',
  },
})
