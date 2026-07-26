/**
 * Heatmaps — grid-sized noise/congestion fields for the scene overlay, plus
 * the ONE shared noise source-propagation helper (`noiseExposureAt`) that
 * occupancy eval also uses, so the heatmap and the eval formula cannot drift
 * apart. Field indexing matches grid.tileIndex: (floor − FLOOR_MIN) ×
 * GRID_WIDTH + x.
 *
 * noiseField holds raw exposure (receiver sensitivity NOT applied — the eval's
 * noisePenalty = sensitivity × exposure, capped). congestionField holds the
 * nearest serving shaft's rolling avgWaitGameMin per walkable tile (0 where no
 * segment or no serving stop), mirroring occupancy's congestionTerm nearest-
 * shaft tie-breaking (strict closer wins, earlier shaft id keeps ties).
 */

import type { EngineState, Unit } from '../gameTypes'
import { FLOOR_COUNT, FLOOR_MIN, GRID_WIDTH, TUNING } from '../gameTypes'
import { itemDef, shaftDef } from './catalog'
import { getSegments, tileIndex } from './grid'
import { findRoute } from './routing'

function spanGap(aLo: number, aHi: number, bLo: number, bHi: number): number {
  if (bLo > aHi) {
    return bLo - aHi
  }
  if (aLo > bHi) {
    return aLo - bHi
  }
  return 0
}

/**
 * Summed noise exposure from every noisy unit reaching the receiver span
 * [x0..x1] on `floor` (excluding `excludeUnitId`, so a noisy unit doesn't hear
 * itself). Sources iterate in id order — identical float-sum ordering to
 * `noiseField`, keeping eval and heatmap numerically consistent.
 */
export function noiseExposureAt(state: EngineState, floor: number, x0: number, x1: number, excludeUnitId?: number): number {
  let exposure = 0
  for (const source of state.units) {
    if (source.id === excludeUnitId) {
      continue
    }
    const noise = itemDef(source.kind).noise
    if (!noise) {
      continue
    }
    const propagation = TUNING.noise.floorPropagation[Math.abs(source.floor - floor)]
    if (propagation === undefined) {
      continue
    }
    const dist = spanGap(x0, x1, source.x, source.x + source.width - 1)
    if (dist >= noise.radiusTiles) {
      continue
    }
    exposure += noise.level * (1 - dist / noise.radiusTiles) * propagation
  }
  return exposure
}

/**
 * The unit contributing the LOUDEST share of the exposure at a receiver span
 * (ties → lowest id), or null in silence. Used by the VIP scorer to exempt a
 * venue's own ambiance: visiting a theater doesn't ding for the theater.
 */
export function dominantNoiseSourceAt(state: EngineState, floor: number, x0: number, x1: number): number | null {
  let bestId: number | null = null
  let bestLevel = 0
  for (const source of state.units) {
    const noise = itemDef(source.kind).noise
    if (!noise) {
      continue
    }
    const propagation = TUNING.noise.floorPropagation[Math.abs(source.floor - floor)]
    if (propagation === undefined) {
      continue
    }
    const dist = spanGap(x0, x1, source.x, source.x + source.width - 1)
    if (dist >= noise.radiusTiles) {
      continue
    }
    const contribution = noise.level * (1 - dist / noise.radiusTiles) * propagation
    if (contribution > bestLevel) {
      bestLevel = contribution
      bestId = source.id
    }
  }
  return bestId
}

/** Raw per-tile noise exposure across the whole grid. */
export function noiseField(state: EngineState): Float32Array {
  const field = new Float32Array(FLOOR_COUNT * GRID_WIDTH)
  const propagation = TUNING.noise.floorPropagation
  for (const source of state.units) {
    const noise = itemDef(source.kind).noise
    if (!noise) {
      continue
    }
    const srcLo = source.x
    const srcHi = source.x + source.width - 1
    for (let deltaIdx = 0; deltaIdx < propagation.length; deltaIdx++) {
      const factor = propagation[deltaIdx]!
      for (const floor of deltaIdx === 0 ? [source.floor] : [source.floor - deltaIdx, source.floor + deltaIdx]) {
        if (floor < FLOOR_MIN || floor >= FLOOR_MIN + FLOOR_COUNT) {
          continue
        }
        const xLo = Math.max(0, srcLo - noise.radiusTiles + 1)
        const xHi = Math.min(GRID_WIDTH - 1, srcHi + noise.radiusTiles - 1)
        for (let x = xLo; x <= xHi; x++) {
          const dist = spanGap(x, x, srcLo, srcHi)
          if (dist >= noise.radiusTiles) {
            continue
          }
          field[tileIndex(floor, x)]! += noise.level * (1 - dist / noise.radiusTiles) * factor
        }
      }
    }
  }
  return field
}

/** Per-tile nearest-serving-shaft wait (game-minutes); 0 off-segment or unserved. */
export function congestionField(state: EngineState): Float32Array {
  const field = new Float32Array(FLOOR_COUNT * GRID_WIDTH)
  const shafts = state.shafts
  for (const [floor, segments] of getSegments(state)) {
    for (const segment of segments) {
      const serving = shafts.filter((shaft) => {
        if (!shaft.enabledStops.includes(floor)) {
          return false
        }
        const width = shaftDef(shaft.kind).width
        return shaft.x + width - 1 >= segment.x0 && shaft.x <= segment.x1
      })
      if (serving.length === 0) {
        continue
      }
      for (let x = segment.x0; x <= segment.x1; x++) {
        let bestGap = Infinity
        let wait = 0
        for (const shaft of serving) {
          const width = shaftDef(shaft.kind).width
          const gap = spanGap(x, x, shaft.x, shaft.x + width - 1)
          if (gap < bestGap) {
            bestGap = gap
            wait = shaft.stats.avgWaitGameMin
          }
        }
        field[tileIndex(floor, x)] = wait
      }
    }
  }
  return field
}

/**
 * Catchment field for a venue (shop/restaurant/theater/amenity): 1.0 on every
 * walkable tile of a floor segment from which the venue is reachable, 0
 * elsewhere. Answers "who can actually get here". Deterministic — findRoute is
 * cached per structureVersion, so probing one representative x per segment is
 * cheap. Marks the venue's own tiles too.
 */
export function catchmentField(state: EngineState, venue: Unit): Float32Array {
  const field = new Float32Array(FLOOR_COUNT * GRID_WIDTH)
  const venueFloor = venue.floor
  const venueX = venue.x + Math.floor(venue.width / 2)
  for (const [floor, segments] of getSegments(state)) {
    if (floor < FLOOR_MIN || floor >= FLOOR_MIN + FLOOR_COUNT) {
      continue
    }
    for (const segment of segments) {
      // Read-only reachability probe — bypass the path memo so these per-segment
      // UI queries never seed paths the sim reuses (the memo key omits endpoints).
      if (findRoute(state, floor, segment.x0, venueFloor, venueX, { bypassCache: true }) === null) {
        continue
      }
      for (let x = Math.max(0, segment.x0); x <= Math.min(GRID_WIDTH - 1, segment.x1); x++) {
        field[tileIndex(floor, x)] = 1
      }
    }
  }
  return field
}
