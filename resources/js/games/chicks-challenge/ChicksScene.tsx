/**
 * three.js canvas host for Chick's Challenge. Pure presentation: it owns the renderer
 * lifecycle and tween/effect playback, and never touches game logic — the
 * pure `engine/` reducer is the only source of truth for `state`. See
 * docs/games/chicks-challenge.md ("Scene & rendering") for the normative spec this
 * implements.
 */
import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { EngineEvent, GameState, TileKind } from './engine/types'
import type { SceneProps } from './gameTypes'
import { type BoardHandle, buildBoard, diffBoard, disposeBoard } from './scene/boardBuilder'
import {
  type CameraView,
  chooseCameraMode,
  fitCameraView,
  followCameraView,
  smoothCameraView,
  tileCenterWorld,
} from './scene/cameraRig'
import {
  createConfettiEffect,
  createEffectsManager,
  createFlashEffect,
  createPopEffect,
  createPuffEffect,
  createSparkleEffect,
  createSplashEffect,
  type EffectsManager,
} from './scene/effects'
import {
  blockEntityId,
  createEntityLayer,
  disposeEntityLayer,
  type EntityId,
  type EntityLayerHandle,
  monsterEntityId,
  setSpriteFacing,
  setSpritePosition,
  syncEntitySprites,
} from './scene/entitySprites'
import {
  CAMERA_FAR,
  CAMERA_FOLLOW_SMOOTHING_PER_SEC,
  CAMERA_NEAR,
  CAMERA_Z,
  DEATH_FLASH_MS,
  PALETTE,
  SLIDE_TWEEN_MS,
  STEP_TWEEN_MS,
  TELEPORT_FLASH_MS,
} from './scene/sceneConstants'
import { disposeRenderer } from './scene/threeUtils'
import {
  createEntityMaterialCache,
  createTileMaterialCache,
  type EntityMaterialCache,
  type TileMaterialCache,
} from './scene/tileTextures'
import { stepDurationMs, TweenScheduler } from './scene/tweenScheduler'

function ensureSchedulerEntities(scheduler: TweenScheduler<EntityId>, state: GameState): void {
  if (!scheduler.hasEntity('player')) {
    scheduler.setEntity('player', state.player.pos)
  }
  for (const block of state.blocks) {
    const id = blockEntityId(block.id)
    if (!scheduler.hasEntity(id)) {
      scheduler.setEntity(id, block.pos)
    }
  }
  for (const monster of state.monsters) {
    const id = monsterEntityId(monster.id)
    if (!scheduler.hasEntity(id)) {
      scheduler.setEntity(id, monster.pos)
    }
  }
}

function pruneSchedulerEntities(scheduler: TweenScheduler<EntityId>, state: GameState): void {
  const keep = new Set<EntityId>(['player'])
  for (const block of state.blocks) {
    keep.add(blockEntityId(block.id))
  }
  for (const monster of state.monsters) {
    keep.add(monsterEntityId(monster.id))
  }
  for (const id of scheduler.ids()) {
    if (!keep.has(id)) {
      scheduler.removeEntity(id)
    }
  }
}

function snapAllEntities(scheduler: TweenScheduler<EntityId>, state: GameState): void {
  for (const id of scheduler.ids()) {
    scheduler.removeEntity(id)
  }
  scheduler.setEntity('player', state.player.pos)
  for (const block of state.blocks) {
    scheduler.setEntity(blockEntityId(block.id), block.pos)
  }
  for (const monster of state.monsters) {
    scheduler.setEntity(monsterEntityId(monster.id), monster.pos)
  }
}

function applyEntityVisuals(entityLayer: EntityLayerHandle, scheduler: TweenScheduler<EntityId>, state: GameState): void {
  const playerPos = scheduler.positionOf('player')
  if (playerPos) {
    const world = tileCenterWorld(playerPos.x, playerPos.y)
    setSpritePosition(entityLayer, 'player', world.x, world.y)
  }
  setSpriteFacing(entityLayer, 'player', state.player.facing)

  for (const block of state.blocks) {
    const id = blockEntityId(block.id)
    const pos = scheduler.positionOf(id)
    if (pos) {
      const world = tileCenterWorld(pos.x, pos.y)
      setSpritePosition(entityLayer, id, world.x, world.y)
    }
  }

  for (const monster of state.monsters) {
    const id = monsterEntityId(monster.id)
    const pos = scheduler.positionOf(id)
    if (pos) {
      const world = tileCenterWorld(pos.x, pos.y)
      setSpritePosition(entityLayer, id, world.x, world.y)
    }
    setSpriteFacing(entityLayer, id, monster.facing)
  }
}

/**
 * Interprets one accepted move's events: queues movement tweens (classifying
 * step vs. forced-slide speed per scene/tweenScheduler.ts's `stepDurationMs`
 * convention) and spawns the matching cheap effect for every other event.
 */
function processMoveEvents(
  events: readonly EngineEvent[],
  nextState: GameState,
  scheduler: TweenScheduler<EntityId>,
  effects: EffectsManager,
  elapsedSeconds: number,
): void {
  const occurrences = new Map<EntityId, number>()
  const occurrenceFor = (id: EntityId): number => {
    const count = occurrences.get(id) ?? 0
    occurrences.set(id, count + 1)
    return count
  }

  for (const event of events) {
    switch (event.type) {
      case 'playerMoved': {
        const duration = stepDurationMs(occurrenceFor('player'), STEP_TWEEN_MS, SLIDE_TWEEN_MS, event.forced)
        scheduler.enqueue('player', { from: event.from, to: event.to, durationMs: duration })
        break
      }
      case 'monsterMoved': {
        const id = monsterEntityId(event.id)
        const duration = stepDurationMs(occurrenceFor(id), STEP_TWEEN_MS, SLIDE_TWEEN_MS)
        scheduler.enqueue(id, { from: event.from, to: event.to, durationMs: duration })
        break
      }
      case 'blockPushed': {
        const id = blockEntityId(event.id)
        const duration = stepDurationMs(occurrenceFor(id), STEP_TWEEN_MS, SLIDE_TWEEN_MS)
        scheduler.enqueue(id, { from: event.from, to: event.to, durationMs: duration })
        break
      }
      case 'teleported': {
        const id: EntityId =
          event.entity === 'player' ? 'player' : event.entity === 'block' ? blockEntityId(event.id ?? 0) : monsterEntityId(event.id ?? 0)
        scheduler.snapEntity(id, event.to)
        effects.add(createFlashEffect(event.from, PALETTE.teleportSwirl, TELEPORT_FLASH_MS), elapsedSeconds)
        effects.add(createFlashEffect(event.to, PALETTE.teleportSwirl, TELEPORT_FLASH_MS), elapsedSeconds)
        break
      }
      case 'cloned':
        effects.add(createPopEffect(event.monster.pos, PALETTE.cloneStripeA), elapsedSeconds)
        break
      case 'splash':
        effects.add(createSplashEffect(event.at), elapsedSeconds)
        break
      case 'monsterDrowned':
        effects.add(createSplashEffect(event.at), elapsedSeconds)
        break
      case 'pickedUp':
        effects.add(createSparkleEffect(event.at), elapsedSeconds)
        break
      case 'doorOpened':
        effects.add(createPopEffect(event.at, PALETTE.doorKeyhole), elapsedSeconds)
        break
      case 'socketOpened':
        effects.add(createPopEffect(event.at, PALETTE.socketPin), elapsedSeconds)
        break
      case 'bootsStolen':
        effects.add(createFlashEffect(event.at, PALETTE.thiefBody, TELEPORT_FLASH_MS), elapsedSeconds)
        break
      case 'died':
        if (event.cause === 'drowned') {
          effects.add(createSplashEffect(event.at), elapsedSeconds)
        } else if (event.cause === 'burned') {
          effects.add(createPuffEffect(event.at), elapsedSeconds)
        } else {
          effects.add(createFlashEffect(event.at, PALETTE.monsterFireball, DEATH_FLASH_MS), elapsedSeconds)
        }
        break
      case 'won':
        effects.add(createConfettiEffect(nextState.player.pos), elapsedSeconds)
        break
      case 'bumped':
      case 'waited':
      case 'dirtCleared':
      case 'popupRaised':
      case 'toggleFlipped':
      case 'tanksReversed':
        break
    }
  }
}

function applyCameraView(camera: THREE.OrthographicCamera, view: CameraView): void {
  camera.left = view.centerX - view.halfWidth
  camera.right = view.centerX + view.halfWidth
  camera.top = view.centerY + view.halfHeight
  camera.bottom = view.centerY - view.halfHeight
  camera.updateProjectionMatrix()
}

export function ChicksScene({ state, events, moveSeq }: SceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef(state)
  const eventsRef = useRef(events)
  const moveSeqRef = useRef(moveSeq)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    moveSeqRef.current = moveSeq
  }, [moveSeq])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR)
    camera.position.set(0, 0, CAMERA_Z)

    // Transparent clear colour: the board is letterboxed inside its own box now
    // that the HUD and toolbar are flow siblings, so the page background (light or
    // dark) shows around it instead of a black band.
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const boardGroup = new THREE.Group()
    const entityLayer = createEntityLayer()
    scene.add(boardGroup, entityLayer.group)

    const tileMaterials: TileMaterialCache = createTileMaterialCache()
    const entityMaterials: EntityMaterialCache = createEntityMaterialCache()
    const effects: EffectsManager = createEffectsManager()
    scene.add(effects.group)

    const scheduler = new TweenScheduler<EntityId>()

    let board: BoardHandle | null = null
    let prevState: GameState | null = null
    let lastProcessedSeq = -1
    let cameraView: CameraView = { centerX: 0, centerY: 0, halfWidth: 1, halfHeight: 1 }

    // Not typed as `Viewport` (its fields are readonly) since resize() mutates it in place;
    // it's structurally assignable wherever a Viewport is expected.
    const viewport = { width: 1, height: 1 }
    const resize = (): void => {
      viewport.width = Math.max(1, container.clientWidth)
      viewport.height = Math.max(1, container.clientHeight)
      renderer.setSize(viewport.width, viewport.height)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const hardReset = (nextState: GameState): void => {
      if (board) {
        boardGroup.remove(board.group)
        disposeBoard(board)
      }
      board = buildBoard(nextState.tiles, nextState.width, nextState.height, tileMaterials)
      boardGroup.add(board.group)

      syncEntitySprites(entityLayer, nextState, entityMaterials)
      scheduler.clearAllQueues()
      snapAllEntities(scheduler, nextState)
      applyEntityVisuals(entityLayer, scheduler, nextState)

      effects.disposeAll()

      const focus = tileCenterWorld(nextState.player.pos.x, nextState.player.pos.y)
      cameraView =
        chooseCameraMode(viewport, nextState.width, nextState.height) === 'fit'
          ? fitCameraView(viewport, nextState.width, nextState.height)
          : followCameraView(viewport, nextState.width, nextState.height, focus)
    }

    const advanceMove = (prevTiles: readonly TileKind[], nextState: GameState, moveEvents: readonly EngineEvent[]): void => {
      if (board) {
        diffBoard(board, prevTiles, nextState.tiles, tileMaterials)
      }
      syncEntitySprites(entityLayer, nextState, entityMaterials)
      ensureSchedulerEntities(scheduler, nextState)
      pruneSchedulerEntities(scheduler, nextState)
      processMoveEvents(moveEvents, nextState, scheduler, effects, clock.elapsedTime)
    }

    const clock = new THREE.Clock()
    let frameId = 0

    const animate = (): void => {
      frameId = requestAnimationFrame(animate)
      const dt = Math.min(0.1, clock.getDelta())
      const elapsed = clock.elapsedTime

      const currentState = stateRef.current
      const currentSeq = moveSeqRef.current
      const currentEvents = eventsRef.current

      const isFirstFrame = board === null
      const isBackwardReset = !isFirstFrame && (currentSeq < lastProcessedSeq || (currentSeq === 0 && lastProcessedSeq !== 0))
      const dimensionsChanged =
        !isFirstFrame && prevState !== null && (prevState.width !== currentState.width || prevState.height !== currentState.height)

      if (isFirstFrame || isBackwardReset || dimensionsChanged) {
        hardReset(currentState)
        lastProcessedSeq = currentSeq
      } else if (currentSeq !== lastProcessedSeq && prevState) {
        advanceMove(prevState.tiles, currentState, currentEvents)
        lastProcessedSeq = currentSeq
      }
      prevState = currentState

      scheduler.advance(dt * 1000)
      applyEntityVisuals(entityLayer, scheduler, currentState)

      tileMaterials.update(elapsed)
      effects.update(elapsed)

      const playerTweenPos = scheduler.positionOf('player') ?? currentState.player.pos
      const focus = tileCenterWorld(playerTweenPos.x, playerTweenPos.y)
      const mode = chooseCameraMode(viewport, currentState.width, currentState.height)
      const targetView =
        mode === 'fit'
          ? fitCameraView(viewport, currentState.width, currentState.height)
          : followCameraView(viewport, currentState.width, currentState.height, focus)
      cameraView = mode === 'fit' ? targetView : smoothCameraView(cameraView, targetView, dt, CAMERA_FOLLOW_SMOOTHING_PER_SEC)
      applyCameraView(camera, cameraView)

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      effects.disposeAll()
      if (board) {
        boardGroup.remove(board.group)
        disposeBoard(board)
      }
      tileMaterials.dispose()
      disposeEntityLayer(entityLayer)
      entityMaterials.dispose()
      disposeRenderer(renderer, container)
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />
}
