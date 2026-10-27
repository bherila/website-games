/**
 * Owns the three.js scene. React calls sync() every frame with plain inputs;
 * each layer rebuilds only when its own inputs change, so a steady frame costs
 * one comparison per layer plus the visitor matrices.
 */
import * as THREE from 'three'

import { clearGroup, disposeObject } from '../../_shared/three/threeUtils'
import { type BuildingAnalysis, lightLevel } from '../engine/analysis'
import type { Building } from '../engine/building'
import type { Visitor } from '../engine/people'
import { type UseKind, USES } from '../engine/uses'
import { buildFloorGeometry, buildGridGeometry, SILL_HEIGHT, SLAB_THICKNESS } from './floorGeometry'
import { applyCamera, FLOOR_HEIGHT, type IsoView, type Viewport } from './isoCamera'
import { type FloorVisibility,floorVisibility } from './isoProjection'
import { LIGHT_RAMP, PALETTE, rampColor, WALK_NONE, WALK_RAMP } from './palette'

export type OverlayKind = 'none' | 'light' | 'walk'

export type Preview =
  | { kind: 'rect', floor: number, x: number, y: number, width: number, depth: number, valid: boolean, tone: 'paint' | 'erase' }
  | { kind: 'room', floor: number, x: number, y: number, width: number, depth: number, use: UseKind, valid: boolean, door: { x: number, y: number } | null }
  | { kind: 'core', floor: number, x: number, y: number, size: number, bottomFloor: number, topFloor: number, valid: boolean }

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
  visitors: readonly Visitor[]
}

const MAX_VISITORS = 64
const GHOST_OPACITY = 0.22
const WALK_OVERLAY_SPAN = 24

interface FloorLayer {
  group: THREE.Group
  solid: THREE.Mesh | null
  glass: THREE.Mesh | null
}

export class Tower2Renderer {
  readonly renderer: THREE.WebGLRenderer
  readonly camera = new THREE.OrthographicCamera()
  private readonly scene = new THREE.Scene()
  private readonly floorsGroup = new THREE.Group()
  private readonly overlayGroup = new THREE.Group()
  private readonly previewGroup = new THREE.Group()
  private readonly grid: THREE.LineSegments
  private readonly visitors: THREE.InstancedMesh
  private readonly solidMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: GHOST_OPACITY, depthWrite: false })
  private readonly glassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false })
  private readonly ghostGlassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false })
  private floors: FloorLayer[] = []
  private floorsKey = ''
  private overlayKey = ''
  private previewKey = ''
  private gridFloor = -1
  private readonly scratch = new THREE.Object3D()
  private readonly scratchColor = new THREE.Color()
  private readonly dusk = new THREE.Color(0x1b1446)

  constructor(canvas: HTMLCanvasElement, private readonly site: { width: number, depth: number }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    this.scene.add(this.lot(), this.floorsGroup, this.overlayGroup, this.previewGroup)
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.lotGrid, transparent: true, opacity: 0.22, depthWrite: false }))
    this.grid.renderOrder = 2
    this.scene.add(this.grid)
    const body = new THREE.CylinderGeometry(0.15, 0.19, 0.55, 8)
    body.translate(0, 0.28, 0)
    this.visitors = new THREE.InstancedMesh(body, new THREE.MeshBasicMaterial(), MAX_VISITORS)
    this.visitors.count = 0
    this.visitors.frustumCulled = false
    this.scene.add(this.visitors)
  }

  setSize(viewport: Viewport, pixelRatio: number): void {
    this.renderer.setPixelRatio(Math.min(pixelRatio, 2))
    this.renderer.setSize(viewport.width, viewport.height, false)
  }

  setView(view: IsoView, viewport: Viewport): void {
    applyCamera(this.camera, view, viewport)
  }

  sync(inputs: SceneInputs): void {
    this.syncFloors(inputs)
    this.syncOverlay(inputs)
    this.syncPreview(inputs)
    this.syncGrid(inputs)
    this.syncVisitors(inputs)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /** Draw calls from the last frame, for the render-cost readout and tests. */
  get drawCalls(): number {
    return this.renderer.info.render.calls
  }

  dispose(): void {
    disposeObject(this.scene)
    for (const material of [this.solidMaterial, this.ghostMaterial, this.glassMaterial, this.ghostGlassMaterial]) material.dispose()
    this.renderer.dispose()
  }

  private lot(): THREE.Object3D {
    const { width, depth } = this.site
    const group = new THREE.Group()
    const y = -SLAB_THICKNESS - 0.02
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(width + 4, depth + 4), new THREE.MeshBasicMaterial({ color: PALETTE.lot }))
    lot.rotation.x = -Math.PI / 2
    lot.position.set(width / 2, y, depth / 2)
    const street = new THREE.Mesh(new THREE.PlaneGeometry(width + 24, 4), new THREE.MeshBasicMaterial({ color: 0x15112f }))
    street.rotation.x = -Math.PI / 2
    street.position.set(width / 2, y - 0.01, depth + 4)
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(width + 24, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd23f }))
    kerb.rotation.x = -Math.PI / 2
    kerb.position.set(width / 2, y + 0.005, depth + 2.15)
    group.add(lot, street, kerb)
    return group
  }

  private visibility(inputs: SceneInputs, floor: number): FloorVisibility {
    return inputs.exterior ? 'solid' : floorVisibility(floor, inputs.activeFloor)
  }

  private syncFloors(inputs: SceneInputs): void {
    const key = [inputs.stamp, inputs.activeFloor, inputs.exterior, inputs.selectedRoomId, inputs.selectedCoreId].join('|')
    if (key === this.floorsKey) return
    this.floorsKey = key
    // Materials are shared across floors, so only each layer's geometry is disposed.
    for (const layer of this.floors) {
      this.floorsGroup.remove(layer.group)
      layer.solid?.geometry.dispose()
      layer.glass?.geometry.dispose()
    }
    this.floors = []
    for (let floor = 0; floor < inputs.building.floorCount; floor++) {
      const visibility = this.visibility(inputs, floor)
      if (visibility === 'hidden') continue
      const active = floor === inputs.activeFloor && !inputs.exterior
      const geometry = buildFloorGeometry(inputs.building, floor, {
        glassHeight: active ? SILL_HEIGHT : FLOOR_HEIGHT - SLAB_THICKNESS,
        selectedRoomId: inputs.selectedRoomId,
        selectedCoreId: inputs.selectedCoreId,
      })
      const group = new THREE.Group()
      const ghost = visibility === 'ghosted'
      const solid = geometry.solid ? new THREE.Mesh(geometry.solid, ghost ? this.ghostMaterial : this.solidMaterial) : null
      const glass = geometry.glass ? new THREE.Mesh(geometry.glass, ghost ? this.ghostGlassMaterial : this.glassMaterial) : null
      if (solid) group.add(solid)
      if (glass) {
        glass.renderOrder = 1
        group.add(glass)
      }
      this.floorsGroup.add(group)
      this.floors.push({ group, solid, glass })
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
      if (preview.door) box(preview.door.x + 0.2, base, preview.door.y + 0.2, preview.door.x + 0.8, base + 0.7, preview.door.y + 0.8, PALETTE.door, 0.85)
    } else {
      const bottom = preview.bottomFloor * FLOOR_HEIGHT
      const top = (preview.topFloor + 1) * FLOOR_HEIGHT - SLAB_THICKNESS
      box(preview.x + 0.06, bottom, preview.y + 0.06, preview.x + preview.size - 0.06, top, preview.y + preview.size - 0.06, color, 0.45)
    }
  }

  private syncGrid(inputs: SceneInputs): void {
    const floor = inputs.exterior ? -1 : inputs.activeFloor
    this.grid.visible = floor >= 0
    if (floor < 0 || floor === this.gridFloor) return
    this.gridFloor = floor
    this.grid.geometry.dispose()
    this.grid.geometry = buildGridGeometry(this.site.width, this.site.depth, floor)
  }

  private syncVisitors(inputs: SceneInputs): void {
    let count = 0
    for (const visitor of inputs.visitors) {
      if (count >= MAX_VISITORS) break
      const shown = inputs.exterior || (visitor.floor <= inputs.activeFloor + 0.05 && visitor.floor >= inputs.activeFloor - 0.95)
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
