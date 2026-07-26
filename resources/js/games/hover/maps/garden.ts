import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * Hedge Maze: three concentric hedge rings with offset ground doors, so the
 * drive to the core zig-zags — but every ring has a jumpable ('-') hedge on
 * the center column, forming a vertical jump highway straight through.
 * Soft hedges absorb most bounce energy.
 */
export const gardenMap: MapDef = createMapDef({
  id: 'garden',
  rows: [
    '#########################',
    '#P......................#',
    '#.......................#',
    '#..#########-#########..#',
    '#..#.................#..#',
    '#..#.................#..#',
    '#..#..######-######..#..#',
    '#..#..#...........#..#..#',
    '#..#..#...........#..#..#',
    '#..#.....###-###..#.....#',
    '#..#.....#..E.....#.....#',
    '#..#.....#........#.....#',
    '#..#..#..###-###..#..#..#',
    '#..#..#...........#..#..#',
    '#..#..######-######..#..#',
    '#..#.................#..#',
    '#..#.................#..#',
    '#..#########-#########..#',
    '#.......................#',
    '#.......................#',
    '#########################',
  ],
  theme: {
    name: 'Hedge Maze',
    skyTopColor: 0x59b8ff,
    skyBottomColor: 0xcfe9a8,
    fogColor: 0xcfe4b8,
    fogDensity: 0.007,
    floorColorA: 0x62b356,
    floorColorB: 0x54a04a,
    wallColorA: 0x3f8f3a,
    wallColorB: 0x2e7030,
    lowWallColor: 0x5fae4b,
    accentColor: 0xff7ac2,
    lightColor: 0xfff7dd,
    ambientIntensity: 0.65,
    directionalIntensity: 1.5,
    wallTexture: 'hedge',
    weather: 'rain',
  },
  physics: {
    wallRestitution: 0.45,
  },
})
