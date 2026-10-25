import { getLevel, type Screw, type ScrewColor, TRAY_CAPACITY } from './level'

export interface Tray { id: 'left' | 'right', color: ScrewColor | null, count: number }
/** Why a head cannot be unscrewed yet: a cover in front of it, or a part resting on its plate. */
export interface ScrewLock { kind: 'cover' | 'bearing', plate: string }
export interface PuzzleState {
  level: number
  overflow: ScrewColor | null
  removed: string[]
  trays: Tray[]
  spare: ScrewColor[]
  queue: ScrewColor[]
  completed: ScrewColor[]
}

export function createPuzzle(levelId = 1): PuzzleState {
  const level = getLevel(levelId)
  return {
    level: levelId, overflow: null,
    removed: [], trays: [{ id: 'left', color: level.trayColors[0]!, count: 0 }, { id: 'right', color: level.trayColors[1]!, count: 0 }],
    spare: [], queue: level.trayColors.slice(2), completed: [],
  }
}

/** Overflow is an undoable move; the unsorted screw is retained in the loss state. */
export function removeScrew(state: PuzzleState, id: string): PuzzleState {
  if (state.overflow !== null || hasWon(state)) return state
  const level = getLevel(state.level)
  const screw = level.screws.find((candidate) => candidate.id === id)
  if (!screw || state.removed.includes(id) || screwLock(state, screw)) return state
  const next: PuzzleState = {
    ...state, removed: [...state.removed, id], trays: state.trays.map((tray) => ({ ...tray })),
    spare: [...state.spare], queue: [...state.queue], completed: [...state.completed],
  }
  const tray = next.trays.find((candidate) => candidate.color === screw.color)
  if (tray) tray.count++
  else if (next.spare.length < level.spareCapacity) next.spare.push(screw.color)
  else if (level.overflowLoses) {
    next.overflow = screw.color
    return next
  } else return state

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
  return getLevel(state.level).screws.filter((screw) => screw.plate === plateId && !state.removed.includes(screw.id)).length
}

export function freedPlates(state: PuzzleState): number {
  return getLevel(state.level).plates.filter((plate) => remainingScrews(state, plate.id) === 0).length
}

export function hasWon(state: PuzzleState): boolean {
  const level = getLevel(state.level)
  return state.overflow === null && state.removed.length === level.screws.length && state.completed.length === level.trayColors.length
}


/**
 * Covers block axial access even when a head can be glimpsed from an oblique
 * angle. A plate's last screw also stays put while a part still rests on it,
 * so a roof can never be left hanging over released walls.
 */
export function screwLock(state: PuzzleState, screw: Screw): ScrewLock | null {
  if (state.removed.includes(screw.id)) return null
  const cover = (screw.blockedBy ?? []).find((id) => remainingScrews(state, id) > 0)
  if (cover) return { kind: 'cover', plate: cover }
  return remainingScrews(state, screw.plate) === 1 ? bearingLock(state, screw.plate) : null
}

/** The first attached part that rests on this plate, if any. */
export function bearingLock(state: PuzzleState, plateId: string): ScrewLock | null {
  const load = getLevel(state.level).plates.find((plate) => plate.restsOn?.includes(plateId) && remainingScrews(state, plate.id) > 0)
  return load ? { kind: 'bearing', plate: load.id } : null
}
