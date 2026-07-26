import * as CANNON from 'cannon-es'

import { LEVELS } from '../levels/levels'
import { buildLevelWorld } from '../scene/physics/levelWorld'

const SIMULATED_SECONDS = 8
const FIXED_STEP = 1 / 60
const STEP_COUNT = Math.round(SIMULATED_SECONDS / FIXED_STEP)
const MAX_DISPLACEMENT = 0.5

describe('Level physics stability (acceptance criteria C)', () => {
  it.each(LEVELS.map((level) => [level.id, level]))(
    'level %d survives 8s with no ball fired: nothing clears, nothing drifts',
    (_id, level) => {
      const world = buildLevelWorld(level)

      // Platform bodies are kinematic and never translate (only their quaternion changes for
      // continuous/oscillate rotation), so each platform's spawn position is its position for
      // the whole run. Capture spawn quaternions (always identity — blocks are spawned assuming
      // the platform's initial rotation is zero) alongside the platform bodies for the frame
      // transform below.
      const platformPositions = world.platforms.map((platform) => platform.body.position.clone())

      for (let i = 0; i < STEP_COUNT; i += 1) {
        world.step(FIXED_STEP)
      }

      expect(world.clearedBlockIds.size).toBe(0)

      for (const block of world.blocks) {
        const platform = world.platforms[block.platformIndex]
        const platformPosition = platformPositions[block.platformIndex]
        expect(platform).toBeDefined()
        expect(platformPosition).toBeDefined()
        if (!platform || !platformPosition) {
          continue
        }

        // Compare displacement in the PLATFORM's local (rotating) frame rather than world space:
        // a block riding a continuously rotating/oscillating platform without slipping legitimately
        // ends up far from its world-space spawn position (it's being carried around the axis) —
        // that is not instability. What must stay near-zero is the block's position relative to
        // the platform (i.e. no sliding/toppling relative to the surface it's resting on).
        const worldOffset = new CANNON.Vec3().copy(block.body.position).vsub(platformPosition)
        const inverseRotation = platform.body.quaternion.inverse()
        const localOffset = new CANNON.Vec3()
        inverseRotation.vmult(worldOffset, localOffset)

        const spawnWorldOffset = new CANNON.Vec3().copy(block.spawnPosition).vsub(platformPosition)
        // Platforms spawn at identity rotation, so the spawn local-frame offset is just the
        // spawn world offset.
        const spawnLocalOffset = spawnWorldOffset

        const dx = localOffset.x - spawnLocalOffset.x
        const dy = localOffset.y - spawnLocalOffset.y
        const dz = localOffset.z - spawnLocalOffset.z
        const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz)
        expect(displacement).toBeLessThan(MAX_DISPLACEMENT)
      }
    },
  )
})
