import { loadSandbox, restoreSandbox, saveSandbox } from '../../gameProgress'
import { TUNING } from '../../gameTypes'
import { stepEngine } from '../engine'
import { despawnPerson, snapshotPeopleRuntime, spawnPerson, stepPeople } from '../people'
import { restoreScheduleRuntime, snapshotScheduleRuntime, stepSchedules } from '../schedules'
import { injectUnit, makeTestState, placeSlabRow } from './testState'

function fixture() {
  const state = makeTestState()
  placeSlabRow(state, 0, 0, 60)
  const office = injectUnit(state, { kind: 'officeS', floor: 0, x: 10, width: 6, storeys: 1, occupied: true, population: { low: 0, med: 4, high: 0, vip: 0 } })
  const food = injectUnit(state, { kind: 'fastfood', floor: 0, x: 30, width: 12, storeys: 1, occupied: true })
  state.clock.minute = 690
  stepSchedules(state, 689, 690, [])
  const pending = snapshotScheduleRuntime(state).pending.find(([minute, spawns]) => minute > 690 && spawns.some((spawn) => spawn.purpose === 'lunch'))!
  expect(pending).toBeDefined()
  // Isolate a strictly future production plan; do not replay its planning minute.
  restoreScheduleRuntime(state, { pending: [pending] })
  state.people = []
  const minute = pending[0]
  return { state, office, food, minute }
}

function drain({ state, minute }: ReturnType<typeof fixture>) {
  state.clock.minute = minute
  stepSchedules(state, minute - 1, minute, [])
}

beforeEach(() => localStorage.clear())

describe('deferred tenant journeys', () => {
  it('does not spawn or pay for a worker whose office was demolished after lunch planning', () => {
    const f = fixture()
    stepEngine(f.state, [{ type: 'demolishUnit', unitId: f.office.id }], 0)
    const rng = f.state.rng.state()
    drain(f)
    stepPeople(f.state, 5, [])
    expect(f.state.people).toHaveLength(0)
    expect(f.state.ledgerToday.lines['sales.commerce']).toBeUndefined()
    expect(f.state.rng.state()).toBe(rng)
  })

  it.each(['move-out', 'offline', 'infested', 'tier left'] as const)('rejects a planned trip after source %s', (change) => {
    const f = fixture()
    if (change === 'move-out') f.office.occupied = false
    if (change === 'offline') f.office.offline = true
    if (change === 'infested') f.office.infested = true
    if (change === 'tier left') f.office.population.med = 0
    drain(f)
    expect(f.state.people).toHaveLength(0)
  })

  it.each(['demolished', 'offline', 'infested', 'closed'] as const)('rejects a planned lunch when its destination is %s', (change) => {
    const f = fixture()
    if (change === 'demolished') stepEngine(f.state, [{ type: 'demolishUnit', unitId: f.food.id }], 0)
    if (change === 'offline') f.food.offline = true
    if (change === 'infested') f.food.infested = true
    if (change === 'closed') f.food.occupied = false
    drain(f)
    expect(f.state.people).toHaveLength(0)
  })

  it('continues unchanged plans and already-started trips after their office disappears', () => {
    const f = fixture()
    const rng = f.state.rng.state()
    drain(f)
    expect(f.state.people.length).toBeGreaterThan(0)
    expect(f.state.rng.state()).toBe(rng)
    stepEngine(f.state, [{ type: 'demolishUnit', unitId: f.office.id }], 0)
    stepPeople(f.state, 5, [])
    expect(f.state.ledgerToday.lines['sales.commerce']).toBeGreaterThan(0)
  })

  it('revalidates overflow after save and reload, without dropping healthy deferred trips', () => {
    const f = fixture()
    const visitor = spawnPerson(f.state, { tier: 'med', floor: 0, x: 0, toFloor: 0, toX: 50, purpose: 'shopping' })!
    f.state.people = Array.from({ length: TUNING.people.maxActive }, () => ({ ...visitor, id: f.state.nextId++ }))
    drain(f)
    expect(snapshotPeopleRuntime(f.state).overflow.length).toBeGreaterThan(0)
    f.state.people = []
    despawnPerson(f.state, visitor.id) // remove its auxiliary plan as well as the cap fixture
    expect(saveSandbox(f.state, 'slot-a').ok).toBe(true)
    const saved = loadSandbox('slot-a')
    expect(saved).not.toBeNull()
    const healthy = restoreSandbox(saved!)
    stepPeople(healthy, 0, [])
    expect(healthy.people.length).toBeGreaterThan(0)
    const stale = restoreSandbox(saved!)
    stepEngine(stale, [{ type: 'demolishUnit', unitId: f.office.id }], 0)
    stepPeople(stale, 0, [])
    expect(stale.people).toHaveLength(0)
    expect(snapshotPeopleRuntime(stale).overflow).toHaveLength(0)
  })

  it('validates saved pending plans against the current tenancy when they become due', () => {
    const f = fixture()
    expect(saveSandbox(f.state, 'slot-a').ok).toBe(true)
    const saved = loadSandbox('slot-a')!
    expect(saved).not.toBeNull()
    const state = restoreSandbox(saved)
    stepEngine(state, [{ type: 'demolishUnit', unitId: f.office.id }], 0)
    state.clock.minute = f.minute
    stepSchedules(state, f.minute - 1, f.minute, [])
    expect(state.people).toHaveLength(0)
  })

  it('checks outbound and returning errands without treating external visitors as tenants', () => {
    const f = fixture()
    const apt = injectUnit(f.state, { kind: 'aptStudio', floor: 0, x: 45, width: 4, storeys: 1, occupied: true, population: { low: 0, med: 2, high: 0, vip: 0 } })
    const out = { tier: 'med' as const, floor: apt.floor, x: apt.x, toFloor: 0, toX: 0, purpose: 'errand' as const, tenantUnitId: apt.id, destUnitId: null }
    const back = { ...out, floor: 0, x: 0, toFloor: apt.floor, toX: apt.x, destUnitId: apt.id }
    expect(spawnPerson(f.state, out)).not.toBeNull()
    expect(spawnPerson(f.state, back)).not.toBeNull()
    apt.occupied = false
    expect(spawnPerson(f.state, out)).toBeNull()
    expect(spawnPerson(f.state, back)).toBeNull()
    expect(spawnPerson(f.state, { ...out, purpose: 'amenity', tenantUnitId: null, destUnitId: f.food.id })).not.toBeNull()
  })

  it('revalidates tenant amenity destinations while preserving a healthy visit', () => {
    const f = fixture()
    const clinic = injectUnit(f.state, { kind: 'medicalClinic', floor: 0, x: 45, width: 12, storeys: 1, occupied: true })
    const trip = { tier: 'med' as const, floor: f.office.floor, x: f.office.x, toFloor: clinic.floor, toX: clinic.x, purpose: 'amenity' as const, tenantUnitId: f.office.id, destUnitId: clinic.id }
    expect(spawnPerson(f.state, trip)).not.toBeNull()
    clinic.offline = true
    expect(spawnPerson(f.state, trip)).toBeNull()
  })
})
