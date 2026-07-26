import { positionKey } from '../engine/types'
import { LEGEND } from './legend'
import type { ChicksLevelDef } from './levelTypes'
import { SOLUTION_CHAR_TO_INTENT } from './levelTypes'

/** Levels that open a phase — the only ones allowed (and required) to carry a hint. */
export const PHASE_OPENER_IDS: readonly number[] = [1, 6, 11, 16, 21, 26, 31, 36]

export const MAX_GRID_SIZE = 32

/**
 * Difficulty-curve floor: the earliest level id each mechanic may appear on,
 * mirroring the phase table in docs/games/chicks-challenge.md.
 */
const MECHANIC_MIN_ID: readonly { chars: string; minId: number; label: string }[] = [
  { chars: 'X%', minId: 6, label: 'blocks/dirt (phase 2)' },
  { chars: 'fi', minId: 11, label: 'flippers/fire boots (phase 3)' },
  { chars: 'Z', minId: 14, label: 'thief (level 14+)' },
  { chars: '57913k', minId: 16, label: 'ice/skates (phase 4)' },
  { chars: '2468u', minId: 21, label: 'force floors/suction (phase 5)' },
  { chars: 'AOFT=', minId: 26, label: 'monsters/blue button (phase 6)' },
  { chars: '[]()M+,', minId: 31, label: 'machinery (phase 7)' },
]

/** Static (non-replay) checks for a single level definition. Empty = valid. */
export function validateLevelDef(def: ChicksLevelDef): string[] {
  const errors: string[] = []
  const height = def.grid.length
  const width = def.grid[0]?.length ?? 0

  if (height < 3 || width < 3) {
    errors.push('grid smaller than 3x3')
  }
  if (height > MAX_GRID_SIZE || width > MAX_GRID_SIZE) {
    errors.push(`grid exceeds ${MAX_GRID_SIZE}x${MAX_GRID_SIZE}`)
  }

  let playerStarts = 0
  let exits = 0
  let chips = 0
  let sockets = 0
  let teleports = 0
  let hintTiles = 0
  const keyCounts: Record<string, number> = { r: 0, g: 0, b: 0, y: 0 }
  const doorCounts: Record<string, number> = { R: 0, G: 0, B: 0, Y: 0 }
  const machines: string[] = []
  const redButtons: string[] = []
  const monsterPositions = new Set<string>()

  for (let y = 0; y < height; y++) {
    const row = def.grid[y] ?? ''
    if (row.length !== width) {
      errors.push(`row ${y} has length ${row.length}, expected ${width}`)
      continue
    }

    for (let x = 0; x < width; x++) {
      const char = row[x] ?? ''
      const entry = LEGEND[char]
      if (!entry) {
        errors.push(`unknown char '${char}' at ${x},${y}`)
        continue
      }

      const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (onBorder && char !== '#') {
        errors.push(`border not walled at ${x},${y} ('${char}')`)
      }

      if (char === '@') playerStarts += 1
      if (char === 'E') exits += 1
      if (char === 'c') chips += 1
      if (char === 'S') sockets += 1
      if (char === '+') teleports += 1
      if (char === '?') hintTiles += 1
      if (char in keyCounts) keyCounts[char] = (keyCounts[char] ?? 0) + 1
      if (char in doorCounts) doorCounts[char] = (doorCounts[char] ?? 0) + 1
      if (char === 'M') machines.push(positionKey({ x, y }))
      if (char === ')') redButtons.push(positionKey({ x, y }))
      if (entry.kind === 'monster') monsterPositions.add(positionKey({ x, y }))

      for (const rule of MECHANIC_MIN_ID) {
        if (rule.chars.includes(char) && def.id < rule.minId) {
          errors.push(`'${char}' (${rule.label}) not allowed before level ${rule.minId}`)
        }
      }
    }
  }

  if (playerStarts !== 1) {
    errors.push(`expected exactly one '@', found ${playerStarts}`)
  }
  if (exits < 1) {
    errors.push('no exit')
  }
  if ((sockets > 0) !== (chips > 0)) {
    errors.push(`socket/chips mismatch: ${sockets} sockets, ${chips} chips`)
  }

  for (const [key, door] of [['r', 'R'], ['b', 'B'], ['y', 'Y']] as const) {
    if ((keyCounts[key] ?? 0) < (doorCounts[door] ?? 0)) {
      errors.push(`${door} doors (${doorCounts[door]}) exceed consumable ${key} keys (${keyCounts[key]})`)
    }
  }
  if ((doorCounts.G ?? 0) > 0 && (keyCounts.g ?? 0) < 1) {
    errors.push('green doors present but no green key')
  }

  if (teleports === 1) {
    errors.push('teleport groups need at least 2 members')
  }

  for (const machine of machines) {
    if (!def.cloneTemplates?.[machine]) {
      errors.push(`clone machine at ${machine} has no cloneTemplates entry`)
    }
  }
  for (const key of Object.keys(def.cloneTemplates ?? {})) {
    if (!machines.includes(key)) {
      errors.push(`cloneTemplates entry ${key} has no machine on the grid`)
    }
  }
  if (redButtons.length > 0 && machines.length === 0) {
    errors.push('red button without a clone machine')
  }

  for (const key of Object.keys(def.facingOverrides ?? {})) {
    if (!monsterPositions.has(key)) {
      errors.push(`facingOverrides entry ${key} does not address a monster`)
    }
  }

  const isOpener = PHASE_OPENER_IDS.includes(def.id)
  if (isOpener && hintTiles === 0) {
    errors.push('phase opener must carry a hint tile')
  }
  if (!isOpener && hintTiles > 0) {
    errors.push('hint tiles are only allowed on phase openers')
  }
  if (hintTiles > 0 && !def.hint) {
    errors.push('hint tile present but def.hint missing')
  }

  if (!Number.isInteger(def.par) || def.par < 1) {
    errors.push(`par (${def.par}) must be a positive integer`)
  }
  for (const char of def.solution ?? '') {
    if (!(char in SOLUTION_CHAR_TO_INTENT)) {
      errors.push(`invalid solution char '${char}'`)
      break
    }
  }

  return errors
}
