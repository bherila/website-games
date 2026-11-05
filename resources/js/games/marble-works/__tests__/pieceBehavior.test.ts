import type { LevelDef, PiecePlacement } from '../levels/levelTypes'
import type { MarbleKind } from '../physics/marbles'
import { buildRunWorld, type RunEvent, simulateRun } from '../physics/runWorld'
import { LAUNCHER_ANGLE_DEG, LAUNCHER_SPEED } from '../pieces/pieceCatalog'

const P = (pieceId: PiecePlacement['pieceId'], col: number, row: number, variant = 0, flipped = false): PiecePlacement => ({ pieceId, col, row, variant, flipped })

function level(partial: Partial<LevelDef>): LevelDef {
  return {
    id: 99,
    title: 'Probe',
    cols: 8,
    rows: 8,
    droppers: [{ cell: { col: 0, row: 0 }, marbles: ['glass'] }],
    baskets: [{ cell: { col: 7, row: 7 } }],
    gems: [],
    blocks: [],
    pegs: [],
    fixed: [],
    noBuild: [],
    inventory: {},
    par: 9,
    solution: [],
    ...partial,
  }
}

/** A single dropper at (col, row) holding `marbles`. */
function from(col: number, row: number, marbles: MarbleKind[] = ['glass']): Pick<LevelDef, 'droppers'> {
  return { droppers: [{ cell: { col, row }, marbles }] }
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
      const run = buildRunWorld(level(from(3, 0)), [P('launcher', 3, 7, 0, flipped)])
      const events = stepUntil(run, () => false, 240 * 3)
      const launch = events.find((event) => event.kind === 'launch')

      expect(launch).toEqual({ kind: 'launch', placementIndex: 0, marble: 0 })
      const run2 = buildRunWorld(level(from(3, 0)), [P('launcher', 3, 7, 0, flipped)])
      stepUntil(run2, () => run2.marbles[0]!.body.velocity.y > 1)
      const angle = Math.atan2(run2.marbles[0]!.body.velocity.y, Math.abs(run2.marbles[0]!.body.velocity.x)) * (180 / Math.PI)

      expect(angle).toBeCloseTo(LAUNCHER_ANGLE_DEG, 0)
      expect(run2.marbles[0]!.body.velocity.length()).toBeCloseTo(LAUNCHER_SPEED, 0)
      expect(Math.sign(run2.marbles[0]!.body.velocity.x)).toBe(flipped ? -1 : 1)
    }
  })

  it('bounces higher off a trampoline than off plain track', () => {
    const apexAfterBounce = (pieceId: 'trampoline' | 'track-short'): number => {
      const run = buildRunWorld(level(from(3, 2)), [P(pieceId, 3, 7)])
      stepUntil(run, () => run.marbles[0]!.body.position.y < 1.2)
      stepUntil(run, () => run.marbles[0]!.body.velocity.y > 0.2)
      let apex = run.marbles[0]!.body.position.y
      stepUntil(run, () => {
        apex = Math.max(apex, run.marbles[0]!.body.position.y)
        return run.marbles[0]!.body.velocity.y < 0
      })

      return apex
    }

    expect(apexAfterBounce('trampoline')).toBeGreaterThan(4)
    expect(apexAfterBounce('track-short')).toBeLessThan(2)
  })

  it('bumpers are bouncier than track', () => {
    /** Horizontal speed just after a vertical drop hits a 45° face, as a fraction of impact speed. */
    const deflection = (pieceId: 'bumper' | 'ramp-steep'): number => {
      const run = buildRunWorld(level(from(3, 0)), [P(pieceId, 3, 4)])
      let impactSpeed = 0
      stepUntil(run, () => {
        impactSpeed = Math.max(impactSpeed, Math.abs(run.marbles[0]!.body.velocity.y))
        return Math.abs(run.marbles[0]!.body.velocity.x) > 0.05
      })
      stepUntil(run, () => false, 4)

      return Math.abs(run.marbles[0]!.body.velocity.x) / impactSpeed
    }

    // Rubber (restitution 0.85) kicks the marble sideways almost at full speed; track soaks it up.
    expect(deflection('bumper')).toBeGreaterThan(0.8)
    expect(deflection('ramp-steep')).toBeLessThan(0.65)
  })

  it('a marble dropped into a tube leaves through the far end', () => {
    const run = buildRunWorld(level(from(2, 0)), [P('tube', 2, 1), P('tube', 2, 2), P('tube-elbow', 2, 3), P('tube', 3, 3, 1)])
    stepUntil(run, () => run.marbles[0]!.body.position.x > 4.2)

    expect(run.marbles[0]!.body.position.x).toBeGreaterThan(4.2)
    // Left the horizontal tube at its floor height (row 3 spans y ∈ [4, 5]).
    expect(run.marbles[0]!.body.position.y).toBeGreaterThan(4)
    expect(run.marbles[0]!.body.position.y).toBeLessThan(4.8)
  })

  it('a fast marble flies off a jump while a slow one just rolls off', () => {
    const fast = buildRunWorld(level({}), [P('curve', 0, 1), P('ramp-steep', 1, 2), P('ramp-steep', 2, 3), P('kicker', 3, 3)])
    let fastApex = 0
    stepUntil(fast, () => {
      if (fast.marbles[0]!.body.position.x > 4) {
        fastApex = Math.max(fastApex, fast.marbles[0]!.body.position.y)
      }
      return fast.marbles[0]!.body.position.x > 6
    })

    const slow = buildRunWorld(level({}), [P('curve', 0, 1), P('kicker', 1, 1)])
    let slowApex = 0
    stepUntil(slow, () => {
      if (slow.marbles[0]!.body.position.x > 2) {
        slowApex = Math.max(slowApex, slow.marbles[0]!.body.position.y)
      }
      return slow.marbles[0]!.body.position.y < 3
    })

    // Rolling on row 3 the marble's centre sits at y ≈ 4.32: a real jump lifts it clear.
    expect(fastApex).toBeGreaterThan(4.6)
    // Rolling on row 1 its centre sits at y ≈ 6.32: the slow marble barely lifts off the lip.
    expect(slowApex).toBeLessThan(6.9)
  })

  it('launches heavier marbles shorter and lighter ones further', () => {
    const landing = (kind: MarbleKind): number => {
      const result = simulateRun(level({ ...from(0, 0, [kind]), cols: 12 }), [P('launcher', 0, 7)])
      const path = result.paths[0] ?? []

      return path[path.length - 1]?.[0] ?? 0
    }
    const steel = landing('steel')
    const glass = landing('glass')
    const mini = landing('mini')

    expect(steel).toBeLessThan(glass - 1.5)
    expect(mini).toBeGreaterThan(glass + 0.5)
  })

  it('bounces a steel ball lower off a trampoline than a glass marble', () => {
    const apex = (kind: MarbleKind): number => {
      const run = buildRunWorld(level(from(3, 4, [kind])), [P('trampoline', 3, 7)])
      let bounced = false
      let top = 0
      for (let i = 0; i < 240 * 3; i += 1) {
        run.tick((event) => {
          bounced ||= event.kind === 'bounce'
        })
        if (bounced) {
          top = Math.max(top, run.marbles[0]!.body.position.y)
        }
      }

      return top
    }

    expect(apex('steel')).toBeLessThan(apex('glass') - 0.5)
  })

  it('a switch sends marbles alternately left and right', () => {
    const result = simulateRun(
      level({
        ...from(3, 0, ['glass', 'glass', 'glass']),
        baskets: [{ cell: { col: 2, row: 7 } }, { cell: { col: 4, row: 7 } }],
        // Walls either side so each exit drops straight into a basket.
        blocks: [{ col: 1, row: 2, w: 1, h: 6 }, { col: 5, row: 2, w: 1, h: 6 }],
      }),
      [P('toggle', 3, 2)],
    )
    const exits = result.paths.map((path) => Math.sign((path[path.length - 1]?.[0] ?? 3.5) - 3.5))

    expect(result.status).toBe('won')
    expect(exits).toEqual([1, -1, 1])
  })

  it('glass track holds glass and mini marbles but a steel ball smashes through it', () => {
    const floorAt = (kind: MarbleKind): { status: string; events: RunEvent[] } => {
      const run = buildRunWorld(level(from(1, 0, [kind])), [P('glass-track', 1, 3)])
      const events = stepUntil(run, () => false, 240 * 3)

      return { status: run.marbles[0]!.tracker.status, events }
    }

    expect(floorAt('glass').status).toBe('stuck')
    expect(floorAt('mini').status).toBe('stuck')
    expect(floorAt('steel').events).toContainEqual({ kind: 'shatter', placementIndex: 0, marble: 0 })
    expect(floorAt('steel').status).not.toBe('stuck')
  })

  it('a glass pane turns a glass marble back but not a steel ball', () => {
    const endX = (kind: MarbleKind): number => {
      const result = simulateRun(level(from(0, 0, [kind])), [P('curve', 0, 1), P('track-long', 1, 1), P('glass-pane', 3, 1)])
      const path = result.paths[0] ?? []

      return path[path.length - 1]?.[0] ?? 0
    }

    expect(endX('glass')).toBeLessThan(3.5)
    expect(endX('steel')).toBeGreaterThan(4)
  })

  it('a sieve drops mini marbles and carries the others across', () => {
    const endX = (kind: MarbleKind): number => {
      const result = simulateRun(level(from(0, 0, [kind])), [P('curve', 0, 1), P('sieve', 1, 1), P('track-long', 3, 1)])
      const path = result.paths[0] ?? []

      return path[path.length - 1]?.[0] ?? 0
    }

    expect(endX('mini')).toBeLessThan(4)
    expect(endX('glass')).toBeGreaterThan(5)
    expect(endX('steel')).toBeGreaterThan(5)
  })

  it('collects gems on the way and refuses marbles a basket does not take', () => {
    const base = { ...from(1, 0), baskets: [{ cell: { col: 1, row: 7 } }], gems: [{ col: 1, row: 4 }] }

    expect(simulateRun(level(base), [])).toMatchObject({ status: 'won', gems: 1, allGems: true })
    expect(simulateRun(level({ ...base, baskets: [{ cell: { col: 1, row: 7 }, accepts: 'steel' }] }), []).status).toBe('wrong')
    expect(simulateRun(level({ ...base, ...from(1, 0, ['glass', 'glass']), baskets: [{ cell: { col: 1, row: 7 }, capacity: 1 }] }), []).status).toBe('full')
    expect(simulateRun(level({ ...base, ...from(1, 0, ['glass', 'steel', 'mini']) }), [])).toMatchObject({ status: 'won', home: 3 })
  })
})
