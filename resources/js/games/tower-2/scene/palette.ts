/**
 * Neo-90s and more vibrant than Tower Throwback: cream plate on a deep indigo
 * lot, one saturated hue per use (see engine/uses.ts), mint corridors and
 * charcoal cores with a signal-yellow band. Overlays keep their own ramps.
 */
export const PALETTE = {
  lot: 0x2e2768,
  lotGrid: 0x120e33,
  plate: 0xf4eee4,
  corridor: 0x5fe3cf,
  /** Plate with no plate beneath it: a cantilever, which costs more to build. */
  overhang: 0xffbcd2,
  core: 0x2d2a4a,
  coreBand: 0xffd23f,
  glass: 0x7fe9ff,
  /** Curtain-wall frames between glass panes. */
  mullion: 0x241c5c,
  door: 0xfff6d8,
  /** Basement retaining walls, where glass would be above ground. */
  retaining: 0x4a4370,
  /** The lobby entrance's canopy. */
  canopy: 0xffd23f,
  valid: 0x4ade80,
  invalid: 0xff4d6d,
  select: 0xffffff,
} as const

/** Daylight: bright sun-yellow at the glass to dusk-blue deep in the plan. */
export const LIGHT_RAMP = [0x1f3b8a, 0x3a5fc8, 0x6f8ff0, 0xb7c46a, 0xffd84d, 0xfff3a0] as const

/** Walk to a core: near is green, far is red; unreachable is grey. */
export const WALK_RAMP = [0x22c55e, 0x84cc16, 0xeab308, 0xf97316, 0xef4444] as const
export const WALK_NONE = 0x6b6b80

export function rampColor(ramp: readonly number[], t: number): number {
  const index = Math.round(Math.min(1, Math.max(0, t)) * (ramp.length - 1))
  return ramp[index]!
}
