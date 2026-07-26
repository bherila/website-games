import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * Medieval Castle — homage to Hover!'s original level 1. An outer boulevard
 * with a clockwise circuit of directional arrow pads ('8642'), a walkable
 * curtain-wall rampart ring ('=') climbed via ramps from both the boulevard
 * and the courtyard, ground gates through the ring, and a hollow central
 * keep with a ground door south and a jumpable ('-') side door east.
 */
export const castleMap: MapDef = createMapDef({
  id: 'castle',
  rows: [
    '#############################',
    '#P...6......................#',
    '#.......v...........v.......#',
    '#..==========...==========..#',
    '#..=.^.................^.=..#',
    '#..=.....................=.2#',
    '#..=.....................=..#',
    '#..=.......#######.......=..#',
    '#..=.......#.....#.......=..#',
    '#..........#.....#..........#',
    '#..........#.....-..........#',
    '#..........#.....#..........#',
    '#..=.......#.....#.......=..#',
    '#..=.......###.###.......=..#',
    '#..=.....................=..#',
    '#8.=.v.................v.=..#',
    '#..==========...==========..#',
    '#.......^...........^.......#',
    '#...........................#',
    '#......................4...E#',
    '#############################',
  ],
  theme: {
    name: 'Medieval Castle',
    skyTopColor: 0x6db3f2,
    skyBottomColor: 0xffe0b0,
    fogColor: 0xd8c8a8,
    fogDensity: 0.0075,
    floorColorA: 0x55a85c,
    floorColorB: 0x47934e,
    wallColorA: 0xd8b273,
    wallColorB: 0xbf9a5f,
    lowWallColor: 0xe4c688,
    accentColor: 0xd03a2e,
    lightColor: 0xfff2dc,
    ambientIntensity: 0.55,
    directionalIntensity: 1.6,
    wallTexture: 'stone',
  },
})
