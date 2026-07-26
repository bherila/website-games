import type { Direction, MonsterKind } from '../engine/types'

export interface CloneTemplate {
  readonly monster: MonsterKind
  readonly facing: Direction
}

export interface ChicksLevelDef {
  /** 1..40, contiguous across the shipped pack. */
  readonly id: number
  /** Short original title (never copied from any commercial release). */
  readonly title: string
  /** Equal-length rows of legend chars, fully enclosed by '#'. */
  readonly grid: readonly string[]
  /**
   * Solver-derived winning move count: MUST equal the deterministic A*
   * solver's solution length for this grid (enforced by solver.test.ts).
   */
  readonly par: number
  /**
   * Optional U/D/L/R/W input sequence for replay-based debugging fixtures.
   * Shipped levels omit it — solvability and par come from the solver.
   */
  readonly solution?: string
  /** Shown in the HUD while the player stands on a '?' tile. */
  readonly hint?: string
  /** "x,y" -> initial facing for a monster at that grid position (default: up). */
  readonly facingOverrides?: Readonly<Record<string, Direction>>
  /** "x,y" of each 'M' tile -> the monster it clones. Required per machine. */
  readonly cloneTemplates?: Readonly<Record<string, CloneTemplate>>
}

export const SOLUTION_CHAR_TO_INTENT = {
  U: 'up',
  D: 'down',
  L: 'left',
  R: 'right',
  W: 'wait',
} as const

export type SolutionChar = keyof typeof SOLUTION_CHAR_TO_INTENT
