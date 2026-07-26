import * as CANNON from 'cannon-es'
import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { createHintPositionReporter } from '../_shared/hintPositionReporter'
import type { SceneProps } from './gameTypes'
import { blockId, type PlatformDef } from './levels/levelTypes'
import { type BarrelTipLaunch, type CannonAimAngles, cannonAimAngles, intersectAimPlane, type RimObstacle, solveRimClearingLaunch, trajectoryPositionAt, type Vec3Like } from './scene/aiming'
import { createBallMesh } from './scene/builders/ballMesh'
import { createBlockMesh } from './scene/builders/blockMesh'
import { type CannonMesh, createCannonMesh, setCannonAim } from './scene/builders/cannonMesh'
import { createEnvironment } from './scene/builders/environment'
import { createPlatformMesh } from './scene/builders/platformMesh'
import { cameraDollyPosition, createCamera, updateCameraAspect } from './scene/cameraRig'
import { type ConfettiBurst, createConfettiBurst, disposeConfettiBurst, updateConfettiBurst } from './scene/effects/confetti'
import { createHitPuff, disposeHitPuff, type HitPuff, updateHitPuff } from './scene/effects/hitPuff'
import { buildLevelWorld, type LevelBlockBody, type LevelWorld, platformAngularVelocity } from './scene/physics/levelWorld'
import {
  carrierRelativeSpeeds,
  createSettleState,
  diffNewClearedIds,
  isBodyQuiet,
  type RelativeSpeeds,
  shouldRemoveBall,
  updateSettleState,
} from './scene/physics/simulation'
import {
  BALL_MASS,
  BALL_RADIUS,
  BALL_SPEED,
  CAMERA_DOLLY_DURATION_S,
  CAMERA_TARGET,
  CANNON_BARREL_LENGTH,
  CANNON_MUZZLE_POSITION,
  CANNON_PIVOT_HEIGHT,
  CANNON_RECOIL_DEPTH,
  CANNON_RECOIL_DURATION_S,
  CLEARED_BLOCK_FADE_S,
  FIRE_COOLDOWN_S,
  GHOST_ARC_POINT_COUNT,
  GRAVITY_Y,
  HIT_PUFF_DURATION_S,
  MUZZLE_PUFF_DURATION_S,
  PHYSICS_MAX_SUBSTEPS,
  PHYSICS_TIMESTEP,
  RETICLE_RADIUS,
  SHADOW_MAP_SIZE,
} from './scene/sceneConstants'
import { clearGroup, disposeObject } from './scene/threeUtils'
import { canvasSizeForContainer, pointerNdcForRect } from './scene/viewport'

/** The barrel swings around this point; the actual launch origin is the tip, solved per aim. */
const PIVOT: Vec3Like = {
  x: CANNON_MUZZLE_POSITION[0],
  y: CANNON_PIVOT_HEIGHT,
  z: CANNON_MUZZLE_POSITION[2],
}
const MAX_FRAME_DT_S = PHYSICS_TIMESTEP * PHYSICS_MAX_SUBSTEPS

interface BlockEntry {
  levelBlock: LevelBlockBody
  mesh: THREE.Mesh
  material: THREE.MeshLambertMaterial
  clearedAt: number | null
}

function copyBodyTransform(mesh: THREE.Object3D, body: CANNON.Body): void {
  mesh.position.set(body.position.x, body.position.y, body.position.z)
  mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
}

/** Coarse check that a block is still being carried by (on top of) its rotating platform. */
function isRidingPlatform(body: CANNON.Body, def: PlatformDef): boolean {
  if (body.position.y < def.topY - 0.3) {
    return false
  }
  const dx = body.position.x - def.center[0]
  const dz = body.position.z - def.center[1]
  const reach = (def.shape === 'round' ? def.radius : def.radius * Math.SQRT2) + 0.5
  return (dx * dx) + (dz * dz) <= reach * reach
}

interface BallEntry {
  mesh: THREE.Mesh
  body: CANNON.Body
  firedAt: number
  lastImpactAt: number
}

/**
 * Owns the three.js renderer + cannon-es simulation for a single Block Blaster level. Implements
 * SceneProps exactly (see gameTypes.ts): the parent owns balls/status/progress, this component
 * owns physics + rendering and reports events back up. Remounting (React `key`) restarts the level.
 */
export function BlockBlasterScene({
  level,
  status,
  hintVisible,
  onShotFired,
  onBlocksCleared,
  onWin,
  onLose,
  onHintPosition,
}: SceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const levelRef = useRef(level)
  const statusRef = useRef(status)
  const hintVisibleRef = useRef(hintVisible)
  const onShotFiredRef = useRef(onShotFired)
  const onBlocksClearedRef = useRef(onBlocksCleared)
  const onWinRef = useRef(onWin)
  const onLoseRef = useRef(onLose)
  const onHintPositionRef = useRef(onHintPosition)

  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { hintVisibleRef.current = hintVisible }, [hintVisible])
  useEffect(() => { onShotFiredRef.current = onShotFired }, [onShotFired])
  useEffect(() => { onBlocksClearedRef.current = onBlocksCleared }, [onBlocksCleared])
  useEffect(() => { onWinRef.current = onWin }, [onWin])
  useEffect(() => { onLoseRef.current = onLose }, [onLose])
  useEffect(() => { onHintPositionRef.current = onHintPosition }, [onHintPosition])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const level = levelRef.current
    const aimPlaneZ = level.platforms[0]?.center[1] ?? 0
    const hintId = level.hint ? blockId(level.hint.platform, level.hint.block) : null

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8fd3ff)

    const camera = createCamera(1)
    const cameraElapsed = { value: 0 }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x6ab04c, 1.4)
    scene.add(hemisphere)

    const sun = new THREE.DirectionalLight(0xfff3d6, 1.8)
    sun.position.set(5, 10, 6)
    sun.target.position.set(0, 1.5, 0)
    sun.castShadow = true
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
    sun.shadow.camera.left = -7
    sun.shadow.camera.right = 7
    sun.shadow.camera.top = 7
    sun.shadow.camera.bottom = -3
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 24
    scene.add(sun)
    scene.add(sun.target)

    const environmentGroup = createEnvironment()
    scene.add(environmentGroup)

    const dynamicGroup = new THREE.Group()
    scene.add(dynamicGroup)

    const ballGroup = new THREE.Group()
    scene.add(ballGroup)

    const effectGroup = new THREE.Group()
    scene.add(effectGroup)

    const levelWorld: LevelWorld = buildLevelWorld(level)

    const platformSlabs: { slab: THREE.Object3D, body: CANNON.Body }[] = []
    levelWorld.platforms.forEach((platform) => {
      const platformMesh = createPlatformMesh(platform.def)
      dynamicGroup.add(platformMesh.group)
      platformSlabs.push({ slab: platformMesh.slab, body: platform.body })
    })

    const blockEntries = new Map<string, BlockEntry>()
    const blockBodyIndex = new Map<CANNON.Body, string>()
    for (const levelBlock of levelWorld.blocks) {
      const mesh = createBlockMesh(levelBlock.type)
      copyBodyTransform(mesh, levelBlock.body)
      dynamicGroup.add(mesh)
      blockEntries.set(levelBlock.id, {
        levelBlock,
        mesh,
        material: mesh.material as THREE.MeshLambertMaterial,
        clearedAt: null,
      })
      blockBodyIndex.set(levelBlock.body, levelBlock.id)
    }

    const cannonMesh: CannonMesh = createCannonMesh()
    cannonMesh.group.position.set(CANNON_MUZZLE_POSITION[0], 0, CANNON_MUZZLE_POSITION[2])
    scene.add(cannonMesh.group)

    const reticleGeometry = new THREE.RingGeometry(RETICLE_RADIUS * 0.65, RETICLE_RADIUS, 24)
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial)
    effectGroup.add(reticle)

    const ghostArcPositions = new Float32Array(GHOST_ARC_POINT_COUNT * 3)
    const ghostArcAttribute = new THREE.BufferAttribute(ghostArcPositions, 3)
    const ghostArcGeometry = new THREE.BufferGeometry()
    ghostArcGeometry.setAttribute('position', ghostArcAttribute)
    const ghostArcMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false })
    const ghostArc = new THREE.Points(ghostArcGeometry, ghostArcMaterial)
    ghostArc.visible = false
    effectGroup.add(ghostArc)

    const activeBalls: BallEntry[] = []
    const ballPool: BallEntry[] = []
    const currentFrameNow = { value: 0 }
    const recoilAmount = { value: 0 }
    const lastFireAt = { value: -Infinity }
    const aimPoint: Vec3Like = { x: 0, y: level.platforms[0]?.topY ?? 2, z: aimPlaneZ }
    // Win and lose are mutually exclusive latches: whichever fires first ends the level.
    const endState = { value: '' as '' | 'won' | 'lost' }
    // Synchronous shot budget — the ballsRemaining prop round-trips through React state and can
    // lag a frame behind, so the fire guard and settle detection use this counter instead.
    const shotsFired = { value: 0 }
    const settleState = createSettleState()
    const knownClearedIds = new Set<string>()
    const hintPositionReporter = createHintPositionReporter()
    const confettiBursts: ConfettiBurst[] = []
    const hitPuffs: HitPuff[] = []
    const cameraSettled = { value: false }
    // Rim obstacles for the aim assist: the near edge of every platform tabletop.
    const rims: RimObstacle[] = level.platforms.map((platformDef) => ({
      z: platformDef.center[1] + platformDef.radius,
      topY: platformDef.topY,
      centerX: platformDef.center[0],
      halfWidth: platformDef.radius,
    }))
    const rimClearance = BALL_RADIUS + 0.05
    // Aim ballistics are only re-solved when the aim point actually moves.
    const aimDirty = { value: true }
    let cachedAim: { launch: BarrelTipLaunch, angles: CannonAimAngles } | null = null
    const ensureAim = (): { launch: BarrelTipLaunch, angles: CannonAimAngles } => {
      if (aimDirty.value || cachedAim === null) {
        const launch = solveRimClearingLaunch(PIVOT, CANNON_BARREL_LENGTH, aimPoint, BALL_SPEED, GRAVITY_Y, rims, rimClearance)
        cachedAim = { launch, angles: cannonAimAngles(launch.solution.velocity) }
        aimDirty.value = false
      }
      return cachedAim
    }
    // Ghost-arc target cache: the trajectory VBO is only rebuilt when the hint block moves.
    const lastArcTarget: Vec3Like = { x: Number.NaN, y: Number.NaN, z: Number.NaN }
    const platformOmegas: number[] = level.platforms.map(() => 0)
    const relativeSpeeds: RelativeSpeeds = { linearSpeed: 0, angularSpeed: 0 }
    const settleParams = {
      ballsRemaining: 0,
      liveBallCount: 0,
      remainingBlockCount: 0,
      allBlocksQuiet: false,
      blockClearedThisFrame: false,
      dt: 0,
    }

    function handleBallCollide(entry: BallEntry, otherBody: CANNON.Body): void {
      if (!blockBodyIndex.has(otherBody)) {
        return
      }
      const now = currentFrameNow.value
      if (now - entry.lastImpactAt < 0.12) {
        return
      }
      entry.lastImpactAt = now
      const puff = createHitPuff(entry.mesh.position.clone(), 0xf5f0e6, HIT_PUFF_DURATION_S, now)
      effectGroup.add(puff.group)
      hitPuffs.push(puff)
    }

    function acquireBall(now: number, position: Vec3Like, velocity: Vec3Like): BallEntry {
      let entry = ballPool.pop()
      if (!entry) {
        const mesh = createBallMesh()
        const body = new CANNON.Body({
          mass: BALL_MASS,
          shape: new CANNON.Sphere(BALL_RADIUS),
          material: levelWorld.handles.materials.ball,
        })
        body.allowSleep = true
        const newEntry: BallEntry = { mesh, body, firedAt: now, lastImpactAt: 0 }
        const onCollide = (event: { body: CANNON.Body }): void => handleBallCollide(newEntry, event.body)
        // cannon-es Body#addEventListener is the physics engine's own event bus, not a Web API —
        // this listener lives as long as the pooled ball body itself (dropped when the body/world
        // are discarded at unmount) rather than needing a per-effect removeEventListener.
        // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener
        body.addEventListener('collide', onCollide)
        entry = newEntry
      }

      entry.body.position.set(position.x, position.y, position.z)
      entry.body.velocity.set(velocity.x, velocity.y, velocity.z)
      entry.body.angularVelocity.set(0, 0, 0)
      entry.body.force.set(0, 0, 0)
      entry.body.torque.set(0, 0, 0)
      entry.body.quaternion.set(0, 0, 0, 1)
      entry.body.wakeUp()
      entry.firedAt = now
      entry.lastImpactAt = 0
      entry.mesh.position.set(position.x, position.y, position.z)
      levelWorld.handles.world.addBody(entry.body)
      ballGroup.add(entry.mesh)
      activeBalls.push(entry)

      return entry
    }

    function releaseBall(entry: BallEntry): void {
      levelWorld.handles.world.removeBody(entry.body)
      ballGroup.remove(entry.mesh)
      ballPool.push(entry)
    }

    function fireBall(now: number): void {
      const { origin, solution } = ensureAim().launch
      acquireBall(now, origin, solution.velocity)
      shotsFired.value += 1
      lastFireAt.value = now
      recoilAmount.value = 1
      const muzzlePuff = createHitPuff(new THREE.Vector3(origin.x, origin.y, origin.z), 0xffe08a, MUZZLE_PUFF_DURATION_S, now)
      effectGroup.add(muzzlePuff.group)
      hitPuffs.push(muzzlePuff)
      onShotFiredRef.current()
    }

    const raycaster = new THREE.Raycaster()
    const pointerNdc = new THREE.Vector2()
    let canvasRect = renderer.domElement.getBoundingClientRect()

    function updateAimFromPointer(clientX: number, clientY: number): void {
      const ndc = pointerNdcForRect(clientX, clientY, canvasRect)
      if (!ndc) {
        return
      }
      pointerNdc.set(ndc.x, ndc.y)
      raycaster.setFromCamera(pointerNdc, camera)
      const hit = intersectAimPlane(raycaster.ray.origin, raycaster.ray.direction, aimPlaneZ)
      if (hit) {
        aimPoint.x = hit.x
        aimPoint.y = hit.y
        aimPoint.z = hit.z
        aimDirty.value = true
      }
    }

    function handlePointerMove(event: PointerEvent): void {
      if (statusRef.current !== 'playing') {
        return
      }
      updateAimFromPointer(event.clientX, event.clientY)
    }

    function handlePointerDown(event: PointerEvent): void {
      if (statusRef.current !== 'playing') {
        return
      }
      updateAimFromPointer(event.clientX, event.clientY)
    }

    function handlePointerUp(event: PointerEvent): void {
      if (statusRef.current !== 'playing') {
        return
      }
      updateAimFromPointer(event.clientX, event.clientY)
      const now = performance.now() / 1000
      if (shotsFired.value < levelRef.current.balls && now - lastFireAt.value >= FIRE_COOLDOWN_S) {
        fireBall(now)
      }
    }

    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)

    const canvasSize = { width: 0, height: 0 }
    const resize = (): void => {
      const { width, height } = canvasSizeForContainer(container.clientWidth, container.clientHeight)
      renderer.setSize(width, height)
      updateCameraAspect(camera, width, height)
      canvasSize.width = width
      canvasSize.height = height
      canvasRect = renderer.domElement.getBoundingClientRect()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    let frameId = 0
    let lastTimestamp: number | null = null

    const animate = (timestamp: number): void => {
      if (lastTimestamp === null) {
        lastTimestamp = timestamp
      }
      const dt = Math.min(MAX_FRAME_DT_S, Math.max(0, (timestamp - lastTimestamp) / 1000))
      lastTimestamp = timestamp
      const now = performance.now() / 1000
      currentFrameNow.value = now

      if (!cameraSettled.value) {
        cameraElapsed.value += dt
        camera.position.copy(cameraDollyPosition(cameraElapsed.value))
        camera.lookAt(...CAMERA_TARGET)
        cameraSettled.value = cameraElapsed.value >= CAMERA_DOLLY_DURATION_S
      }

      levelWorld.step(dt)
      // knownClearedIds always mirrors levelWorld.clearedBlockIds as of the end of the previous
      // frame (ids are only ever added, never removed), so it doubles as "previous" for the diff
      // without needing a fresh Set allocation every frame.
      const newlyClearedIds = levelWorld.clearedBlockIds.size === knownClearedIds.size
        ? []
        : diffNewClearedIds(knownClearedIds, levelWorld.clearedBlockIds)
      for (const id of newlyClearedIds) {
        knownClearedIds.add(id)
        const entry = blockEntries.get(id)
        if (entry) {
          entry.clearedAt = now
        }
      }
      if (newlyClearedIds.length > 0) {
        onBlocksClearedRef.current(levelWorld.clearedBlockIds.size, levelWorld.blocks.length)
      }

      if (endState.value === '' && levelWorld.blocks.length > 0 && levelWorld.clearedBlockIds.size === levelWorld.blocks.length) {
        endState.value = 'won'
        const centerX = level.platforms.reduce((sum, p) => sum + p.center[0], 0) / level.platforms.length
        const centerZ = level.platforms.reduce((sum, p) => sum + p.center[1], 0) / level.platforms.length
        const topY = level.platforms[0]?.topY ?? 2
        const burst = createConfettiBurst(new THREE.Vector3(centerX, topY + 1, centerZ), now)
        effectGroup.add(burst.group)
        confettiBursts.push(burst)
        onWinRef.current()
      }

      for (let i = 0; i < levelWorld.platforms.length; i += 1) {
        const platform = levelWorld.platforms[i]
        platformOmegas[i] = platform?.def.rotation ? platformAngularVelocity(platform.def, levelWorld.elapsed) : 0
      }

      let allBlocksQuiet = true
      for (const [id, entry] of blockEntries) {
        if (entry.clearedAt !== null) {
          const elapsed = now - entry.clearedAt
          if (elapsed >= CLEARED_BLOCK_FADE_S) {
            dynamicGroup.remove(entry.mesh)
            disposeObject(entry.mesh)
            levelWorld.handles.world.removeBody(entry.levelBlock.body)
            blockBodyIndex.delete(entry.levelBlock.body)
            blockEntries.delete(id)
            continue
          }
          entry.material.opacity = Math.max(0, 1 - (elapsed / CLEARED_BLOCK_FADE_S))
          copyBodyTransform(entry.mesh, entry.levelBlock.body)
          continue
        }

        copyBodyTransform(entry.mesh, entry.levelBlock.body)
        const body = entry.levelBlock.body
        const omega = platformOmegas[entry.levelBlock.platformIndex] ?? 0
        const carrier = omega !== 0 ? levelWorld.platforms[entry.levelBlock.platformIndex] : undefined
        // Blocks riding a rotating platform are judged in the platform's rotating frame —
        // in world coordinates they are never quiet, which made rotating levels wait out the
        // full settle timeout on every loss.
        if (carrier && isRidingPlatform(body, carrier.def)) {
          carrierRelativeSpeeds({
            positionX: body.position.x,
            positionZ: body.position.z,
            velocityX: body.velocity.x,
            velocityY: body.velocity.y,
            velocityZ: body.velocity.z,
            angularVelocityX: body.angularVelocity.x,
            angularVelocityY: body.angularVelocity.y,
            angularVelocityZ: body.angularVelocity.z,
            carrierAngularVelocityY: omega,
            carrierCenterX: carrier.def.center[0],
            carrierCenterZ: carrier.def.center[1],
          }, relativeSpeeds)
          if (!isBodyQuiet(relativeSpeeds.linearSpeed, relativeSpeeds.angularSpeed)) {
            allBlocksQuiet = false
          }
        } else if (!isBodyQuiet(body.velocity.length(), body.angularVelocity.length())) {
          allBlocksQuiet = false
        }
      }

      for (const platform of platformSlabs) {
        platform.slab.quaternion.set(platform.body.quaternion.x, platform.body.quaternion.y, platform.body.quaternion.z, platform.body.quaternion.w)
      }

      for (let i = activeBalls.length - 1; i >= 0; i -= 1) {
        const ball = activeBalls[i]
        if (!ball) {
          continue
        }
        copyBodyTransform(ball.mesh, ball.body)
        const age = now - ball.firedAt
        const remove = shouldRemoveBall({
          y: ball.body.position.y,
          isSleeping: ball.body.sleepState === CANNON.Body.SLEEPING,
          age,
        })
        if (remove) {
          activeBalls.splice(i, 1)
          releaseBall(ball)
        }
      }

      if (endState.value === '') {
        settleParams.ballsRemaining = levelRef.current.balls - shotsFired.value
        settleParams.liveBallCount = activeBalls.length
        settleParams.remainingBlockCount = levelWorld.blocks.length - levelWorld.clearedBlockIds.size
        settleParams.allBlocksQuiet = allBlocksQuiet
        settleParams.blockClearedThisFrame = newlyClearedIds.length > 0
        settleParams.dt = dt
        if (updateSettleState(settleState, settleParams)) {
          endState.value = 'lost'
          onLoseRef.current()
        }
      }

      recoilAmount.value = Math.max(0, recoilAmount.value - (dt / CANNON_RECOIL_DURATION_S))
      cannonMesh.barrel.position.z = recoilAmount.value * CANNON_RECOIL_DEPTH

      const aim = ensureAim()
      setCannonAim(cannonMesh, aim.angles.yaw, aim.angles.pitch)
      reticle.position.set(aimPoint.x, aimPoint.y, aimPoint.z)
      reticle.visible = statusRef.current === 'playing'

      const hintEntry = hintId ? blockEntries.get(hintId) : undefined
      const showHint = hintVisibleRef.current && !!hintEntry
      if (showHint && hintEntry) {
        hintPositionReporter.report({
          camera,
          height: canvasSize.height,
          onChange: onHintPositionRef.current,
          width: canvasSize.width,
          worldPosition: hintEntry.mesh.position,
        })

        const target = hintEntry.mesh.position
        const targetMoved = Math.abs(target.x - lastArcTarget.x) + Math.abs(target.y - lastArcTarget.y) + Math.abs(target.z - lastArcTarget.z) > 1e-4
        if (targetMoved || !ghostArc.visible) {
          lastArcTarget.x = target.x
          lastArcTarget.y = target.y
          lastArcTarget.z = target.z
          const hintLaunch = solveRimClearingLaunch(PIVOT, CANNON_BARREL_LENGTH, lastArcTarget, BALL_SPEED, GRAVITY_Y, rims, rimClearance)
          for (let i = 0; i < GHOST_ARC_POINT_COUNT; i += 1) {
            const t = (i / (GHOST_ARC_POINT_COUNT - 1)) * hintLaunch.solution.timeOfFlight
            const point = trajectoryPositionAt(hintLaunch.origin, hintLaunch.solution.velocity, GRAVITY_Y, t)
            ghostArcPositions[(i * 3)] = point.x
            ghostArcPositions[(i * 3) + 1] = point.y
            ghostArcPositions[(i * 3) + 2] = point.z
          }
          ghostArcAttribute.needsUpdate = true
        }
        ghostArc.visible = true
      } else {
        hintPositionReporter.report({
          camera,
          height: canvasSize.height,
          onChange: onHintPositionRef.current,
          width: canvasSize.width,
          worldPosition: null,
        })
        ghostArc.visible = false
      }

      for (let i = confettiBursts.length - 1; i >= 0; i -= 1) {
        const burst = confettiBursts[i]
        if (!burst) {
          continue
        }
        const done = updateConfettiBurst(burst, now, GRAVITY_Y, dt)
        if (done) {
          effectGroup.remove(burst.group)
          disposeConfettiBurst(burst)
          confettiBursts.splice(i, 1)
        }
      }

      for (let i = hitPuffs.length - 1; i >= 0; i -= 1) {
        const puff = hitPuffs[i]
        if (!puff) {
          continue
        }
        const done = updateHitPuff(puff, now, dt)
        if (done) {
          effectGroup.remove(puff.group)
          disposeHitPuff(puff)
          hitPuffs.splice(i, 1)
        }
      }

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }
    frameId = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)

      for (const ball of activeBalls) {
        levelWorld.handles.world.removeBody(ball.body)
        disposeObject(ball.mesh)
      }
      for (const entry of ballPool) {
        disposeObject(entry.mesh)
      }
      for (const burst of confettiBursts) {
        disposeConfettiBurst(burst)
      }
      for (const puff of hitPuffs) {
        disposeHitPuff(puff)
      }

      clearGroup(environmentGroup)
      clearGroup(dynamicGroup)
      clearGroup(ballGroup)
      clearGroup(effectGroup)
      disposeObject(cannonMesh.group)
      scene.remove(environmentGroup, dynamicGroup, ballGroup, effectGroup, cannonMesh.group, sun, sun.target, hemisphere)

      renderer.dispose()
      renderer.domElement.remove()
    }
    // Mount-only: level/status/balls/hint/callbacks are read via refs above so this effect never
    // needs to re-run (remounting the whole component via React `key` restarts the level).
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-full w-full touch-none select-none overflow-hidden bg-sky-300"
      data-testid="block-blaster-scene"
    />
  )
}
