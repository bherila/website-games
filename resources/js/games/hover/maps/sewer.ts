import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * The Sewers: a serpentine of long tunnels connected at alternating ends,
 * with jumpable weirs ('-') cutting straight across and pillars to slalom.
 */
export const sewerMap: MapDef = createMapDef({
  id: 'sewer',
  rows: [
    '#########################',
    '#P......................#',
    '#.....#.....#.....#.....#',
    '#.......................#',
    '##########--#########...#',
    '#.......................#',
    '#........#.....#........#',
    '#.......................#',
    '#...#########--##########',
    '#.......................#',
    '#.....#.....#.....#.....#',
    '#.......................#',
    '######--#############...#',
    '#.......................#',
    '#........#.....#........#',
    '#.......................#',
    '#...#############--######',
    '#.......................#',
    '#.....#.....#.....#.....#',
    '#......................E#',
    '#########################',
  ],
  theme: {
    name: 'The Sewers',
    skyTopColor: 0x14352a,
    skyBottomColor: 0x2f6e4f,
    fogColor: 0x1d4a36,
    fogDensity: 0.017,
    floorColorA: 0x3a5f4a,
    floorColorB: 0x33543f,
    wallColorA: 0x6f9663,
    wallColorB: 0x5c8253,
    lowWallColor: 0x86b56a,
    accentColor: 0x7cfc00,
    lightColor: 0xe0ffe4,
    ambientIntensity: 0.45,
    directionalIntensity: 1.1,
    wallTexture: 'brick',
  },
})
