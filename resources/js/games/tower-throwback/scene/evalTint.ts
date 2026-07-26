import * as THREE from 'three'

import { itemDef } from '../engine/catalog'
import type { Unit } from '../gameTypes'
import type { DiagnosticPaletteMode } from '../presentationPrefs'
import { diagnosticRamp } from './diagnosticPalette'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

const lowColor = new THREE.Color()
const highColor = new THREE.Color()
const colorScratch = new THREE.Color()

/**
 * null = unit not tinted (no income model: slabs, transit, restrooms, support rooms).
 *
 * Desirability runs the shared ramp in reverse — a HIGH score is the good end —
 * so a vacant unit takes the ramp's `high` (worst) stop and a thriving one takes
 * `low`. Colours come from `diagnosticPalette.ts` so this cannot drift from the
 * heatmap meshes or the HUD legend.
 */
export function evalTint(
  unit: Pick<Unit, 'kind' | 'occupied' | 'evalScore'>,
  mode: DiagnosticPaletteMode = 'classic',
): number | null {
  if (itemDef(unit.kind).income === undefined) {
    return null
  }
  const ramp = diagnosticRamp(mode)
  if (!unit.occupied) {
    return ramp.high
  }
  lowColor.setHex(ramp.mid, THREE.LinearSRGBColorSpace)
  highColor.setHex(ramp.low, THREE.LinearSRGBColorSpace)

  return colorScratch.copy(lowColor).lerp(highColor, clamp01((unit.evalScore - 35) / 50)).getHex(THREE.LinearSRGBColorSpace)
}
