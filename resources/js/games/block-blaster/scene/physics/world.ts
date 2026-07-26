import * as CANNON from 'cannon-es'

import {
  FRICTION_BALL_BLOCK,
  FRICTION_BLOCK_BLOCK,
  FRICTION_BLOCK_PLATFORM,
  FRICTION_GROUND,
  GRAVITY_Y,
  RESTITUTION_BALL_BLOCK,
  RESTITUTION_BLOCK_PLATFORM,
} from '../sceneConstants'

export interface PhysicsMaterials {
  ball: CANNON.Material
  block: CANNON.Material
  platform: CANNON.Material
  ground: CANNON.Material
}

export interface PhysicsWorldHandles {
  world: CANNON.World
  materials: PhysicsMaterials
  groundBody: CANNON.Body
}

export function createPhysicsWorld(): PhysicsWorldHandles {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY_Y, 0) })
  world.allowSleep = true
  world.broadphase = new CANNON.SAPBroadphase(world)

  const materials: PhysicsMaterials = {
    ball: new CANNON.Material('ball'),
    block: new CANNON.Material('block'),
    platform: new CANNON.Material('platform'),
    ground: new CANNON.Material('ground'),
  }

  world.addContactMaterial(new CANNON.ContactMaterial(materials.block, materials.platform, {
    friction: FRICTION_BLOCK_PLATFORM,
    restitution: RESTITUTION_BLOCK_PLATFORM,
  }))
  world.addContactMaterial(new CANNON.ContactMaterial(materials.ball, materials.block, {
    friction: FRICTION_BALL_BLOCK,
    restitution: RESTITUTION_BALL_BLOCK,
  }))
  world.addContactMaterial(new CANNON.ContactMaterial(materials.block, materials.block, {
    friction: FRICTION_BLOCK_BLOCK,
    restitution: 0.1,
  }))
  world.addContactMaterial(new CANNON.ContactMaterial(materials.block, materials.ground, {
    friction: FRICTION_GROUND,
    restitution: 0.1,
  }))
  world.addContactMaterial(new CANNON.ContactMaterial(materials.ball, materials.ground, {
    friction: FRICTION_GROUND,
    restitution: 0.2,
  }))

  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: materials.ground,
  })
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)

  return { world, materials, groundBody }
}
