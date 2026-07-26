import { FLAG_DECAY_PER_SEC, FLAG_MIN_VALUE, FLAG_START_VALUE, MAP_BONUS_PER_CYCLE } from '../gameTypes'

/**
 * All uncollected flags share one value that decays with round time — collect
 * early to bank more, like the original's countdown scoring.
 */
export function currentFlagValue(elapsedSec: number): number {
  return Math.max(FLAG_MIN_VALUE, Math.round(FLAG_START_VALUE - FLAG_DECAY_PER_SEC * elapsedSec))
}

export function mapBonusForCycle(cycle: number): number {
  return MAP_BONUS_PER_CYCLE * Math.max(1, cycle)
}
