/**
 * Star thresholds + star bookkeeping. VIP orchestration (the visit that arms an
 * actual star-up) lands in a later phase; this module owns the population count,
 * the armed-threshold predicate, and the funds/ledger/event side-effects of a
 * star gain or loss. Placement availability always tracks `maxStarReached`, so a
 * star loss decrements `star` but never `maxStarReached`.
 */

import type { EngineEvent, EngineState, ItemKind, MapDefinition, ShaftKind, StarLevel, TowerMilestone } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { isItemAvailable, isShaftAvailable, ITEM_DEFS, SHAFT_DEFS } from './catalog'
import { getMap } from './maps'

const STAR_MILESTONE: Partial<Record<StarLevel, TowerMilestone>> = {
  2: 'star2',
  3: 'star3',
  4: 'star4',
  5: 'star5',
}

export function populationOf(state: EngineState): number {
  let total = 0
  for (const unit of state.units) {
    const pop = unit.population
    total += pop.low + pop.med + pop.high + pop.vip
  }
  return total
}

export function starUpArmed(state: EngineState): boolean {
  const next = state.star + 1
  if (next > 5) {
    return false
  }
  const threshold = TUNING.stars.popThresholds[next as 2 | 3 | 4 | 5]
  return populationOf(state) >= threshold
}

export function unlockedKindsAt(star: StarLevel, map: MapDefinition): (ItemKind | ShaftKind)[] {
  const items = (Object.keys(ITEM_DEFS) as ItemKind[]).filter((kind) => isItemAvailable(kind, star, map))
  const shafts = (Object.keys(SHAFT_DEFS) as ShaftKind[]).filter((kind) => isShaftAvailable(kind, star, map))
  return [...items, ...shafts]
}

export function applyStarUp(state: EngineState, events: EngineEvent[]): void {
  if (state.star >= 5) {
    return
  }
  const oldStar = state.star
  const newStar = (oldStar + 1) as StarLevel
  const map = getMap(state.mapId)

  state.star = newStar
  if (newStar > state.maxStarReached) {
    state.maxStarReached = newStar
  }

  const bonus = TUNING.economy.starUpBonusPerStar * newStar
  state.funds += bonus
  state.ledgerToday.lines['bonus.star'] = (state.ledgerToday.lines['bonus.star'] ?? 0) + bonus

  const before = new Set(unlockedKindsAt(oldStar, map))
  const unlocked = unlockedKindsAt(newStar, map).filter((kind) => !before.has(kind))
  events.push({ type: 'starUp', star: newStar, bonus, unlocked })

  const milestone = STAR_MILESTONE[newStar]
  if (milestone) {
    if (!state.milestonesEarned.includes(milestone)) {
      state.milestonesEarned.push(milestone)
    }
    events.push({ type: 'milestone', milestone })
  }
}

export function applyStarLoss(state: EngineState, report: string[], events: EngineEvent[]): void {
  if (state.star <= 1) {
    return
  }
  const newStar = (state.star - 1) as StarLevel
  state.star = newStar
  events.push({ type: 'starLost', star: newStar, report })
}
