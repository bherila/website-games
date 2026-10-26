import { createPuzzle, dialLock, freedPlates, hasWon, panelState, remainingScrews, removeScrew, screwLock, turnDial } from '../engine'
import { LAB_DIAL_JAM, LAB_DIAL_PIN } from '../labLevels'
import { getLevel, heldPlates, LEVELS, type ScrewColor, SCREWS } from '../level'
import { WORKSHOP_TRACE } from './campaignFixtures'

test('collects matching colors directly and holds unopened colors in spare storage', () => {
  const initial = createPuzzle()
  const coral = removeScrew(initial, 'front-1')
  expect(coral.trays[0]).toEqual({ id: 'left', color: 'coral', count: 1 })
  expect(initial.removed).toEqual([])
  expect(initial.trays[0]?.count).toBe(0)
  const blue = removeScrew(coral, 'right-roof-1')
  expect(blue.spare).toEqual(['blue'])
  expect(blue.removed).toEqual(['front-1', 'right-roof-1'])
})

test('opening the blue tray drains stored screws into it', () => {
  let state = createPuzzle()
  for (const id of ['right-roof-1', 'left-roof-2', 'left-roof-1', 'front-1', 'left-1', 'right-roof-2']) state = removeScrew(state, id)
  expect(state.completed).toEqual(['coral'])
  expect(state.spare).toEqual([])
  expect(state.trays[0]).toEqual({ id: 'left', color: 'blue', count: 2 })
  state = removeScrew(state, 'back-1')
  expect(state.completed).toEqual(['coral', 'blue'])
  expect(state.trays[0]).toEqual({ id: 'left', color: null, count: 0 })
  expect(hasWon(state)).toBe(false)
})

test('the last support releases a plate, while all nine screws are required for victory', () => {
  let state = createPuzzle()
  state = removeScrew(state, 'right-roof-1')
  expect(remainingScrews(state, 'right-roof')).toBe(1)
  expect(freedPlates(state)).toBe(0)
  state = removeScrew(state, 'right-roof-2')
  expect(freedPlates(state)).toBe(1)
  // Gables wait for the roof, so a second pass collects what the first could not.
  for (let pass = 0; pass < 2; pass++) for (const screw of SCREWS) state = removeScrew(state, screw.id)
  expect(freedPlates(state)).toBe(6)
  expect(hasWon(state)).toBe(true)
  expect(state.spare).toEqual([])
})

test('a gable wall keeps its last screw while either roof slope rests on it', () => {
  let state = removeScrew(createPuzzle(), 'front-1')
  const last = SCREWS.find((screw) => screw.id === 'front-2')!
  expect(screwLock(state, last)).toEqual({ kind: 'bearing', plate: 'left-roof', support: 'front' })
  expect(removeScrew(state, 'front-2')).toBe(state)
  // Side walls are infill: their only screw is free from the start.
  expect(screwLock(createPuzzle(), SCREWS.find((screw) => screw.id === 'left-1')!)).toBeNull()
  for (const id of ['left-roof-1', 'left-roof-2', 'right-roof-1']) state = removeScrew(state, id)
  expect(screwLock(state, last)).toEqual({ kind: 'bearing', plate: 'right-roof', support: 'front' })
  state = removeScrew(state, 'right-roof-2')
  expect(screwLock(state, last)).toBeNull()
  expect(removeScrew(state, 'front-2').removed).toContain('front-2')
})

test('a cover outranks the bearing lock, so a head is never reported for the wrong reason', () => {
  const state = createPuzzle(3)
  // The windmill's only front screw is behind the sails and also under the roof.
  expect(screwLock(state, getLevel(3).screws.find((screw) => screw.id === 'front-1')!)).toEqual({ kind: 'cover', plate: 'sail-coral' })
})

test('duplicate and unknown taps do not consume storage or change the undo snapshot', () => {
  const state = removeScrew(createPuzzle(), 'front-1')
  expect(removeScrew(state, 'front-1')).toBe(state)
  expect(removeScrew(state, 'unknown')).toBe(state)
  const full = { ...state, spare: ['blue', 'blue', 'blue', 'blue'] as ScrewColor[] }
  expect(removeScrew(full, 'right-roof-1')).toBe(full)
})


test('workshop overflow loses an undoable attempt without discarding the unmatched screw', () => {
  const initial = createPuzzle(2)
  const first = removeScrew(initial, 'right-roof-1')
  const full = removeScrew(first, 'right-roof-2')
  expect(full.spare).toEqual(['blue', 'amber'])
  expect(full.overflow).toBeNull()
  const lost = removeScrew(full, 'left-roof-2')
  expect(lost.overflow).toBe('amber')
  expect(lost.removed).toHaveLength(3)
  expect(lost.spare).toEqual(['blue', 'amber'])
  expect(hasWon(lost)).toBe(false)
  expect(removeScrew(lost, 'left-1')).toBe(lost)
  expect(full.overflow).toBeNull()
  // A matching screw remains legal with full storage, allowing recovery.
  expect(removeScrew(full, 'left-1').trays[0]?.count).toBe(1)
  expect(createPuzzle(2)).toEqual(initial)
})

test('the workshop has a winning order that opens the timber braces before the hidden heads', () => {
  let state = createPuzzle(2)
  for (const id of WORKSHOP_TRACE.win) {
    state = removeScrew(state, id)
    expect(state.overflow).toBeNull()
  }
  expect(hasWon(state)).toBe(true)
  expect(state.completed).toHaveLength(4)
  expect(freedPlates(state)).toBe(8)
  expect(state.spare).toEqual([])
})


test('each authored level has complete color sets and a support for every panel', () => {
  for (const level of LEVELS) {
    expect(new Set(level.screws.map((screw) => screw.id)).size).toBe(level.screws.length)
    for (const color of level.trayColors) expect(level.screws.filter((screw) => screw.color === color)).toHaveLength(3)
    // A dial has no screws of its own: it turns on its host and goes with it.
    for (const plate of level.plates) expect(plate.dial ? level.plates.some((candidate) => candidate.id === plate.host) : level.screws.some((screw) => heldPlates(screw).includes(plate.id))).toBe(true)
    for (const screw of level.screws) for (const plate of heldPlates(screw)) expect(level.plates.some((candidate) => candidate.id === plate)).toBe(true)
    const ids = level.plates.map((plate) => plate.id)
    for (const screw of level.screws) for (const cover of screw.blockedBy ?? []) expect(ids).toContain(cover)
    for (const plate of level.plates) for (const support of plate.restsOn ?? []) expect(ids).toContain(support)
    // Hinged and railed panels name an ordinary host; covers that act once open are captive panels,
    // and never lie over a screw that holds their own host, which could then never come out.
    for (const plate of level.plates.filter((candidate) => candidate.hinge || candidate.rail)) {
      const host = level.plates.find((candidate) => candidate.id === plate.host)
      expect(host?.hinge ?? host?.rail).toBeUndefined()
      expect(host).toBeDefined()
    }
    for (const screw of level.screws) {
      for (const id of screw.coveredWhenOpen ?? []) {
        const cover = level.plates.find((candidate) => candidate.id === id)!
        expect(cover.hinge ?? cover.rail).toBeDefined()
        expect(heldPlates(screw)).not.toContain(cover.host)
      }
    }
  }
  expect(() => getLevel(LEVELS.length + 1)).toThrow('Unknown Plate Escape level')
})

const ROOFS = ['left-roof-1', 'left-roof-2', 'right-roof-1', 'right-roof-2']
const board = (level: number, removed: string[]) => ({ ...createPuzzle(level), removed })
const lockOf = (level: number, removed: string[], id: string) => screwLock(board(level, removed), getLevel(level).screws.find((screw) => screw.id === id)!)

test('a shared screw counts toward every plate it pins, so its plates release together', () => {
  // The waterwheel's axle runs through the wheel into the front gable.
  let state = createPuzzle(6)
  expect(remainingScrews(state, 'wheel')).toBe(2)
  expect(remainingScrews(state, 'front')).toBe(3)
  for (const id of ['wheel-1', ...ROOFS, 'front-1', 'front-2']) state = removeScrew(state, id)
  expect(remainingScrews(state, 'front')).toBe(1)
  expect(freedPlates(state)).toBe(2)
  state = removeScrew(state, 'wheel-axle')
  expect(remainingScrews(state, 'wheel')).toBe(0)
  expect(remainingScrews(state, 'front')).toBe(0)
  expect(freedPlates(state)).toBe(4)
})

test('a gable whose other screws are gone still holds while the shared screw pins it', () => {
  // Without the axle, the front gable's second screw would be its last one under the roof.
  expect(lockOf(6, ['front-1'], 'front-2')).toBeNull()
  expect(lockOf(6, ['front-1', 'front-2', 'wheel-1'], 'wheel-axle')).toEqual({ kind: 'bearing', plate: 'left-roof', support: 'front' })
})

test('a part released by the same screw does not hold that screw', () => {
  const clear = ['front-1', 'front-2', ...ROOFS]
  // The wheel rests on the gable, but the axle drops them together once the wheel's own screw is out.
  expect(lockOf(6, clear, 'wheel-axle')).toEqual({ kind: 'bearing', plate: 'wheel', support: 'front' })
  expect(lockOf(6, [...clear, 'wheel-1'], 'wheel-axle')).toBeNull()
  // The sawmill bolt pins rack, guard and back wall: a chain of resting parts it releases at once.
  const sawmill = ['back-1', 'back-2', ...ROOFS, 'saw-guard-1']
  expect(lockOf(8, sawmill, 'saw-bolt')).toEqual({ kind: 'bearing', plate: 'log-rack', support: 'saw-guard' })
  expect(lockOf(8, [...sawmill, 'log-rack-1'], 'saw-bolt')).toBeNull()
  // A part held elsewhere still counts: the guard keeps its own screw, so the back wall waits.
  expect(lockOf(8, ['back-1', 'back-2', ...ROOFS, 'log-rack-1'], 'saw-bolt')).toEqual({ kind: 'bearing', plate: 'saw-guard', support: 'back' })
})

test('a roof still holds a gable that a shared screw would release with something else', () => {
  expect(lockOf(8, ['back-1', 'back-2', 'saw-guard-1', 'log-rack-1'], 'saw-bolt')).toEqual({ kind: 'bearing', plate: 'left-roof', support: 'back' })
})

test('a flap that drops open covers the screw below it until the batten it hangs on comes off', () => {
  const pinned = board(11, [])
  expect(panelState(pinned, 'bait-flap')).toBe('pinned')
  // Taken first, the transom screw is free; the closed flap only hides the batten's screw.
  expect(lockOf(11, [], 'transom-1')).toBeNull()
  expect(lockOf(11, [], 'batten-1')).toEqual({ kind: 'cover', plate: 'bait-flap' })
  expect(panelState(board(11, ['bait-flap-1']), 'bait-flap')).toBe('open')
  expect(lockOf(11, ['bait-flap-1'], 'transom-1')).toEqual({ kind: 'cover', plate: 'bait-flap' })
  expect(lockOf(11, ['bait-flap-1'], 'batten-1')).toBeNull()
  // The batten goes, the flap goes with it, and the transom screw is free again.
  expect(panelState(board(11, ['bait-flap-1', 'batten-1']), 'bait-flap')).toBe('gone')
  expect(lockOf(11, ['bait-flap-1', 'batten-1'], 'transom-1')).toBeNull()
})

test('a shutter dropped down its rail covers the base until its glass comes off, and never bears on it', () => {
  const caps = ['cap-left-1', 'cap-right-1']
  expect(lockOf(12, [...caps, 'shutter-front-1'], 'base-front-1')).toEqual({ kind: 'cover', plate: 'shutter-front' })
  // The open shutter is no load: the glass's last screw is free once the cap is off.
  expect(lockOf(12, [...caps, 'shutter-front-1'], 'glass-front-1')).toBeNull()
  expect(panelState(board(12, [...caps, 'shutter-front-1', 'glass-front-1']), 'shutter-front')).toBe('gone')
  expect(lockOf(12, [...caps, 'shutter-front-1', 'glass-front-1'], 'base-front-1')).toBeNull()
})

const take = (level: number, ids: readonly string[]) => ids.reduce((state, id) => removeScrew(state, id), createPuzzle(level))
const behind = ['dial-0', 'dial-1', 'dial-2', 'dial-3']
/** Which heads behind the dial can be reached on a board. */
const inWindow = (state: ReturnType<typeof createPuzzle>) => behind.filter((id) => screwLock(state, getLevel(state.level).screws.find((screw) => screw.id === id)!)?.kind !== 'dial')

test('a dial shows one head behind it at each stop, and every head at exactly one', () => {
  let state = take(LAB_DIAL_PIN, ['door-pin'])
  const seen: string[] = []
  for (let turn = 0; turn < 4; turn++) {
    expect(inWindow(state)).toHaveLength(1)
    seen.push(...inWindow(state))
    state = turnDial(state, 'dial', 1)
  }
  // Four turns bring it back round to where it started.
  expect(state.dials).toEqual({ dial: 0 })
  expect(seen.sort()).toEqual(behind)
  // The window starts at the bottom, and turning it clockwise brings it up the left side.
  expect(inWindow(createPuzzle(LAB_DIAL_PIN))).toEqual(['dial-2'])
  expect(inWindow(turnDial(take(LAB_DIAL_PIN, ['door-pin']), 'dial', 1))).toEqual(['dial-3'])
  expect(inWindow(turnDial(take(LAB_DIAL_PIN, ['door-pin']), 'dial', -1))).toEqual(['dial-1'])
})

test('the stop pin holds the dial until it comes out', () => {
  const start = createPuzzle(LAB_DIAL_PIN)
  expect(dialLock(start, 'dial')).toEqual({ kind: 'pin', screw: 'door-pin' })
  expect(turnDial(start, 'dial', 1)).toBe(start)
  const unpinned = take(LAB_DIAL_PIN, ['door-pin'])
  expect(dialLock(unpinned, 'dial')).toBeNull()
  // With the pin out a head in the window does not catch it.
  expect(turnDial(unpinned, 'dial', 1).dials).toEqual({ dial: 1 })
})

test('a head showing in a jamming dial\'s window holds it until that head is out', () => {
  const start = createPuzzle(LAB_DIAL_JAM)
  expect(dialLock(start, 'dial')).toEqual({ kind: 'jam', screw: 'dial-2' })
  expect(turnDial(start, 'dial', -1)).toBe(start)
  const cleared = take(LAB_DIAL_JAM, ['dial-2'])
  const turned = turnDial(cleared, 'dial', -1)
  expect(turned.dials).toEqual({ dial: 3 })
  // It turns onto the next head and catches again; turning back is caught too.
  expect(dialLock(turned, 'dial')).toEqual({ kind: 'jam', screw: 'dial-1' })
  expect(turnDial(turned, 'dial', 1)).toBe(turned)
})

test('a dial stays with its door, turning only while the door is on, and counts as released when it goes', () => {
  const doorScrews = ['door-pin', 'door-corner', 'dial-2']
  let state = take(LAB_DIAL_PIN, doorScrews)
  for (const id of ['dial-3', 'dial-0', 'dial-1']) {
    state = turnDial(state, 'dial', 1)
    state = removeScrew(state, id)
    expect(state.removed).toContain(id)
  }
  expect(panelState(state, 'door')).toBe('gone')
  expect(panelState(state, 'dial')).toBe('gone')
  expect(turnDial(state, 'dial', 1)).toBe(state)
  // The door and its dial both count once the door is off; before that the screwless dial does not.
  expect(freedPlates(state)).toBe(2)
  expect(freedPlates(createPuzzle(LAB_DIAL_PIN))).toBe(0)
})

test('a dial will not turn once the attempt has overflowed', () => {
  // The trays take coral and mint. Amber, amber and blue fill storage, and the next blue overflows.
  const state = take(LAB_DIAL_PIN, ['door-pin', 'back-2', 'top-1', 'top-2', 'left-1'])
  expect(state.overflow).not.toBeNull()
  expect(turnDial(state, 'dial', 1)).toBe(state)
})

test('levels without a dial start with none, so their boards are unchanged', () => {
  for (const level of LEVELS.filter((candidate) => !candidate.plates.some((plate) => plate.dial))) expect(createPuzzle(level.id).dials).toEqual({})
})
