import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'

import { playEventSfx, type SfxName } from './audio/sfx'
import { buildHudSnapshot, drainEvents, setTargetX, tickGame, TRACK_HALF_WIDTH } from './gameEngine'
import type { GameState, HudSnapshot } from './gameTypes'
import { createEffects } from './scene/effects'
import { createEnvironment } from './scene/environment'
import { createGateView } from './scene/gateView'
import { createHordeView } from './scene/hordeView'
import { createSquadView } from './scene/squadView'

interface MathHordeSceneProps {
  active: boolean
  state: GameState
  playSfx?: (name: SfxName, intensity?: number) => void
  onFinish: (state: GameState) => void
  onHud: (hud: HudSnapshot) => void
}

const FIXED_STEP = 1 / 60

export function MathHordeScene({ active, state, playSfx, onFinish, onHud }: MathHordeSceneProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef(active)
  const finishSentRef = useRef(false)
  const onFinishRef = useRef(onFinish)
  const onHudRef = useRef(onHud)
  const playSfxRef = useRef(playSfx)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    onFinishRef.current = onFinish
    onHudRef.current = onHud
    playSfxRef.current = playSfx
  }, [onFinish, onHud, playSfx])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120)
    camera.position.set(0, 8.2, 10.5)
    camera.lookAt(0, 0.6, -7)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(renderer.domElement)

    const environment = createEnvironment(scene, state.level.length)
    const squadView = createSquadView(scene)
    const hordeView = createHordeView(scene)
    const gateView = createGateView(scene, state)
    const effects = createEffects(scene)
    const cameraBase = camera.position.clone()

    function resize(): void {
      if (!container) {
        return
      }
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    function pointerToTrackX(clientX: number): number {
      const rect = renderer.domElement.getBoundingClientRect()

      return ((clientX - rect.left) / Math.max(1, rect.width) - 0.5) * (TRACK_HALF_WIDTH * 2)
    }

    function handlePointer(event: PointerEvent): void {
      if (!activeRef.current) {
        return
      }
      renderer.domElement.setPointerCapture?.(event.pointerId)
      setTargetX(state, pointerToTrackX(event.clientX))
    }

    function handlePointerMove(event: PointerEvent): void {
      if (event.buttons !== 0 || event.pointerType === 'touch') {
        handlePointer(event)
      }
    }

    function handleWheel(event: WheelEvent): void {
      if (!activeRef.current) {
        return
      }
      event.preventDefault()
      const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaX * 16 : event.deltaX
      setTargetX(state, state.targetX + pixels * 0.015)
    }

    renderer.domElement.addEventListener('pointerdown', handlePointer)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })

    let animationFrame = 0
    let previousTime = performance.now()
    let accumulator = 0
    let hudAccumulator = 0

    function renderFrame(now: number): void {
      const frameDelta = Math.min(0.1, (now - previousTime) / 1_000)
      previousTime = now
      if (activeRef.current) {
        accumulator += frameDelta
        while (accumulator >= FIXED_STEP) {
          tickGame(state, FIXED_STEP)
          accumulator -= FIXED_STEP
        }
      }
      const events = drainEvents(state)
      effects.handleEvents(events, state)
      if (playSfxRef.current) {
        playEventSfx(events, playSfxRef.current)
      }

      hudAccumulator += frameDelta
      if (hudAccumulator >= 0.1) {
        hudAccumulator = 0
        onHudRef.current(buildHudSnapshot(state))
      }

      environment.update(state.progress)
      squadView.update(state, frameDelta)
      hordeView.update(state, frameDelta)
      gateView.update(state, frameDelta)
      effects.update(state, frameDelta)
      camera.position.set(cameraBase.x + effects.shakeOffset.x, cameraBase.y + effects.shakeOffset.y, cameraBase.z)

      renderer.render(scene, camera)
      if (state.status !== 'playing' && !finishSentRef.current) {
        finishSentRef.current = true
        onFinishRef.current(state)
      }
      animationFrame = requestAnimationFrame(renderFrame)
    }

    animationFrame = requestAnimationFrame(renderFrame)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointer)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('wheel', handleWheel)
      renderer.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) {
          object.dispose()
        }
        if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh || object instanceof THREE.Sprite) {
          object.geometry?.dispose()
          disposeMaterial(object.material)
        }
      })
      renderer.domElement.remove()
    }
  }, [state])

  return <div className="absolute inset-0 touch-none" data-testid="math-horde-scene" ref={containerRef} />
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material]
  for (const entry of materials) {
    if ('map' in entry && entry.map instanceof THREE.Texture) {
      entry.map.dispose()
    }
    entry.dispose()
  }
}
