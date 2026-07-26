export type Rng = () => number

/**
 * mulberry32 — tiny seedable PRNG so level generation is deterministic across
 * runs and under test. Returns floats in [0, 1).
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function pickWeighted<T>(rng: Rng, entries: ReadonlyArray<{ value: T; weight: number }>): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = rng() * total
  let picked: T | undefined
  for (const entry of entries) {
    picked = entry.value
    roll -= entry.weight
    if (roll <= 0) {
      break
    }
  }
  if (picked === undefined) {
    throw new Error('pickWeighted: entries must be non-empty')
  }
  return picked
}
