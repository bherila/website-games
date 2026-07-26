import type { MapDef } from './mapTypes'
import { createMapDef } from './mapTypes'

/**
 * Glacier Cavern: a wide-open skating rink ringed by jumpable ('-') snowbanks
 * with drive-through gaps, corner ice blocks, and a raised central floe ('=')
 * with a ramp up from the south. Reduced lateral grip makes both crafts
 * drift, and icy walls bounce a little harder.
 */
export const glacierMap: MapDef = createMapDef({
  id: 'glacier',
  rows: [
    '###########################',
    '#P........................#',
    '#.........................#',
    '#...##.....--.....##......#',
    '#...##............##......#',
    '#.........................#',
    '#.......---.....---.......#',
    '#.....-.............-.....#',
    '#.....-.....==......-.....#',
    '#...........==............#',
    '#.....-.....^.......-.....#',
    '#.......---.....---.......#',
    '#.........................#',
    '#...##............##......#',
    '#...##.....--.....##......#',
    '#.........................#',
    '#........................E#',
    '###########################',
  ],
  theme: {
    name: 'Glacier Cavern',
    skyTopColor: 0x9fd8ff,
    skyBottomColor: 0xeaf7ff,
    fogColor: 0xdceef7,
    fogDensity: 0.009,
    floorColorA: 0xbfe3f2,
    floorColorB: 0xa9d5e8,
    wallColorA: 0x9fd4f0,
    wallColorB: 0x6fb4dd,
    lowWallColor: 0xe8f7ff,
    accentColor: 0x66d9ff,
    lightColor: 0xffffff,
    ambientIntensity: 0.75,
    directionalIntensity: 1.3,
    wallTexture: 'ice',
    weather: 'snow',
  },
  physics: {
    lateralGrip: 0.9,
    wallRestitution: 0.8,
  },
})
