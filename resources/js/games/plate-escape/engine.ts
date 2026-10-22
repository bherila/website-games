import { PLATES, type ScrewColor, SCREWS, SPARE_CAPACITY, TRAY_CAPACITY } from './level'

export interface Tray { id: 'left' | 'right', color: ScrewColor | null, count: number }
export interface PuzzleState {
  removed: string[]
  trays: Tray[]
  spare: ScrewColor[]
  queue: ScrewColor[]
  completed: ScrewColor[]
}

export function createPuzzle(): PuzzleState {
  return {
    removed: [], trays: [{ id: 'left', color: 'coral', count: 0 }, { id: 'right', color: 'mint', count: 0 }],
    spare: [], queue: ['blue'], completed: [],
  }
}

/** Returns the same state when a move cannot be accepted; never discards a screw. */
export function removeScrew(state: PuzzleState, id: string): PuzzleState {
  const screw = SCREWS.find((candidate) => candidate.id === id)
  if (!screw || state.removed.includes(id)) return state
  const next: PuzzleState = {
    removed: [...state.removed, id], trays: state.trays.map((tray) => ({ ...tray })),
    spare: [...state.spare], queue: [...state.queue], completed: [...state.completed],
  }
  const tray = next.trays.find((candidate) => candidate.color === screw.color)
  if (tray) tray.count++
  else if (next.spare.length < SPARE_CAPACITY) next.spare.push(screw.color)
  else return state

  // Completing a tray can open a color already held in spare storage. Drain it
  // immediately, including another completion, without depending on animations.
  let changed = true
  while (changed) {
    changed = false
    for (const active of next.trays) {
      if (active.color === null) continue
      if (active.count === TRAY_CAPACITY) {
        next.completed.push(active.color)
        active.color = next.queue.shift() ?? null
        active.count = 0
        changed = true
      }
      if (active.color === null) continue
      const waiting = next.spare.indexOf(active.color)
      if (waiting !== -1 && active.count < TRAY_CAPACITY) {
        next.spare.splice(waiting, 1)
        active.count++
        changed = true
      }
    }
  }
  return next
}

export function remainingScrews(state: PuzzleState, plateId: string): number {
  return SCREWS.filter((screw) => screw.plate === plateId && !state.removed.includes(screw.id)).length
}

export function freedPlates(state: PuzzleState): number {
  return PLATES.filter((plate) => remainingScrews(state, plate.id) === 0).length
}

export function hasWon(state: PuzzleState): boolean {
  return state.removed.length === SCREWS.length && state.completed.length === 3
}
