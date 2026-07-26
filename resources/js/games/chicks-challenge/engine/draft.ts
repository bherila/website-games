import type {
  BlockState,
  BootKind,
  CloneMachineLink,
  DeathCause,
  Direction,
  EngineEvent,
  GameState,
  KeyColor,
  MonsterKind,
  MonsterState,
  Position,
  TileKind,
} from './types'
import { positionKey, samePosition } from './types'

/** Mutable working copy used inside a single applyMove resolution. */
export interface DraftMonster {
  readonly id: number
  readonly kind: MonsterKind
  pos: Position
  facing: Direction
}

export interface DraftBlock {
  readonly id: number
  pos: Position
}

export interface Draft {
  readonly width: number
  readonly height: number
  tiles: TileKind[]
  player: { pos: Position; facing: Direction }
  alive: boolean
  won: boolean
  deathCause: DeathCause | null
  chipsRemaining: number
  keys: Record<KeyColor, number>
  boots: Record<BootKind, boolean>
  blocks: DraftBlock[]
  monsters: DraftMonster[]
  moves: number
  nextEntityId: number
  readonly teleports: readonly Position[]
  readonly cloneLinks: Readonly<Record<string, CloneMachineLink>>
  readonly hint: string | null
  events: EngineEvent[]
}

export function toDraft(state: GameState): Draft {
  return {
    width: state.width,
    height: state.height,
    tiles: [...state.tiles],
    player: { pos: state.player.pos, facing: state.player.facing },
    alive: state.alive,
    won: state.won,
    deathCause: state.deathCause,
    chipsRemaining: state.chipsRemaining,
    keys: { ...state.keys },
    boots: { ...state.boots },
    blocks: state.blocks.map((block) => ({ id: block.id, pos: block.pos })),
    monsters: state.monsters.map((monster) => ({ ...monster })),
    moves: state.moves,
    nextEntityId: state.nextEntityId,
    teleports: state.teleports,
    cloneLinks: state.cloneLinks,
    hint: state.hint,
    events: [],
  }
}

export function toState(draft: Draft): GameState {
  const blocks: readonly BlockState[] = draft.blocks.map((block) => ({ id: block.id, pos: block.pos }))
  const monsters: readonly MonsterState[] = draft.monsters.map((monster) => ({ ...monster }))

  return {
    width: draft.width,
    height: draft.height,
    tiles: draft.tiles,
    player: { pos: draft.player.pos, facing: draft.player.facing },
    alive: draft.alive,
    won: draft.won,
    deathCause: draft.deathCause,
    chipsRemaining: draft.chipsRemaining,
    keys: { ...draft.keys },
    boots: { ...draft.boots },
    blocks,
    monsters,
    moves: draft.moves,
    nextEntityId: draft.nextEntityId,
    teleports: draft.teleports,
    cloneLinks: draft.cloneLinks,
    hint: draft.hint,
  }
}

export function draftTileAt(draft: Draft, pos: Position): TileKind {
  if (pos.x < 0 || pos.y < 0 || pos.x >= draft.width || pos.y >= draft.height) {
    return 'wall'
  }

  return draft.tiles[pos.y * draft.width + pos.x] ?? 'wall'
}

export function setTileAt(draft: Draft, pos: Position, tile: TileKind): void {
  if (pos.x < 0 || pos.y < 0 || pos.x >= draft.width || pos.y >= draft.height) {
    return
  }

  draft.tiles[pos.y * draft.width + pos.x] = tile
}

export function blockAt(draft: Draft, pos: Position): DraftBlock | null {
  return draft.blocks.find((block) => samePosition(block.pos, pos)) ?? null
}

export function monsterAt(draft: Draft, pos: Position): DraftMonster | null {
  return draft.monsters.find((monster) => samePosition(monster.pos, pos)) ?? null
}

export function removeMonster(draft: Draft, id: number): void {
  draft.monsters = draft.monsters.filter((monster) => monster.id !== id)
}

export function removeBlock(draft: Draft, id: number): void {
  draft.blocks = draft.blocks.filter((block) => block.id !== id)
}

export function cloneLinkForButton(draft: Draft, buttonPos: Position): CloneMachineLink | null {
  return draft.cloneLinks[positionKey(buttonPos)] ?? null
}
