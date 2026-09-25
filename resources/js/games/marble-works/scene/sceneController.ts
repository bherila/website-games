import * as THREE from 'three'

import { type ConfettiBurst, createConfettiBurst, disposeConfettiBurst, updateConfettiBurst } from '../../_shared/three/effects/confetti'
import { advanceFixedSteps, createFixedStepClock, type FixedStepClock } from '../../_shared/three/physicsStep'
import { clearGroup, disposeObject } from '../../_shared/three/threeUtils'
import { cellCenter, placementSize } from '../board/grid'
import { type BoardLayout, computeBoardLayout, orthoFrustum } from '../board/layout'
import type { Cell, LevelDef, PiecePlacement, PlacedPiece } from '../levels/levelTypes'
import { FIXED_STEP_S, GRAVITY_Y, MAX_STEPS_PER_FRAME } from '../physics/constants'
import type { RunStatus } from '../physics/runOutcome'
import { buildRunWorld, marbleSpawn, type RunEvent, type RunWorld } from '../physics/runWorld'
import type { Vec2 } from '../pieces/pieceCatalog'
import { type BasketMesh, createBasket, createDropper, createGridLines, createObstacles, createPegboard, type DropperMesh, PEGBOARD_Z } from './builders/boardMesh'
import { createMarbleMesh, type MarbleMesh } from './builders/marbleMesh'
import { createPieceMesh, type PieceMesh } from './builders/pieceMesh'
import { PIECE_DEPTH } from './builders/wallGeometry'
import { createDotTrail, type DotTrail, setDotTrail, thinPath } from './effects/dotTrail'
import { GHOST_OK_COLOR, SELECTION_COLOR } from './palette'
import { canvasTexture } from './textures'

export interface SceneControllerOptions {
  reducedMotion: boolean
}

export interface RunCallbacks {
  onEnd: (status: Exclude<RunStatus, 'running'>, path: Vec2[]) => void
}

interface PlacedMesh {
  signature: string
  holder: THREE.Group
  mesh: PieceMesh
  bornAt: number
}

const SNAP_DURATION_S = 0.12
const SPRING_DURATION_S = 0.28
const GATE_OPEN_S = 0.14
const TRAIL_LENGTH = 22
const FRONT_Z = (PIECE_DEPTH / 2) + 0.05

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
  private layout: BoardLayout = { width: 1, height: 1, cellSize: 1, left: 0, top: 0 }
  private readonly pieces = new Map<string, PlacedMesh>()
  private placementsByIndex: PlacedPiece[] = []
  private readonly fixedMeshes: PieceMesh[] = []
  private readonly piecesGroup = new THREE.Group()
  private readonly overlayGroup = new THREE.Group()
  private readonly ghostGroup = new THREE.Group()
  private readonly selectionGroup = new THREE.Group()
  private readonly gridLines: THREE.LineSegments
  private readonly dropper: DropperMesh
  private readonly basket: BasketMesh
  private readonly marble: MarbleMesh
  private readonly trail: DotTrail
  private readonly ghostPath: DotTrail
  private tutorialMarker: THREE.Mesh | null = null
  private run: RunWorld | null = null
  private runCallbacks: RunCallbacks | null = null
  private readonly clock: FixedStepClock = createFixedStepClock()
  private runStartedAt = 0
  private springs: { mesh: PieceMesh; startedAt: number }[] = []
  private confetti: ConfettiBurst | null = null
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

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b59a74', 1.7))
    const sun = new THREE.DirectionalLight('#ffffff', 1.9)
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

    this.dropper = createDropper(level)
    this.basket = createBasket(level)
    this.scene.add(this.dropper.group, this.basket.group, this.piecesGroup, this.ghostGroup, this.selectionGroup)

    this.ghostPath = createDotTrail(512, 0.035, '#1e293b', 0.4)
    this.trail = createDotTrail(TRAIL_LENGTH, 0.1, '#ffffff', 0.35)
    this.scene.add(this.ghostPath.mesh, this.trail.mesh)

    this.marble = createMarbleMesh()
    this.scene.add(this.marble.group)
    this.placeMarbleAtSpawn()

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

  setGhostPath(path: readonly Vec2[] | null): void {
    setDotTrail(this.ghostPath, path ? thinPath(path, 2) : [], PEGBOARD_Z + 0.03, false)
  }

  startRun(placements: readonly PiecePlacement[], callbacks: RunCallbacks): void {
    this.resetRun()
    this.run = buildRunWorld(this.level, placements)
    this.runCallbacks = callbacks
    this.clock.accumulator = 0
    this.runStartedAt = this.timer.getElapsed()
  }

  /** Stops any run and returns the marble to the dropper. */
  resetRun(): void {
    this.run = null
    this.runCallbacks = null
    this.wonAt = null
    this.springs = []
    this.basket.body.rotation.z = 0
    this.dropper.gate.rotation.z = 0
    this.placeMarbleAtSpawn()
    setDotTrail(this.trail, [], 0, true)
    if (this.confetti) {
      this.scene.remove(this.confetti.group)
      disposeConfettiBurst(this.confetti)
      this.confetti = null
    }
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
    this.renderer.dispose()
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

  private placeMarbleAtSpawn(): void {
    const [x, y] = marbleSpawn(this.level)
    this.marble.group.position.set(x, y, 0)
    this.marble.spinner.quaternion.identity()
  }

  private handleRunEvent(event: RunEvent): void {
    const mesh = event.placementIndex >= 0
      ? this.pieces.get(this.placementsByIndex[event.placementIndex]?.uid ?? '')?.mesh
      : this.fixedMeshes[-event.placementIndex - 1]
    if (mesh?.spring) {
      this.springs.push({ mesh, startedAt: this.timer.getElapsed() })
    }
  }

  private finishRun(status: Exclude<RunStatus, 'running'>): void {
    const callbacks = this.runCallbacks
    const path = this.run ? [...this.run.path] : []
    this.runCallbacks = null
    if (status === 'won') {
      this.wonAt = this.timer.getElapsed()
      if (!this.reducedMotion) {
        const [gx, gy] = cellCenter(this.level, this.level.goal)
        this.confetti = createConfettiBurst(new THREE.Vector3(gx, gy + 0.3, 0.6), this.wonAt, 1.4, 0.9)
        this.scene.add(this.confetti.group)
      }
    }
    callbacks?.onEnd(status, path)
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
      let status: RunStatus = run.tracker.status
      advanceFixedSteps(this.clock, dt, { fixedStep: FIXED_STEP_S, maxSubsteps: MAX_STEPS_PER_FRAME }, () => {
        status = run.tick((event) => this.handleRunEvent(event))

        return status === 'running'
      })
      const { position, quaternion } = run.marble
      this.marble.group.position.set(position.x, position.y, 0)
      this.marble.spinner.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
      if (!this.reducedMotion) {
        setDotTrail(this.trail, [...this.trail.points, [position.x, position.y] as Vec2].slice(-TRAIL_LENGTH), -0.05, true)
      }
      if (status !== 'running') {
        this.finishRun(status)
      }
    }

    const gateProgress = this.run ? Math.min(1, (now - this.runStartedAt) / GATE_OPEN_S) : 0
    this.dropper.gate.rotation.z = -gateProgress * 1.35

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

    const glowMaterial = this.basket.glow.material as THREE.MeshBasicMaterial
    glowMaterial.opacity = this.reducedMotion ? 0.3 : 0.25 + (Math.sin(now * 3) * 0.12)
    if (this.tutorialMarker) {
      (this.tutorialMarker.material as THREE.MeshBasicMaterial).opacity = this.reducedMotion ? 0.45 : 0.3 + (Math.sin(now * 5) * 0.2)
    }
    this.gridLines.visible = this.editing

    if (this.wonAt !== null && !this.reducedMotion) {
      const since = now - this.wonAt
      this.basket.body.rotation.z = Math.sin(since * 22) * 0.12 * Math.exp(-since * 3)
    }
    if (this.confetti && updateConfettiBurst(this.confetti, now, GRAVITY_Y, dt)) {
      this.scene.remove(this.confetti.group)
      disposeConfettiBurst(this.confetti)
      this.confetti = null
    }

    this.renderer.render(this.scene, this.camera)
  }
}
