import { type ReactElement, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'

import { playEventSfx, type SfxName } from './audio/sfx'
import { buildHudSnapshot, drainEvents, setTargetX, tickGame, TRACK_HALF_WIDTH } from './gameEngine'
import type { GameState, HudSnapshot } from './gameTypes'
import { createEffects } from './scene/effects'
import { createEnvironment } from './scene/environment'
import { createGateView } from './scene/gateView'
import { createHordeView } from './scene/hordeView'
import { safely, SceneResources } from './scene/resources'
import { createSquadView } from './scene/squadView'

export type GraphicsStatus = 'loading' | 'ready' | 'error'

interface MathHordeSceneProps {
  active: boolean
  state: GameState
  graphicsAttempt: number
  playSfx?: (name: SfxName, intensity?: number) => void
  onGraphicsStatus: (status: GraphicsStatus) => void
  onFinish: (state: GameState) => void
  onHud: (hud: HudSnapshot) => void
}

const FIXED_STEP = 1 / 60

export function MathHordeScene({ active, state, graphicsAttempt, playSfx, onFinish, onHud, onGraphicsStatus }: MathHordeSceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const liveRef = useRef({ active, onFinish, onHud, playSfx, onGraphicsStatus })
  const finishSentRef = useRef(false)

  useLayoutEffect(() => {
    liveRef.current = { active, onFinish, onHud, playSfx, onGraphicsStatus }
  }, [active, onFinish, onHud, playSfx, onGraphicsStatus])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let stopped = false
    let ready = false
    let animationFrame = 0
    let resizeObserver: ResizeObserver | undefined
    let renderer: THREE.WebGLRenderer | undefined
    const canvas = document.createElement('canvas')
    const resources = new SceneResources()
    const pointers = new Set<number>()
    const inputController = new AbortController()

    function cleanup(): void {
      if (stopped) {
        return
      }
      stopped = true
      ready = false
      safely(() => cancelAnimationFrame(animationFrame))
      safely(() => resizeObserver?.disconnect())
      safely(() => inputController.abort())
      for (const id of pointers) {
        safely(() => canvas.releasePointerCapture?.(id))
      }
      pointers.clear()
      // Release instance buffers, lights/shadows, textures, materials and geometry
      // while the renderer's disposal listeners still exist.
      resources.dispose()
      safely(() => renderer?.dispose())
      safely(() => canvas.remove())
    }

    function fail(): void {
      if (stopped) {
        return
      }
      cleanup()
      liveRef.current.onGraphicsStatus('error')
    }

    liveRef.current.onGraphicsStatus('loading')
    try {
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120)
      camera.position.set(0, 8.2, 10.5)
      camera.lookAt(0, 0.6, -7)

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      const graphics = renderer
      graphics.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      graphics.shadowMap.enabled = true
      graphics.outputColorSpace = THREE.SRGBColorSpace
      graphics.toneMapping = THREE.ACESFilmicToneMapping
      container.appendChild(canvas)

      const environment = createEnvironment(scene, state.level.length, resources)
      const squadView = createSquadView(scene, resources)
      const hordeView = createHordeView(scene, resources)
      const gateView = createGateView(scene, state, resources)
      const effects = createEffects(scene, resources)
      const cameraBase = camera.position.clone()

      function resize(): void {
        if (stopped) {
          return
        }
        try {
          const width = container!.clientWidth
          const height = container!.clientHeight
          graphics.setSize(width, height)
          camera.aspect = width / Math.max(1, height)
          camera.updateProjectionMatrix()
        } catch {
          fail()
        }
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      resize()
      if (stopped) {
        return cleanup
      }

      function handlePointer(event: PointerEvent): void {
        if (stopped || !ready || !liveRef.current.active || !pointers.has(event.pointerId)) {
          return
        }
        const rect = canvas.getBoundingClientRect()
        setTargetX(state, ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * TRACK_HALF_WIDTH * 2)
      }
      function pointerDown(event: PointerEvent): void {
        if (stopped || !ready || !liveRef.current.active) {
          return
        }
        pointers.add(event.pointerId)
        canvas.setPointerCapture?.(event.pointerId)
        handlePointer(event)
      }
      function pointerUp(event: PointerEvent): void {
        pointers.delete(event.pointerId)
      }
      function wheel(event: WheelEvent): void {
        if (stopped || !ready || !liveRef.current.active) {
          return
        }
        event.preventDefault()
        const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaX * 16 : event.deltaX
        setTargetX(state, state.targetX + pixels * 0.015)
      }
      function contextLost(event: Event): void {
        event.preventDefault()
        fail()
      }
      const signal = inputController.signal
      canvas.addEventListener('pointerdown', pointerDown, { signal })
      canvas.addEventListener('pointermove', handlePointer, { signal })
      canvas.addEventListener('pointerup', pointerUp, { signal })
      canvas.addEventListener('pointercancel', pointerUp, { signal })
      canvas.addEventListener('wheel', wheel, { passive: false, signal })
      canvas.addEventListener('webglcontextlost', contextLost, { signal })

      function draw(dt: number): void {
        environment.update(state.progress)
        squadView.update(state, dt)
        hordeView.update(state, dt)
        gateView.update(state, dt)
        effects.update(state, dt)
        camera.position.set(cameraBase.x + effects.shakeOffset.x, cameraBase.y + effects.shakeOffset.y, cameraBase.z)
        graphics.render(scene, camera)
      }

      // A populated first draw must succeed before simulation, events, HUD or
      // result callbacks can run. A retry only rebuilds views of this same run.
      draw(0)
      if (stopped) {
        return cleanup
      }
      ready = true
      liveRef.current.onGraphicsStatus('ready')
      let previousTime = performance.now()
      let accumulator = 0
      let hudAccumulator = 0

      function renderFrame(now: number): void {
        if (stopped || !ready) {
          return
        }
        try {
          const frameDelta = Math.min(0.1, (now - previousTime) / 1_000)
          previousTime = now
          if (liveRef.current.active) {
            accumulator += frameDelta
            while (accumulator >= FIXED_STEP) {
              tickGame(state, FIXED_STEP)
              accumulator -= FIXED_STEP
            }
          } else {
            accumulator = 0
            pointers.clear()
          }
          const events = drainEvents(state)
          effects.handleEvents(events, state)
          draw(frameDelta)
          if (stopped) {
            return
          }
          if (liveRef.current.playSfx) {
            playEventSfx(events, liveRef.current.playSfx)
          }
          hudAccumulator += frameDelta
          if (hudAccumulator >= 0.1) {
            hudAccumulator = 0
            liveRef.current.onHud(buildHudSnapshot(state))
          }
          if (state.status !== 'playing' && !finishSentRef.current) {
            finishSentRef.current = true
            liveRef.current.onFinish(state)
          }
          animationFrame = requestAnimationFrame(renderFrame)
        } catch {
          fail()
        }
      }
      animationFrame = requestAnimationFrame(renderFrame)
    } catch {
      fail()
    }

    return cleanup
  }, [state, graphicsAttempt])

  return <div className="absolute inset-0 touch-none" data-testid="math-horde-scene" ref={containerRef} />
}
