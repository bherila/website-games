/**
 * THE single source for every diagnostic colour ramp — noise, congestion, eval,
 * and catchment — in both the WebGL layers and the HTML legends.
 *
 * The legends previously hard-coded their own CSS gradients while the meshes
 * read `palette.heat*`, so the two could drift silently. Everything now derives
 * from `DIAGNOSTIC_RAMPS`: `rampHex()` feeds `THREE.Color.setHex`, `cssRamp()`
 * builds the legend gradient from the same three stops.
 *
 * `colorSafe` replaces the red/yellow/green ramp — indistinguishable to the
 * ~8% of men with red-green colour vision deficiency — with a blue → yellow →
 * vermillion ramp drawn from the Okabe-Ito palette. Its endpoints separate on
 * BOTH the hue axis that CVD preserves (blue vs orange) and on luminance, so
 * the ramp survives greyscale printing and simulation alike.
 */
import type { DiagnosticPaletteMode } from '../presentationPrefs'

export interface DiagnosticRamp {
  /** Ramp stops, low → high value. */
  low: number
  mid: number
  high: number
  /** Selection-driven venue reachability highlight; never part of the ramp. */
  catchment: number
}

export const DIAGNOSTIC_RAMPS: Record<DiagnosticPaletteMode, DiagnosticRamp> = {
  classic: {
    low: 0x3fae52,
    mid: 0xe0c030,
    high: 0xd83a2a,
    catchment: 0x38bdf8,
  },
  colorSafe: {
    // Okabe-Ito sky blue → yellow → vermillion.
    low: 0x56b4e9,
    mid: 0xf0e442,
    high: 0xd55e00,
    // Reddish purple: the only Okabe-Ito hue that stays distinct from all three
    // ramp stops when the catchment highlight overlaps the heatmap layer.
    catchment: 0xcc79a7,
  },
}

export function diagnosticRamp(mode: DiagnosticPaletteMode): DiagnosticRamp {
  return DIAGNOSTIC_RAMPS[mode]
}

function cssHex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * Legend gradient for a ramp. `reversed` is used by the desirability legend,
 * where a HIGH score is the good end — the colours are identical to the mesh
 * ramp, only the direction differs.
 */
export function cssRamp(mode: DiagnosticPaletteMode, reversed = false): string {
  const ramp = diagnosticRamp(mode)
  const stops = reversed ? [ramp.high, ramp.mid, ramp.low] : [ramp.low, ramp.mid, ramp.high]

  return `linear-gradient(90deg, ${stops.map(cssHex).join(', ')})`
}

/** Relative luminance (WCAG 2.x) of a packed sRGB hex — used by the contrast guardrail test. */
export function relativeLuminance(hex: number): number {
  const channel = (raw: number): number => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const r = channel((hex >> 16) & 0xff)
  const g = channel((hex >> 8) & 0xff)
  const b = channel(hex & 0xff)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
