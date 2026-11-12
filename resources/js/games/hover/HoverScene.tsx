import { type ReactElement, type RefObject, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { stepEngine } from './engine/engine'
import { craftSpeed } from './engine/physics'
import { createRng } from './engine/rng'
import type { EngineEvent, EngineState, HudSnapshot } from './gameTypes'
import { COCKPIT_HEIGHT, DT, MAX_SUBSTEPS } from './gameTypes'
import type { InputState } from './input/inputState'
import { cellCenter } from './maps/mapTypes'
import { animateDroneRings, createCockpitDash, createDroneMesh } from './scene/craftMeshes'
import {
  animateFlagCloth,
  createArrowPadMesh,
  createFlagMesh,
  createPodMesh,
  createTrapMesh,
  podFloatHeight,
} from './scene/flagMeshes'
import { drawMinimap } from './scene/minimap'
import { createMirrorCamera, mirrorRectPx, renderMirror, updateMirrorCamera } from './scene/mirror'
import { buildMapScene } from './scene/sceneBuilder'
import { createWeather, type WeatherEffect } from './scene/weather'
import { markHoverVisualReady, readHoverVisualTestOptions, resetHoverVisualReadiness } from './visualTestMode'

export type GraphicsStatus = 'starting' | 'ready' | 'failed'

const HUD_SNAPSHOT_INTERVAL_SEC = 0.1
/** Cloth vertex animation only runs for flags within this range of the player. */
const CLOTH_ANIMATION_RANGE = 70

interface HoverSceneProps {
  graphicsAttempt: number
  onGraphicsStatus: (status: GraphicsStatus) => void
  engineRef: RefObject<EngineState | null>
  /** Steps the engine only while true (phase === 'playing'). */
  running: boolean
  /** True while paused: after a couple of settle frames, rendering stops entirely. */
  idle: boolean
  readInput: () => InputState
  onEvents: (events: EngineEvent[]) => void
  onHudSnapshot: (snapshot: HudSnapshot) => void
  minimapCanvasRef: RefObject<HTMLCanvasElement | null>
}

export function buildHudSnapshot(state: EngineState): HudSnapshot {
  const blue = state.flags.filter((flag) => flag.team === 'blue')
  const red = state.flags.filter((flag) => flag.team === 'red')

  return {
    score: state.score,
    mapScore: state.mapScore,
    flagValue: state.flagValue,
    blueCollected: blue.filter((flag) => flag.collected).length,
    blueTotal: blue.length,
    redCollected: red.filter((flag) => flag.collected).length,
    redTotal: red.length,
    speed: craftSpeed(state.player),
    speedEffect: state.player.speedEffect,
    hasJumpPower: state.player.hasJumpPower,
    mapId: state.map.id,
    mapName: state.map.theme.name,
    cycle: state.cycle,
    lossesOnMap: state.lossesOnMap,
  }
}

export function HoverScene({
  engineRef,
  graphicsAttempt,
  onGraphicsStatus,
  running,
  idle,
  readInput,
  onEvents,
  onHudSnapshot,
  minimapCanvasRef,
}: HoverSceneProps): ReactElement {
  const onGraphicsStatusRef = useRef(onGraphicsStatus)
  useEffect(() => {
    onGraphicsStatusRef.current = onGraphicsStatus
  }, [onGraphicsStatus])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wakeRef = useRef<(() => void) | null>(null)
  const runningRef = useRef(running)
  const idleRef = useRef(idle)
  const readInputRef = useRef(readInput)
  const onEventsRef = useRef(onEvents)
  const onHudSnapshotRef = useRef(onHudSnapshot)

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    idleRef.current = idle
  }, [idle])

  useEffect(() => {
    readInputRef.current = readInput
  }, [readInput])

  useEffect(() => {
    onEventsRef.current = onEvents
  }, [onEvents])

  useEffect(() => {
    onHudSnapshotRef.current = onHudSnapshot
  }, [onHudSnapshot])

  // Any commit (phase change, new round, prop flip) revives a parked loop.
  useEffect(() => {
    wakeRef.current?.()
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let active = true
    let frameId = 0
    let renderer: THREE.WebGLRenderer | null = null
    let resizeObserver: ResizeObserver | null = null
    const scene = new THREE.Scene()
    const cleanup = (): void => {
      if (!active) return
      active = false
      wakeRef.current = null
      cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      disposeSceneResources(scene)
      if (renderer) {
        // A driver failure during disposal must never strand the failed canvas.
        try { renderer.dispose() } catch { /* Continue detaching. */ }
        renderer.domElement.remove()
      }
    }
    const fail = (): void => {
      cleanup()
      onGraphicsStatusRef.current('failed')
    }
    onGraphicsStatusRef.current('starting')
    try {
      const sceneRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer = sceneRenderer
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 260)
      camera.rotation.order = 'YXZ'
      const mirrorCamera = createMirrorCamera()

      sceneRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      sceneRenderer.shadowMap.enabled = true
      sceneRenderer.shadowMap.type = THREE.PCFSoftShadowMap
      // Only static walls cast shadows, so the shadow map renders once per
      // round (rebuildRound flips needsUpdate) instead of every frame.
      sceneRenderer.shadowMap.autoUpdate = false
      sceneRenderer.toneMapping = THREE.NeutralToneMapping
      container.appendChild(sceneRenderer.domElement)

      const staticGroup = new THREE.Group()
      scene.add(staticGroup)
      const dynamicGroup = new THREE.Group()
      scene.add(dynamicGroup)

      const dash = createCockpitDash(0xff2ec4)
      camera.add(dash)
      scene.add(camera)

      const flagMeshes = new Map<number, THREE.Group>()
      const podMeshes = new Map<number, THREE.Group>()
      let droneMesh: THREE.Group | null = null
      let weather: WeatherEffect | null = null
      let builtState: EngineState | null = null

      const viewSize = { width: 1, height: 1 }
      const resize = (): void => {
        viewSize.width = Math.max(1, container.clientWidth)
        viewSize.height = Math.max(1, container.clientHeight)
        if (!active) return
        sceneRenderer.setSize(viewSize.width, viewSize.height)
        camera.aspect = viewSize.width / viewSize.height
        camera.updateProjectionMatrix()
      }
      resizeObserver = new ResizeObserver(() => {
        if (!active) return
        try { resize() } catch { fail() }
      })
      resizeObserver.observe(container)
      resize()

      const rebuildRound = (state: EngineState): void => {
        disposeSceneResources(staticGroup)
        disposeSceneResources(dynamicGroup)
        flagMeshes.clear()
        podMeshes.clear()

        buildMapScene(scene, staticGroup, state.map)

        // The old cloud was disposed by disposeSceneResources(staticGroup) above. Visual
        // tests seed the particles so weather-map screenshots are reproducible.
        const weatherKind = state.map.theme.weather
        const weatherRandom =
          visualOptions.enabled && visualOptions.seed !== null
            ? createRng((visualOptions.seed + state.roundIndex) >>> 0)
            : Math.random
        weather = weatherKind ? createWeather(weatherKind, weatherRandom) : null
        if (weather) {
          staticGroup.add(weather.points)
        }

        for (const flag of state.flags) {
          const mesh = createFlagMesh(flag)
          flagMeshes.set(flag.id, mesh)
          dynamicGroup.add(mesh)
        }
        for (const pod of state.pods) {
          const mesh = createPodMesh(pod)
          podMeshes.set(pod.id, mesh)
          dynamicGroup.add(mesh)
        }
        // Traps and arrow pads never move within a round — static scenery.
        for (const trap of state.traps) {
          staticGroup.add(createTrapMesh(trap))
        }
        for (const pad of state.map.arrowPads) {
          staticGroup.add(createArrowPadMesh(pad, cellCenter(state.map, pad.cell)))
        }

        droneMesh = createDroneMesh()
        dynamicGroup.add(droneMesh)
        sceneRenderer.shadowMap.needsUpdate = true
        builtState = state
      }

      const visualOptions = readHoverVisualTestOptions()
      if (visualOptions.enabled) {
        resetHoverVisualReadiness()
      }

      const clock = new THREE.Clock()
      let accumulator = 0
      let hudTimer = 0
      let frameToggle = false
      let presentedState: EngineState | null = null
      let renderedFrames = 0
      let idleSettleFrames = 0
      let parked = false

      // Parking cancels the queued frame so a paused (or attract-screen) game
      // schedules NO rAF wakeups at all; wake() restarts the loop and is called
      // after every React commit.
      const park = (): void => {
        parked = true
        cancelAnimationFrame(frameId)
      }
      const wake = (): void => {
        if (active && parked) {
          parked = false
          clock.getDelta()
          animate()
        }
      }
      wakeRef.current = wake

      const animate = (): void => {
        if (!active) return
        frameId = requestAnimationFrame(animate)
        const startupFrame = presentedState !== engineRef.current || !engineRef.current
        try {
          const dt = Math.min(0.1, clock.getDelta())
          const elapsed = clock.elapsedTime
          const state = engineRef.current

          if (!state) {
            sceneRenderer.clear()
            onGraphicsStatusRef.current('ready')
            park()
            return
          }

          if (builtState !== state) {
            onGraphicsStatusRef.current('starting')
            rebuildRound(state)
            idleSettleFrames = 0
            accumulator = 0
          }

          if (idleRef.current) {
            // Paused: present a couple of settle frames, then park the loop —
            // the compositor keeps the last frame on screen.
            if (idleSettleFrames >= 2) {
              park()
              return
            }
            idleSettleFrames += 1
          } else {
            idleSettleFrames = 0
          }

          if (runningRef.current && presentedState === state) {
            accumulator = Math.min(accumulator + dt, DT * MAX_SUBSTEPS)
            const events: EngineEvent[] = []
            while (accumulator >= DT) {
              accumulator -= DT
              events.push(...stepEngine(state, readInputRef.current(), DT))
            }
            if (events.length > 0) {
              onEventsRef.current(events)
            }
          }

          const bob = runningRef.current ? Math.sin(elapsed * 3.1) * 0.045 : 0
          const cameraInput = readInputRef.current()
          camera.position.set(state.player.pos.x, state.player.altitude + COCKPIT_HEIGHT + bob, state.player.pos.z)
          camera.rotation.y = state.player.heading
          camera.rotation.z = -state.player.angularVel * 0.055
          camera.rotation.x = -0.045 - cameraInput.lookPitch * 0.14

          if (droneMesh) {
            droneMesh.position.set(state.drone.pos.x, state.drone.altitude + Math.sin(elapsed * 2.4) * 0.08, state.drone.pos.z)
            droneMesh.rotation.y = state.drone.heading
            animateDroneRings(droneMesh, elapsed)
          }

          for (const flag of state.flags) {
            const mesh = flagMeshes.get(flag.id)
            if (mesh) {
              mesh.visible = !flag.collected
              if (mesh.visible) {
                // Billboard around Y so the cloth never sits edge-on to the player.
                mesh.rotation.y = Math.atan2(state.player.pos.x - flag.pos.x, state.player.pos.z - flag.pos.z)
                if (Math.hypot(state.player.pos.x - flag.pos.x, state.player.pos.z - flag.pos.z) < CLOTH_ANIMATION_RANGE) {
                  animateFlagCloth(mesh, elapsed + flag.id)
                }
              }
            }
          }
          for (const pod of state.pods) {
            const mesh = podMeshes.get(pod.id)
            if (mesh) {
              mesh.visible = pod.active
              if (mesh.visible) {
                mesh.position.y = podFloatHeight(elapsed, pod.id)
                mesh.rotation.y = elapsed * 0.9 + pod.id
              }
            }
          }

          weather?.update(dt, state.player.pos.x, state.player.pos.z)

          frameToggle = !frameToggle
          if (frameToggle) {
            const minimapCanvas = minimapCanvasRef.current
            const ctx = minimapCanvas?.getContext('2d')
            if (minimapCanvas && ctx) {
              const dpr = minimapCanvas.clientWidth > 0 ? minimapCanvas.width / minimapCanvas.clientWidth : 1
              ctx.save()
              ctx.scale(dpr, dpr)
              drawMinimap(ctx, state, minimapCanvas.width / dpr, minimapCanvas.height / dpr)
              ctx.restore()
            }
          }

          sceneRenderer.render(scene, camera)
          // The mirror must render every frame: the main pass clears the whole
          // canvas, so a skipped mirror frame would flash the background through
          // the glass.
          const mirrorAspect = mirrorRectAspect(viewSize.width, viewSize.height)
          updateMirrorCamera(mirrorCamera, state.player, mirrorAspect)
          renderMirror(sceneRenderer, scene, mirrorCamera, viewSize.width, viewSize.height)

          if (presentedState !== state) {
            presentedState = state
            // Neither simulation nor phase timers can start until BOTH passes work.
            accumulator = 0
            clock.getDelta()
            onGraphicsStatusRef.current('ready')
          }
          hudTimer += dt
          if (hudTimer >= HUD_SNAPSHOT_INTERVAL_SEC) {
            hudTimer = 0
            onHudSnapshotRef.current(buildHudSnapshot(state))
          }

          renderedFrames += 1
          if (visualOptions.enabled && renderedFrames === 3) {
            markHoverVisualReady({
              frameCount: renderedFrames,
              mapId: state.map.id,
              renderedAt: performance.now(),
              seed: visualOptions.seed,
            })
          }
        } catch (error) {
          if (!startupFrame) throw error
          fail()
        }
      }

      animate()
    } catch {
      fail()
    }

    return cleanup
  }, [engineRef, minimapCanvasRef, graphicsAttempt])

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />
}

function mirrorRectAspect(width: number, height: number): number {
  const rect = mirrorRectPx(width, height)
  return rect.height > 0 ? rect.width / rect.height : 3
}

/** Best-effort teardown visits every resource, even if a driver disposal throws. */
function disposeSceneResources(scene: THREE.Scene | THREE.Group): void {
  const disposed = new Set<object>()
  const dispose = (resource: { dispose: () => void; userData?: Record<string, unknown> }): void => {
    if (disposed.has(resource) || resource.userData?.cached === true) return
    disposed.add(resource)
    try { resource.dispose() } catch { /* Release the remaining resources. */ }
  }
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) dispose(mesh.geometry)
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) dispose(value)
      }
      dispose(material)
    }
    if ((object as THREE.Light).isLight) dispose(object as THREE.Light)
  })
  if (scene instanceof THREE.Scene) {
    if (scene.background instanceof THREE.Texture) dispose(scene.background)
    scene.background = null
  }
  scene.clear()
}
