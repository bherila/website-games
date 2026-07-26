import { nextPersonGlide, type PersonGlideInput } from '../styleGateArt'

function input(overrides: Partial<PersonGlideInput>): PersonGlideInput {
  return {
    visualX: 0,
    visualFloor: 0,
    targetX: 0,
    targetFloor: 0,
    riding: false,
    verticalLeg: false,
    walkStep: 0.2,
    climbStep: 0.1,
    ...overrides,
  }
}

describe('nextPersonGlide — axis-locked person glide (diagonal-movement fix)', () => {
  it('a walking person eases x but SNAPS floor (no diagonal across floors)', () => {
    // Sim ran ahead: person is now several floors up and to the right.
    const result = nextPersonGlide(input({ visualX: 0, visualFloor: 0, targetX: 5, targetFloor: 3 }))
    expect(result.floor).toBe(3) // floor snaps — never mid-glides on a walk leg
    expect(result.x).toBeGreaterThan(0) // x eases toward target
    expect(result.x).toBeLessThan(5)
  })

  it('a climbing person eases floor but HOLDS x (vertical-only)', () => {
    const result = nextPersonGlide(input({ visualX: 2, visualFloor: 0, targetX: 2, targetFloor: 3, verticalLeg: true }))
    expect(result.x).toBe(2) // x pinned to the stair/escalator column
    expect(result.floor).toBeGreaterThan(0) // floor eases toward target
    expect(result.floor).toBeLessThan(3)
  })

  it('never eases BOTH axes at once — the invariant that kills the diagonal', () => {
    const scenarios: Partial<PersonGlideInput>[] = [
      { visualX: 0, visualFloor: 0, targetX: 4, targetFloor: 2 }, // walk
      { visualX: 1, visualFloor: 0, targetX: 1, targetFloor: 4, verticalLeg: true }, // climb
      { visualX: 0, visualFloor: 0, targetX: 3, targetFloor: 5, riding: true }, // ride
    ]
    for (const scenario of scenarios) {
      const full = input(scenario)
      const result = nextPersonGlide(full)
      const xMoving = result.x !== full.targetX
      const floorMoving = result.floor !== full.targetFloor
      // At most one axis may be mid-glide (the other is snapped to target).
      expect(xMoving && floorMoving).toBe(false)
    }
  })

  it('a rider tracks the cabin exactly on both axes', () => {
    const result = nextPersonGlide(input({ visualX: 0, visualFloor: 0, targetX: 3, targetFloor: 7, riding: true }))
    expect(result).toEqual({ x: 3, floor: 7 })
  })
})
