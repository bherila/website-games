import type { LevelDef } from '../levels/levelTypes'
import { buildLevelWorld, platformAngularVelocity } from '../scene/physics/levelWorld'

const SINGLE_BEAM_LEVEL: LevelDef = {
  id: 1,
  balls: 3,
  starThresholds: { twoStar: 1, threeStar: 2 },
  platforms: [
    {
      shape: 'round',
      radius: 2.2,
      topY: 2,
      center: [0, 0],
      blocks: [
        { type: 'beam', position: [0, 0, 0] },
      ],
    },
  ],
}

describe('cleared-block latch', () => {
  it('does not clear a block resting on its platform', () => {
    const world = buildLevelWorld(SINGLE_BEAM_LEVEL)
    for (let i = 0; i < 120; i += 1) {
      world.step(1 / 60)
    }
    expect(world.clearedBlockIds.size).toBe(0)
  })

  it('clears a tall piece standing on end on the ground off the platform, even though its center stays above topY - CLEAR_DROP', () => {
    const world = buildLevelWorld(SINGLE_BEAM_LEVEL)
    const beam = world.blocks[0]
    expect(beam).toBeDefined()
    if (!beam) {
      return
    }

    // Teleport the beam off the platform, standing on end on the grass: vertical extent 3.0
    // (the long axis up), center at y = 1.5 — above the fast-path threshold of 0.8.
    beam.body.position.set(4.5, 1.5, 0)
    beam.body.quaternion.setFromEuler(0, 0, Math.PI / 2)
    beam.body.velocity.set(0, 0, 0)
    beam.body.angularVelocity.set(0, 0, 0)
    world.step(1 / 60)

    expect(world.clearedBlockIds.has(beam.id)).toBe(true)
  })

  it('does not clear a block that is above the platform top surface, wherever it is horizontally', () => {
    const world = buildLevelWorld(SINGLE_BEAM_LEVEL)
    const beam = world.blocks[0]
    if (!beam) {
      return
    }

    beam.body.position.set(5, 4, 0)
    world.step(1 / 60)

    expect(world.clearedBlockIds.has(beam.id)).toBe(false)
  })
})

describe('platformAngularVelocity oscillation guard', () => {
  it('stays finite when an author sets maxAngleDeg to 0', () => {
    const def = SINGLE_BEAM_LEVEL.platforms[0]
    if (!def) {
      return
    }

    const zeroAmplitude = {
      ...def,
      rotation: { mode: 'oscillate' as const, speedDegPerSec: 30, maxAngleDeg: 0 },
    }
    for (const t of [0, 0.5, 1, 5]) {
      expect(Number.isFinite(platformAngularVelocity(zeroAmplitude, t))).toBe(true)
    }
  })
})
