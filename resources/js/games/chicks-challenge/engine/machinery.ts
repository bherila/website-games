import type { Draft, DraftMonster } from './draft'
import { cloneLinkForButton, draftTileAt, setTileAt } from './draft'
import type { Direction, Position } from './types'
import { MAX_MONSTERS, OPPOSITE_DIRECTION, samePosition, stepFrom } from './types'

/** Green button: flip every toggle wall on the level. */
export function flipToggleWalls(draft: Draft): void {
  for (let index = 0; index < draft.tiles.length; index++) {
    const tile = draft.tiles[index]
    if (tile === 'toggleClosed') {
      draft.tiles[index] = 'toggleOpen'
    } else if (tile === 'toggleOpen') {
      draft.tiles[index] = 'toggleClosed'
    }
  }
  draft.events.push({ type: 'toggleFlipped' })
}

/** Blue button: every tank does an about-face. */
export function reverseTanks(draft: Draft): void {
  for (const monster of draft.monsters) {
    if (monster.kind === 'tank') {
      monster.facing = OPPOSITE_DIRECTION[monster.facing]
    }
  }
  draft.events.push({ type: 'tanksReversed' })
}

/**
 * Red button: spawn the linked machine's template monster onto the launch
 * tile (adjacent to the machine in the template facing) when it is free.
 * Returns the spawned monster so the caller can run its slide chain.
 */
export function spawnClone(
  draft: Draft,
  buttonPos: Position,
  canSpawnAt: (pos: Position) => boolean,
): DraftMonster | null {
  const link = cloneLinkForButton(draft, buttonPos)
  if (!link || draft.monsters.length >= MAX_MONSTERS) {
    return null
  }

  const launch = stepFrom(link.machine, link.facing)
  if (!canSpawnAt(launch)) {
    return null
  }

  const monster: DraftMonster = {
    id: draft.nextEntityId,
    kind: link.monster,
    pos: launch,
    facing: link.facing,
  }
  draft.nextEntityId += 1
  draft.monsters.push(monster)
  draft.events.push({ type: 'cloned', monster: { ...monster } })

  return monster
}

export interface TeleportExit {
  readonly via: Position
  readonly exit: Position
}

/**
 * All teleports form one reading-order cycle; the mover exits from the next
 * teleport whose adjacent tile in the travel direction is available (the
 * entry teleport itself is the final candidate, i.e. passing straight
 * through). Exits onto another teleport are treated as blocked — chained
 * teleports are not supported.
 */
export function resolveTeleportExit(
  draft: Draft,
  entry: Position,
  dir: Direction,
  canOccupyExit: (pos: Position) => boolean,
): TeleportExit | null {
  const entryIndex = draft.teleports.findIndex((teleport) => samePosition(teleport, entry))
  if (entryIndex < 0) {
    return null
  }

  const count = draft.teleports.length
  for (let offset = 1; offset <= count; offset++) {
    const via = draft.teleports[(entryIndex + offset) % count]
    if (!via) {
      continue
    }

    const exit = stepFrom(via, dir)
    if (draftTileAt(draft, exit) === 'teleport') {
      continue
    }

    if (canOccupyExit(exit)) {
      return { via, exit }
    }
  }

  return null
}

/** Player leaves a pop-up wall tile: it rises into a permanent wall. */
export function raisePopupWall(draft: Draft, pos: Position): void {
  if (draftTileAt(draft, pos) === 'popup') {
    setTileAt(draft, pos, 'wall')
    draft.events.push({ type: 'popupRaised', at: pos })
  }
}
