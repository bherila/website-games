import type { Draft, DraftBlock, DraftMonster } from './draft'
import { blockAt, cloneLinkForButton, draftTileAt, monsterAt, removeBlock, removeMonster, setTileAt } from './draft'
import { flipToggleWalls, raisePopupWall, resolveTeleportExit, reverseTanks, spawnClone } from './machinery'
import type { BootKind, DeathCause, Direction, KeyColor, Position, TileKind } from './types'
import { MAX_SLIDE_CHAIN, samePosition, stepFrom } from './types'

export type Mover =
  | { readonly kind: 'player' }
  | { readonly kind: 'monster'; readonly monster: DraftMonster }
  | { readonly kind: 'block'; readonly block: DraftBlock }

export const PLAYER: Mover = { kind: 'player' }

const DOOR_COLORS: Partial<Record<TileKind, KeyColor>> = {
  doorRed: 'red',
  doorGreen: 'green',
  doorBlue: 'blue',
  doorYellow: 'yellow',
}

const KEY_COLORS: Partial<Record<TileKind, KeyColor>> = {
  keyRed: 'red',
  keyGreen: 'green',
  keyBlue: 'blue',
  keyYellow: 'yellow',
}

const BOOT_KINDS: Partial<Record<TileKind, BootKind>> = {
  flippers: 'flippers',
  fireBoots: 'fireBoots',
  skates: 'skates',
  suctionBoots: 'suctionBoots',
}

const FORCE_DIRECTIONS: Partial<Record<TileKind, Direction>> = {
  forceUp: 'up',
  forceDown: 'down',
  forceLeft: 'left',
  forceRight: 'right',
}

/**
 * Ice corners are walls on their two named edges. A slider entering through
 * an open edge is bent around the curve; directions absent from the map are
 * entries through a wall edge and are blocked.
 */
const CORNER_REDIRECTS: Partial<Record<TileKind, Partial<Record<Direction, Direction>>>> = {
  iceNW: { up: 'right', left: 'down' },
  iceNE: { up: 'left', right: 'down' },
  iceSW: { down: 'right', left: 'up' },
  iceSE: { down: 'left', right: 'up' },
}

const CORNER_EXIT_BLOCKED: Partial<Record<TileKind, readonly Direction[]>> = {
  iceNW: ['up', 'left'],
  iceNE: ['up', 'right'],
  iceSW: ['down', 'left'],
  iceSE: ['down', 'right'],
}

const MONSTER_FLOOR_TILES: readonly TileKind[] = [
  'floor',
  'hint',
  'ice',
  'forceUp',
  'forceDown',
  'forceLeft',
  'forceRight',
  'buttonGreen',
  'buttonBlue',
  'buttonRed',
  'toggleOpen',
]

const BLOCK_FLOOR_TILES: readonly TileKind[] = [...MONSTER_FLOOR_TILES, 'water']

export function moverPos(draft: Draft, mover: Mover): Position {
  switch (mover.kind) {
    case 'player':
      return draft.player.pos
    case 'monster':
      return mover.monster.pos
    case 'block':
      return mover.block.pos
  }
}

function moverActive(draft: Draft, mover: Mover): boolean {
  switch (mover.kind) {
    case 'player':
      return draft.alive && !draft.won
    case 'monster':
      return draft.monsters.some((monster) => monster.id === mover.monster.id)
    case 'block':
      return draft.blocks.some((block) => block.id === mover.block.id)
  }
}

function isCorner(tile: TileKind): boolean {
  return tile === 'iceNW' || tile === 'iceNE' || tile === 'iceSW' || tile === 'iceSE'
}

export function cornerRedirect(tile: TileKind, dir: Direction): Direction | null {
  return CORNER_REDIRECTS[tile]?.[dir] ?? null
}

function tileEnterableBy(draft: Draft, mover: Mover, tile: TileKind, dir: Direction): boolean {
  if (tile === 'wall' || tile === 'toggleClosed' || tile === 'cloneMachine') {
    return false
  }

  if (isCorner(tile)) {
    return cornerRedirect(tile, dir) !== null
  }

  switch (mover.kind) {
    case 'player': {
      if (tile === 'socket') {
        return draft.chipsRemaining === 0
      }

      const doorColor = DOOR_COLORS[tile]
      if (doorColor) {
        return draft.keys[doorColor] > 0
      }

      return true
    }
    case 'monster': {
      if (tile === 'water') {
        return mover.monster.kind === 'fireball'
      }

      return MONSTER_FLOOR_TILES.includes(tile)
    }
    case 'block':
      return BLOCK_FLOOR_TILES.includes(tile)
  }
}

interface OccupyOptions {
  readonly allowPush: boolean
  readonly allowTeleport: boolean
}

function canOccupy(draft: Draft, mover: Mover, pos: Position, dir: Direction, options: OccupyOptions): boolean {
  const tile = draftTileAt(draft, pos)

  if (tile === 'teleport') {
    if (!options.allowTeleport) {
      return false
    }

    return (
      resolveTeleportExit(draft, pos, dir, (exit) =>
        canOccupy(draft, mover, exit, dir, { allowPush: false, allowTeleport: false }),
      ) !== null
    )
  }

  if (!tileEnterableBy(draft, mover, tile, dir)) {
    return false
  }

  const block = blockAt(draft, pos)
  if (block) {
    if (mover.kind === 'player' && options.allowPush) {
      return canStep(draft, { kind: 'block', block }, dir)
    }

    return false
  }

  if (monsterAt(draft, pos)) {
    return mover.kind === 'player'
  }

  if (mover.kind !== 'player' && samePosition(pos, draft.player.pos)) {
    return mover.kind === 'monster'
  }

  return true
}

/** Pure check: can this mover take one step in dir from where it stands? */
export function canStep(draft: Draft, mover: Mover, dir: Direction): boolean {
  const from = moverPos(draft, mover)
  const fromTile = draftTileAt(draft, from)
  if (CORNER_EXIT_BLOCKED[fromTile]?.includes(dir)) {
    return false
  }

  return canOccupy(draft, mover, stepFrom(from, dir), dir, {
    allowPush: mover.kind === 'player',
    allowTeleport: true,
  })
}

/**
 * Performs one step (canStep must hold — verified internally). Handles block
 * pushes, teleport transit, leave effects (pop-up walls), and entry effects.
 */
export function attemptStep(draft: Draft, mover: Mover, dir: Direction, forced: boolean): boolean {
  if (!canStep(draft, mover, dir)) {
    return false
  }

  const from = moverPos(draft, mover)
  const target = stepFrom(from, dir)
  const targetTile = draftTileAt(draft, target)

  if (targetTile === 'teleport') {
    const resolution = resolveTeleportExit(draft, target, dir, (exit) =>
      canOccupy(draft, mover, exit, dir, { allowPush: false, allowTeleport: false }),
    )
    if (!resolution) {
      return false
    }

    relocate(draft, mover, from, target, dir, forced)
    draft.events.push({
      type: 'teleported',
      entity: mover.kind,
      id: mover.kind === 'player' ? null : mover.kind === 'monster' ? mover.monster.id : mover.block.id,
      from: target,
      to: resolution.via,
    })
    setMoverPos(mover, draft, resolution.via)
    relocate(draft, mover, resolution.via, resolution.exit, dir, true)
    applyEntryEffects(draft, mover, resolution.exit, dir)

    return true
  }

  const blockInWay = blockAt(draft, target)
  const pushedBlock = blockInWay && mover.kind === 'player' ? blockInWay : null
  if (pushedBlock) {
    attemptStep(draft, { kind: 'block', block: pushedBlock }, dir, false)
  }

  relocate(draft, mover, from, target, dir, forced)
  applyEntryEffects(draft, mover, target, dir)

  if (pushedBlock) {
    runSlideChain(draft, { kind: 'block', block: pushedBlock }, dir)
  }

  return true
}

function setMoverPos(mover: Mover, draft: Draft, pos: Position): void {
  switch (mover.kind) {
    case 'player':
      draft.player.pos = pos
      break
    case 'monster':
      mover.monster.pos = pos
      break
    case 'block':
      mover.block.pos = pos
      break
  }
}

function relocate(draft: Draft, mover: Mover, from: Position, to: Position, dir: Direction, forced: boolean): void {
  switch (mover.kind) {
    case 'player':
      raisePopupWall(draft, from)
      draft.player.pos = to
      draft.player.facing = dir
      draft.events.push({ type: 'playerMoved', from, to, forced })
      break
    case 'monster':
      mover.monster.pos = to
      mover.monster.facing = dir
      draft.events.push({ type: 'monsterMoved', id: mover.monster.id, kind: mover.monster.kind, from, to })
      break
    case 'block':
      mover.block.pos = to
      draft.events.push({ type: 'blockPushed', id: mover.block.id, from, to })
      break
  }
}

function killPlayer(draft: Draft, cause: DeathCause, at: Position): void {
  draft.alive = false
  draft.deathCause = cause
  draft.events.push({ type: 'died', cause, at })
}

function pressButton(draft: Draft, tile: TileKind, pos: Position): void {
  if (tile === 'buttonGreen') {
    flipToggleWalls(draft)

    return
  }

  if (tile === 'buttonBlue') {
    reverseTanks(draft)

    return
  }

  if (tile !== 'buttonRed') {
    return
  }

  const link = cloneLinkForButton(draft, pos)
  if (!link) {
    return
  }

  const spawned = spawnClone(draft, pos, (launch) => {
    if (samePosition(launch, draft.player.pos)) {
      return false
    }

    const probe: DraftMonster = { id: -1, kind: link.monster, pos: launch, facing: link.facing }

    return canOccupy(draft, { kind: 'monster', monster: probe }, launch, link.facing, {
      allowPush: false,
      allowTeleport: false,
    })
  })
  if (spawned) {
    const mover: Mover = { kind: 'monster', monster: spawned }
    applyEntryEffects(draft, mover, spawned.pos, spawned.facing)
    runSlideChain(draft, mover, spawned.facing)
  }
}

function applyEntryEffects(draft: Draft, mover: Mover, pos: Position, dir: Direction): void {
  const tile = draftTileAt(draft, pos)

  switch (mover.kind) {
    case 'player': {
      const monster = monsterAt(draft, pos)
      if (monster) {
        killPlayer(draft, 'monster', pos)

        return
      }

      applyPlayerTileEffects(draft, tile, pos)

      return
    }
    case 'monster': {
      if (samePosition(pos, draft.player.pos)) {
        killPlayer(draft, 'monster', pos)

        return
      }

      if (tile === 'water') {
        removeMonster(draft, mover.monster.id)
        draft.events.push({ type: 'monsterDrowned', id: mover.monster.id, at: pos })

        return
      }

      pressButton(draft, tile, pos)

      return
    }
    case 'block': {
      if (tile === 'water') {
        removeBlock(draft, mover.block.id)
        setTileAt(draft, pos, 'floor')
        draft.events.push({ type: 'splash', id: mover.block.id, at: pos })

        return
      }

      pressButton(draft, tile, pos)

      return
    }
  }
}

function applyPlayerTileEffects(draft: Draft, tile: TileKind, pos: Position): void {
  if (tile === 'chip') {
    setTileAt(draft, pos, 'floor')
    draft.chipsRemaining -= 1
    draft.events.push({ type: 'pickedUp', tile, at: pos })

    return
  }

  const keyColor = KEY_COLORS[tile]
  if (keyColor) {
    draft.keys[keyColor] += 1
    setTileAt(draft, pos, 'floor')
    draft.events.push({ type: 'pickedUp', tile, at: pos })

    return
  }

  const bootKind = BOOT_KINDS[tile]
  if (bootKind) {
    draft.boots[bootKind] = true
    setTileAt(draft, pos, 'floor')
    draft.events.push({ type: 'pickedUp', tile, at: pos })

    return
  }

  const doorColor = DOOR_COLORS[tile]
  if (doorColor) {
    if (doorColor !== 'green') {
      draft.keys[doorColor] -= 1
    }
    setTileAt(draft, pos, 'floor')
    draft.events.push({ type: 'doorOpened', color: doorColor, at: pos })

    return
  }

  switch (tile) {
    case 'socket':
      setTileAt(draft, pos, 'floor')
      draft.events.push({ type: 'socketOpened', at: pos })

      return
    case 'water':
      if (!draft.boots.flippers) {
        killPlayer(draft, 'drowned', pos)
      }

      return
    case 'fire':
      if (!draft.boots.fireBoots) {
        killPlayer(draft, 'burned', pos)
      }

      return
    case 'dirt':
      setTileAt(draft, pos, 'floor')
      draft.events.push({ type: 'dirtCleared', at: pos })

      return
    case 'thief':
      draft.boots = { flippers: false, fireBoots: false, skates: false, suctionBoots: false }
      draft.events.push({ type: 'bootsStolen', at: pos })

      return
    case 'buttonGreen':
    case 'buttonBlue':
    case 'buttonRed':
      pressButton(draft, tile, pos)

      return
    case 'exit':
      draft.won = true

      return
    default:
      return
  }
}

function forcedDirectionFor(draft: Draft, mover: Mover, tile: TileKind, dir: Direction): Direction | null {
  const playerBoots = mover.kind === 'player' ? draft.boots : null

  if (tile === 'ice') {
    return playerBoots?.skates ? null : dir
  }

  if (isCorner(tile)) {
    return playerBoots?.skates ? null : cornerRedirect(tile, dir)
  }

  const forceDir = FORCE_DIRECTIONS[tile]
  if (forceDir) {
    return playerBoots?.suctionBoots ? null : forceDir
  }

  return null
}

/**
 * Resolves forced movement (ice, corners, force floors) after a step until
 * the mover rests, is blocked, is removed, or the chain cap is hit. Blocked
 * forced steps leave the mover standing on the sliding tile.
 */
export function runSlideChain(draft: Draft, mover: Mover, initialDir: Direction): void {
  let dir = initialDir
  let guard = 0

  while (moverActive(draft, mover)) {
    const tile = draftTileAt(draft, moverPos(draft, mover))
    const forced = forcedDirectionFor(draft, mover, tile, dir)
    if (!forced) {
      return
    }

    guard += 1
    if (guard > MAX_SLIDE_CHAIN) {
      return
    }

    if (!attemptStep(draft, mover, forced, true)) {
      return
    }

    dir = forced
  }
}
