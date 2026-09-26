import type { LevelDef, PiecePlacement } from '../levels/levelTypes'
import { buildRunWorld, type RunEvent } from '../physics/runWorld'
import { LAUNCHER_ANGLE_DEG, LAUNCHER_SPEED } from '../pieces/pieceCatalog'

const P = (pieceId: PiecePlacement['pieceId'], col: number, row: number, variant = 0, flipped = false): PiecePlacement => ({ pieceId, col, row, variant, flipped })

function level(partial: Partial<LevelDef>): LevelDef {
  return {
    id: 99,
    title: 'Probe',
    cols: 8,
    rows: 8,
    start: { col: 0, row: 0 },
    goal: { col: 7, row: 7 },
    blocks: [],
    pegs: [],
    fixed: [],
    noBuild: [],
    inventory: {},
    par: { two: 9, three: 9 },
    solution: [],
    ...partial,
  }
}

/** Steps until `until` holds or the run ends; returns every event seen. */
function stepUntil(run: ReturnType<typeof buildRunWorld>, until: () => boolean, maxSteps = 240 * 10): RunEvent[] {
  const events: RunEvent[] = []
  for (let i = 0; i < maxSteps && !until(); i += 1) {
    if (run.tick((event) => events.push(event)) !== 'running') {
      break
    }
  }

  return events
}

describe('piece behaviour (headless cannon-es)', () => {
  it('fires the launcher at its fixed angle and speed, mirrored when flipped', () => {
    for (const flipped of [false, true]) {
      const run = buildRunWorld(level({ start: { col: 3, row: 0 } }), [P('launcher', 3, 7, 0, flipped)])
      const events = stepUntil(run, () => false, 240 * 3)
      const launch = events.find((event) => event.kind === 'launch')

      expect(launch).toEqual({ kind: 'launch', placementIndex: 0 })
      const run2 = buildRunWorld(level({ start: { col: 3, row: 0 } }), [P('launcher', 3, 7, 0, flipped)])
      stepUntil(run2, () => run2.marble.velocity.y > 1)
      const angle = Math.atan2(run2.marble.velocity.y, Math.abs(run2.marble.velocity.x)) * (180 / Math.PI)

      expect(angle).toBeCloseTo(LAUNCHER_ANGLE_DEG, 0)
      expect(run2.marble.velocity.length()).toBeCloseTo(LAUNCHER_SPEED, 0)
      expect(Math.sign(run2.marble.velocity.x)).toBe(flipped ? -1 : 1)
    }
  })

  it('bounces higher off a trampoline than off plain track', () => {
    const apexAfterBounce = (pieceId: 'trampoline' | 'track-short'): number => {
      const run = buildRunWorld(level({ start: { col: 3, row: 2 } }), [P(pieceId, 3, 7)])
      stepUntil(run, () => run.marble.position.y < 1.2)
      stepUntil(run, () => run.marble.velocity.y > 0.2)
      let apex = run.marble.position.y
      stepUntil(run, () => {
        apex = Math.max(apex, run.marble.position.y)
        return run.marble.velocity.y < 0
      })

      return apex
    }

    expect(apexAfterBounce('trampoline')).toBeGreaterThan(4)
    expect(apexAfterBounce('track-short')).toBeLessThan(2)
  })

  it('bumpers are bouncier than track', () => {
    /** Horizontal speed just after a vertical drop hits a 45° face, as a fraction of impact speed. */
    const deflection = (pieceId: 'bumper' | 'ramp-steep'): number => {
      const run = buildRunWorld(level({ start: { col: 3, row: 0 } }), [P(pieceId, 3, 4)])
      let impactSpeed = 0
      stepUntil(run, () => {
        impactSpeed = Math.max(impactSpeed, Math.abs(run.marble.velocity.y))
        return Math.abs(run.marble.velocity.x) > 0.05
      })
      stepUntil(run, () => false, 4)

      return Math.abs(run.marble.velocity.x) / impactSpeed
    }

    // Rubber (restitution 0.85) kicks the marble sideways almost at full speed; track soaks it up.
    expect(deflection('bumper')).toBeGreaterThan(0.8)
    expect(deflection('ramp-steep')).toBeLessThan(0.65)
  })

  it('a marble dropped into a tube leaves through the far end', () => {
    const run = buildRunWorld(level({ start: { col: 2, row: 0 } }), [P('tube', 2, 1), P('tube', 2, 2), P('tube-elbow', 2, 3), P('tube', 3, 3, 1)])
    stepUntil(run, () => run.marble.position.x > 4.2)

    expect(run.marble.position.x).toBeGreaterThan(4.2)
    // Left the horizontal tube at its floor height (row 3 spans y ∈ [4, 5]).
    expect(run.marble.position.y).toBeGreaterThan(4)
    expect(run.marble.position.y).toBeLessThan(4.8)
  })

  it('a fast marble flies off a jump while a slow one just rolls off', () => {
    const fast = buildRunWorld(level({}), [P('curve', 0, 1), P('ramp-steep', 1, 2), P('ramp-steep', 2, 3), P('kicker', 3, 3)])
    let fastApex = 0
    stepUntil(fast, () => {
      if (fast.marble.position.x > 4) {
        fastApex = Math.max(fastApex, fast.marble.position.y)
      }
      return fast.marble.position.x > 6
    })

    const slow = buildRunWorld(level({}), [P('curve', 0, 1), P('kicker', 1, 1)])
    let slowApex = 0
    stepUntil(slow, () => {
      if (slow.marble.position.x > 2) {
        slowApex = Math.max(slowApex, slow.marble.position.y)
      }
      return slow.marble.position.y < 3
    })

    // Rolling on row 3 the marble's centre sits at y ≈ 4.32: a real jump lifts it clear.
    expect(fastApex).toBeGreaterThan(4.6)
    // Rolling on row 1 its centre sits at y ≈ 6.32: the slow marble barely lifts off the lip.
    expect(slowApex).toBeLessThan(6.9)
  })
})
