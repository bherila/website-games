/**
 * Shareable challenge codes.
 *
 * A code is a human-typeable encoding of the two inputs that fully determine a
 * new tower's starting conditions: the uint32 rng seed and the permanent lobby
 * height. Both are already persisted in the save (`SavedSandbox.seed` /
 * `.lobbyHeight`) — this module only makes them enterable and shareable, so
 * nothing here touches the wire contract.
 *
 * DETERMINISM: choosing a seed selects a different point in the SAME rng stream.
 * It must never add, remove, or reorder draws — `createEngineState` already
 * takes the seed as a parameter, so no engine change is involved.
 *
 * Layout (10 base36 chars, displayed grouped): SSSSSSS L M C
 *   S = seed, base36, zero-padded to 7 (uint32 max is "1z141z3")
 *   L = lobby height, 1–3
 *   M = map, via `MapDefinition.codeKey` (stable, never reused)
 *   C = checksum over the preceding 9 chars, so a mistyped code is rejected
 *       rather than silently starting a *different* tower — the failure mode
 *       that makes a challenge code worthless.
 *
 * BACK-COMPAT: codes minted before maps existed are 9 chars with no map field.
 * They still decode, to the original city map — a code someone shared must keep
 * working forever, so the parser accepts both widths rather than invalidating
 * every code already in the wild.
 */

import { CITY_TOWER, getMap, mapByCodeKey } from './engine/maps'

const RADIX = 36
const SEED_CHARS = 7
const MAX_SEED = 0xffff_ffff

export interface ChallengeInput {
  seed: number
  lobbyHeight: 1 | 2 | 3
  mapId: string
}

/** Width of a pre-map code, retained so old shared codes keep resolving. */
const LEGACY_LENGTH = SEED_CHARS + 2
const CODE_LENGTH = SEED_CHARS + 3

function checksumChar(body: string): string {
  let sum = 0
  for (const char of body) {
    sum += Number.parseInt(char, RADIX)
  }
  return (sum % RADIX).toString(RADIX)
}

/** Canonical 10-character code (unformatted, lowercase-insensitive on input). */
export function encodeChallengeCode({ seed, lobbyHeight, mapId }: ChallengeInput): string {
  const normalizedSeed = (seed >>> 0).toString(RADIX).padStart(SEED_CHARS, '0')
  const body = `${normalizedSeed}${lobbyHeight}${getMap(mapId).codeKey}`

  return `${body}${checksumChar(body)}`.toUpperCase()
}

/** Display form: `1Z141Z3-20A` — grouping only, never re-parsed verbatim. */
export function formatChallengeCode(code: string): string {
  const normalized = normalizeChallengeCode(code)
  if (normalized.length !== CODE_LENGTH && normalized.length !== LEGACY_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, SEED_CHARS)}-${normalized.slice(SEED_CHARS)}`
}

/** Strip grouping/whitespace and case so players can paste any presentation of a code. */
export function normalizeChallengeCode(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, '').toUpperCase()
}

/**
 * Parse a code back to its inputs, or null if it is malformed, mistyped
 * (checksum mismatch), out of range, or names an impossible lobby height.
 */
export function decodeChallengeCode(raw: string): ChallengeInput | null {
  const code = normalizeChallengeCode(raw).toLowerCase()
  const legacy = code.length === LEGACY_LENGTH
  if (code.length !== CODE_LENGTH && !legacy) {
    return null
  }
  if (!/^[0-9a-z]+$/.test(code)) {
    return null
  }

  const body = code.slice(0, code.length - 1)
  if (checksumChar(body) !== code[code.length - 1]) {
    return null
  }

  const seed = Number.parseInt(code.slice(0, SEED_CHARS), RADIX)
  const lobbyHeight = Number.parseInt(code[SEED_CHARS] ?? '', RADIX)
  if (!Number.isFinite(seed) || seed < 0 || seed > MAX_SEED) {
    return null
  }
  if (lobbyHeight !== 1 && lobbyHeight !== 2 && lobbyHeight !== 3) {
    return null
  }

  // Pre-map codes predate the map field entirely; they can only mean the
  // original city map, which is what they were minted against.
  const map = legacy ? CITY_TOWER : mapByCodeKey(code[SEED_CHARS + 1] ?? '')
  if (!map) {
    return null
  }

  return { seed, lobbyHeight, mapId: map.id }
}

/** The seed used when the player does not supply a code. */
export function randomSeed(now: number = Date.now()): number {
  return now >>> 0
}
