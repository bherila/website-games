import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * Future City: a street grid of building blocks. Three blocks on the
 * diagonal are low ('-') plazas the player can jump across as shortcuts.
 */
export const cityMap: MapDef = createMapDef({
  id: 'city',
  rows: [
    '###########################',
    '#P........................#',
    '#.###..###..###..---..###.#',
    '#.###..###..###..---..###.#',
    '#.###..###..###..---..###.#',
    '#.........................#',
    '#.........................#',
    '#.###..###..---..###..###.#',
    '#.###..###..---..###..###.#',
    '#.###..###..---..###..###.#',
    '#.........................#',
    '#.........................#',
    '#.###..---..###..###..###.#',
    '#.###..---..###..###..###.#',
    '#.###..---..###..###..###.#',
    '#.........................#',
    '#.........................#',
    '#.###..###..###..###..###.#',
    '#.###..###..###..###..###.#',
    '#........................E#',
    '###########################',
  ],
  theme: {
    name: 'Future City',
    skyTopColor: 0x2b32b2,
    skyBottomColor: 0x36c3dd,
    fogColor: 0x2a4a9e,
    fogDensity: 0.009,
    floorColorA: 0x3d4a6b,
    floorColorB: 0x35415e,
    wallColorA: 0x5b8def,
    wallColorB: 0x7f5bef,
    lowWallColor: 0x49e0b8,
    accentColor: 0xff2ec4,
    lightColor: 0xe8f4ff,
    ambientIntensity: 0.5,
    directionalIntensity: 1.4,
    wallTexture: 'panel',
  },
})
