/**
 * Owns the three.js scene. React calls sync() every frame with plain inputs;
 * each layer rebuilds only when its own inputs change, so a steady frame costs
 * one comparison per layer plus the visitor matrices.
 */
import * as THREE from 'three'

import { clearGroup, disposeObject } from '../../_shared/three/threeUtils'
import storefrontSignsUrl from '../assets/storefront-signs.webp'
import { type BuildingAnalysis, lightLevel } from '../engine/analysis'
import { type Building, DOOR_STEP, type Facing } from '../engine/building'
import type { Car, Visitor } from '../engine/people'
import { type UseKind, USES } from '../engine/uses'
import { loadAtlas } from './atlasMaterials'
import { attachBackdrop } from './backdrop'
import { buildCityContext } from './cityGeometry'
import { buildFloorGeometry, buildGridGeometry, SLAB_THICKNESS } from './floorGeometry'
import { loadFloorAtlas } from './floorMaterials'
import { applyCamera, cameraSides, FLOOR_HEIGHT, type IsoView, type Viewport } from './isoCamera'
import { type FloorVisibility, floorVisibility, type QuarterTurn } from './isoProjection'
import { LIGHT_RAMP, PALETTE, rampColor, WALK_NONE, WALK_RAMP } from './palette'

export type OverlayKind = 'none' | 'light' | 'walk'

export type Preview =
  | { kind: 'rect', floor: number, x: number, y: number, width: number, depth: number, valid: boolean, tone: 'paint' | 'erase' }
  | { kind: 'room', floor: number, x: number, y: number, width: number, depth: number, use: UseKind, facing: Facing, valid: boolean, door: { x: number, y: number } | null, storefront: boolean }
  | { kind: 'core', floor: number, x: number, y: number, width: number, depth: number, cars: number, bottomFloor: number, topFloor: number, valid: boolean }

export interface SceneInputs {
  building: Building
  analysis: BuildingAnalysis
  /** Changes whenever the building or its identity changes (edits, undo, load). */
  stamp: number
  activeFloor: number
  exterior: boolean
  overlay: OverlayKind
  selectedRoomId: number | null
  selectedCoreId: string | null
  preview: Preview | null
  /** A dashed outline suggesting where the tutorial's current step goes. */
  guide: { floor: number, x: number, y: number, width: number, depth: number } | null
  visitors: readonly Visitor[]
  cars: readonly Car[]
}

const MAX_VISITORS = 64
const MAX_CARS_DRAWN = 64
const GHOST_OPACITY = 0.22
const WALK_OVERLAY_SPAN = 24

interface FloorLayer {
  group: THREE.Group
  solid: THREE.Mesh | null
  glass: THREE.Mesh | null
  signs: THREE.Mesh | null
}

/**
 * The lot's look for the active floor. Below ground it fades so the basement
 * shows, and stops writing depth so the grid, overlays and previews drawn
 * after it still pass the depth test underneath.
 */
export function lotLook(activeFloor: number, exterior: boolean): { opacity: number, depthWrite: boolean } {
  return !exterior && activeFloor < 0 ? { opacity: 0.07, depthWrite: false } : { opacity: 1, depthWrite: true }
}

export class Tower2Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.OrthographicCamera()
  private readonly scene = new THREE.Scene()
  private readonly cityGroup = new THREE.Group()
  private readonly floorsGroup = new THREE.Group()
  private readonly overlayGroup = new THREE.Group()
  private readonly previewGroup = new THREE.Group()
  private readonly guideGroup = new THREE.Group()
  private readonly grid: THREE.LineSegments
  private readonly visitors: THREE.InstancedMesh
  private readonly cars: THREE.InstancedMesh
  private readonly solidMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: GHOST_OPACITY, depthWrite: false })
  private readonly glassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false })
  private readonly ghostGlassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false })
  private readonly signMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  private readonly ghostSignMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: GHOST_OPACITY, depthWrite: false })
  private floors: FloorLayer[] = []
  private floorsKey = ''
  private cityStamp: number | null = null
  private overlayKey = ''
  private previewKey = ''
  private guideKey = ''
  private gridFloor: number | null = null
  private rotation: QuarterTurn = 0
  private readonly scratch = new THREE.Object3D()
  private readonly scratchColor = new THREE.Color()
  private readonly dusk = new THREE.Color(0x1b1446)
  private readonly lotMaterials: THREE.MeshBasicMaterial[] = []
  private readonly releaseFloorAtlas: () => void
  private readonly releaseSignAtlas: () => void
  private readonly releaseBackdrop: () => void

  constructor(canvas: HTMLCanvasElement, private readonly site: { width: number, depth: number }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.releaseBackdrop = attachBackdrop(canvas)
    this.releaseFloorAtlas = loadFloorAtlas([this.solidMaterial, this.ghostMaterial])
    this.releaseSignAtlas = loadAtlas([this.signMaterial, this.ghostSignMaterial], storefrontSignsUrl, { hideUntilLoaded: true })
    this.scene.add(this.cityGroup, this.floorsGroup, this.overlayGroup, this.previewGroup, this.guideGroup)
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.lotGrid, transparent: true, opacity: 0.22, depthWrite: false }))
    this.grid.renderOrder = 2
    this.scene.add(this.grid)
    const body = new THREE.CylinderGeometry(0.15, 0.19, 0.55, 8)
    body.translate(0, 0.28, 0)
    this.visitors = new THREE.InstancedMesh(body, new THREE.MeshBasicMaterial(), MAX_VISITORS)
    this.visitors.count = 0
    this.visitors.frustumCulled = false
    this.scene.add(this.visitors)
    const car = new THREE.BoxGeometry(0.72, 0.9, 0.72)
    car.translate(0, 0.47, 0)
    this.cars = new THREE.InstancedMesh(car, new THREE.MeshBasicMaterial({ color: PALETTE.car }), MAX_CARS_DRAWN)
    this.cars.count = 0
    this.cars.frustumCulled = false
    this.scene.add(this.cars)
  }

  setSize(viewport: Viewport, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(viewport.width, viewport.height, false)
  }

  setView(view: IsoView, viewport: Viewport): void {
    this.rotation = view.rotation
    applyCamera(this.camera, view, viewport)
  }

  sync(inputs: SceneInputs): void {
    this.syncCity(inputs)
    this.syncFloors(inputs)
    this.syncOverlay(inputs)
    this.syncPreview(inputs)
    this.syncGuide(inputs)
    this.syncGrid(inputs)
    this.syncVisitors(inputs)
    this.syncCars(inputs)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /** Draw calls from the last frame, for the render-cost readout and tests. */
  get drawCalls(): number {
    return this.renderer.info.render.calls
  }

  dispose(): void {
    this.releaseBackdrop()
    this.releaseFloorAtlas()
    this.releaseSignAtlas()
    disposeObject(this.scene)
    for (const material of [this.solidMaterial, this.ghostMaterial, this.glassMaterial, this.ghostGlassMaterial, this.signMaterial, this.ghostSignMaterial]) material.dispose()
    this.renderer.dispose()
  }

  private syncCity(inputs: SceneInputs): void {
    if (this.cityStamp === inputs.stamp) return
    this.cityStamp = inputs.stamp
    clearGroup(this.cityGroup)
    this.lotMaterials.length = 0
    const context = buildCityContext(this.site, inputs.building.entrance(), inputs.building.roomsOn(0))
    context.traverse(object => {
      if (object instanceof THREE.Mesh) this.lotMaterials.push(object.material as THREE.MeshBasicMaterial)
    })
    this.cityGroup.add(context)
  }

  private visibility(inputs: SceneInputs, floor: number): FloorVisibility {
    return inputs.exterior ? 'solid' : floorVisibility(floor, inputs.activeFloor)
  }

  private syncFloors(inputs: SceneInputs): void {
    // The cutaway follows the camera, so turning the view rebuilds the active floor's façade.
    const key = [inputs.stamp, inputs.activeFloor, inputs.exterior, inputs.selectedRoomId, inputs.selectedCoreId, this.rotation].join('|')
    if (key === this.floorsKey) return
    this.floorsKey = key
    // Materials are shared across floors, so only each layer's geometry is disposed.
    for (const layer of this.floors) {
      this.floorsGroup.remove(layer.group)
      layer.solid?.geometry.dispose()
      layer.glass?.geometry.dispose()
      layer.signs?.geometry.dispose()
    }
    this.floors = []
    for (const floor of inputs.building.builtFloors()) {
      const visibility = this.visibility(inputs, floor)
      if (visibility === 'hidden') continue
      const active = floor === inputs.activeFloor && !inputs.exterior
      const geometry = buildFloorGeometry(inputs.building, floor, {
        cutaway: active ? cameraSides(this.rotation) : [],
        selectedRoomId: inputs.selectedRoomId,
        selectedCoreId: inputs.selectedCoreId,
      })
      const group = new THREE.Group()
      const ghost = visibility === 'ghosted'
      const solid = geometry.solid ? new THREE.Mesh(geometry.solid, ghost ? this.ghostMaterial : this.solidMaterial) : null
      const glass = geometry.glass ? new THREE.Mesh(geometry.glass, ghost ? this.ghostGlassMaterial : this.glassMaterial) : null
      const signs = geometry.signs ? new THREE.Mesh(geometry.signs, ghost ? this.ghostSignMaterial : this.signMaterial) : null
      if (solid) group.add(solid)
      if (signs) {
        signs.raycast = () => {}
        group.add(signs)
      }
      if (glass) {
        glass.renderOrder = 1
        group.add(glass)
      }
      this.floorsGroup.add(group)
      this.floors.push({ group, solid, glass, signs })
    }
  }

  private syncOverlay(inputs: SceneInputs): void {
    const key = [inputs.stamp, inputs.activeFloor, inputs.overlay].join('|')
    if (key === this.overlayKey) return
    this.overlayKey = key
    clearGroup(this.overlayGroup)
    if (inputs.overlay === 'none') return
    const { building, analysis, activeFloor: floor } = inputs
    const { width } = building
    const colors: number[] = []
    const tiles: number[] = []
    if (inputs.overlay === 'light') {
      const daylight = analysis.daylight(floor)
      for (let index = 0; index < daylight.length; index++) {
        if (daylight[index] === 0) continue
        tiles.push(index)
        colors.push(rampColor(LIGHT_RAMP, lightLevel(daylight[index]!)))
      }
    } else {
      const walk = analysis.walkField(floor)
      const plate = building.plateMask(floor)
      const roomWalk = new Map(building.roomsOn(floor).map((room) => [room.id, walk[room.door.y * width + room.door.x]!]))
      for (let index = 0; index < walk.length; index++) {
        if (plate[index] !== 1) continue
        const room = building.roomAt(floor, index % width, (index / width) | 0)
        const steps = room ? roomWalk.get(room.id)! : walk[index]!
        if (!room && steps < 0) continue
        tiles.push(index)
        colors.push(steps < 0 ? WALK_NONE : rampColor(WALK_RAMP, steps / WALK_OVERLAY_SPAN))
      }
    }
    if (tiles.length === 0) return
    const plane = new THREE.PlaneGeometry(0.94, 0.94)
    plane.rotateX(-Math.PI / 2)
    const mesh = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.78, depthWrite: false }), tiles.length)
    const y = floor * FLOOR_HEIGHT + 0.05
    tiles.forEach((index, i) => {
      this.scratch.position.set((index % width) + 0.5, y, Math.floor(index / width) + 0.5)
      this.scratch.updateMatrix()
      mesh.setMatrixAt(i, this.scratch.matrix)
      mesh.setColorAt(i, this.scratchColor.setHex(colors[i]!))
    })
    mesh.renderOrder = 3
    this.overlayGroup.add(mesh)
  }

  private syncPreview(inputs: SceneInputs): void {
    const key = JSON.stringify(inputs.preview)
    if (key === this.previewKey) return
    this.previewKey = key
    clearGroup(this.previewGroup)
    const preview = inputs.preview
    if (!preview) return
    const color = preview.valid ? PALETTE.valid : PALETTE.invalid
    const material = (hex: number, opacity: number) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false })
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, opacity: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material(hex, opacity))
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      mesh.renderOrder = 4
      this.previewGroup.add(mesh)
    }
    const base = preview.floor * FLOOR_HEIGHT
    if (preview.kind === 'rect') {
      const hex = preview.valid ? (preview.tone === 'erase' ? PALETTE.invalid : PALETTE.valid) : 0x9ca3af
      box(preview.x, base - 0.02, preview.y, preview.x + preview.width, base + 0.12, preview.y + preview.depth, hex, 0.4)
    } else if (preview.kind === 'room') {
      const hex = preview.valid ? USES[preview.use].color : PALETTE.invalid
      box(preview.x + 0.04, base, preview.y + 0.04, preview.x + preview.width - 0.04, base + 0.62, preview.y + preview.depth - 0.04, hex, 0.5)
      // The door arrow shows which way the room faces even where it cannot go.
      const step = DOOR_STEP[preview.facing]
      const door = preview.door ?? {
        x: preview.facing === 'east' ? preview.x + preview.width - 1 : preview.facing === 'west' ? preview.x : preview.x + Math.floor((preview.width - 1) / 2),
        y: preview.facing === 'south' ? preview.y + preview.depth - 1 : preview.facing === 'north' ? preview.y : preview.y + Math.floor((preview.depth - 1) / 2),
      }
      box(door.x + 0.2, base, door.y + 0.2, door.x + 0.8, base + 0.7, door.y + 0.8, PALETTE.door, 0.85)
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3), material(preview.storefront ? PALETTE.canopy : PALETTE.door, 0.95))
      // Lay the cone flat and point it out through the door wall.
      arrow.rotation.set(Math.PI / 2, 0, 0)
      arrow.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.atan2(step.x, step.y))
      arrow.position.set(door.x + 0.5 + step.x * 1.25, base + 0.45, door.y + 0.5 + step.y * 1.25)
      arrow.renderOrder = 4
      this.previewGroup.add(arrow)
    } else {
      const bottom = preview.bottomFloor * FLOOR_HEIGHT
      const top = (preview.topFloor + 1) * FLOOR_HEIGHT - SLAB_THICKNESS
      box(preview.x + 0.06, bottom, preview.y + 0.06, preview.x + preview.width - 0.06, top, preview.y + preview.depth - 0.06, color, 0.45)
    }
  }

  private syncGuide(inputs: SceneInputs): void {
    const key = JSON.stringify(inputs.guide)
    if (key === this.guideKey) return
    this.guideKey = key
    clearGroup(this.guideGroup)
    const guide = inputs.guide
    if (!guide) return
    const y = guide.floor * FLOOR_HEIGHT + 0.03
    const { x, y: z, width, depth } = guide
    const outline = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, z), new THREE.Vector3(x + width, y, z), new THREE.Vector3(x + width, y, z + depth), new THREE.Vector3(x, y, z + depth),
    ])
    const line = new THREE.LineLoop(outline, new THREE.LineDashedMaterial({ color: PALETTE.canopy, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.95, depthWrite: false }))
    line.computeLineDistances()
    line.renderOrder = 5
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ color: PALETTE.canopy, transparent: true, opacity: 0.12, depthWrite: false }))
    fill.rotation.x = -Math.PI / 2
    fill.position.set(x + width / 2, y, z + depth / 2)
    fill.renderOrder = 5
    this.guideGroup.add(fill, line)
  }

  private syncGrid(inputs: SceneInputs): void {
    const floor = inputs.exterior ? null : inputs.activeFloor
    this.grid.visible = floor !== null
    const look = lotLook(inputs.activeFloor, inputs.exterior)
    if (this.lotMaterials[0]!.opacity !== look.opacity) {
      for (const material of this.lotMaterials) {
        material.opacity = look.opacity
        material.depthWrite = look.depthWrite
        material.transparent = look.opacity < 1
        material.needsUpdate = true
      }
    }
    if (floor === null || floor === this.gridFloor) return
    this.gridFloor = floor
    this.grid.geometry.dispose()
    this.grid.geometry = buildGridGeometry(this.site.width, this.site.depth, floor)
  }

  /** Cars on or near the active floor (every car in the exterior view), moving with their riders. */
  private syncCars(inputs: SceneInputs): void {
    let count = 0
    for (const car of inputs.cars) {
      if (count >= MAX_CARS_DRAWN) break
      if (!inputs.exterior && (car.floor > inputs.activeFloor + 0.05 || car.floor < inputs.activeFloor - 0.95)) continue
      this.scratch.position.set(car.x, car.floor * FLOOR_HEIGHT, car.y)
      this.scratch.updateMatrix()
      this.cars.setMatrixAt(count++, this.scratch.matrix)
    }
    this.cars.count = count
    this.cars.instanceMatrix.needsUpdate = true
  }

  private syncVisitors(inputs: SceneInputs): void {
    let count = 0
    for (const visitor of inputs.visitors) {
      if (count >= MAX_VISITORS) break
      // Riders are inside their car, which is drawn instead.
      const shown = visitor.ride?.state !== 'riding' && (inputs.exterior || (visitor.floor <= inputs.activeFloor + 0.05 && visitor.floor >= inputs.activeFloor - 0.95))
      if (!shown) continue
      const room = inputs.building.room(visitor.roomId)
      this.scratch.position.set(visitor.x, visitor.floor * FLOOR_HEIGHT, visitor.y)
      this.scratch.updateMatrix()
      this.visitors.setMatrixAt(count, this.scratch.matrix)
      this.visitors.setColorAt(count, this.scratchColor.setHex(room ? USES[room.use].color : 0xffffff).lerp(this.dusk, 0.25))
      count++
    }
    this.visitors.count = count
    this.visitors.instanceMatrix.needsUpdate = true
    if (this.visitors.instanceColor) this.visitors.instanceColor.needsUpdate = true
  }
}
