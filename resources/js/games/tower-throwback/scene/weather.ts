/**
 * Cosmetic weather — a PURE function of the sim clock, never `state.rng`.
 *
 * Determinism is the whole point: `weatherForDay(day)` is a stable integer hash
 * of the game day, and the precipitation animation phase derives only from
 * `(day, minute)` sim time — no `state.rng`, no `Date.now()`, no `Math.random()`.
 * A stray rng draw here would shift the deterministic engine stream and break
 * the soak gate and saves, so this module deliberately imports nothing from the
 * engine and touches no shared state. It returns plain numbers only (no THREE),
 * so the scene layer composes the tint/precipitation and this stays trivially
 * unit-testable.
 */

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'snow'
export type PrecipKind = 'none' | 'rain' | 'snow'

export interface WeatherLook {
  kind: WeatherKind
  precip: PrecipKind
  /** Hex color the daytime sky is tinted toward (composed atop day/night). */
  skyTint: number
  /** Strength of the sky-tint lerp before day/night scaling, [0, 1]. */
  skyTintStrength: number
  /** Precipitation layer opacity at full strength, [0, 1]. */
  precipOpacity: number
}

const MINUTES_PER_DAY = 1440

/** 32-bit integer avalanche hash (fmix-style), stable across engines/runs. */
function hashDay(day: number): number {
  let h = (day | 0) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h
}

/** Deterministic day → weather. Distribution: 55% clear, 25% overcast, 15% rain, 5% snow. */
export function weatherForDay(day: number): WeatherKind {
  const roll = hashDay(day) % 100
  if (roll < 55) {
    return 'clear'
  }
  if (roll < 80) {
    return 'overcast'
  }
  if (roll < 95) {
    return 'rain'
  }
  return 'snow'
}

const LOOKS: Record<WeatherKind, WeatherLook> = {
  clear: { kind: 'clear', precip: 'none', skyTint: 0x000000, skyTintStrength: 0, precipOpacity: 0 },
  overcast: { kind: 'overcast', precip: 'none', skyTint: 0x9aa7b4, skyTintStrength: 0.4, precipOpacity: 0 },
  rain: { kind: 'rain', precip: 'rain', skyTint: 0x6b7784, skyTintStrength: 0.55, precipOpacity: 0.5 },
  snow: { kind: 'snow', precip: 'snow', skyTint: 0xc2ccd6, skyTintStrength: 0.45, precipOpacity: 0.6 },
}

export function weatherLookForDay(day: number): WeatherLook {
  return LOOKS[weatherForDay(day)]
}

/** Wrap into [0, 1); keeps texture offsets bounded across a long soak. */
function fract(value: number): number {
  return value - Math.floor(value)
}

const RAIN_FALL_PER_MIN = 0.42
const RAIN_DRIFT_PER_MIN = 0.06
const SNOW_FALL_PER_MIN = 0.13
const SNOW_SWAY_RATE = 0.09
const SNOW_SWAY_AMPLITUDE = 0.12

/**
 * Precipitation scroll offset (UV units) as a pure function of sim time. Uses the
 * absolute minute so the fall is continuous across midnight; never wall-clock.
 */
export function precipScrollPhase(day: number, minuteOfDay: number, kind: PrecipKind): { x: number; y: number } {
  const absMinute = (day - 1) * MINUTES_PER_DAY + minuteOfDay
  if (kind === 'snow') {
    return {
      x: fract(Math.sin(absMinute * SNOW_SWAY_RATE) * SNOW_SWAY_AMPLITUDE),
      y: fract(absMinute * SNOW_FALL_PER_MIN),
    }
  }
  return {
    x: fract(absMinute * RAIN_DRIFT_PER_MIN),
    y: fract(absMinute * RAIN_FALL_PER_MIN),
  }
}
