import { populationOf } from '../engine/stars'
import { exportSandbox, importSandbox, loadSandbox, migrateSandboxPayload, restoreSandbox, saveSandbox } from '../gameProgress'
import { FLOOR_MAX, FLOOR_MIN } from '../gameTypes'

/**
 * Fast (non-gated) validation of the committed end-of-game fixture. The fixture
 * is a completed 5★ / TOWER tower produced by the deterministic generator in
 * `completedTowerFixture.slow.test.tsx`. This test never grinds the sim — it
 * only loads the JSON and asserts the end-of-game invariants and that it
 * round-trips through the real v2 save import/migration path unchanged.
 *
 * The fixture is loaded with a declared `require` (the frontend type-check
 * config carries no node types — same pattern as `tests-ts/jestConfig.test.ts`);
 * Jest parses the JSON at runtime and the payload stays `unknown` until the
 * wire parser vets it.
 */

declare function require(moduleName: string): unknown

const fixtureJson = require('./fixtures/completed-tower.v2.json')

/** The exact bytes `exportSandbox` produces for this payload (sans trailing newline). */
const rawFixture = JSON.stringify(fixtureJson, null, 2)

/** A completed office+high-rise tower is well under the active-people/entity scale ceiling. */
const POP_CEILING = 100_000

describe('completed-tower fixture', () => {
  it('is a valid v2 payload describing a finished 5★ / TOWER game', () => {
    const saved = migrateSandboxPayload(fixtureJson)
    expect(saved).not.toBeNull()
    if (!saved) {
      return
    }

    expect(saved.version).toBe(2)
    expect(saved.star).toBe(5)
    expect(saved.maxStarReached).toBe(5)
    expect(saved.towerAchieved).toBe(true)
    expect(saved.milestonesEarned).toEqual(
      expect.arrayContaining(['star2', 'star3', 'star4', 'star5', 'tower']),
    )

    // Floor / unit / population sanity bounds.
    expect(saved.units.length).toBeGreaterThan(50)
    expect(saved.units.length).toBeLessThan(2000)
    const floors = saved.units.map((u) => u.floor)
    expect(Math.min(...floors)).toBeGreaterThanOrEqual(FLOOR_MIN)
    expect(Math.max(...floors)).toBeLessThanOrEqual(FLOOR_MAX)
    // The tower reaches the cathedral floor even though the crown was demolished.
    expect(Math.max(...floors)).toBe(99)
    expect(saved.units.some((u) => u.kind === 'cathedral')).toBe(false)

    const restored = restoreSandbox(saved)
    const population = populationOf(restored)
    expect(population).toBeGreaterThan(0)
    expect(population).toBeLessThan(POP_CEILING)

    // The guest of honor is a resident of a penthouse.
    const penthouse = restored.units.find((u) => u.kind === 'aptPenthouse')
    expect(penthouse).toBeDefined()
    expect(penthouse!.population.vip).toBe(1)
    const towerVip = restored.vips.find((v) => v.target === 'tower')
    expect(towerVip).toMatchObject({ target: 'tower', state: 'resident' })
  })

  it('round-trips through the save import → restore → save path unchanged', () => {
    window.localStorage.clear()

    // Import the committed fixture through the real wire contract.
    const imported = importSandbox(rawFixture, 'slot-a')
    expect(imported.ok).toBe(true)
    const savedA = loadSandbox('slot-a')
    expect(savedA).not.toBeNull()

    // Rehydrate to a runnable engine and re-save — the payload must be identical.
    const restored = restoreSandbox(savedA!)
    expect(saveSandbox(restored, 'slot-b').ok).toBe(true)
    const savedB = loadSandbox('slot-b')

    expect(savedB).toEqual(savedA)
    // And the re-exported JSON matches the migrated import byte-for-byte.
    expect(exportSandbox(savedB!)).toEqual(exportSandbox(savedA!))
  })
})
