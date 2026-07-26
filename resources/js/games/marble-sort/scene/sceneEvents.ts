import { type GameState, type MarbleColor } from '../gameEngine'

export interface OpenedBoxEvent {
  color: MarbleColor
  position: GameState['boxes'][number]['position']
}

export function computeOpenedBoxEvents(previous: GameState | null, next: GameState): OpenedBoxEvent[] {
  if (!previous || previous.level !== next.level || previous.seed !== next.seed || next.moves <= previous.moves) {
    return []
  }

  const nextBoxIds = new Set(next.boxes.map((box) => box.id))

  return previous.boxes
    .filter((box) => !nextBoxIds.has(box.id))
    .map((box) => ({
      color: box.color,
      position: { ...box.position },
    }))
}

export interface ChuteRefillEvent {
  boxId: string
  position: GameState['boxes'][number]['position']
}

/** Boxes that a dispenser just pushed onto the grid. */
export function computeChuteRefillEvents(previous: GameState | null, next: GameState): ChuteRefillEvent[] {
  if (!previous || previous.level !== next.level || previous.seed !== next.seed) {
    return []
  }

  const previousBoxIds = new Set(previous.boxes.map((box) => box.id))

  return next.boxes
    .filter((box) => box.source === 'chute' && !previousBoxIds.has(box.id))
    .map((box) => ({
      boxId: box.id,
      position: { ...box.position },
    }))
}
