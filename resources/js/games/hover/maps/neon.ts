import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * Neon Circuit: a synthwave night arena — an open outer boulevard, a pillared
 * inner box whose side doors are jumpable ('-') neon barriers, and a raised
 * central platform ('=') with no ramp: only the jump power-up gets you up
 * there. Walls carry emissive seams; the floor is a Tron-style grid.
 */
export const neonMap: MapDef = createMapDef({
  id: 'neon',
  rows: [
    '#############################',
    '#P..........................#',
    '#...........................#',
    '#...####---######---####....#',
    '#...........................#',
    '#...#...................#...#',
    '#...#....####....####...#...#',
    '#...-....#..........#...-...#',
    '#...#....#....==....#...#...#',
    '#...#.........==........#...#',
    '#...#....#....==....#...#...#',
    '#...-....#..........#...-...#',
    '#...#....####....####...#...#',
    '#...#...................#...#',
    '#...........................#',
    '#...####---######---####....#',
    '#...........................#',
    '#..........................E#',
    '#############################',
  ],
  theme: {
    name: 'Neon Circuit',
    skyTopColor: 0x0b031c,
    skyBottomColor: 0x5a1668,
    fogColor: 0x1a0b33,
    fogDensity: 0.008,
    floorColorA: 0x0d0d1f,
    floorColorB: 0x27e6ff,
    floorPattern: 'grid',
    wallColorA: 0x27e6ff,
    wallColorB: 0xff2ec4,
    lowWallColor: 0xffe12e,
    accentColor: 0xff2ec4,
    lightColor: 0xbfd7ff,
    ambientIntensity: 0.35,
    directionalIntensity: 0.9,
    wallTexture: 'neon',
    wallEmissiveIntensity: 0.85,
  },
})
