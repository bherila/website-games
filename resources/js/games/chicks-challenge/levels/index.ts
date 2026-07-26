import type { ChicksLevelDef } from './levelTypes'
import { PHASE1_LEVELS } from './phase1'
import { PHASE2_LEVELS } from './phase2'
import { PHASE3_LEVELS } from './phase3'
import { PHASE4_LEVELS } from './phase4'
import { PHASE5_LEVELS } from './phase5'
import { PHASE6_LEVELS } from './phase6'
import { PHASE7_LEVELS } from './phase7'
import { PHASE8_LEVELS } from './phase8'

export const LEVELS: readonly ChicksLevelDef[] = [
  ...PHASE1_LEVELS,
  ...PHASE2_LEVELS,
  ...PHASE3_LEVELS,
  ...PHASE4_LEVELS,
  ...PHASE5_LEVELS,
  ...PHASE6_LEVELS,
  ...PHASE7_LEVELS,
  ...PHASE8_LEVELS,
]

export const LEVEL_IDS: readonly number[] = LEVELS.map((level) => level.id)

export function getLevelById(id: number): ChicksLevelDef | null {
  return LEVELS.find((level) => level.id === id) ?? null
}
