import type {
  BlockState,
  CloneMachineLink,
  Direction,
  GameState,
  MonsterState,
  Position,
  TileKind,
} from '../engine/types'
import { positionKey } from '../engine/types'
import { LEGEND } from './legend'
import type { ChicksLevelDef } from './levelTypes'

/**
 * Converts a level definition into the engine's initial GameState. Throws on
 * malformed definitions (ragged rows, unknown chars, missing/duplicate '@',
 * machines without clone templates, red buttons without machines) — shipped
 * levels are proven parseable by the level tests, never at runtime.
 */
export function parseLevel(def: ChicksLevelDef): GameState {
  const height = def.grid.length
  const width = def.grid[0]?.length ?? 0
  if (height < 3 || width < 3) {
    throw new Error(`Level ${def.id}: grid must be at least 3x3`)
  }

  const tiles: TileKind[] = []
  const blocks: BlockState[] = []
  const monsters: MonsterState[] = []
  const teleports: Position[] = []
  const machines: Position[] = []
  const redButtons: Position[] = []
  let playerStart: Position | null = null
  let chipsRemaining = 0
  let nextEntityId = 1

  for (let y = 0; y < height; y++) {
    const row = def.grid[y] ?? ''
    if (row.length !== width) {
      throw new Error(`Level ${def.id}: row ${y} has length ${row.length}, expected ${width}`)
    }

    for (let x = 0; x < width; x++) {
      const char = row[x] ?? ''
      const entry = LEGEND[char]
      if (!entry) {
        throw new Error(`Level ${def.id}: unknown char '${char}' at ${x},${y}`)
      }

      const pos: Position = { x, y }
      switch (entry.kind) {
        case 'tile': {
          tiles.push(entry.tile)
          if (entry.tile === 'chip') {
            chipsRemaining += 1
          } else if (entry.tile === 'teleport') {
            teleports.push(pos)
          } else if (entry.tile === 'cloneMachine') {
            machines.push(pos)
          } else if (entry.tile === 'buttonRed') {
            redButtons.push(pos)
          }
          break
        }
        case 'playerStart': {
          if (playerStart) {
            throw new Error(`Level ${def.id}: multiple player starts`)
          }
          playerStart = pos
          tiles.push('floor')
          break
        }
        case 'block': {
          blocks.push({ id: nextEntityId, pos })
          nextEntityId += 1
          tiles.push('floor')
          break
        }
        case 'monster': {
          const facing: Direction = def.facingOverrides?.[positionKey(pos)] ?? 'up'
          monsters.push({ id: nextEntityId, kind: entry.monster, pos, facing })
          nextEntityId += 1
          tiles.push('floor')
          break
        }
      }
    }
  }

  if (!playerStart) {
    throw new Error(`Level ${def.id}: no player start ('@')`)
  }

  return {
    width,
    height,
    tiles,
    player: { pos: playerStart, facing: 'down' },
    alive: true,
    won: false,
    deathCause: null,
    chipsRemaining,
    keys: { red: 0, green: 0, blue: 0, yellow: 0 },
    boots: { flippers: false, fireBoots: false, skates: false, suctionBoots: false },
    blocks,
    monsters,
    moves: 0,
    nextEntityId,
    teleports,
    cloneLinks: buildCloneLinks(def, machines, redButtons),
    hint: def.hint ?? null,
  }
}

/** Each red button links to its nearest machine (Manhattan; ties by reading order). */
function buildCloneLinks(
  def: ChicksLevelDef,
  machines: readonly Position[],
  redButtons: readonly Position[],
): Record<string, CloneMachineLink> {
  const links: Record<string, CloneMachineLink> = {}

  for (const machine of machines) {
    if (!def.cloneTemplates?.[positionKey(machine)]) {
      throw new Error(`Level ${def.id}: clone machine at ${positionKey(machine)} has no cloneTemplates entry`)
    }
  }

  for (const button of redButtons) {
    let best: Position | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const machine of machines) {
      const distance = Math.abs(machine.x - button.x) + Math.abs(machine.y - button.y)
      if (distance < bestDistance) {
        best = machine
        bestDistance = distance
      }
    }

    if (!best) {
      throw new Error(`Level ${def.id}: red button at ${positionKey(button)} has no clone machine`)
    }

    const template = def.cloneTemplates?.[positionKey(best)]
    if (!template) {
      throw new Error(`Level ${def.id}: clone machine at ${positionKey(best)} has no cloneTemplates entry`)
    }

    links[positionKey(button)] = { machine: best, monster: template.monster, facing: template.facing }
  }

  return links
}
