/**
 * mulberry32 (same generator as math-horde's `rng.ts`) exposed as a pure step
 * function instead of a closure: the seed travels inside the saved run, so a
 * restored game keeps spawning exactly as it would have before the reload, and
 * engine tests stay reproducible.
 */
export interface RandomDraw {
  seed: number
  value: number
}

export function nextRandom(seed: number): RandomDraw {
  const a = (seed + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return { seed: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** Draws an integer in `[0, maxExclusive)`. */
export function randomInt(seed: number, maxExclusive: number): { seed: number, value: number } {
  const draw = nextRandom(seed)

  return { seed: draw.seed, value: Math.min(maxExclusive - 1, Math.floor(draw.value * maxExclusive)) }
}

/** Seed for a fresh run. Uses `crypto` when available so two tabs don't share a run. */
export function createRunSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)

    return (bytes[0] ?? 1) >>> 0
  }

  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
