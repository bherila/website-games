import { applyMove } from '../engine/applyMove'
import type { GameState, MonsterKind, Position, TileKind } from '../engine/types'
import { samePosition } from '../engine/types'
import { LEGEND } from './legend'
import type { ChicksLevelDef } from './levelTypes'
import { SOLUTION_CHAR_TO_INTENT } from './levelTypes'
import { parseLevel } from './parseLevel'

export interface ReplayResult {
  readonly won: boolean
  readonly moves: number
  readonly state: GameState
  /** Null when the solution ran clean; otherwise a diagnostic for the author. */
  readonly failure: string | null
}

/**
 * Replays a level's authored solution through the real engine. The keystone
 * of the level pack: a clean replay proves the level is solvable and that
 * par (= solution length) is honest. Failure messages include an ASCII
 * render so level authors can iterate without a browser.
 */
export function replaySolution(def: ChicksLevelDef): ReplayResult {
  let state = parseLevel(def)
  const solution = def.solution ?? ''
  if (!solution) {
    return fail(state, 'no solution string on this definition (shipped levels are solver-verified instead)')
  }

  for (let index = 0; index < solution.length; index++) {
    const char = solution[index] ?? ''
    const intent = SOLUTION_CHAR_TO_INTENT[char as keyof typeof SOLUTION_CHAR_TO_INTENT]
    if (!intent) {
      return fail(state, `invalid solution char '${char}' at index ${index}`)
    }

    const result = applyMove(state, intent)
    if (!result.accepted) {
      return fail(
        state,
        `input ${index} ('${char}') rejected — player at ${describePos(state.player.pos)} cannot move ${intent}`,
      )
    }

    state = result.state

    if (!state.alive) {
      return fail(state, `died (${state.deathCause ?? 'unknown'}) on input ${index} ('${char}')`)
    }

    if (state.won && index < solution.length - 1) {
      return fail(state, `won early on input ${index} of ${solution.length - 1} — replay length must match exactly`)
    }
  }

  if (!state.won) {
    return fail(
      state,
      `solution exhausted without winning — player at ${describePos(state.player.pos)}, ${state.chipsRemaining} chips remaining`,
    )
  }

  return { won: true, moves: state.moves, state, failure: null }
}

function describePos(pos: Position): string {
  return `${pos.x},${pos.y}`
}

function fail(state: GameState, message: string): ReplayResult {
  return {
    won: false,
    moves: state.moves,
    state,
    failure: `${message}\n${renderStateAscii(state)}`,
  }
}

const MONSTER_CHARS: Readonly<Record<MonsterKind, string>> = {
  bug: 'A',
  ball: 'O',
  fireball: 'F',
  tank: 'T',
}

const TILE_CHARS: Readonly<Partial<Record<TileKind, string>>> = buildTileChars()

function buildTileChars(): Partial<Record<TileKind, string>> {
  const chars: Partial<Record<TileKind, string>> = {}
  for (const [char, entry] of Object.entries(LEGEND)) {
    if (entry.kind === 'tile' && chars[entry.tile] === undefined) {
      chars[entry.tile] = char
    }
  }

  return chars
}

/** Current board as legend chars with entities overlaid — for diagnostics. */
export function renderStateAscii(state: GameState): string {
  const rows: string[] = []
  for (let y = 0; y < state.height; y++) {
    let row = ''
    for (let x = 0; x < state.width; x++) {
      row += charAt(state, { x, y })
    }
    rows.push(row)
  }

  return rows.join('\n')
}

function charAt(state: GameState, pos: Position): string {
  if (samePosition(state.player.pos, pos)) {
    return '@'
  }

  const monster = state.monsters.find((candidate) => samePosition(candidate.pos, pos))
  if (monster) {
    return MONSTER_CHARS[monster.kind]
  }

  if (state.blocks.some((block) => samePosition(block.pos, pos))) {
    return 'X'
  }

  const tile = state.tiles[pos.y * state.width + pos.x] ?? 'wall'

  return TILE_CHARS[tile] ?? '#'
}
