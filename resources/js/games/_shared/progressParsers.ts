export function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function safeProgressNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function parseString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function parseInteger(value: unknown, minimum: number | null = null): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null
  }

  if (minimum !== null && value < minimum) {
    return null
  }

  return value
}

export function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseArray<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed: T[] = []
  for (const item of value) {
    const next = parser(item)
    if (next === null) {
      return null
    }
    parsed.push(next)
  }

  return parsed
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses a per-level best-star map ({ levelId: 0..3 }). Invalid entries are
 * discarded so one corrupt level does not reset otherwise valid progress.
 */
export function parseStars(value: unknown): Record<number, number> | null {
  if (!isRecord(value)) {
    return null
  }

  const stars: Record<number, number> = {}
  for (const [key, entry] of Object.entries(value)) {
    const levelId = parseInteger(Number(key), 1)
    const starCount = parseInteger(entry, 0)
    if (levelId === null || starCount === null || starCount > 3) {
      continue
    }

    stars[levelId] = starCount
  }

  return stars
}
