import { type ReactElement, type RefObject, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { disposeObject } from '../_shared/three/threeUtils'
import { canvasSizeForContainer, pointerNdcForRect } from '../_shared/three/viewport'
import { playEventSfx, type SfxName } from './audio/sfx'
import { buildHudSnapshot, buildingAtCell, drainEvents, tickGame } from './gameEngine'
import { COLS, type GameState, type HudSnapshot, ROWS } from './gameTypes'
import { frameBoard } from './scene/boardCamera'
import { type BoardOverlay, createBuildingView } from './scene/buildingView'
import { createEffects } from './scene/effects'
import { createTerrainView } from './scene/terrainView'
import { THEMES } from './scene/themes'
import { createUnitView } from './scene/unitView'

const FIXED_STEP = 1 / 60
const HUD_SECONDS = 0.1
const MAX_STEPS_PER_FRAME = 16
const CAMERA_DISTANCE = 60

export interface BoardPointer {
  phase: 'down' | 'move' | 'up' | 'cancel'
  /** True while the button or finger is down. */
  pressed: boolean
  /** Exact position on the ground, in cells. */
  x: number
  y: number
  col: number
  row: number
  inBoard: boolean
  /** A building under the pointer, allowing for how tall it stands on screen. */
  buildingId: number | null
}

interface TowerDefenseSceneProps {
  state: GameState
  active: boolean
  speed: number
  overlayRef: RefObject<BoardOverlay>
  playSfx: (name: SfxName, intensity?: number) => void
  onPointer: (pointer: BoardPointer) => void
  onHud: (hud: HudSnapshot) => void
  onFinish: (state: GameState) => void
  onGraphicsAvailable: (state: GameState, available: boolean) => void
}

export function TowerDefenseScene({ state, active, speed, overlayRef, playSfx, onPointer, onHud, onFinish, onGraphicsAvailable }: TowerDefenseSceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const latestRef = useRef({ active, speed, playSfx, onPointer, onHud, onFinish, onGraphicsAvailable })

  useEffect(() => {
    latestRef.current = { active, speed, playSfx, onPointer, onHud, onFinish, onGraphicsAvailable }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const scene = new THREE.Scene()
    let rendererToDispose: THREE.WebGLRenderer | undefined
    let animationFrame = 0
    let running = true
    const stopCallbacks: (() => void)[] = []
    const release = (dispose: () => void): void => {
      try {
        dispose()
      } catch (error) {
        // A failed cleanup must not hide recovery or leave the failed canvas behind.
        console.error('Tower Defense graphics cleanup failed.', error)
      }
    }
    const cleanup = (): void => {
      running = false
      release(() => cancelAnimationFrame(animationFrame))
      for (const stop of stopCallbacks) release(stop)
      // Release GPU resources while Three still has its WebGLProperties.
      release(() => disposeObject(scene))
      release(() => rendererToDispose?.dispose())
      release(() => rendererToDispose?.domElement.remove())
    }

    try {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

      const theme = THEMES[state.level.theme]
      scene.background = new THREE.Color(theme.rim)
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)

      const renderer = new THREE.WebGLRenderer({ antialias: true })
      rendererToDispose = renderer
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NeutralToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.domElement.dataset.testid = 'tower-defense-canvas'
      renderer.domElement.setAttribute('aria-label', 'Battlefield')
      renderer.domElement.setAttribute('role', 'img')
      renderer.domElement.style.display = 'block'
      renderer.domElement.style.touchAction = 'none'
      container.appendChild(renderer.domElement)

      // A bright bounce from the ground keeps the shaded sides of models clay-soft, not black.
      scene.add(new THREE.HemisphereLight(theme.ambient, theme.groundLight, 1.45))
      const sun = new THREE.DirectionalLight(theme.sunlight, 2.1)
      sun.position.set((COLS / 2) - 10, 26, (ROWS / 2) + 8)
      sun.target.position.set(COLS / 2, 0, ROWS / 2)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.left = -18
      sun.shadow.camera.right = 18
      sun.shadow.camera.top = 18
      sun.shadow.camera.bottom = -18
      sun.shadow.camera.far = 70
      sun.shadow.bias = -0.0015
      scene.add(sun, sun.target)

      const terrainView = createTerrainView(scene, state)
      const buildingView = createBuildingView(scene)
      const unitView = createUnitView(scene)
      const effects = createEffects(scene, reducedMotion)

      function resize(): void {
        if (!running || !container) {
          return
        }
        const { width, height } = canvasSizeForContainer(container.clientWidth, container.clientHeight)
        renderer.setSize(width, height)
        const frame = frameBoard(width, height)
        const halfWidth = (width * frame.unitsPerPixel) / 2
        const halfHeight = (height * frame.unitsPerPixel) / 2
        camera.left = -halfWidth
        camera.right = halfWidth
        camera.top = halfHeight + frame.liftUnits
        camera.bottom = -halfHeight + frame.liftUnits
        camera.position.set(
          (COLS / 2) + (frame.direction.x * CAMERA_DISTANCE),
          frame.direction.y * CAMERA_DISTANCE,
          (ROWS / 2) + (frame.direction.z * CAMERA_DISTANCE),
        )
        camera.lookAt(COLS / 2, 0, ROWS / 2)
        camera.updateProjectionMatrix()
        camera.updateMatrixWorld()
      }
      const resizeObserver = new ResizeObserver(resize)
      stopCallbacks.push(() => resizeObserver.disconnect())
      resizeObserver.observe(container)
      resize()

      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const hit = new THREE.Vector3()

      /** Where a pointer ray meets a level `height` above the board. */
      function rayAt(height: number): THREE.Vector3 | null {
        ground.constant = -height

        return raycaster.ray.intersectPlane(ground, hit)
      }

      function readPointer(event: PointerEvent, phase: BoardPointer['phase'], pressed: boolean): BoardPointer | null {
        const point = pointerNdcForRect(event.clientX, event.clientY, renderer.domElement.getBoundingClientRect())
        if (!point) {
          return null
        }
        ndc.set(point.x, point.y)
        raycaster.setFromCamera(ndc, camera)
        // Tall models stand in front of the cells behind them, so look a little above the ground first.
        let buildingId: number | null = null
        for (const height of [0.9, 0.5, 0]) {
          const spot = rayAt(height)
          const building = spot ? buildingAtCell(state, Math.floor(spot.x), Math.floor(spot.z)) : null
          if (building) {
            buildingId = building.id
            break
          }
        }
        const spot = rayAt(0)
        if (!spot) {
          return null
        }
        const col = Math.floor(spot.x)
        const row = Math.floor(spot.z)

        return { phase, pressed, x: spot.x, y: spot.z, col, row, inBoard: col >= 0 && col < COLS && row >= 0 && row < ROWS, buildingId }
      }

      let activePointer: number | null = null

      function handleDown(event: PointerEvent): void {
        if (!running || activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) {
          return
        }
        activePointer = event.pointerId
        renderer.domElement.setPointerCapture?.(event.pointerId)
        const pointer = readPointer(event, 'down', true)
        if (pointer) {
          latestRef.current.onPointer(pointer)
        }
      }
      function handleMove(event: PointerEvent): void {
        if (!running || (activePointer !== null && event.pointerId !== activePointer)) {
          return
        }
        const pointer = readPointer(event, 'move', activePointer !== null)
        if (pointer) {
          latestRef.current.onPointer(pointer)
        }
      }
      function handleUp(event: PointerEvent): void {
        if (!running || event.pointerId !== activePointer) {
          return
        }
        activePointer = null
        const pointer = readPointer(event, 'up', false)
        if (pointer) {
          latestRef.current.onPointer(pointer)
        }
      }
      function handleCancel(event: PointerEvent): void {
        if (!running || event.pointerId !== activePointer) {
          return
        }
        activePointer = null
        const pointer = readPointer(event, 'cancel', false)
        if (pointer) {
          latestRef.current.onPointer(pointer)
        }
      }
      const canvas = renderer.domElement
      stopCallbacks.push(() => {
        canvas.removeEventListener('pointerdown', handleDown)
        canvas.removeEventListener('pointermove', handleMove)
        canvas.removeEventListener('pointerup', handleUp)
        canvas.removeEventListener('pointercancel', handleCancel)
      })
      canvas.addEventListener('pointerdown', handleDown)
      canvas.addEventListener('pointermove', handleMove)
      canvas.addEventListener('pointerup', handleUp)
      canvas.addEventListener('pointercancel', handleCancel)

      let previous = performance.now()
      let accumulator = 0
      let hudTimer = 0
      let finished = false

      function draw(now: number, frameDelta: number): void {
        const overlay = overlayRef.current
        terrainView.update(state, camera, now / 1000, overlay.tool !== null, reducedMotion)
        buildingView.update(state, overlay, now / 1000, reducedMotion)
        unitView.update(state, camera, reducedMotion, overlay.heroSelected)
        effects.update(frameDelta, camera)
        renderer.render(scene, camera)
      }

      function renderFrame(now: number): void {
        if (!running) return
        const frameDelta = Math.min(0.1, (now - previous) / 1000)
        previous = now
        const live = latestRef.current
        if (live.active && !document.hidden) {
          accumulator += frameDelta * live.speed
          let steps = 0
          while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
            tickGame(state, FIXED_STEP)
            accumulator -= FIXED_STEP
            steps += 1
          }
          if (steps === MAX_STEPS_PER_FRAME) {
            // A slow device runs the game slower rather than falling further behind.
            accumulator = 0
          }
        }
        const events = drainEvents(state)
        effects.handle(events)
        playEventSfx(events, live.playSfx)

        hudTimer += frameDelta
        if (hudTimer >= HUD_SECONDS) {
          hudTimer = 0
          live.onHud(buildHudSnapshot(state))
        }

        draw(now, frameDelta)

        if (state.status !== 'playing' && !finished) {
          finished = true
          live.onHud(buildHudSnapshot(state))
          live.onFinish(state)
        }
        animationFrame = requestAnimationFrame(renderFrame)
      }
      // Prove the battlefield can be drawn before input or simulation is enabled.
      draw(previous, 0)
      latestRef.current.onGraphicsAvailable(state, true)
      animationFrame = requestAnimationFrame(renderFrame)
    } catch (error) {
      cleanup()
      console.error('Tower Defense could not start WebGL.', error)
      latestRef.current.onGraphicsAvailable(state, false)
      return undefined
    }

    return cleanup
  }, [state, overlayRef])

  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="tower-defense-scene" ref={containerRef}>
      {/* Darkens the screen's edges to draw the eye to the board; pointers pass straight through. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 68%, rgba(0,0,0,0.16) 100%)' }} />
    </div>
  )
}
