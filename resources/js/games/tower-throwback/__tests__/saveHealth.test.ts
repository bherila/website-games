import { isStateChangingCommand } from '../dirtyCommands'
import type { EngineCommand } from '../gameTypes'
import {
  AUTOSAVE_MAX_UNSAVED_MS,
  AUTOSAVE_QUIET_MS,
  describeLastSaved,
  emptySchedule,
  markDirty,
  msUntilAutosave,
  shouldAutosave,
} from '../saveHealth'

describe('autosave scheduling', () => {
  it('never fires while clean', () => {
    expect(shouldAutosave(emptySchedule(), 1_000_000)).toBe(false)
    expect(msUntilAutosave(emptySchedule(), 1_000_000)).toBeNull()
  })

  it('waits out the quiet window after the last change', () => {
    const schedule = markDirty(emptySchedule(), 0)

    expect(shouldAutosave(schedule, AUTOSAVE_QUIET_MS - 1)).toBe(false)
    expect(shouldAutosave(schedule, AUTOSAVE_QUIET_MS)).toBe(true)
  })

  it('coalesces a burst into a single deadline', () => {
    // A bulk placement emits many commands; each one pushes the quiet deadline
    // out rather than queueing another write.
    let schedule = markDirty(emptySchedule(), 0)
    for (let t = 100; t <= 2_000; t += 100) {
      schedule = markDirty(schedule, t)
    }

    expect(shouldAutosave(schedule, 2_000 + AUTOSAVE_QUIET_MS - 1)).toBe(false)
    expect(shouldAutosave(schedule, 2_000 + AUTOSAVE_QUIET_MS)).toBe(true)
  })

  it('bounds the worst-case unsaved window under continuous activity', () => {
    // The property that makes this feature worth having: sustained building
    // must not defer the write forever.
    let schedule = markDirty(emptySchedule(), 0)
    for (let t = 500; t < AUTOSAVE_MAX_UNSAVED_MS; t += 500) {
      schedule = markDirty(schedule, t)
      expect(shouldAutosave(schedule, t)).toBe(false)
    }

    expect(shouldAutosave(schedule, AUTOSAVE_MAX_UNSAVED_MS)).toBe(true)
  })

  it('reports a non-negative time to the nearer deadline', () => {
    const schedule = markDirty(emptySchedule(), 0)

    expect(msUntilAutosave(schedule, 0)).toBe(AUTOSAVE_QUIET_MS)
    expect(msUntilAutosave(schedule, AUTOSAVE_QUIET_MS + 10_000)).toBe(0)
  })

  it('starts a fresh window after the state is saved', () => {
    const saved = emptySchedule()
    expect(shouldAutosave(saved, AUTOSAVE_MAX_UNSAVED_MS * 10)).toBe(false)
  })
})

describe('describeLastSaved', () => {
  it('describes the common ranges', () => {
    expect(describeLastSaved(null, 0)).toBe('not yet saved')
    expect(describeLastSaved(1_000, 5_000)).toBe('just now')
    expect(describeLastSaved(0, 30_000)).toBe('30s ago')
    expect(describeLastSaved(0, 5 * 60_000)).toBe('5m ago')
    expect(describeLastSaved(0, 3 * 3_600_000)).toBe('3h ago')
  })

  it('never reports a negative age from clock skew', () => {
    expect(describeLastSaved(10_000, 0)).toBe('just now')
  })
})

describe('isStateChangingCommand', () => {
  it('treats view-only speed controls as clean', () => {
    // Otherwise idling on the speed buttons would rewrite the whole tower.
    expect(isStateChangingCommand({ type: 'setSpeed', speed: 8 })).toBe(false)
    expect(isStateChangingCommand({ type: 'setFastMode', enabled: true })).toBe(false)
  })

  it.each<EngineCommand>([
    { type: 'place', kind: 'officeS', floor: 1, x: 2 },
    { type: 'demolishUnit', unitId: 1 },
    { type: 'setRentTier', unitId: 1, tier: 'high' },
    { type: 'acceptLoan', amount: 100 },
    { type: 'respondToFire', choice: 'dispatch' },
    { type: 'setDisastersEnabled', enabled: false },
    { type: 'repairUnit', unitId: 3 },
  ])('treats $type as dirtying', (cmd) => {
    expect(isStateChangingCommand(cmd)).toBe(true)
  })
})
