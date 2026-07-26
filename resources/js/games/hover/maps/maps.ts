import { castleMap } from './castle'
import { cityMap } from './city'
import { gardenMap } from './garden'
import { glacierMap } from './glacier'
import type { MapDef } from './mapTypes'
import { neonMap } from './neon'
import { sewerMap } from './sewer'
import { templeMap } from './temple'

export const MAPS: readonly MapDef[] = [castleMap, cityMap, sewerMap, neonMap, glacierMap, gardenMap, templeMap]

export const TOTAL_LEVELS = MAPS.length

export function mapForRound(roundIndex: number): MapDef {
  const map = MAPS[roundIndex % MAPS.length]
  if (!map) {
    throw new Error(`No map for round ${roundIndex}`)
  }
  return map
}
