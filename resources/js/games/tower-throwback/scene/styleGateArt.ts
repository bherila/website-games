import * as THREE from 'three'

import { shaftDef } from '../engine/catalog'
import { isSlabFamily } from '../engine/grid'
import { getMap } from '../engine/maps'
import { type EngineState, GRID_WIDTH, TUNING, type Unit } from '../gameTypes'
import { dwellRenderSlot, isDwellingVisitor } from './dwellSlots'
import { QUEUE_ICON_HEIGHT, QUEUE_ICON_WIDTH, QUEUE_ICON_Z, QUEUE_RENDER_MAX, queueSlotX, resolveQueuedRender } from './elevatorQueues'
import { daylightAt, FLOOR_H, getPalette, skyColorAt, type TowerPalette } from './palette'
import {
  approach,
  PERSON_SNAP_FLOORS,
  PERSON_SNAP_TILES,
  PERSON_VISUAL_FLOORS_PER_SEC,
  PERSON_VISUAL_TILES_PER_SEC,
  type SceneFrame,
} from './sceneFrame'
import {
  STYLE_GATE_ATLAS_HEIGHT,
  STYLE_GATE_ATLAS_WIDTH,
  STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES,
  STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES,
  STYLE_GATE_FRAMES,
  STYLE_GATE_NIAGARA_GORGE_FRAME,
  styleGateCarBodyFrameName,
  styleGateCloudFrameName,
  styleGateDamageFrameName,
  type StyleGateDetailLevel,
  styleGateDoorFrameName,
  type StyleGateFrame,
  styleGateFrameHasAtlasPixels,
  type StyleGateFrameName,
  styleGatePersonFrameName,
  styleGatePersonReadsIrritated,
  styleGateRepeatingUnitFrameName,
  styleGateShaftBottomCapFrameName,
  styleGateShaftInteriorFrameName,
  styleGateShaftTopCapFrameName,
  styleGateStopPlateFrameName,
  styleGateUnitFrameName,
  styleGateUnitHasGlassBacking,
  styleGateUnitUsesDynamicArt,
} from './styleGateFrames'
import { clearGroup, disposeObject } from './threeUtils'
import { type UnitVisualActivity, unitVisualActivity } from './unitActivity'

const ATLAS_URL = new URL('../assets/sprites/style-gate.webp', import.meta.url).href

const Z_STARS = -10
const Z_GROUND = -9
const Z_CLOUD = -8
const Z_UNIT_GLASS = 0.17
const Z_UNIT_SAMPLE = 0.18
const Z_SHAFT_SAMPLE = 0.52
const Z_CAP_SAMPLE = 0.53
const Z_STOP_SAMPLE = 0.54
const Z_DAMAGE_SAMPLE = 0.6
const Z_CAR_SAMPLE = 1.02
const Z_DOOR_SAMPLE = 1.03
const Z_PERSON_SAMPLE = 1.08

const MAX_STYLE_GATE_CARS = 256
// The atlas is the sole people renderer once loaded, so this cap governs how many
// people are drawn at all. Keep it tied to the simulation ceiling so render and
// engine capacity cannot silently drift apart again.
export const STYLE_GATE_PERSON_CAP = TUNING.people.maxActive

const STYLE_GATE_SHAFT_KINDS = ['standard', 'express', 'service', 'glass'] as const
const STYLE_GATE_CAR_OCCUPANCIES = ['empty', 'single', 'double', 'crowded', 'full'] as const
const STYLE_GATE_PERSON_TIERS = ['low', 'med', 'high', 'vip'] as const
const STYLE_GATE_PERSON_ROLES = ['staff', 'housekeeper'] as const
const STYLE_GATE_DAMAGE_FRAMES = [
  ...STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES,
  ...STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES,
] as const satisfies readonly StyleGateFrameName[]
const LOBBY_TILE_FRAME = 'unit.lobby.tile' as StyleGateFrameName
const LOBBY_TREE_FRAME = 'unit.lobby.decor.tree' as StyleGateFrameName
const LOBBY_BENCH_FRAME = 'unit.lobby.decor.bench' as StyleGateFrameName
const LOBBY_FRONT_DESK_FRAME = 'unit.lobby.decor.frontDesk' as StyleGateFrameName
const LOBBY_PLANT_FRAME = 'unit.lobby.decor.plant' as StyleGateFrameName

const DYNAMIC_FRAME_CONFIGS = [
  ...STYLE_GATE_SHAFT_KINDS.flatMap((kind) => [
    ...STYLE_GATE_CAR_OCCUPANCIES.flatMap((occupancy) => [
      { name: `elevator.${kind}.car.${occupancy}` as StyleGateFrameName, cap: MAX_STYLE_GATE_CARS, z: Z_CAR_SAMPLE },
      { name: `elevator.${kind}.car.${occupancy}.summary` as StyleGateFrameName, cap: MAX_STYLE_GATE_CARS, z: Z_CAR_SAMPLE },
    ]),
    { name: `elevator.${kind}.doors.closed` as StyleGateFrameName, cap: MAX_STYLE_GATE_CARS, z: Z_DOOR_SAMPLE },
    { name: `elevator.${kind}.doors.open` as StyleGateFrameName, cap: MAX_STYLE_GATE_CARS, z: Z_DOOR_SAMPLE },
    { name: `elevator.${kind}.doors.closed.summary` as StyleGateFrameName, cap: MAX_STYLE_GATE_CARS, z: Z_DOOR_SAMPLE },
    { name: `elevator.${kind}.doors.open.summary` as StyleGateFrameName, cap: MAX_STYLE_GATE_CARS, z: Z_DOOR_SAMPLE },
  ]),
  ...STYLE_GATE_PERSON_TIERS.flatMap((tier) => [
    { name: `person.${tier}.sample` as StyleGateFrameName, cap: STYLE_GATE_PERSON_CAP, z: Z_PERSON_SAMPLE },
    { name: `person.${tier}.summary` as StyleGateFrameName, cap: STYLE_GATE_PERSON_CAP, z: Z_PERSON_SAMPLE },
    { name: `person.${tier}.variantB.sample` as StyleGateFrameName, cap: STYLE_GATE_PERSON_CAP, z: Z_PERSON_SAMPLE },
    { name: `person.${tier}.variantB.summary` as StyleGateFrameName, cap: STYLE_GATE_PERSON_CAP, z: Z_PERSON_SAMPLE },
  ]),
  ...STYLE_GATE_PERSON_ROLES.flatMap((role) => [
    { name: `person.${role}.sample` as StyleGateFrameName, cap: STYLE_GATE_PERSON_CAP, z: Z_PERSON_SAMPLE },
    { name: `person.${role}.summary` as StyleGateFrameName, cap: STYLE_GATE_PERSON_CAP, z: Z_PERSON_SAMPLE },
  ]),
  ...STYLE_GATE_DAMAGE_FRAMES.map((name) => ({ name, cap: 512, z: Z_DAMAGE_SAMPLE })),
] as const satisfies readonly { name: StyleGateFrameName; cap: number; z: number }[]

interface StyleGateGlassUnit {
  unitId: number
}

interface StyledUnitSample {
  dynamic?: boolean
  frameName: StyleGateFrameName
  glass: boolean
  h: number
  unit: Unit
  w: number
  x: number
  y: number
}

export interface StyleGateArtLayer {
  group: THREE.Group
  structureGroup: THREE.Group
  dynamicGroup: THREE.Group
  structureVersion: number
  mapId: string | null
  glassMesh: THREE.InstancedMesh | null
  glassUnits: StyleGateGlassUnit[]
  glassOccupancySignature: string
  lastGlassTimeBucket: number
  texture: THREE.Texture | null
  loaded: boolean
  settled: boolean
  disposed: boolean
  warnedFrames: Set<string>
  warnedLoadFailure: boolean
  dynamicMeshes: Map<StyleGateFrameName, THREE.InstancedMesh>
  /**
   * The single merged mesh holding every activity-art (dynamic) unit quad. Its UV
   * buffer sub-ranges are rewritten in place when a unit's frame changes, so the
   * whole activity layer stays at one draw call instead of one mesh per unit.
   */
  dynamicStructureMesh: THREE.Mesh | null
  activityUnits: Map<number, { frameName: StyleGateFrameName; vertexBase: number }>
  personVisual: Map<number, { x: number; floor: number }>
}

export function createStyleGateArtLayer(scene: THREE.Scene): StyleGateArtLayer {
  const group = new THREE.Group()
  const structureGroup = new THREE.Group()
  const dynamicGroup = new THREE.Group()
  group.add(structureGroup, dynamicGroup)
  scene.add(group)

  const layer: StyleGateArtLayer = {
    group,
    structureGroup,
    dynamicGroup,
    structureVersion: -1,
    mapId: null,
    glassMesh: null,
    glassUnits: [],
    glassOccupancySignature: '',
    lastGlassTimeBucket: -1,
    texture: null,
    loaded: false,
    settled: false,
    disposed: false,
    warnedFrames: new Set(),
    warnedLoadFailure: false,
    dynamicMeshes: new Map(),
    dynamicStructureMesh: null,
    activityUnits: new Map(),
    personVisual: new Map(),
  }

  new THREE.TextureLoader().load(
    ATLAS_URL,
    (texture) => {
      if (layer.disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = true
      texture.userData.cached = true
      texture.needsUpdate = true
      layer.texture = texture
      layer.loaded = true
      layer.settled = true
      ensureDynamicMeshes(layer)
    },
    undefined,
    () => {
      layer.settled = true
      if (!layer.warnedLoadFailure) {
        layer.warnedLoadFailure = true
        console.warn('Tower Throwback style-gate atlas failed to load; using colored fallback quads.')
      }
    },
  )

  return layer
}

export function isStyleGateArtReady(layer: StyleGateArtLayer): boolean {
  return layer.settled
}

function frame(layer: StyleGateArtLayer, name: string): (typeof STYLE_GATE_FRAMES)[StyleGateFrameName] | null {
  const value = (STYLE_GATE_FRAMES as Record<string, (typeof STYLE_GATE_FRAMES)[StyleGateFrameName] | undefined>)[name]
  if (!value) {
    if (!layer.warnedFrames.has(name)) {
      layer.warnedFrames.add(name)
      console.warn(`Tower Throwback style-gate frame missing: ${name}`)
    }
    return null
  }

  if (!styleGateFrameHasAtlasPixels(value)) {
    if (!layer.warnedFrames.has(name)) {
      layer.warnedFrames.add(name)
      console.warn(`Tower Throwback style-gate frame pending raster: ${name}; using colored fallback quads.`)
    }
    return null
  }

  return value
}

/** One place that builds the atlas material — used by both static quads and the
 * instanced dynamic meshes so their sampling config can't drift apart. */
function createFrameMaterial(layer: StyleGateArtLayer): THREE.MeshBasicMaterial | null {
  if (!layer.texture) {
    return null
  }
  return new THREE.MeshBasicMaterial({
    alphaTest: 0.01,
    depthWrite: false,
    map: layer.texture,
    transparent: true,
  })
}

function texturedQuad(layer: StyleGateArtLayer, frameName: StyleGateFrameName): THREE.Mesh | null {
  const geometry = frameGeometry(layer, frameName)
  const material = createFrameMaterial(layer)
  if (!geometry || !material) {
    return null
  }
  return new THREE.Mesh(geometry, material)
}

export interface PersonGlideInput {
  visualX: number
  visualFloor: number
  targetX: number
  targetFloor: number
  /** Person is inside a moving cabin — track it exactly on both axes. */
  riding: boolean
  /** Current leg climbs (stairs/escalator) — ease floor, hold x. */
  verticalLeg: boolean
  walkStep: number
  climbStep: number
}

/**
 * Axis-locked person glide: eases only the axis the active leg actually moves
 * along and snaps the other. This is what prevents a floor change from rendering
 * as a diagonal line across floors that have no vertical transport — at most one
 * axis is ever mid-glide, so motion is always horizontal-only or vertical-only.
 */
export function nextPersonGlide(input: PersonGlideInput): { x: number; floor: number } {
  if (input.riding) {
    return { x: input.targetX, floor: input.targetFloor }
  }
  if (input.verticalLeg) {
    return { x: input.targetX, floor: approach(input.visualFloor, input.targetFloor, input.climbStep, PERSON_SNAP_FLOORS) }
  }
  return { x: approach(input.visualX, input.targetX, input.walkStep, PERSON_SNAP_TILES), floor: input.targetFloor }
}

function frameGeometry(layer: StyleGateArtLayer, frameName: StyleGateFrameName): THREE.PlaneGeometry | null {
  const atlasFrame = frame(layer, frameName)
  if (!atlasFrame) {
    return null
  }

  return geometryForAtlasFrame(atlasFrame)
}

export function createStyleGateFrameGeometry(frameName: StyleGateFrameName): THREE.PlaneGeometry | null {
  const atlasFrame = STYLE_GATE_FRAMES[frameName]
  if (!styleGateFrameHasAtlasPixels(atlasFrame)) {
    return null
  }

  return geometryForAtlasFrame(atlasFrame)
}

function geometryForAtlasFrame(atlasFrame: StyleGateFrame): THREE.PlaneGeometry {
  const u0 = atlasFrame.x / STYLE_GATE_ATLAS_WIDTH
  const u1 = (atlasFrame.x + atlasFrame.w) / STYLE_GATE_ATLAS_WIDTH
  const v0 = 1 - (atlasFrame.y + atlasFrame.h) / STYLE_GATE_ATLAS_HEIGHT
  const v1 = 1 - atlasFrame.y / STYLE_GATE_ATLAS_HEIGHT
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
  return geometry
}

interface MergeableQuad {
  frameName: StyleGateFrameName
  flipX?: boolean
  x: number
  y: number
  w: number
  h: number
}

/**
 * Write a frame's four atlas UVs into `uv` at `vertexBase` (TL, TR, BL, BR — the
 * PlaneGeometry vertex order `geometryForAtlasFrame` bakes). Returns false when the
 * frame has no atlas pixels so callers can leave the quad's UVs untouched.
 */
function writeQuadUvs(
  layer: StyleGateArtLayer,
  uv: Float32Array,
  vertexBase: number,
  frameName: StyleGateFrameName,
  flipX = false,
): boolean {
  const atlasFrame = frame(layer, frameName)
  if (!atlasFrame) {
    return false
  }
  const u0 = atlasFrame.x / STYLE_GATE_ATLAS_WIDTH
  const u1 = (atlasFrame.x + atlasFrame.w) / STYLE_GATE_ATLAS_WIDTH
  const v0 = 1 - (atlasFrame.y + atlasFrame.h) / STYLE_GATE_ATLAS_HEIGHT
  const v1 = 1 - atlasFrame.y / STYLE_GATE_ATLAS_HEIGHT
  const o = vertexBase * 2
  uv[o + 0] = flipX ? u1 : u0; uv[o + 1] = v1
  uv[o + 2] = flipX ? u0 : u1; uv[o + 3] = v1
  uv[o + 4] = flipX ? u1 : u0; uv[o + 5] = v0
  uv[o + 6] = flipX ? u0 : u1; uv[o + 7] = v0
  return true
}

/**
 * Bake many same-z atlas quads into one BufferGeometry → one draw call. Quads
 * within a z-layer never overlap spatially, so index order is irrelevant, and the
 * returned mesh keeps the layer's z so three's transparent sort orders layers
 * exactly as the pre-batch per-quad meshes did. `vertexBases` is parallel to the
 * input (`-1` for a dropped quad with no atlas pixels) so an activity layer can
 * later rewrite a specific quad's UVs in place.
 */
function buildMergedQuadMesh(
  layer: StyleGateArtLayer,
  quads: readonly MergeableQuad[],
  z: number,
): { mesh: THREE.Mesh; vertexBases: number[] } | null {
  if (quads.length === 0) {
    return null
  }
  const material = createFrameMaterial(layer)
  if (!material) {
    return null
  }
  const positions = new Float32Array(quads.length * 4 * 3)
  const uvs = new Float32Array(quads.length * 4 * 2)
  const index = new Uint32Array(quads.length * 6)
  const vertexBases: number[] = []
  let vertexCount = 0
  let quadCount = 0
  for (const quad of quads) {
    const base = vertexCount
    if (!writeQuadUvs(layer, uvs, base, quad.frameName, quad.flipX)) {
      vertexBases.push(-1)
      continue
    }
    vertexBases.push(base)
    const hw = quad.w / 2
    const hh = quad.h / 2
    const p = base * 3
    positions[p + 0] = quad.x - hw; positions[p + 1] = quad.y + hh; positions[p + 2] = 0
    positions[p + 3] = quad.x + hw; positions[p + 4] = quad.y + hh; positions[p + 5] = 0
    positions[p + 6] = quad.x - hw; positions[p + 7] = quad.y - hh; positions[p + 8] = 0
    positions[p + 9] = quad.x + hw; positions[p + 10] = quad.y - hh; positions[p + 11] = 0
    const ix = quadCount * 6
    index[ix + 0] = base + 0; index[ix + 1] = base + 2; index[ix + 2] = base + 1
    index[ix + 3] = base + 2; index[ix + 4] = base + 3; index[ix + 5] = base + 1
    vertexCount += 4
    quadCount += 1
  }
  if (quadCount === 0) {
    material.dispose()
    return null
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, vertexCount * 3), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs.subarray(0, vertexCount * 2), 2))
  geometry.setIndex(new THREE.BufferAttribute(index.subarray(0, quadCount * 6), 1))
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.z = z
  // Static positions → three's auto bounding sphere is correct, so leave frustum
  // culling on (unlike the moving dynamic pools): a fully off-screen tower still
  // culls. Merging trades away per-quad culling — when any floor is visible the
  // whole layer's quads are submitted — but that is only cheap vertex work; the
  // point of the merge is collapsing thousands of draw calls, the CPU bottleneck.
  return { mesh, vertexBases }
}

/** Build and attach a merged mesh for a static (never-retinted) quad layer. */
function addMergedQuadLayer(layer: StyleGateArtLayer, name: string, quads: readonly MergeableQuad[], z: number): void {
  const merged = buildMergedQuadMesh(layer, quads, z)
  if (merged) {
    merged.mesh.name = name
    layer.structureGroup.add(merged.mesh)
  }
}

/** Names for the batched atlas meshes, so tests and debugging can find each z-layer's single draw. */
export const STYLE_GATE_MERGED_UNITS = 'styleGate.merged.units'
export const STYLE_GATE_MERGED_SHAFT_INTERIOR = 'styleGate.merged.shaftInterior'
export const STYLE_GATE_MERGED_SHAFT_CAPS = 'styleGate.merged.shaftCaps'
export const STYLE_GATE_MERGED_SHAFT_STOPS = 'styleGate.merged.shaftStops'

function ensureDynamicMeshes(layer: StyleGateArtLayer): void {
  if (layer.dynamicMeshes.size > 0) {
    return
  }
  for (const config of DYNAMIC_FRAME_CONFIGS) {
    const geometry = frameGeometry(layer, config.name)
    const material = createFrameMaterial(layer)
    if (!geometry || !material) {
      continue
    }
    const mesh = new THREE.InstancedMesh(geometry, material, config.cap)
    mesh.count = 0
    mesh.position.z = config.z
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    layer.dynamicMeshes.set(config.name, mesh)
    layer.dynamicGroup.add(mesh)
  }
}

function addFrame(
  parent: THREE.Group,
  layer: StyleGateArtLayer,
  frameName: StyleGateFrameName | null,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
): THREE.Mesh | null {
  if (frameName === null) {
    return null
  }
  const mesh = texturedQuad(layer, frameName)
  if (!mesh) {
    return null
  }
  mesh.name = frameName
  mesh.position.set(x, y, z)
  mesh.scale.set(w, h, 1)
  parent.add(mesh)
  return mesh
}

const dummy = new THREE.Object3D()
const glassColorScratch = new THREE.Color()
const glassColorScratchB = new THREE.Color()
const personTintScratch = new THREE.Color()
const PERSON_NO_TINT = 0xffffff

function putInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, w: number, h: number, z = 0): void {
  dummy.position.set(x, y, z)
  dummy.scale.set(w, h, 1)
  dummy.rotation.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

function createGlassMesh(count: number): THREE.InstancedMesh | null {
  if (count === 0) {
    return null
  }
  const material = new THREE.MeshBasicMaterial({
    depthWrite: false,
    opacity: 0.85,
    transparent: true,
    vertexColors: true,
  })
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count)
  mesh.count = count
  mesh.position.z = Z_UNIT_GLASS
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  return mesh
}

/** World height that preserves a frame's native aspect for a given width. */
function frameHeightForWidth(frameName: StyleGateFrameName, width: number): number {
  const atlasFrame = STYLE_GATE_FRAMES[frameName]
  return (width * atlasFrame.h) / atlasFrame.w
}

function styledLobbySamples(unit: Unit, height: number): StyledUnitSample[] {
  const samples = styledRepeatingUnitSamples(unit, height, LOBBY_TILE_FRAME, styleGateUnitHasGlassBacking(unit.kind))

  const frontDeskWidth = Math.min(4.2, Math.max(2.8, unit.width * 0.14))
  const frontDeskHeight = Math.min(height * 0.38, frameHeightForWidth(LOBBY_FRONT_DESK_FRAME, frontDeskWidth))
  const frontDeskX = unit.x + Math.min(unit.width - frontDeskWidth / 2 - 0.8, Math.max(frontDeskWidth / 2 + 1.2, 3.2))
  if (unit.width >= 5 && frontDeskX > unit.x) {
    samples.push({
      frameName: LOBBY_FRONT_DESK_FRAME,
      glass: false,
      h: frontDeskHeight,
      unit,
      w: frontDeskWidth,
      x: frontDeskX,
      y: unit.floor * FLOOR_H + frontDeskHeight / 2 + 0.18,
    })
  }

  // Decor sits on the lobby floor and keeps each sprite's native proportions
  // (was stretched to the full multi-storey lobby height before).
  const treeWidth = Math.min(2.8, Math.max(1.8, unit.width * 0.08))
  const treeHeight = Math.min(height * 0.9, frameHeightForWidth(LOBBY_TREE_FRAME, treeWidth))
  for (let offset = 4; offset < unit.width - 2; offset += 10) {
    if (Math.abs(unit.x + offset - frontDeskX) < 3) {
      continue
    }
    samples.push({
      frameName: LOBBY_TREE_FRAME,
      glass: false,
      h: treeHeight,
      unit,
      w: treeWidth,
      x: unit.x + offset,
      y: unit.floor * FLOOR_H + treeHeight / 2 + 0.3,
    })
  }

  const benchWidth = Math.min(3.6, Math.max(2.4, unit.width * 0.1))
  const benchHeight = Math.min(height * 0.35, frameHeightForWidth(LOBBY_BENCH_FRAME, benchWidth))
  for (let offset = 9; offset < unit.width - 2; offset += 14) {
    if (Math.abs(unit.x + offset - frontDeskX) < 3.5) {
      continue
    }
    samples.push({
      frameName: LOBBY_BENCH_FRAME,
      glass: false,
      h: benchHeight,
      unit,
      w: benchWidth,
      x: unit.x + offset,
      y: unit.floor * FLOOR_H + benchHeight / 2 + 0.2,
    })
  }

  const plantWidth = Math.min(1.25, Math.max(0.85, unit.width * 0.035))
  const plantHeight = Math.min(height * 0.5, frameHeightForWidth(LOBBY_PLANT_FRAME, plantWidth))
  for (let offset = 2; offset < unit.width - 1; offset += 12) {
    if (Math.abs(unit.x + offset - frontDeskX) < 2.5) {
      continue
    }
    samples.push({
      frameName: LOBBY_PLANT_FRAME,
      glass: false,
      h: plantHeight,
      unit,
      w: plantWidth,
      x: unit.x + offset,
      y: unit.floor * FLOOR_H + plantHeight / 2 + 0.15,
    })
  }

  return samples
}

function styledRepeatingUnitSamples(
  unit: Unit,
  height: number,
  frameName: StyleGateFrameName,
  glass: boolean,
): StyledUnitSample[] {
  const samples: StyledUnitSample[] = []
  const y = unit.floor * FLOOR_H + (unit.storeys * FLOOR_H) / 2
  for (let offset = 0; offset < unit.width; offset += 1) {
    const tileWidth = Math.min(1, unit.width - offset)
    samples.push({
      frameName,
      glass,
      h: height,
      unit,
      w: tileWidth,
      x: unit.x + offset + tileWidth / 2,
      y,
    })
  }

  return samples
}

function glassColor(palette: TowerPalette, minuteOfDay: number, activity: UnitVisualActivity): number {
  const darkness = 1 - daylightAt(minuteOfDay)
  const sky = skyColorAt(palette, minuteOfDay)
  if (activity === 'vacant' || darkness <= 0.05) {
    return sky
  }
  const glow = activity === 'sleeping' ? 0.4 : 0.72
  return glassColorScratch.setHex(sky).lerp(glassColorScratchB.setHex(palette.windowNight), glow * darkness).getHex()
}

function syncStyleGateGlass(layer: StyleGateArtLayer, state: EngineState, frame: SceneFrame): void {
  const mesh = layer.glassMesh
  if (!mesh) {
    return
  }
  const bucket = Math.floor(state.clock.minute / 5)
  const occupancySignature = layer.glassUnits
    .map((glassUnit) => {
      const unit = frame.unitsById.get(glassUnit.unitId)
      return unit ? unitVisualActivity(unit, state.clock, frame.activeVisitorUnitIds) : 'vacant'
    })
    .join('')
  if (bucket === layer.lastGlassTimeBucket && occupancySignature === layer.glassOccupancySignature) {
    return
  }
  layer.lastGlassTimeBucket = bucket
  layer.glassOccupancySignature = occupancySignature
  const palette = getPalette(getMap(state.mapId).paletteTheme)
  const midBucketMinute = bucket * 5 + 2.5
  for (let i = 0; i < layer.glassUnits.length; i += 1) {
    const unit = frame.unitsById.get(layer.glassUnits[i]?.unitId ?? -1)
    const activity = unit ? unitVisualActivity(unit, state.clock, frame.activeVisitorUnitIds) : 'vacant'
    mesh.setColorAt(i, glassColorScratch.setHex(glassColor(palette, midBucketMinute, activity)))
  }
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true
  }
}

function syncStyleGateStructure(layer: StyleGateArtLayer, state: EngineState, frame: SceneFrame): void {
  if (layer.structureVersion === state.structureVersion && layer.mapId === state.mapId) {
    return
  }
  layer.structureVersion = state.structureVersion
  layer.mapId = state.mapId
  layer.glassMesh = null
  layer.glassUnits = []
  layer.glassOccupancySignature = ''
  layer.lastGlassTimeBucket = -1
  layer.activityUnits.clear()
  layer.dynamicStructureMesh = null
  clearGroup(layer.structureGroup)

  const styledUnits: StyledUnitSample[] = [...state.units]
    .sort((a, b) => a.id - b.id)
    .flatMap((unit): StyledUnitSample[] => {
      const height = isSlabFamily(unit.kind) ? unit.storeys * FLOOR_H - 0.3 : unit.storeys * FLOOR_H - 0.4
      if (unit.kind === 'lobby') {
        return styledLobbySamples(unit, height)
      }
      const repeatingFrameName = styleGateRepeatingUnitFrameName(unit.kind)
      if (repeatingFrameName) {
        return styledRepeatingUnitSamples(
          unit,
          height,
          repeatingFrameName,
          styleGateUnitHasGlassBacking(unit.kind),
        )
      }
      const frameName = styleGateUnitFrameName(unit, unitVisualActivity(unit, state.clock, frame.activeVisitorUnitIds))
      if (!frameName) {
        return []
      }
      return [{
        dynamic: styleGateUnitUsesDynamicArt(unit.kind),
        frameName,
        glass: styleGateUnitHasGlassBacking(unit.kind),
        h: height,
        unit,
        w: unit.width - 0.15,
        x: unit.x + unit.width / 2,
        y: unit.floor * FLOOR_H + (unit.storeys * FLOOR_H) / 2,
      }]
    })

  const glassUnits = styledUnits.filter((styledUnit) => styledUnit.glass)
  const glassMesh = createGlassMesh(glassUnits.length)
  if (glassMesh) {
    glassUnits.forEach((styledUnit, i) => {
      putInstance(glassMesh, i, styledUnit.x, styledUnit.y, styledUnit.w, styledUnit.h)
      layer.glassUnits.push({ unitId: styledUnit.unit.id })
    })
    layer.glassMesh = glassMesh
    layer.structureGroup.add(glassMesh)
  }

  // Every unit sample shares the atlas texture, so bake them into one merged mesh
  // (one draw call) instead of one THREE.Mesh per unit — the bulk of the endgame
  // draw-call cost. Activity-art units live in the same mesh; their UVs are
  // rewritten in place per frame, so `dynamicStructureMesh` points at it.
  const unitQuads: MergeableQuad[] = styledUnits.map((s) => ({
    frameName: s.frameName,
    flipX: s.unit.kind === 'observationDeck' && s.unit.facing === 'left',
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
  }))
  const dynamicSamples = styledUnits
    .map((s, i) => ({ sample: s, quadIndex: i }))
    .filter((entry) => entry.sample.dynamic)
  const unitMerged = buildMergedQuadMesh(layer, unitQuads, Z_UNIT_SAMPLE)
  if (unitMerged) {
    unitMerged.mesh.name = STYLE_GATE_MERGED_UNITS
    layer.structureGroup.add(unitMerged.mesh)
    layer.dynamicStructureMesh = unitMerged.mesh
    for (const { sample, quadIndex } of dynamicSamples) {
      const vertexBase = unitMerged.vertexBases[quadIndex] ?? -1
      if (vertexBase >= 0) {
        layer.activityUnits.set(sample.unit.id, { frameName: sample.frameName, vertexBase })
      }
    }
  }

  const shaftInteriorQuads: MergeableQuad[] = []
  const shaftCapQuads: MergeableQuad[] = []
  const shaftStopQuads: MergeableQuad[] = []
  for (const shaft of state.shafts) {
    const def = shaftDef(shaft.kind)
    const cx = shaft.x + def.width / 2
    const interior = styleGateShaftInteriorFrameName(shaft.kind)
    for (let floor = shaft.bottomFloor; floor <= shaft.topFloor; floor += 1) {
      shaftInteriorQuads.push({ frameName: interior, x: cx, y: floor * FLOOR_H + FLOOR_H / 2, w: def.width - 0.1, h: FLOOR_H })
    }
    shaftCapQuads.push({ frameName: styleGateShaftTopCapFrameName(shaft.kind), x: cx, y: (shaft.topFloor + 1) * FLOOR_H + FLOOR_H / 2, w: def.width - 0.1, h: FLOOR_H })
    shaftCapQuads.push({ frameName: styleGateShaftBottomCapFrameName(shaft.kind), x: cx, y: (shaft.bottomFloor - 1) * FLOOR_H + FLOOR_H / 2, w: def.width - 0.1, h: FLOOR_H })
    for (const stop of shaft.stops) {
      shaftStopQuads.push({ frameName: styleGateStopPlateFrameName(shaft.kind, shaft.enabledStops.includes(stop)), x: cx, y: stop * FLOOR_H + 0.3, w: def.width - 0.2, h: 0.35 })
    }
  }
  addMergedQuadLayer(layer, STYLE_GATE_MERGED_SHAFT_INTERIOR, shaftInteriorQuads, Z_SHAFT_SAMPLE)
  addMergedQuadLayer(layer, STYLE_GATE_MERGED_SHAFT_CAPS, shaftCapQuads, Z_CAP_SAMPLE)
  addMergedQuadLayer(layer, STYLE_GATE_MERGED_SHAFT_STOPS, shaftStopQuads, Z_STOP_SAMPLE)

  const structureMinX = [
    ...state.units.map((unit) => unit.x),
    ...state.shafts.map((shaft) => shaft.x),
  ]
  const structureMaxX = [
    ...state.units.map((unit) => unit.x + unit.width),
    ...state.shafts.map((shaft) => shaft.x + shaftDef(shaft.kind).width),
  ]
  const map = getMap(state.mapId)
  const maxFloor = Math.max(
    map.lobbyAnchorFloor,
    ...state.units.map((unit) => unit.floor + unit.storeys),
    ...state.shafts.map((shaft) => shaft.topFloor + 2),
  )
  const minX = structureMinX.length > 0 ? Math.min(...structureMinX) : 0
  const maxX = structureMaxX.length > 0 ? Math.max(...structureMaxX) : 48
  const ambienceStartX = Math.floor((minX - 24) / 32) * 32
  const ambienceEndX = Math.ceil((maxX + 24) / 32) * 32
  if (map.id === 'niagara-falls') {
    addFrame(layer.structureGroup, layer, STYLE_GATE_NIAGARA_GORGE_FRAME, GRID_WIDTH / 2, -30, GRID_WIDTH, 250, Z_GROUND)
  } else {
    for (let x = ambienceStartX; x < ambienceEndX; x += 32) {
      addFrame(layer.structureGroup, layer, 'ambience.groundHorizon.strip', x + 16, -1.5, 32, 12, Z_GROUND)
    }
  }
  for (let x = ambienceStartX; x < ambienceEndX; x += 48) {
    const starStartY = map.id === 'niagara-falls' ? map.lobbyAnchorFloor * FLOOR_H : 12
    const starEndY = (Math.max(maxFloor, map.lobbyAnchorFloor) + 8) * FLOOR_H
    for (let y = starStartY; y < starEndY; y += 24) {
      addFrame(layer.structureGroup, layer, 'ambience.nightStars.tile', x + 24, y, 48, 24, Z_STARS)
    }
  }
  const cloudPlacements = [
    { x: minX + 10, floor: maxFloor + 1.8, w: 8 },
    { x: minX + (maxX - minX) * 0.58, floor: maxFloor + 4.2, w: 10 },
    { x: maxX + 8, floor: Math.max(5, maxFloor * 0.62), w: 13 },
  ]
  cloudPlacements.forEach((placement, index) => {
    const frameName = styleGateCloudFrameName(index)
    addFrame(
      layer.structureGroup,
      layer,
      frameName,
      placement.x,
      placement.floor * FLOOR_H,
      placement.w,
      frameHeightForWidth(frameName, placement.w),
      Z_CLOUD,
    )
  })
}

function syncStyleGateAmbience(layer: StyleGateArtLayer, state: EngineState): void {
  const darkness = 1 - daylightAt(state.clock.minute)
  for (const child of layer.structureGroup.children) {
    if (child.name !== 'ambience.nightStars.tile' || !(child instanceof THREE.Mesh)) {
      continue
    }
    const material = child.material as THREE.MeshBasicMaterial
    material.opacity = Math.min(0.9, darkness * 1.2)
    child.visible = darkness > 0.03
  }
}

function syncStyleGateActivityUnits(layer: StyleGateArtLayer, state: EngineState, sceneFrame: SceneFrame): void {
  const mesh = layer.dynamicStructureMesh
  if (!mesh) {
    return
  }
  const uvAttr = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute
  const uv = uvAttr.array as Float32Array
  let dirty = false
  for (const [unitId, visual] of layer.activityUnits) {
    const unit = sceneFrame.unitsById.get(unitId)
    if (!unit) {
      continue
    }
    const frameName = styleGateUnitFrameName(unit, unitVisualActivity(unit, state.clock, sceneFrame.activeVisitorUnitIds))
    if (!frameName || frameName === visual.frameName) {
      continue
    }
    if (!writeQuadUvs(layer, uv, visual.vertexBase, frameName)) {
      continue
    }
    visual.frameName = frameName
    dirty = true
  }
  if (dirty) {
    uvAttr.needsUpdate = true
  }
}

function syncStyleGateDynamic(
  layer: StyleGateArtLayer,
  state: EngineState,
  detailLevel: StyleGateDetailLevel,
  frame: SceneFrame,
  dtSec: number,
): void {
  ensureDynamicMeshes(layer)
  const palette = getPalette(getMap(state.mapId).paletteTheme)
  const counts = new Map<StyleGateFrameName, number>()
  const put = (
    frameName: StyleGateFrameName,
    x: number,
    y: number,
    w: number,
    h: number,
    z = 0,
    color?: THREE.Color,
  ): void => {
    const mesh = layer.dynamicMeshes.get(frameName)
    if (!mesh) {
      return
    }
    const index = counts.get(frameName) ?? 0
    if (index >= mesh.instanceMatrix.count) {
      return
    }
    putInstance(mesh, index, x, y, w, h, z)
    if (color) {
      // Per-instance multiply over the atlas sprite (see setColorAt on the glass
      // pass). Every person instance is coloured, so no stale black defaults.
      mesh.setColorAt(index, color)
    }
    counts.set(frameName, index + 1)
  }

  const walkStep = PERSON_VISUAL_TILES_PER_SEC * dtSec
  const climbStep = PERSON_VISUAL_FLOORS_PER_SEC * dtSec

  for (const unit of state.units) {
    if (!unit.offline) {
      continue
    }
    const y = unit.floor * FLOOR_H + (unit.storeys * FLOOR_H) / 2
    const h = unit.storeys * FLOOR_H
    for (let offset = 0; offset < unit.width; offset += 1) {
      const tileWidth = Math.min(1, unit.width - offset)
      const damageFrameName = styleGateDamageFrameName(unit, unit.x + offset)
      if (!damageFrameName) {
        continue
      }
      put(damageFrameName, unit.x + offset + tileWidth / 2, y, tileWidth, h)
    }
  }

  // Cars read the shared glide advanced once per render; riders use that same y.
  for (const shaft of state.shafts) {
    const def = shaftDef(shaft.kind)
    for (const car of shaft.cars) {
      const key = `${shaft.id}:${car.index}`
      const visual = frame.carVisual.get(key)
      if (!visual) {
        continue
      }
      const x = shaft.x + def.width / 2
      const y = visual.y * FLOOR_H + FLOOR_H * 0.4
      put(styleGateCarBodyFrameName(shaft.kind, car.passengerIds.length, def.carCapacity, detailLevel), x, y, def.width - 0.4, FLOOR_H * 0.8)
      put(styleGateDoorFrameName(shaft.kind, car.state, detailLevel), x, y, def.width - 0.4, FLOOR_H * 0.8)
    }
  }

  // People glide with an AXIS LOCK: only the axis the current leg actually moves
  // along is eased, and the other axis snaps. This keeps a floor change (stairs /
  // escalator / elevator alight) from rendering as a straight diagonal that cuts
  // across floors with no vertical transport.
  const seenPeople = new Set<number>()
  let people = 0
  for (const person of state.people) {
    if (people >= STYLE_GATE_PERSON_CAP) {
      break
    }
    const riding = person.state === 'riding'
    const leg = person.legs[person.legIndex]
    let targetX = person.x
    let targetFloor = person.floor
    let queued = false
    if (riding) {
      const carY = frame.riderY.get(person.id)
      if (carY !== undefined) {
        targetFloor = carY
      }
    } else if (isDwellingVisitor(person)) {
      const unit = frame.unitsById.get(person.destUnitId)
      if (unit) {
        const slot = dwellRenderSlot(person.id, unit)
        targetX = slot.x
        targetFloor = slot.floor
      }
    } else if (person.state === 'queued') {
      const queuedRender = resolveQueuedRender(person, frame)
      if (!queuedRender || queuedRender.rank >= QUEUE_RENDER_MAX) {
        continue
      }
      queued = true
      targetX = queueSlotX(queuedRender.shaft, queuedRender.rank)
    }

    seenPeople.add(person.id)
    let visual = layer.personVisual.get(person.id)
    if (!visual) {
      visual = { x: targetX, floor: targetFloor } // first sight → snap
      layer.personVisual.set(person.id, visual)
    }
    const next = nextPersonGlide({
      visualX: visual.x,
      visualFloor: visual.floor,
      targetX,
      targetFloor,
      riding,
      verticalLeg: !riding && (leg?.type === 'stairs' || leg?.type === 'escalator'),
      walkStep,
      climbStep,
    })
    visual.x = next.x
    visual.floor = next.floor

    // Irritated waiters read red in the fallback renderer; tint the atlas sprite
    // to match. Non-irritated instances get white (an identity multiply).
    const tint = personTintScratch.setHex(
      styleGatePersonReadsIrritated(person) ? palette.person.irritated : PERSON_NO_TINT,
    )
    put(
      styleGatePersonFrameName(person, detailLevel),
      visual.x,
      visual.floor * FLOOR_H + 0.65,
      queued ? QUEUE_ICON_WIDTH : 0.6,
      queued ? QUEUE_ICON_HEIGHT : 1.2,
      queued ? QUEUE_ICON_Z - Z_PERSON_SAMPLE : 0,
      tint,
    )
    people += 1
  }
  for (const id of layer.personVisual.keys()) {
    if (!seenPeople.has(id)) {
      layer.personVisual.delete(id)
    }
  }

  for (const [frameName, mesh] of layer.dynamicMeshes.entries()) {
    mesh.count = counts.get(frameName) ?? 0
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }
}

export function syncStyleGateArt(
  layer: StyleGateArtLayer,
  state: EngineState,
  frame: SceneFrame,
  detailLevel: StyleGateDetailLevel = 'detail',
  dtSec = 0,
): void {
  if (!layer.loaded) {
    return
  }
  syncStyleGateStructure(layer, state, frame)
  syncStyleGateAmbience(layer, state)
  syncStyleGateActivityUnits(layer, state, frame)
  syncStyleGateGlass(layer, state, frame)
  syncStyleGateDynamic(layer, state, detailLevel, frame, dtSec)
}

export function disposeStyleGateArtLayer(layer: StyleGateArtLayer): void {
  layer.disposed = true
  layer.group.parent?.remove(layer.group)
  disposeObject(layer.group)
  if (layer.texture) {
    layer.texture.userData.cached = false
    layer.texture.dispose()
  }
}
