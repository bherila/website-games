import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import { createHintPositionReporter } from '../_shared/hintPositionReporter'
import type { TapHintPosition } from '../_shared/TapHint'
import {
  type GameState,
  type GridPosition,
  isBoxDisplayedAsHidden,
  isBoxOpenable,
  type MarbleColor,
  SORTING_BLOCK_CAPACITY,
  type SortingStack,
} from './gameEngine'
import {
  type BoxBurst,
  createBoxBurst,
  disposeBoxBurst,
  updateBoxBurst,
} from './scene/animation/boxBurst'
import {
  type BoxPopTween,
  createBoxPopTween,
  updateBoxPopTween,
} from './scene/animation/boxPop'
import {
  type ConfettiBurst,
  createConfettiBurst,
  disposeConfettiBurst,
  updateConfettiBurst,
} from './scene/animation/confetti'
import { animateConveyorBeltMarkers } from './scene/animation/conveyor'
import {
  createSlotDropTween,
  type SlotDropTween,
  updateSlotDropTween,
} from './scene/animation/slotDrop'
import {
  createStackRiseTween,
  type StackRiseTween,
  updateStackRiseTween,
} from './scene/animation/sortingStack'
import { shouldReportArrival } from './scene/arrivalGate'
import { createBoxMesh } from './scene/builders/boxMesh'
import { createChuteMesh } from './scene/builders/chuteMesh'
import { type CloudField, createCloudField, updateCloudField } from './scene/builders/clouds'
import { createConveyorBeltMarkers, createConveyorTrack } from './scene/builders/conveyorTrack'
import { createMarbleMesh } from './scene/builders/marbleMesh'
import { createBoardSurface, createPlayfield } from './scene/builders/playfield'
import { createSortingStackMesh } from './scene/builders/sortingBlockMesh'
import {
  conveyorPhaseForTick,
  conveyorProgressSpeedForSlotCount,
  conveyorSlotProgress,
  sortingStackDropProgress,
} from './scene/conveyorProgress'
import { slotProgressDistance } from './scene/conveyorSlots'
import { createPhysicsDebugOverlay, physicsDebugOverlayEnabled } from './scene/physics/debugOverlay'
import {
  createMarbleBodyManager,
  type MarbleBodyManager,
} from './scene/physics/marbleBodies'
import {
  createPhysicsWorld,
  disposePhysicsWorld,
  type PhysicsWorld,
  stepPhysics,
} from './scene/physics/world'
import {
  BOARD_TILT_PIVOT_Z,
  BOARD_TILT_RADIANS,
  DECK_TOP_Y,
  SKY_FOG_COLOR,
  SKY_HORIZON_COLOR,
  SKY_TOP_COLOR,
} from './scene/sceneConstants'
import { computeChuteRefillEvents, computeOpenedBoxEvents } from './scene/sceneEvents'
import { chutePosition, conveyorPositionAt, gridCellPosition } from './scene/sceneGeometry'
import type { BeltMarkerRenderItem } from './scene/sceneTypes'
import { clearGroup, createCanvasTexture, disposeObject, findBoxId } from './scene/threeUtils'

interface MarbleSortSceneProps {
  colorblindMode: boolean
  hintCell?: GridPosition | null
  state: GameState
  onBoxClick: (boxId: string) => void
  onHintPosition?: (position: TapHintPosition | null) => void
  onMarbleArrived: (marbleId: string) => void
}

type MarblePhase = 'falling' | 'transit' | 'conveyor' | 'slotDrop'

interface MarbleEntry {
  mesh: THREE.Group
  phase: MarblePhase
  color: MarbleColor
}

interface TransitData {
  startedAt: number
  duration: number
  from: THREE.Vector3
}

const TRANSIT_DURATION = 0.22

export function MarbleSortScene({
  colorblindMode,
  hintCell = null,
  state,
  onBoxClick,
  onHintPosition,
  onMarbleArrived,
}: MarbleSortSceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const staticGroupRef = useRef<THREE.Group | null>(null)
  const dynamicGroupRef = useRef<THREE.Group | null>(null)
  const marbleGroupRef = useRef<THREE.Group | null>(null)
  const effectGroupRef = useRef<THREE.Group | null>(null)
  const boardGroupRef = useRef<THREE.Group | null>(null)
  const boardDynamicGroupRef = useRef<THREE.Group | null>(null)
  const boardMarbleGroupRef = useRef<THREE.Group | null>(null)
  const boardEffectGroupRef = useRef<THREE.Group | null>(null)
  const beltMarkersRef = useRef<BeltMarkerRenderItem[]>([])
  const beltMarkerGroupRef = useRef<THREE.Group | null>(null)
  const beltMarkerCapacityRef = useRef(0)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const bodiesRef = useRef<MarbleBodyManager | null>(null)
  const marbleEntriesRef = useRef<Map<string, MarbleEntry>>(new Map())
  const transitRef = useRef<Map<string, TransitData>>(new Map())
  const marbleSlotByIdRef = useRef<Map<string, number>>(new Map())
  const conveyorCapacityRef = useRef(1)
  const onBoxClickRef = useRef(onBoxClick)
  const onMarbleArrivedRef = useRef(onMarbleArrived)
  const hintCellRef = useRef(hintCell)
  const onHintPositionRef = useRef(onHintPosition)
  const arrivedAttemptsRef = useRef<Map<string, number>>(new Map())
  const fallingIdsRef = useRef<Set<string>>(new Set())
  const stateRef = useRef(state)
  const previousStateRef = useRef<GameState | null>(null)
  const previousColorblindModeRef = useRef(colorblindMode)
  // Phase is anchored on (conveyorTicks, conveyorCapacity) and advances linearly
  // with wall-clock time between state updates. This guarantees one source of
  // truth: belt markers, marbles, and matching all derive from the same phase.
  const phaseBaseRef = useRef(0)
  const phaseBaseTimeRef = useRef(0)
  const confettiBurstsRef = useRef<ConfettiBurst[]>([])
  const cloudFieldRef = useRef<CloudField | null>(null)
  const boxBurstsRef = useRef<BoxBurst[]>([])
  const stackTweensRef = useRef<StackRiseTween[]>([])
  const boxPopTweensRef = useRef<BoxPopTween[]>([])
  const stackGroupsRef = useRef<Map<string, THREE.Group>>(new Map())
  const slotDropTweensRef = useRef<Map<string, SlotDropTween>>(new Map())

  const syncMarbles = (
    nextState: GameState,
    previousState: GameState | null,
    marbleGroup: THREE.Group,
    bodies: MarbleBodyManager,
    now: number,
  ): void => {
    const entries = marbleEntriesRef.current
    const fallingIds = new Set(nextState.fallingMarbles.map((marble) => marble.id))
    fallingIdsRef.current = fallingIds
    const conveyorIds = new Set(nextState.conveyor.map((marble) => marble.id))

    const slotsById = marbleSlotByIdRef.current
    slotsById.clear()
    for (const marble of nextState.conveyor) {
      slotsById.set(marble.id, marble.slotIndex)
    }

    const ticksChanged = !previousState
      || previousState.conveyorTicks !== nextState.conveyorTicks
      || previousState.conveyorCapacity !== nextState.conveyorCapacity
    if (ticksChanged) {
      phaseBaseRef.current = conveyorPhaseForTick(nextState.conveyorTicks, nextState.conveyorCapacity)
      phaseBaseTimeRef.current = now
    }
    conveyorCapacityRef.current = Math.max(1, nextState.conveyorCapacity)

    if (beltMarkerCapacityRef.current !== conveyorCapacityRef.current && staticGroupRef.current) {
      const oldGroup = beltMarkerGroupRef.current
      if (oldGroup) {
        staticGroupRef.current.remove(oldGroup)
        disposeObject(oldGroup)
      }
      const rebuilt = createConveyorBeltMarkers(conveyorCapacityRef.current)
      staticGroupRef.current.add(rebuilt.group)
      beltMarkersRef.current = rebuilt.markers
      beltMarkerGroupRef.current = rebuilt.group
      beltMarkerCapacityRef.current = conveyorCapacityRef.current
    }

    const sortTargets = collectSortTargets(previousState, nextState)
    const livePhase = currentConveyorPhase(now)
    const liveCapacity = conveyorCapacityRef.current
    const stackCount = nextState.sortingStacks.length

    for (const [id, entry] of Array.from(entries.entries())) {
      if (entry.phase === 'slotDrop') {
        continue
      }
      if (fallingIds.has(id)) {
        continue
      }
      if (conveyorIds.has(id)) {
        if (entry.phase === 'falling') {
          const body = bodies.get(id)
          const from = body
            ? new THREE.Vector3(body.position.x, body.position.y, body.position.z)
            : entry.mesh.position.clone()
          // Falling marbles render in tilted board space; the conveyor lives
          // in flat space. Convert the handoff point and reparent the mesh so
          // the transit tween runs in flat world coordinates.
          boardGroupRef.current?.localToWorld(from)
          entry.mesh.parent?.remove(entry.mesh)
          marbleGroup.add(entry.mesh)
          entry.mesh.position.copy(from)
          transitRef.current.set(id, {
            startedAt: now,
            duration: TRANSIT_DURATION,
            from,
          })
          entry.phase = 'transit'
          bodies.release(id)
        }
        continue
      }
      const queue = sortTargets.get(entry.color)
      const targetStackId = queue && queue.length > 0 ? queue.shift() : undefined
      if (targetStackId) {
        const stackGroup = stackGroupsRef.current.get(targetStackId)
        const targetStack = nextState.sortingStacks.find((stack) => stack.id === targetStackId)
        if (stackGroup && targetStack) {
          // Drop tween starts from the marble's current rendered position. If
          // the slot is inside the stack's drop window we trust the engine's
          // matching decision; otherwise we still start from the current pose
          // rather than teleporting to a canonical position. This preserves
          // continuity of motion through the sort.
          const previousSlotIndex = previousState?.conveyor.find((marble) => marble.id === id)?.slotIndex
          if (previousSlotIndex !== undefined) {
            const distance = slotProgressDistance(
              livePhase,
              liveCapacity,
              previousSlotIndex,
              sortingStackDropProgress(targetStack.index, stackCount),
            )
            if (distance > 0.5 / Math.max(1, liveCapacity) + 0.001) {
              entry.mesh.position.copy(conveyorPositionAt(
                conveyorSlotProgress(livePhase, liveCapacity, previousSlotIndex),
              ))
            }
          }
          const targetPosition = stackGroup.position.clone().add(new THREE.Vector3(0, 0.55, 0))
          // Longer, arcing dive: the marble hops over the belt rim and drops
          // to the collector trays on the ground below.
          slotDropTweensRef.current.set(id, createSlotDropTween(id, entry.mesh, targetPosition, now, 0.42, 0.6))
          entry.phase = 'slotDrop'
          transitRef.current.delete(id)
          bodies.release(id)
          continue
        }
      }
      entry.mesh.parent?.remove(entry.mesh)
      disposeObject(entry.mesh)
      entries.delete(id)
      transitRef.current.delete(id)
      bodies.release(id)
    }

    for (const marble of nextState.fallingMarbles) {
      if (!entries.has(marble.id)) {
        const mesh = createMarbleMesh(marble.color, 0.13)
        // Physics positions ARE board-local coordinates, so falling marbles
        // live under the tilted board group and ride its transform for free.
        const fallingParent = boardMarbleGroupRef.current ?? marbleGroup
        fallingParent.add(mesh)
        entries.set(marble.id, { mesh, phase: 'falling', color: marble.color })
      }
    }
    bodies.ensure(nextState.fallingMarbles)

    for (const marble of nextState.conveyor) {
      if (!entries.has(marble.id)) {
        const mesh = createMarbleMesh(marble.color, 0.13)
        marbleGroup.add(mesh)
        entries.set(marble.id, { mesh, phase: 'conveyor', color: marble.color })
      }
    }

    const attempts = arrivedAttemptsRef.current
    for (const id of Array.from(attempts.keys())) {
      if (!fallingIds.has(id)) {
        attempts.delete(id)
      }
    }
  }

  const currentConveyorPhase = (now: number): number => {
    const capacity = conveyorCapacityRef.current
    const elapsed = now - phaseBaseTimeRef.current
    return phaseBaseRef.current + elapsed * conveyorProgressSpeedForSlotCount(capacity)
  }

  const updateMarbleMeshes = (now: number, _delta: number): void => {
    const entries = marbleEntriesRef.current
    const bodies = bodiesRef.current
    const transit = transitRef.current
    const slotsById = marbleSlotByIdRef.current
    const capacity = conveyorCapacityRef.current
    const phase = currentConveyorPhase(now)

    const slotDrops = slotDropTweensRef.current
    for (const [id, tween] of Array.from(slotDrops.entries())) {
      const entry = entries.get(id)
      if (!entry) {
        slotDrops.delete(id)
        continue
      }
      const done = updateSlotDropTween(tween, now)
      if (done) {
        entry.mesh.parent?.remove(entry.mesh)
        disposeObject(entry.mesh)
        entries.delete(id)
        slotDrops.delete(id)
      }
    }

    const attempts = arrivedAttemptsRef.current
    const fallingIds = fallingIdsRef.current
    for (const [id, entry] of entries) {
      if (entry.phase === 'falling') {
        bodies?.applyToMesh(id, entry.mesh)
        const body = bodies?.get(id)
        if (body && shouldReportArrival(id, body, fallingIds, attempts, now)) {
          attempts.set(id, now)
          onMarbleArrivedRef.current(id)
        }
        continue
      }

      if (entry.phase === 'slotDrop') {
        continue
      }

      const slotIndex = slotsById.get(id)
      if (slotIndex === undefined) {
        continue
      }
      const target = conveyorPositionAt(conveyorSlotProgress(phase, capacity, slotIndex))

      if (entry.phase === 'transit') {
        const data = transit.get(id)
        if (!data) {
          entry.phase = 'conveyor'
          entry.mesh.position.copy(target)
          continue
        }
        const t = Math.min(1, Math.max(0, (now - data.startedAt) / data.duration))
        const eased = easeOutCubic(t)
        entry.mesh.position.set(
          data.from.x + (target.x - data.from.x) * eased,
          data.from.y + (target.y - data.from.y) * eased,
          data.from.z + (target.z - data.from.z) * eased,
        )
        entry.mesh.rotation.x += 0.04
        if (t >= 1) {
          entry.phase = 'conveyor'
          transit.delete(id)
        }
        continue
      }

      entry.mesh.position.copy(target)
      entry.mesh.rotation.x += 0.08
    }
  }

  useEffect(() => {
    onBoxClickRef.current = onBoxClick
  }, [onBoxClick])

  useEffect(() => {
    onMarbleArrivedRef.current = onMarbleArrived
  }, [onMarbleArrived])

  useEffect(() => {
    hintCellRef.current = hintCell
  }, [hintCell])

  useEffect(() => {
    onHintPositionRef.current = onHintPosition
  }, [onHintPosition])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    const skyTexture = createCanvasTexture(16, 512, (context, w, h) => {
      const gradient = context.createLinearGradient(0, 0, 0, h)
      gradient.addColorStop(0, SKY_TOP_COLOR)
      gradient.addColorStop(1, SKY_HORIZON_COLOR)
      context.fillStyle = gradient
      context.fillRect(0, 0, w, h)
    })
    scene.background = skyTexture
    scene.fog = new THREE.Fog(SKY_FOG_COLOR, 22, 48)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80)
    camera.position.set(0, 9.0, 11.4)
    camera.lookAt(0, -0.1, 1.2)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.0
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.3
    pmrem.dispose()

    const stackGroups = stackGroupsRef.current
    const marbleEntries = marbleEntriesRef.current
    const transitEntries = transitRef.current
    const marbleSlots = marbleSlotByIdRef.current
    const slotDropTweens = slotDropTweensRef.current
    const arrivedAttempts = arrivedAttemptsRef.current
    const fallingIds = fallingIdsRef.current

    const ambient = new THREE.HemisphereLight('#eaf6ff', '#79b46a', 0.62)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight('#fff2d8', 1.15)
    sun.position.set(-5, 12, 3.5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    // The shadow frustum must reach from the launch island down to the meadow
    // (and the collector plinth at z ~6.5) so the floating pieces cast onto
    // the ground below.
    sun.shadow.camera.left = -9
    sun.shadow.camera.right = 9
    sun.shadow.camera.top = 10
    sun.shadow.camera.bottom = -10
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 40
    scene.add(sun)

    const rim = new THREE.DirectionalLight('#9fc8ff', 0.3)
    rim.position.set(5, 6, -4)
    scene.add(rim)

    const clouds = createCloudField()
    cloudFieldRef.current = clouds
    scene.add(clouds.group)

    const staticGroup = new THREE.Group()
    staticGroup.add(createPlayfield())
    staticGroup.add(createConveyorTrack())
    const initialCapacity = Math.max(1, stateRef.current.conveyorCapacity)
    const beltMarkers = createConveyorBeltMarkers(initialCapacity)
    staticGroup.add(beltMarkers.group)
    beltMarkersRef.current = beltMarkers.markers
    beltMarkerGroupRef.current = beltMarkers.group
    beltMarkerCapacityRef.current = initialCapacity
    conveyorCapacityRef.current = initialCapacity
    scene.add(staticGroup)
    staticGroupRef.current = staticGroup

    // The crate board is pitched toward the camera around a pivot at the
    // funnel throat. Children keep flat physics coordinates as their local
    // space; the group transform does the rest.
    const boardGroup = new THREE.Group()
    boardGroup.rotation.x = BOARD_TILT_RADIANS
    const pivot = new THREE.Vector3(0, DECK_TOP_Y, BOARD_TILT_PIVOT_Z)
    boardGroup.position.copy(pivot).sub(pivot.clone().applyEuler(boardGroup.rotation))
    boardGroup.add(createBoardSurface())
    scene.add(boardGroup)
    boardGroup.updateMatrixWorld(true)
    boardGroupRef.current = boardGroup

    const boardDynamicGroup = new THREE.Group()
    boardGroup.add(boardDynamicGroup)
    boardDynamicGroupRef.current = boardDynamicGroup

    const boardMarbleGroup = new THREE.Group()
    boardGroup.add(boardMarbleGroup)
    boardMarbleGroupRef.current = boardMarbleGroup

    const boardEffectGroup = new THREE.Group()
    boardGroup.add(boardEffectGroup)
    boardEffectGroupRef.current = boardEffectGroup

    const dynamicGroup = new THREE.Group()
    scene.add(dynamicGroup)
    dynamicGroupRef.current = dynamicGroup
    previousStateRef.current = null

    const marbleGroup = new THREE.Group()
    scene.add(marbleGroup)
    marbleGroupRef.current = marbleGroup

    const effectGroup = new THREE.Group()
    scene.add(effectGroup)
    effectGroupRef.current = effectGroup

    const physics = createPhysicsWorld()
    physicsRef.current = physics
    bodiesRef.current = createMarbleBodyManager(physics)

    if (physicsDebugOverlayEnabled()) {
      // Physics coordinates are board-local, so the overlay belongs there.
      boardGroup.add(createPhysicsDebugOverlay(physics.containerBody))
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const handlePointerDown = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const hits = raycaster.intersectObjects(boardDynamicGroup.children, true)
      for (const hit of hits) {
        const boxId = findBoxId(hit.object)
        if (boxId) {
          onBoxClickRef.current(boxId)
          return
        }
      }
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)

    const viewSize = { width: 160, height: 160 }
    const resize = (): void => {
      viewSize.width = Math.max(160, container.clientWidth)
      viewSize.height = Math.max(160, container.clientHeight)
      const narrow = viewSize.width < 640
      renderer.setSize(viewSize.width, viewSize.height)
      camera.fov = narrow ? 50 : 45
      camera.position.set(0, narrow ? 9.8 : 9.0, narrow ? 12.2 : 11.4)
      camera.lookAt(0, narrow ? -0.2 : -0.1, narrow ? 1.4 : 1.2)
      camera.aspect = viewSize.width / viewSize.height
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    let frameId = 0
    const timer = new THREE.Timer()
    timer.connect(document)
    const animate = (timestamp?: number): void => {
      timer.update(timestamp)
      const delta = timer.getDelta()
      const now = performance.now() / 1000
      const phase = currentConveyorPhase(now)

      stepPhysics(physics.world, delta)
      animateConveyorBeltMarkers(beltMarkersRef.current, phase)
      updateMarbleMeshes(now, delta)
      if (cloudFieldRef.current) {
        updateCloudField(cloudFieldRef.current, delta)
      }

      confettiBurstsRef.current = confettiBurstsRef.current.filter((burst) => {
        const done = updateConfettiBurst(burst, now)
        if (done) {
          effectGroup.remove(burst.group)
          disposeConfettiBurst(burst)
        }
        return !done
      })

      boxBurstsRef.current = boxBurstsRef.current.filter((burst) => {
        const done = updateBoxBurst(burst, now)
        if (done) {
          burst.group.parent?.remove(burst.group)
          disposeBoxBurst(burst)
        }
        return !done
      })

      stackTweensRef.current = stackTweensRef.current.filter((tween) => {
        const done = updateStackRiseTween(tween, now)
        return !done
      })

      boxPopTweensRef.current = boxPopTweensRef.current.filter((tween) => {
        if (!tween.group.parent) {
          return false
        }
        return !updateBoxPopTween(tween, now)
      })

      reportHintPosition()
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }

    const hintProjection = new THREE.Vector3()
    const hintPositionReporter = createHintPositionReporter()
    const reportHintPosition = (): void => {
      let worldPosition: THREE.Vector3 | null = null
      const cell = hintCellRef.current
      if (cell) {
        hintProjection.copy(gridCellPosition(cell))
        hintProjection.y += 0.3
        boardGroupRef.current?.localToWorld(hintProjection)
        worldPosition = hintProjection
      }
      hintPositionReporter.report({
        camera,
        height: viewSize.height,
        onChange: onHintPositionRef.current,
        width: viewSize.width,
        worldPosition,
      })
    }

    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      timer.dispose()
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      bodiesRef.current?.releaseAll()
      if (physicsRef.current) {
        disposePhysicsWorld(physicsRef.current)
      }
      if (staticGroupRef.current) {
        clearGroup(staticGroupRef.current)
      }
      if (dynamicGroupRef.current) {
        clearGroup(dynamicGroupRef.current)
      }
      if (marbleGroupRef.current) {
        clearGroup(marbleGroupRef.current)
      }
      if (effectGroupRef.current) {
        clearGroup(effectGroupRef.current)
      }
      if (boardGroupRef.current) {
        clearGroup(boardGroupRef.current)
      }
      skyTexture.dispose()
      cloudFieldRef.current = null
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      staticGroupRef.current = null
      dynamicGroupRef.current = null
      marbleGroupRef.current = null
      effectGroupRef.current = null
      boardGroupRef.current = null
      boardDynamicGroupRef.current = null
      boardMarbleGroupRef.current = null
      boardEffectGroupRef.current = null
      physicsRef.current = null
      bodiesRef.current = null
      marbleEntries.clear()
      transitEntries.clear()
      marbleSlots.clear()
      conveyorCapacityRef.current = 1
      phaseBaseRef.current = 0
      phaseBaseTimeRef.current = 0
      beltMarkersRef.current = []
      beltMarkerGroupRef.current = null
      beltMarkerCapacityRef.current = 0
      confettiBurstsRef.current = []
      boxBurstsRef.current = []
      stackTweensRef.current = []
      boxPopTweensRef.current = []
      slotDropTweens.clear()
      arrivedAttempts.clear()
      fallingIds.clear()
      stackGroups.clear()
    }
  }, [])

  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current
    const boardDynamicGroup = boardDynamicGroupRef.current
    const boardEffectGroup = boardEffectGroupRef.current
    const marbleGroup = marbleGroupRef.current
    const effectGroup = effectGroupRef.current
    const bodies = bodiesRef.current
    if (!dynamicGroup || !boardDynamicGroup || !boardEffectGroup || !marbleGroup || !effectGroup || !bodies) {
      return
    }

    const previous = previousStateRef.current
    const clearEvents = computeClearedBlockEvents(previous, state)
    const openedBoxEvents = computeOpenedBoxEvents(previous, state)
    const refillEvents = computeChuteRefillEvents(previous, state)
    const shouldRebuildDynamicObjects = (
      !previous
      || previousColorblindModeRef.current !== colorblindMode
      || dynamicObjectsSignature(previous) !== dynamicObjectsSignature(state)
    )

    if (shouldRebuildDynamicObjects) {
      clearGroup(dynamicGroup)
      clearGroup(boardDynamicGroup)
      stackGroupsRef.current.clear()
      boxPopTweensRef.current = []

      const boxMeshById = new Map<string, THREE.Group>()

      for (const chute of state.chutes) {
        boardDynamicGroup.add(createChuteMesh(chute))
      }

      for (const box of state.boxes) {
        const displayHidden = isBoxDisplayedAsHidden(box, state.boxes)
        const openable = isBoxOpenable(box, state.boxes)
        const boxMesh = createBoxMesh(box, colorblindMode, { displayHidden, openable })
        boardDynamicGroup.add(boxMesh)
        boxMeshById.set(box.id, boxMesh)
      }

      for (const stack of state.sortingStacks) {
        const stackMesh = createSortingStackMesh(stack, state.sortingStacks.length, colorblindMode)
        dynamicGroup.add(stackMesh)
        stackGroupsRef.current.set(stack.id, stackMesh)
      }

      const now = performance.now() / 1000
      for (const event of refillEvents) {
        const boxMesh = boxMeshById.get(event.boxId)
        if (!boxMesh) {
          continue
        }
        // The dispenser only feeds its edge cell, so its side follows the column.
        const side = event.position.column === 0 ? 'left' : 'right'
        const from = chutePosition(event.position.row, side)
        const to = gridCellPosition(event.position)
        from.y = to.y
        boxPopTweensRef.current.push(createBoxPopTween(boxMesh, from, to, now))
      }
    }

    syncMarbles(state, previous, marbleGroup, bodies, performance.now() / 1000)

    for (const event of clearEvents) {
      const stackGroup = stackGroupsRef.current.get(event.stackId)
      if (stackGroup) {
        const tween = createStackRiseTween(stackGroup)
        stackTweensRef.current.push(tween)
      }
      const stack = state.sortingStacks.find((candidate) => candidate.id === event.stackId)
      const x = stackGroup?.position.x ?? 0
      const y = (stackGroup?.position.y ?? 0) + 0.55
      const z = stackGroup?.position.z ?? 0
      const confetti = createConfettiBurst(new THREE.Vector3(x, y, z), stack?.color ?? event.color)
      effectGroup.add(confetti.group)
      confettiBurstsRef.current.push(confetti)
    }

    for (const event of openedBoxEvents) {
      const burst = createBoxBurst(gridCellPosition(event.position), event.color)
      boardEffectGroup.add(burst.group)
      boxBurstsRef.current.push(burst)
    }

    previousStateRef.current = state
    previousColorblindModeRef.current = colorblindMode
  }, [colorblindMode, state])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-lg border border-white/70 bg-sky-300 shadow-2xl shadow-slate-950/20 dark:border-white/10 dark:bg-sky-950 dark:shadow-slate-950/35"
    />
  )
}

function easeOutCubic(t: number): number {
  return 1 - ((1 - t) ** 3)
}

interface ClearEvent {
  stackId: string
  color: SortingStack['color']
}

function collectSortTargets(previous: GameState | null, next: GameState): Map<MarbleColor, string[]> {
  const targets = new Map<MarbleColor, string[]>()
  if (!previous) {
    return targets
  }
  const nextStackById = new Map(next.sortingStacks.map((stack) => [stack.id, stack]))
  for (const stack of previous.sortingStacks) {
    const prevTop = stack.blocks[0]
    if (!prevTop) {
      continue
    }
    const after = nextStackById.get(stack.id)
    const afterTop = after?.blocks[0]
    let landed = 0
    if (afterTop && afterTop.id === prevTop.id) {
      if (afterTop.slotsFilled > prevTop.slotsFilled) {
        landed = afterTop.slotsFilled - prevTop.slotsFilled
      }
    } else {
      // The previous top block was completed and shifted out; it received its remaining slots.
      landed = SORTING_BLOCK_CAPACITY - prevTop.slotsFilled
    }
    for (let i = 0; i < landed; i += 1) {
      const queue = targets.get(prevTop.color) ?? []
      queue.push(stack.id)
      targets.set(prevTop.color, queue)
    }
  }

  return targets
}

function computeClearedBlockEvents(previous: GameState | null, next: GameState): ClearEvent[] {
  if (!previous) {
    return []
  }
  const events: ClearEvent[] = []
  const previousById = new Map(previous.sortingStacks.map((stack) => [stack.id, stack]))
  for (const stack of next.sortingStacks) {
    const before = previousById.get(stack.id)
    if (!before) {
      continue
    }
    const beforeTop = before.blocks[0]
    const afterTop = stack.blocks[0]
    if (beforeTop && (!afterTop || beforeTop.id !== afterTop.id)) {
      events.push({ stackId: stack.id, color: beforeTop.color })
    }
  }
  return events
}

function dynamicObjectsSignature(state: GameState): string {
  return [
    state.boxes.map((box) => {
      const displayHidden = isBoxDisplayedAsHidden(box, state.boxes)
      const openable = isBoxOpenable(box, state.boxes)

      return `${box.id}:${box.color}:${box.hidden ? 1 : 0}:${displayHidden ? 1 : 0}:${openable ? 1 : 0}:${box.position.column}:${box.position.row}`
    }).join(','),
    state.chutes.map((chute) => (
      `${chute.id}:${chute.side}:${chute.row}:${chute.remaining}:${chute.queue.map((box) => `${box.color}:${box.hidden ? 1 : 0}`).join('.')}`
    )).join(','),
    state.sortingStacks.map((stack) => (
      `${stack.id}:${stack.blocks.map((block) => `${block.id}:${block.color}:${block.slotsFilled}`).join('.')}`
    )).join(','),
  ].join('|')
}

export function disposeMarbleSortObjectForTest(object: THREE.Object3D): void {
  disposeObject(object)
}
