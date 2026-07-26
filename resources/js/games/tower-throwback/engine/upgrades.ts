/**
 * In-place upgrades — validate/apply for the catalog's UPGRADE_PATHS.
 *
 * A kind-changing upgrade PRESERVES the unit's footprint even where the
 * catalog widths differ (fastfood 12 → restaurant 10: the room keeps its 12
 * tiles, per the spec's "footprint preserved" rule). Grade upgrades flip
 * `unit.grade` in place. Everything downstream (income, noise, affinity,
 * palette color) reads `itemDef(unit.kind)` / `unit.grade` at use time, so no
 * cached-def invalidation is needed beyond the structureVersion bump that
 * retints the scene.
 */

import type { EngineEvent, EngineState, PlacementResult, Unit } from '../gameTypes'
import { itemDef, UPGRADE_PATHS } from './catalog'

function err(reason: string): PlacementResult {
  return { ok: false, reason }
}

function findUnit(state: EngineState, unitId: number): Unit | undefined {
  return state.units.find((u) => u.id === unitId)
}

export function validateUpgrade(state: EngineState, unitId: number, upgradeId: string): PlacementResult {
  const unit = findUnit(state, unitId)
  if (!unit) {
    return err('No such unit')
  }
  const path = UPGRADE_PATHS.find((p) => p.id === upgradeId)
  if (!path) {
    return err('Unknown upgrade')
  }
  if (!path.appliesTo.includes(unit.kind)) {
    return err(`${path.label} does not apply to ${itemDef(unit.kind).name}`)
  }
  if (path.starRequired > state.maxStarReached) {
    return err(`${path.label} requires ${path.starRequired}★`)
  }
  if (path.toGrade !== undefined && unit.grade === path.toGrade) {
    return err('Already upgraded')
  }
  if (unit.offline) {
    return err('Repair the unit first')
  }
  if (unit.infested) {
    return err('Clear the infestation first')
  }
  return { ok: true, cost: path.cost }
}

/** Assumes validated. Footprint preserved; bumps structureVersion for the scene retint. */
export function applyUpgrade(state: EngineState, unitId: number, upgradeId: string, events: EngineEvent[]): void {
  const unit = findUnit(state, unitId)
  const path = UPGRADE_PATHS.find((p) => p.id === upgradeId)
  if (!unit || !path) {
    return
  }
  if (path.toKind !== undefined) {
    unit.kind = path.toKind
  }
  if (path.toGrade !== undefined) {
    unit.grade = path.toGrade
  }
  state.structureVersion += 1
  events.push({ type: 'upgraded', unitId, upgradeId, cost: path.cost })
}
