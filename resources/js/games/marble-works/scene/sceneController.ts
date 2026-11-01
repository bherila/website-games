import * as THREE from 'three'

import { type ConfettiBurst, createConfettiBurst, disposeConfettiBurst, updateConfettiBurst } from '../../_shared/three/effects/confetti'
import { advanceFixedSteps, createFixedStepClock, type FixedStepClock } from '../../_shared/three/physicsStep'
import { clearGroup, disposeObject } from '../../_shared/three/threeUtils'
import { cellCenter, placementSize, placementWalls } from '../board/grid'
import { type BoardLayout, computeBoardLayout, orthoFrustum } from '../board/layout'
import type { Cell, LevelDef, PiecePlacement, PlacedPiece } from '../levels/levelTypes'
import { FIXED_STEP_S, GRAVITY_Y, MAX_STEPS_PER_FRAME } from '../physics/constants'
import { MARBLE_KINDS } from '../physics/marbles'
import { buildRunWorld, dropperSpawn, marbleSchedule, type RunEvent, type RunResult, type RunWorld, summarizeRun } from '../physics/runWorld'
import type { Vec2 } from '../pieces/pieceCatalog'
import {
  type BasketMesh,
  createBasket,
  createDropper,
  createGem,
  createGridLines,
  createObstacles,
  createPegboard,
  type DropperMesh,
  type GemMesh,
  PEGBOARD_Z,
} from './builders/boardMesh'
import { createMarbleMesh, type MarbleMesh } from './builders/marbleMesh'
import { createPieceMesh, pieceGlassMaterial, type PieceMesh, poseToggle } from './builders/pieceMesh'
import { PIECE_DEPTH } from './builders/wallGeometry'
import { createDotTrail, type DotTrail, setDotTrail, thinPath } from './effects/dotTrail'
import { createShardBurst, disposeShardBurst, type ShardBurst, updateShardBurst } from './effects/shards'
import {
  applyGlassQuality,
  type GlassQuality,
  isSoftwareRenderer,
  medianFrameTime,
  QUALITY_SAMPLE_FRAMES,
  QUALITY_SLOW_FRAME_S,
  setMaterialQuality,
} from './glassQuality'
import { GEM_COLOR, GHOST_OK_COLOR, GLASS_PIECE_TINT, MARBLE_STYLES, SELECTION_COLOR } from './palette'
import { canvasTexture } from './textures'

export interface SceneControllerOptions {
  reducedMotion: boolean
}

export interface RunCallbacks {
  onEnd: (result: RunResult) => void
  /** A gem was collected (for the HUD counter). */
  onGem?: (collected: number) => void
}

interface PlacedMesh {
  signature: string
  holder: THREE.Group
  mesh: PieceMesh
  bornAt: number
}

/** A marble on screen: its mesh, trail and the animation it is in. */
interface MarbleView {
  mesh: MarbleMesh
  trail: DotTrail
  /** Set when it lands in a basket: it sinks in and disappears. */
  sinking: { startedAt: number; from: Vec2; to: Vec2 } | null
}

/** A toggle paddle swinging between poses: t = 0 placed, 1 mirrored. */
interface ToggleSwing {
  mesh: PieceMesh
  from: number
  to: number
  startedAt: number
}

const SNAP_DURATION_S = 0.12
const SPRING_DURATION_S = 0.28
const GATE_OPEN_S = 0.14
const TOGGLE_SWING_S = 0.12
const SINK_DURATION_S = 0.3
const GEM_BURST_S = 0.7
const TRAIL_LENGTH = 22
const FRONT_Z = (PIECE_DEPTH / 2) + 0.05
/** Queued marbles wait in a row on top of their dropper, at this scale. */
const QUEUE_SCALE = 0.7

function signatureOf(placement: PiecePlacement): string {
  return `${placement.pieceId}|${placement.col}|${placement.row}|${placement.variant}|${placement.flipped ? 1 : 0}`
}

function footprintCenter(level: LevelDef, placement: PiecePlacement): Vec2 {
  const { w, h } = placementSize(placement)

  return [placement.col + (w / 2), level.rows - placement.row - (h / 2)]
}

/** Rounded-rectangle outline (a flat ring) around a footprint. */
function createOutline(width: number, height: number, color: string): THREE.Mesh {
  const roundedRect = (path: THREE.Path, w: number, h: number, r: number): void => {
    path.moveTo(-w / 2 + r, -h / 2)
    path.lineTo(w / 2 - r, -h / 2)
    path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
    path.lineTo(w / 2, h / 2 - r)
    path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
    path.lineTo(-w / 2 + r, h / 2)
    path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
    path.lineTo(-w / 2, -h / 2 + r)
    path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  }
  const shape = new THREE.Shape()
  roundedRect(shape, width, height, 0.14)
  const hole = new THREE.Path()
  roundedRect(hole, width - 0.08, height - 0.08, 0.11)
  shape.holes.push(hole)

  return new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }))
}

/**
 * Owns the three.js renderer and the cannon-es run for one level. React drives it
 * through setters; it never touches React state itself.
 */
export class MarbleWorksSceneController {
  readonly level: LevelDef
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  private readonly timer = new THREE.Timer()
  private readonly reducedMotion: boolean
  private readonly environment: THREE.Texture
  private layout: BoardLayout = { width: 1, height: 1, cellSize: 1, left: 0, top: 0 }
  private readonly pieces = new Map<string, PlacedMesh>()
  private placementsByIndex: PlacedPiece[] = []
  private readonly fixedMeshes: PieceMesh[] = []
  private readonly piecesGroup = new THREE.Group()
  private readonly overlayGroup = new THREE.Group()
  private readonly ghostGroup = new THREE.Group()
  private readonly selectionGroup = new THREE.Group()
  private readonly effectsGroup = new THREE.Group()
  private readonly gridLines: THREE.LineSegments
  private readonly droppers: DropperMesh[]
  private readonly baskets: BasketMesh[]
  private readonly gems: GemMesh[]
  private readonly schedule: ReturnType<typeof marbleSchedule>
  private readonly marbles: MarbleView[]
  private readonly ghostPaths: DotTrail[]
  private readonly shardMaterial: THREE.Material
  private glassQuality: GlassQuality
  /** Frame times sampled to decide whether refraction is affordable (null once decided). */
  private frameSamples: number[] | null = []
  private tutorialMarker: THREE.Mesh | null = null
  private run: RunWorld | null = null
  private runCallbacks: RunCallbacks | null = null
  private readonly clock: FixedStepClock = createFixedStepClock()
  /** Seconds (scene clock) when each dropper last opened its gate. */
  private gateOpenedAt: (number | null)[]
  private springs: { mesh: PieceMesh; startedAt: number }[] = []
  private swings: ToggleSwing[] = []
  private shardBursts: ShardBurst[] = []
  private bursts: ConfettiBurst[] = []
  private basketBobs: { basket: BasketMesh; startedAt: number }[] = []
  private wonAt: number | null = null
  private editing = true
  private frame = 0
  private disposed = false

  constructor(canvas: HTMLCanvasElement, level: LevelDef, options: SceneControllerOptions) {
    this.level = level
    this.reducedMotion = options.reducedMotion
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    // Refraction renders the board into a buffer behind the glass; half resolution is plenty
    // for marbles a few dozen pixels across and halves that pass's cost.
    this.renderer.transmissionResolutionScale = 0.5
    this.glassQuality = isSoftwareRenderer(this.renderer.getContext()) ? 'lite' : 'refractive'
    if (this.glassQuality === 'lite') {
      this.frameSamples = null
    }

    // A small painted studio (sky, floor and two soft boxes) gives glass, steel and gems
    // their reflections. Prefiltering a 128×64 image is far cheaper than rendering a room.
    const studio = canvasTexture(128, 64, (context) => {
      const sky = context.createLinearGradient(0, 0, 0, 64)
      sky.addColorStop(0, '#ffffff')
      sky.addColorStop(0.45, '#cfe6f7')
      sky.addColorStop(0.55, '#8a7a66')
      sky.addColorStop(1, '#3b3127')
      context.fillStyle = sky
      context.fillRect(0, 0, 128, 64)
      context.fillStyle = '#ffffff'
      context.fillRect(18, 10, 22, 12)
      context.fillRect(80, 14, 30, 8)
    })
    studio.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.environment = pmrem.fromEquirectangular(studio).texture
    studio.dispose()
    pmrem.dispose()

    this.scene.background = canvasTexture(4, 256, (context) => {
      const gradient = context.createLinearGradient(0, 0, 0, 256)
      gradient.addColorStop(0, '#5ab7ff')
      gradient.addColorStop(0.65, '#bfe6ff')
      gradient.addColorStop(1, '#eaf7ff')
      context.fillStyle = gradient
      context.fillRect(0, 0, 4, 256)
    })

    const cx = level.cols / 2
    const cy = level.rows / 2
    this.camera.position.set(cx, cy, 20)
    this.camera.lookAt(cx, cy, 0)

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b59a74', 1.35))
    const sun = new THREE.DirectionalLight('#ffffff', 1.7)
    sun.position.set(cx - 3, cy + 5, 10)
    sun.target.position.set(cx, cy, 0)
    sun.castShadow = true
    const extent = Math.max(level.cols, level.rows)
    sun.shadow.camera.left = -extent
    sun.shadow.camera.right = extent
    sun.shadow.camera.top = extent
    sun.shadow.camera.bottom = -extent
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 40
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.radius = 4
    sun.shadow.bias = -0.0015
    this.scene.add(sun, sun.target)

    this.scene.add(createPegboard(level))
    this.gridLines = createGridLines(level)
    this.scene.add(this.gridLines)
    this.scene.add(createObstacles(level))
    this.scene.add(this.overlayGroup)

    for (const fixed of level.fixed) {
      const mesh = createPieceMesh(level, fixed, 'fixed')
      this.fixedMeshes.push(mesh)
      this.scene.add(mesh.group)
    }

    this.droppers = level.droppers.map((_, index) => createDropper(level, index))
    this.baskets = level.baskets.map((_, index) => createBasket(level, index))
    this.gems = level.gems.map((_, index) => createGem(level, index))
    this.gateOpenedAt = level.droppers.map(() => null)
    for (const mesh of [...this.droppers, ...this.baskets, ...this.gems]) {
      this.scene.add(mesh.group)
    }
    this.scene.add(this.piecesGroup, this.ghostGroup, this.selectionGroup, this.effectsGroup)

    this.schedule = marbleSchedule(level)
    this.ghostPaths = this.schedule.map((marble) => createDotTrail(512, 0.035, marble.kind === 'steel' ? '#334155' : '#1e293b', 0.4))
    this.marbles = this.schedule.map((marble) => {
      const mesh = createMarbleMesh(marble.kind)
      const trail = createDotTrail(TRAIL_LENGTH, MARBLE_KINDS[marble.kind].radius * 0.5, '#ffffff', 0.35)
      this.scene.add(mesh.group, trail.mesh)

      return { mesh, trail, sinking: null }
    })
    for (const ghost of this.ghostPaths) {
      this.scene.add(ghost.mesh)
    }
    this.shardMaterial = pieceGlassMaterial(GLASS_PIECE_TINT)
    ;(this.shardMaterial as THREE.MeshPhysicalMaterial).envMap = this.environment
    this.placeMarblesInDroppers()
    this.dress(this.scene)

    this.timer.connect(document)
    this.loop = this.loop.bind(this)
    this.frame = requestAnimationFrame(this.loop)
  }

  resize(width: number, height: number): BoardLayout {
    this.layout = computeBoardLayout(this.level, width, height)
    const frustum = orthoFrustum(this.layout)
    this.camera.left = frustum.left
    this.camera.right = frustum.right
    this.camera.top = frustum.top
    this.camera.bottom = frustum.bottom
    this.camera.position.set(this.level.cols / 2, this.level.rows / 2, 20)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)

    return this.layout
  }

  setPlacements(placements: readonly PlacedPiece[]): void {
    const now = this.timer.getElapsed()
    const seen = new Set<string>()
    for (const placement of placements) {
      seen.add(placement.uid)
      const signature = signatureOf(placement)
      const existing = this.pieces.get(placement.uid)
      if (existing?.signature === signature) {
        continue
      }
      if (existing) {
        this.removePiece(placement.uid)
      }
      const mesh = createPieceMesh(this.level, placement, 'player')
      this.dress(mesh.group)
      const holder = new THREE.Group()
      const [cx, cy] = footprintCenter(this.level, placement)
      holder.position.set(cx, cy, 0)
      mesh.group.position.set(-cx, -cy, 0)
      holder.add(mesh.group)
      this.piecesGroup.add(holder)
      this.pieces.set(placement.uid, { signature, holder, mesh, bornAt: this.reducedMotion ? -Infinity : now })
    }
    for (const uid of [...this.pieces.keys()]) {
      if (!seen.has(uid)) {
        this.removePiece(uid)
      }
    }
    this.placementsByIndex = [...placements]
  }

  setGhost(ghost: { placement: PiecePlacement; ok: boolean } | null): void {
    clearGroup(this.ghostGroup)
    if (!ghost) {
      return
    }
    const mesh = createPieceMesh(this.level, ghost.placement, ghost.ok ? 'ghost-ok' : 'ghost-bad')
    mesh.group.position.z = 0.02
    this.ghostGroup.add(mesh.group)
    const { w, h } = placementSize(ghost.placement)
    const [cx, cy] = footprintCenter(this.level, ghost.placement)
    const outline = createOutline(w - 0.04, h - 0.04, ghost.ok ? GHOST_OK_COLOR : '#ef4444')
    outline.position.set(cx, cy, FRONT_Z)
    this.ghostGroup.add(outline)
  }

  setSelection(placement: PiecePlacement | null): void {
    clearGroup(this.selectionGroup)
    if (!placement) {
      return
    }
    const { w, h } = placementSize(placement)
    const [cx, cy] = footprintCenter(this.level, placement)
    const outline = createOutline(w - 0.02, h - 0.02, SELECTION_COLOR)
    outline.position.set(cx, cy, FRONT_Z)
    this.selectionGroup.add(outline)
  }

  /** Build-mode overlays: grid lines, free-cell tint for an armed piece, and the tutorial target. */
  setBuildOverlay(editing: boolean, freeCells: readonly Cell[], tutorialCell: Cell | null): void {
    this.editing = editing
    this.gridLines.visible = editing
    clearGroup(this.overlayGroup)
    this.tutorialMarker = null
    if (!editing) {
      return
    }
    for (const cell of freeCells) {
      const [x, y] = cellCenter(this.level, cell)
      const tint = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.92),
        new THREE.MeshBasicMaterial({ color: GHOST_OK_COLOR, transparent: true, opacity: 0.12, depthWrite: false }),
      )
      tint.position.set(x, y, PEGBOARD_Z + 0.015)
      this.overlayGroup.add(tint)
    }
    if (tutorialCell) {
      const [x, y] = cellCenter(this.level, tutorialCell)
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(0.94, 0.94),
        new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 0.45, depthWrite: false }),
      )
      marker.position.set(x, y, PEGBOARD_Z + 0.02)
      this.overlayGroup.add(marker)
      this.tutorialMarker = marker
    }
  }

  /** The last failed run's paths, one dotted line per marble. */
  setGhostPaths(paths: readonly (readonly Vec2[])[] | null): void {
    this.ghostPaths.forEach((ghost, index) => {
      setDotTrail(ghost, paths?.[index] ? thinPath(paths[index] ?? [], 2) : [], PEGBOARD_Z + 0.03, false)
    })
  }

  startRun(placements: readonly PiecePlacement[], callbacks: RunCallbacks): void {
    this.resetRun()
    this.run = buildRunWorld(this.level, placements)
    this.runCallbacks = callbacks
    this.clock.accumulator = 0
  }

  /** Stops any run and returns every marble, gem, pane and switch to its starting state. */
  resetRun(): void {
    this.run = null
    this.runCallbacks = null
    this.wonAt = null
    this.springs = []
    this.swings = []
    this.basketBobs = []
    this.gateOpenedAt = this.level.droppers.map(() => null)
    for (const basket of this.baskets) {
      basket.body.rotation.z = 0
      basket.body.position.y = this.level.rows - (this.level.baskets[this.baskets.indexOf(basket)]?.cell.row ?? 0) - 1
      for (const pip of basket.pips) {
        ;(pip.material as THREE.MeshBasicMaterial).opacity = 0.55
        ;(pip.material as THREE.MeshBasicMaterial).color.set('#ffffff')
      }
    }
    for (const dropper of this.droppers) {
      dropper.gate.rotation.z = 0
    }
    for (const gem of this.gems) {
      gem.group.visible = true
      gem.group.scale.setScalar(1)
    }
    for (const mesh of this.allPieceMeshes()) {
      if (mesh.glass) {
        mesh.glass.visible = true
      }
      if (mesh.paddle) {
        poseToggle(mesh.paddle, 0)
      }
    }
    for (const marble of this.marbles) {
      marble.sinking = null
      setDotTrail(marble.trail, [], 0, true)
    }
    this.placeMarblesInDroppers()
    this.clearEffects()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.timer.dispose()
    this.resetRun()
    this.scene.traverse((object) => {
      if (object !== this.scene) {
        disposeObject(object)
      }
    })
    ;(this.scene.background as THREE.Texture | null)?.dispose()
    this.environment.dispose()
    this.shardMaterial.dispose()
    this.renderer.dispose()
  }

  /**
   * Gives glass, steel and gem materials (the physical ones) the studio reflections, and
   * applies the glass quality. Plain painted materials skip the environment map: sampling it
   * across the whole pegboard costs a lot of fill rate for no visible gain.
   */
  private dress(root: THREE.Object3D): void {
    root.traverse((object) => {
      const { material } = object as THREE.Mesh
      if (material instanceof THREE.MeshPhysicalMaterial && material.envMap !== this.environment) {
        material.envMap = this.environment
        material.envMapIntensity *= 0.55
        material.needsUpdate = true
      }
    })
    applyGlassQuality(root, this.glassQuality)
    if (root === this.scene) {
      setMaterialQuality(this.shardMaterial, this.glassQuality)
    }
  }

  private setGlassQuality(quality: GlassQuality): void {
    this.glassQuality = quality
    applyGlassQuality(this.scene, quality)
    setMaterialQuality(this.shardMaterial, quality)
  }

  /** Samples early frame times and drops to lite glass if refraction is too slow here. */
  private sampleFrame(dt: number): void {
    if (!this.frameSamples) {
      return
    }
    this.frameSamples.push(dt)
    if (this.frameSamples.length < QUALITY_SAMPLE_FRAMES) {
      return
    }
    // The first frames include shader compilation; judge the rest.
    const slow = medianFrameTime(this.frameSamples.slice(5)) > QUALITY_SLOW_FRAME_S
    this.frameSamples = null
    if (slow) {
      this.setGlassQuality('lite')
    }
  }

  private *allPieceMeshes(): Generator<PieceMesh> {
    yield* this.fixedMeshes
    for (const entry of this.pieces.values()) {
      yield entry.mesh
    }
  }

  private clearEffects(): void {
    for (const burst of this.bursts) {
      this.effectsGroup.remove(burst.group)
      disposeConfettiBurst(burst)
    }
    for (const burst of this.shardBursts) {
      this.effectsGroup.remove(burst.group)
      disposeShardBurst(burst)
    }
    this.bursts = []
    this.shardBursts = []
  }

  private removePiece(uid: string): void {
    const entry = this.pieces.get(uid)
    if (!entry) {
      return
    }
    this.piecesGroup.remove(entry.holder)
    disposeObject(entry.holder)
    this.pieces.delete(uid)
  }

  /**
   * Each dropper's next marble sits in its cup; the rest wait in a row on its lip,
   * newest furthest right, so the player can read the release order.
   */
  private placeMarblesInDroppers(): void {
    const waitingByDropper = new Map<number, number>()
    this.schedule.forEach((entry, index) => {
      const view = this.marbles[index]
      const released = this.run?.marbles[index]?.tracker.status !== undefined && this.run.marbles[index]?.tracker.status !== 'waiting'
      if (!view || released) {
        return
      }
      const position = waitingByDropper.get(entry.dropper) ?? 0
      waitingByDropper.set(entry.dropper, position + 1)
      const [x, y] = dropperSpawn(this.level, entry.dropper)
      view.mesh.group.visible = true
      view.mesh.spinner.quaternion.identity()
      if (position === 0) {
        view.mesh.group.position.set(x, y, 0)
        view.mesh.group.scale.setScalar(1)
      } else {
        view.mesh.group.position.set(x - 0.42 + (position * 0.3), y + 0.66, FRONT_Z)
        view.mesh.group.scale.setScalar(QUEUE_SCALE * (0.2 / MARBLE_KINDS[entry.kind].radius) * 0.9)
      }
    })
  }

  private meshForPlacement(placementIndex: number): PieceMesh | undefined {
    return placementIndex >= 0
      ? this.pieces.get(this.placementsByIndex[placementIndex]?.uid ?? '')?.mesh
      : this.fixedMeshes[-placementIndex - 1]
  }

  private placementFor(placementIndex: number): PiecePlacement | undefined {
    return placementIndex >= 0 ? this.placementsByIndex[placementIndex] : this.level.fixed[-placementIndex - 1]
  }

  private handleRunEvent(event: RunEvent): void {
    const now = this.timer.getElapsed()
    switch (event.kind) {
      case 'release': {
        const dropper = this.schedule[event.marble]?.dropper ?? 0
        this.gateOpenedAt[dropper] = now
        this.placeMarblesInDroppers()
        break
      }
      case 'launch':
      case 'bounce': {
        const mesh = this.meshForPlacement(event.placementIndex)
        if (mesh?.spring) {
          this.springs.push({ mesh, startedAt: now })
        }
        break
      }
      case 'toggle': {
        const mesh = this.meshForPlacement(event.placementIndex)
        const placement = this.placementFor(event.placementIndex)
        if (mesh?.paddle && placement) {
          const to = event.flipped === placement.flipped ? 0 : 1
          if (this.reducedMotion) {
            poseToggle(mesh.paddle, to)
          } else {
            this.swings = this.swings.filter((swing) => swing.mesh !== mesh)
            this.swings.push({ mesh, from: 1 - to, to, startedAt: now })
          }
        }
        break
      }
      case 'shatter': {
        const mesh = this.meshForPlacement(event.placementIndex)
        const placement = this.placementFor(event.placementIndex)
        if (mesh?.glass && placement) {
          mesh.glass.visible = false
          const marble = this.run?.marbles[event.marble]?.body.velocity
          if (!this.reducedMotion) {
            const points = placementWalls(this.level, placement).flatMap((wall) => wall.points)
            const burst = createShardBurst(points, [marble?.x ?? 0, marble?.y ?? -1], (placement.col * 31) + (placement.row * 17) + 5, now, this.shardMaterial)
            this.shardBursts.push(burst)
            this.effectsGroup.add(burst.group)
          }
        }
        break
      }
      case 'gem': {
        const gem = this.gems[event.gem]
        if (gem) {
          gem.group.visible = false
          if (!this.reducedMotion) {
            const burst = createConfettiBurst(gem.group.position.clone().setZ(0.5), now, GEM_BURST_S, 0.45)
            for (const child of burst.group.children) {
              ;((child as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(Math.random() < 0.5 ? GEM_COLOR : '#fde68a')
            }
            this.bursts.push(burst)
            this.effectsGroup.add(burst.group)
          }
        }
        this.runCallbacks?.onGem?.(this.run?.gems.size ?? 0)
        break
      }
      case 'home': {
        const view = this.marbles[event.marble]
        const basket = this.baskets[event.basket]
        const cell = this.level.baskets[event.basket]?.cell
        if (view && cell) {
          const [bx, by] = cellCenter(this.level, cell)
          const { x, y } = view.mesh.group.position
          view.sinking = { startedAt: now, from: [x, y], to: [bx, by - 0.25] }
        }
        if (basket) {
          const held = this.run?.marbles.filter((marble) => marble.tracker.status === 'home' && marble.tracker.basket === event.basket).length ?? 0
          const pip = basket.pips[held - 1]
          if (pip) {
            ;(pip.material as THREE.MeshBasicMaterial).color.set(MARBLE_STYLES[this.schedule[event.marble]?.kind ?? 'glass'].badge)
            ;(pip.material as THREE.MeshBasicMaterial).opacity = 1
          }
          if (!this.reducedMotion) {
            this.basketBobs.push({ basket, startedAt: now })
          }
        }
        break
      }
    }
  }

  private finishRun(): void {
    const callbacks = this.runCallbacks
    const run = this.run
    this.runCallbacks = null
    if (!run) {
      return
    }
    if (run.status === 'won') {
      this.wonAt = this.timer.getElapsed()
      if (!this.reducedMotion) {
        for (const basket of this.level.baskets) {
          const [gx, gy] = cellCenter(this.level, basket.cell)
          const burst = createConfettiBurst(new THREE.Vector3(gx, gy + 0.3, 0.6), this.wonAt, 1.4, 0.9)
          this.bursts.push(burst)
          this.effectsGroup.add(burst.group)
        }
      }
    }
    callbacks?.onEnd(summarizeRun(this.level, run))
  }

  private loop(timestamp: number): void {
    if (this.disposed) {
      return
    }
    this.frame = requestAnimationFrame(this.loop)
    this.timer.update(timestamp)
    const dt = Math.min(this.timer.getDelta(), 0.1)
    const now = this.timer.getElapsed()

    const run = this.run
    if (run && this.runCallbacks) {
      let status = run.status
      advanceFixedSteps(this.clock, dt, { fixedStep: FIXED_STEP_S, maxSubsteps: MAX_STEPS_PER_FRAME }, () => {
        status = run.tick((event) => this.handleRunEvent(event))

        return status === 'running'
      })
      run.marbles.forEach((marble, index) => {
        const view = this.marbles[index]
        if (!view || marble.tracker.status === 'waiting' || view.sinking) {
          return
        }
        const { position, quaternion } = marble.body
        view.mesh.group.position.set(position.x, position.y, 0)
        view.mesh.group.scale.setScalar(1)
        view.mesh.spinner.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
        if (!this.reducedMotion && marble.tracker.status === 'rolling') {
          setDotTrail(view.trail, [...view.trail.points, [position.x, position.y] as Vec2].slice(-TRAIL_LENGTH), -0.05, true)
        }
      })
      if (status !== 'running') {
        this.finishRun()
      }
    }

    this.animate(now, dt)
    this.sampleFrame(dt)
    this.renderer.render(this.scene, this.camera)
  }

  private animate(now: number, dt: number): void {
    this.droppers.forEach((dropper, index) => {
      const opened = this.gateOpenedAt[index]
      // The gate swings open on each release and closes again under the next marble.
      const age = opened === null || opened === undefined ? Infinity : now - opened
      const open = age < GATE_OPEN_S ? age / GATE_OPEN_S : age < GATE_OPEN_S * 4 ? 1 - ((age - (GATE_OPEN_S * 3)) / GATE_OPEN_S) : 0
      dropper.gate.rotation.z = -Math.max(0, Math.min(1, open)) * 1.35
    })

    for (const entry of this.pieces.values()) {
      const age = now - entry.bornAt
      entry.holder.scale.setScalar(age < SNAP_DURATION_S ? 1.12 - (0.12 * (age / SNAP_DURATION_S)) : 1)
    }

    this.springs = this.springs.filter(({ mesh, startedAt }) => {
      const t = (now - startedAt) / SPRING_DURATION_S
      if (!mesh.spring) {
        return false
      }
      if (t >= 1) {
        mesh.spring.position.y = 0
        return false
      }
      mesh.spring.position.y = -Math.sin(t * Math.PI) * 0.06

      return true
    })

    this.swings = this.swings.filter((swing) => {
      const t = Math.min(1, (now - swing.startedAt) / TOGGLE_SWING_S)
      if (swing.mesh.paddle) {
        poseToggle(swing.mesh.paddle, swing.from + ((swing.to - swing.from) * (1 - ((1 - t) ** 2))))
      }

      return t < 1
    })

    for (const view of this.marbles) {
      if (!view.sinking) {
        continue
      }
      const t = Math.min(1, (now - view.sinking.startedAt) / SINK_DURATION_S)
      const { from, to } = view.sinking
      view.mesh.group.position.set(from[0] + ((to[0] - from[0]) * t), from[1] + ((to[1] - from[1]) * t), -0.1 * t)
      view.mesh.group.scale.setScalar(1 - (0.65 * t))
      if (t >= 1) {
        view.mesh.group.visible = false
        setDotTrail(view.trail, [], 0, true)
      }
    }

    this.basketBobs = this.basketBobs.filter(({ basket, startedAt }) => {
      const t = (now - startedAt) / 0.3
      const index = this.baskets.indexOf(basket)
      const base = this.level.rows - (this.level.baskets[index]?.cell.row ?? 0) - 1
      basket.body.position.y = base - (t < 1 ? Math.sin(t * Math.PI) * 0.06 : 0)

      return t < 1
    })

    const spin = this.reducedMotion ? 0 : now * 1.4
    for (const gem of this.gems) {
      gem.crystal.rotation.y = spin
      gem.crystal.position.y = this.reducedMotion ? 0 : Math.sin((now * 2.2) + gem.group.position.x) * 0.04
    }

    for (const basket of this.baskets) {
      const glowMaterial = basket.glow.material as THREE.MeshBasicMaterial
      glowMaterial.opacity = this.reducedMotion ? 0.3 : 0.25 + (Math.sin(now * 3) * 0.12)
    }
    if (this.tutorialMarker) {
      (this.tutorialMarker.material as THREE.MeshBasicMaterial).opacity = this.reducedMotion ? 0.45 : 0.3 + (Math.sin(now * 5) * 0.2)
    }
    this.gridLines.visible = this.editing

    if (this.wonAt !== null && !this.reducedMotion) {
      const since = now - this.wonAt
      for (const basket of this.baskets) {
        basket.body.rotation.z = Math.sin(since * 22) * 0.12 * Math.exp(-since * 3)
      }
    }

    this.bursts = this.bursts.filter((burst) => {
      if (updateConfettiBurst(burst, now, GRAVITY_Y, dt)) {
        this.effectsGroup.remove(burst.group)
        disposeConfettiBurst(burst)
        return false
      }
      return true
    })
    this.shardBursts = this.shardBursts.filter((burst) => {
      if (updateShardBurst(burst, now, GRAVITY_Y, dt)) {
        this.effectsGroup.remove(burst.group)
        disposeShardBurst(burst)
        return false
      }
      return true
    })
  }
}
