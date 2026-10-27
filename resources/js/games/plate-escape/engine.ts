import { getLevel, heldPlates, type Plate, type Screw, type ScrewColor, TRAY_CAPACITY } from './level'

export interface Tray { id: 'left' | 'right', color: ScrewColor | null, count: number }
/**
 * Why a head cannot be unscrewed yet: a dial with no window over it, a cover in
 * front of it, or a part resting on a plate (`support`) whose last screw it is.
 */
export interface ScrewLock { kind: 'dial' | 'cover' | 'bearing', plate: string, support?: string }
/** Why a dial will not turn: a stop pin still in, or a head showing in its window. */
export interface DialLock { kind: 'pin' | 'jam', screw: string }
export interface PuzzleState {
  level: number
  overflow: ScrewColor | null
  removed: string[]
  trays: Tray[]
  spare: ScrewColor[]
  queue: ScrewColor[]
  completed: ScrewColor[]
  /** Each dial's stop, counted clockwise from where it starts. */
  dials: Record<string, number>
}

export function createPuzzle(levelId = 1): PuzzleState {
  const level = getLevel(levelId)
  return {
    level: levelId, overflow: null,
    removed: [], trays: [{ id: 'left', color: level.trayColors[0]!, count: 0 }, { id: 'right', color: level.trayColors[1]!, count: 0 }],
    spare: [], queue: level.trayColors.slice(2), completed: [],
    dials: Object.fromEntries(level.plates.filter((plate) => plate.dial).map((plate) => [plate.id, 0])),
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
  // The screw that frees the rack can take the slot it opens.
  else if (next.spare.length < spareCapacity(next)) next.spare.push(screw.color)
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

/** Whether the staging rack is open: its cover has no screw left, so its slot is available. */
export function rackOpen(state: PuzzleState): boolean {
  const rack = getLevel(state.level).rack
  return rack !== undefined && remainingScrews(state, rack) === 0
}

/**
 * Spare slots available on this board: the level's own, and one more once the staging rack is
 * open. It is derived from the screws taken, never stored, so restoring a snapshot restores the
 * capacity and the screws stored in it together, and a fresh attempt starts with the rack shut.
 */
export function spareCapacity(state: PuzzleState): number {
  return getLevel(state.level).spareCapacity + (rackOpen(state) ? 1 : 0)
}

export function remainingScrews(state: PuzzleState, plateId: string): number {
  return getLevel(state.level).screws.filter((screw) => heldPlates(screw).includes(plateId) && !state.removed.includes(screw.id)).length
}

/**
 * A panel is pinned while any screw holds it. A hinged or railed panel with
 * none left is open, hanging on its host, until the host itself lets go; any
 * other panel with none left is gone. A dial has no screws: it is open, free to
 * turn over the heads behind it, for as long as its host stays. A part a
 * counterweight drives has no screws either: its cord holds it shut (pinned)
 * while any screw holds the weight, and open once the weight has dropped.
 */
export type PanelState = 'pinned' | 'open' | 'gone'

export function panelState(state: PuzzleState, plateId: string): PanelState {
  if (remainingScrews(state, plateId) > 0) return 'pinned'
  const plate = getLevel(state.level).plates.find((candidate) => candidate.id === plateId)
  if (plate?.host === undefined || remainingScrews(state, plate.host) === 0) return 'gone'
  return plate.drivenBy !== undefined && remainingScrews(state, plate.drivenBy) > 0 ? 'pinned' : 'open'
}

/** Plates no screw holds any more; a screwless part (a dial, or one a counterweight drives) counts once it has come away with its host. */
export function freedPlates(state: PuzzleState): number {
  return getLevel(state.level).plates.filter((plate) => plate.dial || plate.drivenBy ? panelState(state, plate.id) === 'gone' : remainingScrews(state, plate.id) === 0).length
}

export function hasWon(state: PuzzleState): boolean {
  const level = getLevel(state.level)
  return state.overflow === null && state.removed.length === level.screws.length && state.completed.length === level.trayColors.length
}


/**
 * Covers block axial access even when a head can be glimpsed from an oblique
 * angle. A plate's last screw also stays put while a part still rests on it,
 * so a roof can never be left hanging over released walls. A part the same
 * screw also releases falls with it, so it does not hold that screw.
 */
export function screwLock(state: PuzzleState, screw: Screw): ScrewLock | null {
  if (state.removed.includes(screw.id)) return null
  if (!showing(state, screw)) return { kind: 'dial', plate: screw.underDial!.dial }
  // A cover is in the way while it is pinned: by its own screws, or by the cord of the weight that drives it.
  const cover = (screw.blockedBy ?? []).find((id) => panelState(state, id) === 'pinned')
    ?? (screw.coveredWhenOpen ?? []).find((id) => panelState(state, id) === 'open')
  if (cover) return { kind: 'cover', plate: cover }
  const held = heldPlates(screw)
  for (const plate of held) {
    if (remainingScrews(state, plate) !== 1) continue
    const load = bearingLock(state, plate, held)
    if (load) return load
  }
  return null
}

/** The first attached part that rests on this plate, if any, ignoring parts released with it. */
export function bearingLock(state: PuzzleState, plateId: string, releasedWith: readonly string[] = []): ScrewLock | null {
  const load = getLevel(state.level).plates.find((plate) => plate.restsOn?.includes(plateId)
    && remainingScrews(state, plate.id) > (releasedWith.includes(plate.id) ? 1 : 0))
  return load ? { kind: 'bearing', plate: load.id, support: plateId } : null
}

/** Whether a head can be seen: it is behind no dial, its dial has gone, or a window is over it. */
export function showing(state: PuzzleState, screw: Screw): boolean {
  if (!screw.underDial) return true
  const { dial: id, slot } = screw.underDial
  if (panelState(state, id) === 'gone') return true
  const dial = dialPlate(state, id).dial!
  const stop = state.dials[id] ?? 0
  return dial.windows.some((window) => (window + stop) % dial.stops === slot)
}

function dialPlate(state: PuzzleState, id: string): Plate {
  const plate = getLevel(state.level).plates.find((candidate) => candidate.id === id)
  if (!plate?.dial) throw new Error(`Level ${state.level} has no dial ${id}`)
  return plate
}

/** What holds a dial still, if anything: a stop pin before a head in the window. */
export function dialLock(state: PuzzleState, id: string): DialLock | null {
  const { dial } = dialPlate(state, id)
  const pin = dial!.pins?.find((screw) => !state.removed.includes(screw))
  if (pin) return { kind: 'pin', screw: pin }
  if (!dial!.jams) return null
  const head = getLevel(state.level).screws.find((screw) => screw.underDial?.dial === id && !state.removed.includes(screw.id) && showing(state, screw))
  return head ? { kind: 'jam', screw: head.id } : null
}

/**
 * Turn a dial one stop clockwise (1) or anticlockwise (-1). A turn is an
 * ordinary move, so undo steps back through it like a removal.
 */
export function turnDial(state: PuzzleState, id: string, step: 1 | -1): PuzzleState {
  if (state.overflow !== null || hasWon(state) || panelState(state, id) !== 'open' || dialLock(state, id)) return state
  const { stops } = dialPlate(state, id).dial!
  return { ...state, dials: { ...state.dials, [id]: ((state.dials[id] ?? 0) + step + stops) % stops } }
}
