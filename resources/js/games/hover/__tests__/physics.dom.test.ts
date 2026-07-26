import { craftSpeed, normalizeAngle, resolveCraftCollision, resolveWallCollisions, stepCraftPhysics } from '../engine/physics'
import { DT, JUMP_VELOCITY, WALL_RESTITUTION } from '../gameTypes'
import type { InputState } from '../input/inputState'
import type { MapDef } from '../maps/mapTypes'
import { createMapDef } from '../maps/mapTypes'
import { makeCraft, openMap, testTheme } from './fixtures'

const IDLE: InputState = { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
const FORWARD: InputState = { thrust: 1, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }

describe('hover physics', () => {
  test('is deterministic for identical inputs', () => {
    const a = makeCraft({ x: 10, z: 10 })
    const b = makeCraft({ x: 10, z: 10 })
    const inputs: InputState[] = [FORWARD, { thrust: 1, strafe: 0, turn: 0.5, lookPitch: 0, jumpHeld: false }, { thrust: -1, strafe: 0, turn: -1, lookPitch: 0, jumpHeld: false }]

    for (let i = 0; i < 300; i++) {
      const input = inputs[i % inputs.length] ?? IDLE
      stepCraftPhysics(a, input, openMap, DT, false)
      stepCraftPhysics(b, input, openMap, DT, false)
    }

    expect(a).toEqual(b)
  })

  test('drag decays speed when coasting', () => {
    const craft = makeCraft({ x: 14, z: 18 }, { vel: { x: 0, z: -10 } })
    const before = craftSpeed(craft)
    for (let i = 0; i < 60; i++) {
      stepCraftPhysics(craft, IDLE, openMap, DT, false)
    }
    expect(craftSpeed(craft)).toBeLessThan(before * 0.7)
  })

  test('thrust accelerates along the heading (heading 0 = -z)', () => {
    const craft = makeCraft({ x: 14, z: 18 })
    for (let i = 0; i < 60; i++) {
      stepCraftPhysics(craft, FORWARD, openMap, DT, false)
    }
    expect(craft.pos.z).toBeLessThan(18)
    expect(Math.abs(craft.pos.x - 14)).toBeLessThan(0.001)
  })

  test('wall bounce reflects velocity with restitution', () => {
    const cellSize = openMap.cellSize
    const craft = makeCraft({ x: cellSize + craftRadiusFudge(), z: 2 * cellSize }, { vel: { x: -8, z: 0 } })
    const impact = resolveWallCollisions(craft, openMap)

    expect(impact).toBeGreaterThan(0)
    expect(craft.vel.x).toBeCloseTo(8 * WALL_RESTITUTION, 5)
    expect(craft.pos.x).toBeGreaterThanOrEqual(cellSize + craft.radius - 1e-6)
  })

  test('jump requires jump power and clears low walls but not high walls', () => {
    const jumper = makeCraft({ x: 14, z: 18 }, { hasJumpPower: true })
    const events = stepCraftPhysics(jumper, IDLE, openMap, DT, true)

    expect(events.some((event) => event.kind === 'jump')).toBe(true)
    expect(jumper.hasJumpPower).toBe(true)
    expect(jumper.airborne).toBe(true)

    let peak = 0
    for (let i = 0; i < 240 && jumper.airborne; i++) {
      stepCraftPhysics(jumper, IDLE, openMap, DT, false)
      peak = Math.max(peak, jumper.altitude)
    }
    expect(peak).toBeGreaterThan(openMap.lowWallHeight)
    expect(peak).toBeLessThan(openMap.highWallHeight)
    expect(jumper.airborne).toBe(false)
    expect(jumper.altitude).toBe(0)

    // Jump power is unlimited for the round: jumping again works immediately.
    const secondJump = stepCraftPhysics(jumper, IDLE, openMap, DT, true)
    expect(secondJump.some((event) => event.kind === 'jump')).toBe(true)
    expect(jumper.hasJumpPower).toBe(true)
    expect(jumper.airborne).toBe(true)

    const lowWallX = 4.5 * openMap.cellSize
    const belowLowWallZ = 4 * openMap.cellSize + 0.6
    const atPeak = makeCraft({ x: lowWallX, z: belowLowWallZ }, { altitude: openMap.lowWallHeight + 0.5, airborne: true, vel: { x: 0, z: -5 } })
    expect(resolveWallCollisions(atPeak, openMap)).toBe(0)

    const grounded = makeCraft({ x: lowWallX, z: belowLowWallZ }, { vel: { x: 0, z: -5 } })
    expect(resolveWallCollisions(grounded, openMap)).toBeGreaterThan(0)
  })

  test('jump without jump power does nothing even when pressed', () => {
    const craft = makeCraft({ x: 14, z: 18 })
    const events = stepCraftPhysics(craft, IDLE, openMap, DT, true)
    expect(events).toHaveLength(0)
    expect(craft.airborne).toBe(false)
    expect(craft.hasJumpPower).toBe(false)
  })

  test('craft-craft collision conserves momentum and separates', () => {
    const a = makeCraft({ x: 10, z: 10 }, { vel: { x: 5, z: 0 } })
    const b = makeCraft({ x: 11, z: 10 }, { vel: { x: -5, z: 0 } })
    const momentumBefore = a.vel.x + b.vel.x

    const impact = resolveCraftCollision(a, b)

    expect(impact).toBeGreaterThan(0)
    expect(a.vel.x + b.vel.x).toBeCloseTo(momentumBefore, 5)
    expect(a.vel.x).toBeLessThan(0)
    expect(b.vel.x).toBeGreaterThan(0)
    const dist = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)
    expect(dist).toBeGreaterThanOrEqual(a.radius + b.radius - 1e-6)
  })

  test('a craft jumping over the other does not collide', () => {
    const jumper = makeCraft({ x: 10, z: 10 }, { vel: { x: 5, z: 0 }, altitude: 2.2, airborne: true })
    const grounded = makeCraft({ x: 11, z: 10 }, { vel: { x: -5, z: 0 } })

    expect(resolveCraftCollision(jumper, grounded)).toBe(0)
    expect(jumper.vel.x).toBe(5)
    expect(grounded.vel.x).toBe(-5)
  })

  test('per-map lateralGrip override keeps more sideways slide', () => {
    const slippery = tweakedMap({ lateralGrip: 0.2 })
    const onIce = makeCraft({ x: 3 * slippery.cellSize, z: 3 * slippery.cellSize }, { vel: { x: 6, z: 0 } })
    const onDefault = makeCraft({ x: 3 * openMap.cellSize, z: 3 * openMap.cellSize }, { vel: { x: 6, z: 0 } })

    for (let i = 0; i < 60; i++) {
      stepCraftPhysics(onIce, IDLE, slippery, DT, false)
      stepCraftPhysics(onDefault, IDLE, openMap, DT, false)
    }

    expect(onIce.vel.x).toBeGreaterThan(onDefault.vel.x * 1.5)
  })

  test('per-map wallRestitution override changes bounce energy', () => {
    const soft = tweakedMap({ wallRestitution: 0.3 })
    const cellSize = soft.cellSize
    const craft = makeCraft({ x: cellSize + craftRadiusFudge(), z: 2 * cellSize }, { vel: { x: -8, z: 0 } })

    expect(resolveWallCollisions(craft, soft)).toBeGreaterThan(0)
    expect(craft.vel.x).toBeCloseTo(8 * 0.3, 5)
  })

  test('normalizeAngle wraps into (-π, π]', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10)
    expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 10)
    expect(normalizeAngle(0.5)).toBeCloseTo(0.5, 10)
  })

  test('jump arc peak matches v²/2g ballistics', () => {
    const craft = makeCraft({ x: 14, z: 18 }, { hasJumpPower: true })
    stepCraftPhysics(craft, IDLE, openMap, DT, true)
    let peak = 0
    for (let i = 0; i < 240 && craft.airborne; i++) {
      stepCraftPhysics(craft, IDLE, openMap, DT, false)
      peak = Math.max(peak, craft.altitude)
    }
    const expected = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * 34)
    expect(peak).toBeGreaterThan(expected * 0.9)
    expect(peak).toBeLessThan(expected * 1.1)
  })
})

function craftRadiusFudge(): number {
  return makeCraft({ x: 0, z: 0 }).radius * 0.6
}

function tweakedMap(physics: NonNullable<MapDef['physics']>): MapDef {
  return createMapDef({
    id: 'castle',
    rows: [
      '#########',
      '#P.....E#',
      '#.......#',
      '#...-...#',
      '#.......#',
      '#.......#',
      '#########',
    ],
    theme: testTheme,
    physics,
  })
}
