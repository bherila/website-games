/**
 * The one Three.js renderer for every Mandarin Quest scene. Loaded lazily by
 * `DioramaCanvas` after the first DOM paint. Budget: a single canvas, pixel
 * ratio capped at 1.5, shared Lambert materials keyed by colour, shared
 * primitive geometries, no shadows or post-processing. Everything created here
 * is disposed in `dispose()`; scene swaps clear and dispose the previous group.
 */
import * as THREE from 'three'

import type { SceneSetting } from '../domain/courseSchema'
import {
  CHARACTER_COLORS,
  type CharacterRole,
  type CharacterSpec,
  type DioramaBeat,
  type DioramaConfig,
  dioramaConfig,
  PALETTE,
  type PropSpec,
  type Vec2,
} from './sceneConfigs'

export interface DioramaMetrics {
  drawCalls: number
  triangles: number
  frameMs: number
}

export interface DioramaController {
  setScene(setting: SceneSetting): void
  setBeat(beat: DioramaBeat): void
  setReducedMotion(enabled: boolean): void
  setPaused(paused: boolean): void
  resize(width: number, height: number): void
  getMetrics(): DioramaMetrics
  dispose(): void
}

export interface DioramaOptions {
  pixelRatioCap?: number
  reducedMotion?: boolean
  onContextLost?: () => void
  onContextRestored?: () => void
}

const PIXEL_RATIO_CAP = 1.5
const CAMERA_EASE_MS = 900
const CHARACTER_EASE_MS = 1200

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

interface CharacterRig {
  spec: CharacterSpec
  group: THREE.Group
  from: THREE.Vector3
  to: THREE.Vector3
  startedAt: number
}

export function createDioramaRenderer(canvas: HTMLCanvasElement, options: DioramaOptions = {}): DioramaController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' })
  const cap = options.pixelRatioCap ?? PIXEL_RATIO_CAP
  renderer.setPixelRatio(Math.min(cap, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.5, 80)
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x8fa48a, 0.9)
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.6)
  scene.add(hemisphere, sun)

  const materials = new Map<number, THREE.MeshLambertMaterial>()
  const material = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial => {
    const key = extra.transparent ? color + 0x1000000 : color
    let cached = materials.get(key)
    if (!cached) {
      cached = new THREE.MeshLambertMaterial({ color, ...extra })
      materials.set(key, cached)
    }
    return cached
  }
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cone: new THREE.ConeGeometry(0.5, 1, 12),
    sphere: new THREE.SphereGeometry(0.5, 12, 10),
    plane: new THREE.PlaneGeometry(1, 1),
    arch: new THREE.TorusGeometry(1, 0.22, 8, 18, Math.PI),
    roof: new THREE.CylinderGeometry(0, 0.72, 1, 4, 1),
  }
  for (const geometry of Object.values(geometries)) geometry.userData.cached = true

  let group: THREE.Group | null = null
  let waterMesh: THREE.Mesh | null = null
  let lanternHeads: THREE.Mesh[] = []
  let characters: CharacterRig[] = []
  let config: DioramaConfig | null = null
  let beat: DioramaBeat = 'idle'
  let reducedMotion = options.reducedMotion ?? false
  let paused = false
  let disposed = false
  let frameHandle: number | null = null
  let lastFrameAt = 0
  let frameMs = 0
  let cameraFrom = new THREE.Vector3()
  let cameraTo = new THREE.Vector3()
  let targetFrom = new THREE.Vector3()
  let targetTo = new THREE.Vector3()
  let cameraStartedAt = -1
  let width = 1
  let height = 1

  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const mesh = (geometry: THREE.BufferGeometry, color: number, extra?: Partial<THREE.MeshLambertMaterialParameters>): THREE.Mesh => {
    const created = new THREE.Mesh(geometry, material(color, extra))
    created.matrixAutoUpdate = true
    return created
  }

  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotationY = 0): THREE.Mesh => {
    const item = mesh(geometries.box, color)
    item.position.set(x, y, z)
    item.scale.set(w, h, d)
    item.rotation.y = rotationY
    return item
  }

  const buildProp = (spec: PropSpec, parent: THREE.Group): void => {
    switch (spec.kind) {
      case 'hills': {
        const positions: Array<[number, number, number, number]> = [[-6, -9, 5, 1.8], [1, -11, 7, 2.4], [7, -9, 4.5, 1.6]]
        for (const [x, z, radius, h] of positions) {
          const hill = mesh(geometries.sphere, PALETTE.mist)
          hill.position.set(x, -radius + h, z)
          hill.scale.set(radius * 2.2, radius * 2, radius * 1.6)
          parent.add(hill)
        }
        return
      }
      case 'path': {
        const dx = spec.to[0] - spec.from[0]
        const dz = spec.to[1] - spec.from[1]
        const length = Math.hypot(dx, dz)
        const strip = mesh(geometries.plane, spec.color ?? PALETTE.path)
        strip.rotation.x = -Math.PI / 2
        strip.rotation.z = Math.atan2(dx, dz)
        strip.scale.set(spec.width, length, 1)
        strip.position.set((spec.from[0] + spec.to[0]) / 2, 0.012, (spec.from[1] + spec.to[1]) / 2)
        parent.add(strip)
        return
      }
      case 'paving': {
        const slab = mesh(geometries.plane, PALETTE.paving)
        slab.rotation.x = -Math.PI / 2
        slab.scale.set(spec.w, spec.d, 1)
        slab.position.set(spec.x, 0.01, spec.z)
        parent.add(slab)
        return
      }
      case 'building': {
        const rotation = spec.rotation ?? 0
        parent.add(box(spec.x, spec.h / 2, spec.z, spec.w, spec.h, spec.d, spec.wall, rotation))
        const roof = mesh(geometries.roof, spec.roof)
        roof.position.set(spec.x, spec.h + 0.45, spec.z)
        roof.rotation.y = Math.PI / 4 + rotation
        roof.scale.set(Math.max(spec.w, spec.d) * 1.15, 0.9, Math.max(spec.w, spec.d) * 1.15)
        parent.add(roof)
        const door = box(spec.x, 0.45, spec.z + spec.d / 2 + 0.02, 0.5, 0.9, 0.06, PALETTE.woodDark, rotation)
        parent.add(door)
        const sill = box(spec.x, 0.02, spec.z, spec.w + 0.3, 0.04, spec.d + 0.3, PALETTE.stoneDark, rotation)
        parent.add(sill)
        return
      }
      case 'gate': {
        const { x, z } = spec
        for (const offset of [-1.3, 1.3]) {
          parent.add(box(x + offset, 1.3, z, 0.26, 2.6, 0.26, PALETTE.woodDark))
        }
        parent.add(box(x, 2.6, z, 3.4, 0.22, 0.34, PALETTE.wood))
        parent.add(box(x, 2.9, z, 3.9, 0.16, 0.5, PALETTE.slateDark))
        parent.add(box(x, 3.15, z, 3.2, 0.24, 0.9, PALETTE.slate))
        parent.add(box(x, 3.4, z, 2.4, 0.2, 1.1, PALETTE.slateDark))
        parent.add(box(x, 0.05, z, 3.8, 0.1, 1.2, PALETTE.stone))
        return
      }
      case 'wall': {
        const height = spec.height ?? 1.1
        parent.add(box(spec.x, height / 2, spec.z, spec.length, height, 0.32, PALETTE.plaster, spec.rotation))
        parent.add(box(spec.x, height + 0.07, spec.z, spec.length + 0.1, 0.14, 0.46, PALETTE.slateDark, spec.rotation))
        return
      }
      case 'bridge': {
        const { x, z } = spec
        const deck = mesh(geometries.box, PALETTE.stone)
        deck.position.set(x, 0.62, z)
        deck.scale.set(2.2, 0.16, 4.2)
        parent.add(deck)
        for (const side of [-1, 1]) {
          const rail = box(x + side * 1.0, 0.95, z, 0.14, 0.5, 4.2, PALETTE.stoneDark)
          parent.add(rail)
          const cap = box(x + side * 1.0, 1.22, z, 0.2, 0.06, 4.3, PALETTE.paving)
          parent.add(cap)
          const arch = mesh(geometries.arch, PALETTE.stoneDark)
          arch.position.set(x + side * 1.0, 0.1, z)
          arch.rotation.y = Math.PI / 2
          arch.scale.set(1.6, 0.6, 1.6)
          parent.add(arch)
        }
        for (const end of [-1, 1]) {
          const ramp = box(x, 0.3, z + end * 2.5, 2.2, 0.6, 1.0, PALETTE.stone)
          ramp.rotation.x = end * -0.28
          parent.add(ramp)
        }
        return
      }
      case 'water': {
        const water = mesh(geometries.plane, PALETTE.water, { transparent: true, opacity: 0.92 })
        water.rotation.x = -Math.PI / 2
        water.scale.set(spec.w, spec.d, 1)
        water.position.set(spec.x, 0.006, spec.z)
        parent.add(water)
        waterMesh = water
        for (const side of [-1, 1]) {
          const bank = box(spec.x, 0.02, spec.z + side * (spec.d / 2 + 0.2), spec.w, 0.14, 0.4, PALETTE.stoneDark)
          parent.add(bank)
        }
        return
      }
      case 'tree': {
        const scale = spec.scale ?? 1
        const trunk = mesh(geometries.cylinder, PALETTE.wood)
        trunk.position.set(spec.x, 0.55 * scale, spec.z)
        trunk.scale.set(0.22 * scale, 1.1 * scale, 0.22 * scale)
        parent.add(trunk)
        const canopy = mesh(geometries.sphere, PALETTE.jade)
        canopy.position.set(spec.x, 1.55 * scale, spec.z)
        canopy.scale.set(1.7 * scale, 1.3 * scale, 1.7 * scale)
        parent.add(canopy)
        const highlight = mesh(geometries.sphere, PALETTE.jadeLight)
        highlight.position.set(spec.x + 0.3 * scale, 1.85 * scale, spec.z + 0.2 * scale)
        highlight.scale.set(0.9 * scale, 0.7 * scale, 0.9 * scale)
        parent.add(highlight)
        return
      }
      case 'bush': {
        const scale = spec.scale ?? 1
        const bush = mesh(geometries.sphere, PALETTE.jadeDark)
        bush.position.set(spec.x, 0.32 * scale, spec.z)
        bush.scale.set(1.0 * scale, 0.7 * scale, 0.9 * scale)
        parent.add(bush)
        const top = mesh(geometries.sphere, PALETTE.jadeLight)
        top.position.set(spec.x - 0.15 * scale, 0.5 * scale, spec.z + 0.1 * scale)
        top.scale.set(0.55 * scale, 0.4 * scale, 0.5 * scale)
        parent.add(top)
        return
      }
      case 'lantern': {
        parent.add(box(spec.x, 0.7, spec.z, 0.08, 1.4, 0.08, PALETTE.woodDark))
        const head = mesh(geometries.sphere, PALETTE.amber)
        head.position.set(spec.x, 1.5, spec.z)
        head.scale.set(0.34, 0.4, 0.34)
        parent.add(head)
        lanternHeads.push(head)
        parent.add(box(spec.x, 1.76, spec.z, 0.3, 0.06, 0.3, PALETTE.slateDark))
        return
      }
      case 'bench': {
        const rotation = spec.rotation ?? 0
        parent.add(box(spec.x, 0.42, spec.z, 1.4, 0.08, 0.42, PALETTE.wood, rotation))
        for (const offset of [-0.55, 0.55]) {
          const leg = box(spec.x + Math.cos(rotation) * offset, 0.2, spec.z - Math.sin(rotation) * offset, 0.1, 0.4, 0.36, PALETTE.woodDark, rotation)
          parent.add(leg)
        }
        return
      }
      case 'shelter': {
        const { x, z } = spec
        for (const [dx, dz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]] as const) {
          parent.add(box(x + dx, 1.1, z + dz, 0.16, 2.2, 0.16, PALETTE.wood))
        }
        parent.add(box(x, 2.28, z, 3.4, 0.16, 2.4, PALETTE.slateDark))
        parent.add(box(x, 2.5, z, 2.6, 0.3, 1.8, PALETTE.slate))
        parent.add(box(x, 0.04, z, 3.2, 0.08, 2.2, PALETTE.paving))
        return
      }
    }
  }

  const buildCharacter = (spec: CharacterSpec): THREE.Group => {
    const colors = CHARACTER_COLORS[spec.role]
    const figure = new THREE.Group()
    const body = mesh(geometries.cylinder, colors.coat)
    body.position.y = 0.55
    body.scale.set(0.44, 1.1, 0.34)
    figure.add(body)
    const shoulders = mesh(geometries.sphere, colors.coat)
    shoulders.position.y = 1.08
    shoulders.scale.set(0.46, 0.3, 0.36)
    figure.add(shoulders)
    const head = mesh(geometries.sphere, PALETTE.skin)
    head.position.y = 1.42
    head.scale.set(0.34, 0.36, 0.34)
    figure.add(head)
    const hair = mesh(geometries.sphere, colors.hair)
    hair.position.set(0, 1.52, -0.03)
    hair.scale.set(0.36, 0.26, 0.36)
    figure.add(hair)
    const shadow = mesh(geometries.plane, 0x000000, { transparent: true, opacity: 0.12 })
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.02
    shadow.scale.set(0.7, 0.5, 1)
    figure.add(shadow)
    figure.name = `character-${spec.role}`
    return figure
  }

  const vec = (position: Vec2): THREE.Vector3 => new THREE.Vector3(position[0], 0, position[1])

  const targetFor = (spec: CharacterSpec, currentBeat: DioramaBeat): Vec2 => (currentBeat === 'idle' ? spec.idle : spec.advance)

  const visibleFor = (spec: CharacterSpec, currentBeat: DioramaBeat): boolean => !spec.appearsOnComplete || currentBeat === 'complete'

  const disposeGroup = (): void => {
    if (!group) return
    scene.remove(group)
    group.traverse((child) => {
      const item = child as THREE.Mesh
      if (item.geometry && item.geometry.userData.cached !== true) item.geometry.dispose()
    })
    group = null
    waterMesh = null
    lanternHeads = []
    characters = []
  }

  const applyCamera = (next: DioramaConfig, animate: boolean): void => {
    cameraTo = new THREE.Vector3(...next.camera.position)
    targetTo = new THREE.Vector3(...next.camera.target)
    if (!animate || reducedMotion || cameraStartedAt === -1 && !config) {
      camera.position.copy(cameraTo)
      camera.lookAt(targetTo)
      cameraStartedAt = -1
      return
    }
    cameraFrom = camera.position.clone()
    targetFrom = targetFrom.equals(new THREE.Vector3()) ? targetTo.clone() : targetFrom
    cameraStartedAt = now()
  }

  const setScene = (setting: SceneSetting): void => {
    if (disposed) return
    const next = dioramaConfig(setting)
    const first = config === null
    disposeGroup()
    config = next
    scene.background = new THREE.Color(next.sky)
    scene.fog = new THREE.Fog(next.fog, 14, 34)
    sun.color.set(next.sunColor)
    sun.intensity = next.sunIntensity
    sun.position.set(...next.sun)
    hemisphere.intensity = next.ambient
    group = new THREE.Group()
    const ground = mesh(geometries.plane, next.ground)
    ground.rotation.x = -Math.PI / 2
    ground.scale.set(40, 40, 1)
    ground.position.y = -0.05
    group.add(ground)
    // Top face sits well below the ground plane: coplanar faces z-fight on 16-bit mobile depth buffers.
    const base = box(0, -0.4, 0, 15, 0.5, 13.5, PALETTE.woodDark)
    group.add(base)
    for (const prop of next.props) buildProp(prop, group)
    for (const spec of next.characters) {
      const figure = buildCharacter(spec)
      const start = vec(targetFor(spec, beat))
      figure.position.copy(start)
      figure.visible = visibleFor(spec, beat)
      group.add(figure)
      characters.push({ spec, group: figure, from: start.clone(), to: start.clone(), startedAt: -1 })
    }
    scene.add(group)
    applyCamera(next, !first)
    targetFrom = targetTo.clone()
  }

  const setBeat = (next: DioramaBeat): void => {
    if (beat === next) return
    beat = next
    const at = now()
    for (const rig of characters) {
      const destination = vec(targetFor(rig.spec, beat))
      const shouldShow = visibleFor(rig.spec, beat)
      if (shouldShow && !rig.group.visible) {
        rig.group.visible = true
        rig.group.position.copy(vec(rig.spec.idle))
      }
      rig.from = rig.group.position.clone()
      rig.to = destination
      rig.startedAt = reducedMotion ? -1 : at
      if (reducedMotion) rig.group.position.copy(destination)
      if (!shouldShow) rig.group.visible = false
    }
  }

  const render = (time: number): void => {
    frameHandle = null
    if (disposed) return
    if (paused) return
    const started = now()
    const dt = lastFrameAt === 0 ? 0 : Math.min(0.1, (time - lastFrameAt) / 1000)
    lastFrameAt = time

    if (cameraStartedAt >= 0) {
      const t = Math.min(1, (time - cameraStartedAt) / CAMERA_EASE_MS)
      const eased = easeInOut(t)
      camera.position.lerpVectors(cameraFrom, cameraTo, eased)
      const target = new THREE.Vector3().lerpVectors(targetFrom, targetTo, eased)
      camera.lookAt(target)
      if (t >= 1) {
        cameraStartedAt = -1
        targetFrom = targetTo.clone()
      }
    }
    for (const rig of characters) {
      if (rig.startedAt < 0) continue
      const t = Math.min(1, (time - rig.startedAt) / CHARACTER_EASE_MS)
      rig.group.position.lerpVectors(rig.from, rig.to, easeInOut(t))
      rig.group.position.y = reducedMotion ? 0 : Math.sin(t * Math.PI * 4) * 0.03 * (1 - t)
      if (t >= 1) {
        rig.startedAt = -1
        rig.group.position.y = 0
      }
    }
    if (!reducedMotion) {
      if (waterMesh) waterMesh.position.y = -0.04 + Math.sin(time / 900) * 0.01
      for (let index = 0; index < lanternHeads.length; index += 1) {
        const head = lanternHeads[index]!
        const pulse = 1 + Math.sin(time / 1400 + index) * 0.03
        head.scale.set(0.34 * pulse, 0.4 * pulse, 0.34 * pulse)
      }
    }
    void dt
    renderer.render(scene, camera)
    frameMs = now() - started
    schedule()
  }

  const schedule = (): void => {
    if (disposed || paused || frameHandle !== null) return
    frameHandle = requestAnimationFrame(render)
  }

  const onVisibility = (): void => {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      if (frameHandle !== null) cancelAnimationFrame(frameHandle)
      frameHandle = null
    } else {
      lastFrameAt = 0
      schedule()
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  const onContextLost = (event: Event): void => {
    event.preventDefault()
    paused = true
    if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    frameHandle = null
    options.onContextLost?.()
  }
  const onContextRestored = (): void => {
    paused = false
    lastFrameAt = 0
    schedule()
    options.onContextRestored?.()
  }
  canvas.addEventListener('webglcontextlost', onContextLost, false)
  canvas.addEventListener('webglcontextrestored', onContextRestored, false)

  schedule()

  return {
    setScene,
    setBeat,
    setReducedMotion(enabled) {
      reducedMotion = enabled
      if (enabled) {
        for (const rig of characters) {
          rig.startedAt = -1
          rig.group.position.copy(rig.to)
          rig.group.position.y = 0
        }
        if (cameraStartedAt >= 0) {
          camera.position.copy(cameraTo)
          camera.lookAt(targetTo)
          cameraStartedAt = -1
        }
      }
    },
    setPaused(next) {
      paused = next
      if (!next) {
        lastFrameAt = 0
        schedule()
      } else if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle)
        frameHandle = null
      }
    },
    resize(nextWidth, nextHeight) {
      width = Math.max(1, Math.floor(nextWidth))
      height = Math.max(1, Math.floor(nextHeight))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      schedule()
    },
    getMetrics() {
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs }
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (frameHandle !== null) cancelAnimationFrame(frameHandle)
      frameHandle = null
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost, false)
      canvas.removeEventListener('webglcontextrestored', onContextRestored, false)
      disposeGroup()
      for (const item of materials.values()) item.dispose()
      materials.clear()
      for (const geometry of Object.values(geometries)) geometry.dispose()
      hemisphere.dispose()
      sun.dispose()
      renderer.dispose()
    },
  }
}

export type { CharacterRole, DioramaBeat }
