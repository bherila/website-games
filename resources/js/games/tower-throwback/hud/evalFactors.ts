/**
 * Presentation helper: turn the engine's EvalBreakdown into a labeled, signed
 * factor list for the inspect panel. Only non-zero terms are shown, which
 * naturally filters to what's relevant per unit kind (e.g. parking only affects
 * offices, view/glass only glass-backed units), so no per-kind config is needed.
 */

import type { EvalBreakdown } from '../engine/occupancy'

export interface EvalFactorLine {
  key: string
  label: string
  /** Signed contribution to the score: positive = bonus, negative = penalty. */
  value: number
}

// Penalties are stored as positive magnitudes and subtracted, so they carry sign -1.
const FACTORS: Array<{ key: keyof EvalBreakdown; label: string; sign: 1 | -1 }> = [
  { key: 'amenityBonus', label: 'Nearby amenities', sign: 1 },
  { key: 'landmarkBonus', label: 'Nearby landmark', sign: 1 },
  { key: 'fallsViewBonus', label: 'Falls view', sign: 1 },
  { key: 'affinityBonus', label: 'Good neighbors', sign: 1 },
  { key: 'superLobbyBonus', label: 'Grand lobby', sign: 1 },
  { key: 'glassBonus', label: 'View / natural light', sign: 1 },
  { key: 'liveWorkBonus', label: 'Jobs in the tower', sign: 1 },
  { key: 'requestBonus', label: 'Fulfilled request', sign: 1 },
  { key: 'noisePenalty', label: 'Noise', sign: -1 },
  { key: 'congestionPenalty', label: 'Elevator congestion (peak today)', sign: -1 },
  { key: 'restroomComfortPenalty', label: 'No restroom on the floor', sign: -1 },
  { key: 'trashPenalty', label: 'Trash nearby', sign: -1 },
  { key: 'dirtyPenalty', label: 'Dirty', sign: -1 },
  { key: 'incidentPenalty', label: 'Incident damage', sign: -1 },
  { key: 'parkingPenalty', label: 'Parking shortfall', sign: -1 },
  { key: 'infestationPenalty', label: 'Infestation nearby', sign: -1 },
]

export function evalFactorLines(breakdown: EvalBreakdown): EvalFactorLine[] {
  const lines: EvalFactorLine[] = []
  for (const factor of FACTORS) {
    const magnitude = Math.round(breakdown[factor.key])
    if (magnitude === 0) {
      continue
    }
    lines.push({ key: factor.key, label: factor.label, value: factor.sign * magnitude })
  }
  return lines
}
