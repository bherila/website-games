/**
 * Pure engine types for Chick's Challenge. This layer has no three.js, React, or DOM
 * dependencies — see docs/games/chicks-challenge.md ("Game rules") for the normative
 * semantics each type encodes.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

/** One accepted player input = one move. 'wait' advances monsters in place. */
export type MoveIntent = Direction | 'wait'

export type KeyColor = 'red' | 'green' | 'blue' | 'yellow'

export type BootKind = 'flippers' | 'fireBoots' | 'skates' | 'suctionBoots'

export type MonsterKind = 'bug' | 'ball' | 'fireball' | 'tank'

export type DeathCause = 'drowned' | 'burned' | 'monster'

/**
 * Static tile layer kinds. Items (chips/keys/boots) are tiles that become
 * floor when picked up; blocks and monsters are entities layered on top.
 *
 * Ice corners are named by the corner their two walls occupy: iceNW has walls
 * on its north and west edges, redirects a slider entering upward to the
 * right and a slider entering leftward to downward, and blocks entry through
 * its wall edges. Force floors push in their named direction.
 */
export type TileKind =
  | 'floor'
  | 'wall'
  | 'exit'
  | 'socket'
  | 'chip'
  | 'keyRed'
  | 'keyGreen'
  | 'keyBlue'
  | 'keyYellow'
  | 'doorRed'
  | 'doorGreen'
  | 'doorBlue'
  | 'doorYellow'
  | 'water'
  | 'fire'
  | 'dirt'
  | 'flippers'
  | 'fireBoots'
  | 'skates'
  | 'suctionBoots'
  | 'ice'
  | 'iceNW'
  | 'iceNE'
  | 'iceSW'
  | 'iceSE'
  | 'forceUp'
  | 'forceDown'
  | 'forceLeft'
  | 'forceRight'
  | 'hint'
  | 'popup'
  | 'toggleClosed'
  | 'toggleOpen'
  | 'buttonGreen'
  | 'buttonBlue'
  | 'buttonRed'
  | 'cloneMachine'
  | 'teleport'
  | 'thief'

export interface Position {
  readonly x: number
  readonly y: number
}

export interface PlayerState {
  readonly pos: Position
  readonly facing: Direction
}

export interface MonsterState {
  readonly id: number
  readonly kind: MonsterKind
  readonly pos: Position
  readonly facing: Direction
}

export interface BlockState {
  readonly id: number
  readonly pos: Position
}

export interface CloneMachineLink {
  readonly machine: Position
  readonly monster: MonsterKind
  readonly facing: Direction
}

export interface GameState {
  readonly width: number
  readonly height: number
  /** Row-major tile layer; index = y * width + x. */
  readonly tiles: readonly TileKind[]
  readonly player: PlayerState
  readonly alive: boolean
  readonly won: boolean
  readonly deathCause: DeathCause | null
  readonly chipsRemaining: number
  readonly keys: Readonly<Record<KeyColor, number>>
  readonly boots: Readonly<Record<BootKind, boolean>>
  readonly blocks: readonly BlockState[]
  /** Spawn (reading) order — monsters step in this order every move. */
  readonly monsters: readonly MonsterState[]
  /** Accepted inputs so far (directions + waits). */
  readonly moves: number
  readonly nextEntityId: number
  /** Teleport positions in reading order; exit = next in the cycle. */
  readonly teleports: readonly Position[]
  /** Red-button position key "x,y" -> linked clone machine. */
  readonly cloneLinks: Readonly<Record<string, CloneMachineLink>>
  readonly hint: string | null
}

export type EngineEvent =
  | { readonly type: 'playerMoved'; readonly from: Position; readonly to: Position; readonly forced: boolean }
  | { readonly type: 'bumped'; readonly at: Position; readonly dir: Direction }
  | { readonly type: 'waited' }
  | { readonly type: 'pickedUp'; readonly tile: TileKind; readonly at: Position }
  | { readonly type: 'doorOpened'; readonly color: KeyColor; readonly at: Position }
  | { readonly type: 'socketOpened'; readonly at: Position }
  | { readonly type: 'blockPushed'; readonly id: number; readonly from: Position; readonly to: Position }
  | { readonly type: 'splash'; readonly id: number; readonly at: Position }
  | { readonly type: 'dirtCleared'; readonly at: Position }
  | { readonly type: 'popupRaised'; readonly at: Position }
  | { readonly type: 'toggleFlipped' }
  | { readonly type: 'tanksReversed' }
  | { readonly type: 'cloned'; readonly monster: MonsterState }
  | { readonly type: 'teleported'; readonly entity: 'player' | 'block' | 'monster'; readonly id: number | null; readonly from: Position; readonly to: Position }
  | { readonly type: 'bootsStolen'; readonly at: Position }
  | { readonly type: 'monsterMoved'; readonly id: number; readonly kind: MonsterKind; readonly from: Position; readonly to: Position }
  | { readonly type: 'monsterDrowned'; readonly id: number; readonly at: Position }
  | { readonly type: 'died'; readonly cause: DeathCause; readonly at: Position }
  | { readonly type: 'won'; readonly moves: number }

export interface MoveResult {
  readonly state: GameState
  readonly events: readonly EngineEvent[]
  /** False = rejected input: nothing moved, no move counted, no monster step. */
  readonly accepted: boolean
}

/** Forced-move chains beyond this are a level design error (tested). */
export const MAX_SLIDE_CHAIN = 256

/** Live monster cap — clone presses beyond it silently no-op. */
export const MAX_MONSTERS = 32

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

export const DIRECTION_DELTAS: Readonly<Record<Direction, Position>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export function positionKey(pos: Position): string {
  return `${pos.x},${pos.y}`
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

export function stepFrom(pos: Position, dir: Direction): Position {
  const delta = DIRECTION_DELTAS[dir]

  return { x: pos.x + delta.x, y: pos.y + delta.y }
}

export function tileAt(state: GameState, pos: Position): TileKind {
  if (pos.x < 0 || pos.y < 0 || pos.x >= state.width || pos.y >= state.height) {
    return 'wall'
  }

  return state.tiles[pos.y * state.width + pos.x] ?? 'wall'
}
