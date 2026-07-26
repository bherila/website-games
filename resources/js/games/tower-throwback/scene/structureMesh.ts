/**
 * Static structure pass — rebuilt only when structureVersion changes.
 *
 * Instancing approach: one InstancedMesh per layer (unit quads, slab edge
 * strips, shaft rails, stop markers), each recreated with exact instance
 * counts on rebuild — rebuilds happen only on build/demolish, so recreation
 * is simpler and cheaper than growable pools, and per-instance color comes
 * from `instanceColor`. Ground, sky, and the night-dim overlay are three
 * plain quads. Map ambience and weather add a handful of bounded cosmetic
 * draws; none of them participate in simulation state.
 *
 * `applyTimeOfDay` lerps the sky, fades the dim overlay, and warm-tints
 * OCCUPIED unit instances at night (per-unit approximation of lit windows);
 * instance colors are only rewritten when the 5-minute time bucket changes.
 */

import * as THREE from 'three'

import { shaftDef } from '../engine/catalog'
import { getSegments, isSlabFamily } from '../engine/grid'
import { getMap } from '../engine/maps'
import { type EngineState, FLOOR_MAX, FLOOR_MIN, GRID_WIDTH, type Unit } from '../gameTypes'
import { elevatorStopLabels } from './elevatorStops'
import {
  daylightAt,
  FLOOR_H,
  getPalette,
  nightWindowColor,
  skyColorAt,
  type TowerPalette,
  unitFillColor,
} from './palette'
import { disposeObject } from './threeUtils'
import { type PrecipKind, precipScrollPhase, weatherLookForDay } from './weather'

const Z_SKY = -10
const Z_GROUND = -9
const Z_FALLS = -7.5
const Z_SLAB = -1
const Z_UNIT = 0
const Z_RAIL = 0.5
const Z_STOP = 0.6
const Z_STOP_LABEL = 0.7
/** Precipitation sits in front of the tower but behind the night-dim overlay so the dim darkens it too. */
const Z_PRECIP = 5.5
const Z_DIM = 6

const TIME_BUCKET_MIN = 5

/** Procedural precipitation texture: small, tiled, and scrolled via UV offset. */
const PRECIP_TEX_SIZE = 64
/** World units per texture tile — sets how large rain streaks / snow dots read on screen. */
const PRECIP_TILE_WORLD = 7
const WATERFALL_MIST_PARTICLES = 72
const NIAGARA_MAP = getMap('niagara-falls')
/**
 * The falls are drawn in the map's own void, so the geometry is read from map
 * config rather than duplicated here. A missing exclusion is a config error,
 * not a runtime condition — `structureMeshWeather.test.ts` asserts it instead
 * of throwing at import, which would take down every map's scene, not Niagara's.
 */
const NIAGARA_GAP = NIAGARA_MAP.horizontalBuildExclusions?.[0] ?? { xMin: 0, xMaxExclusive: 0, label: '' }
const NIAGARA_FALLS_CENTER_X = (NIAGARA_GAP.xMin + NIAGARA_GAP.xMaxExclusive) / 2
const NIAGARA_FALLS_TOP_Y = NIAGARA_MAP.lobbyAnchorFloor * FLOOR_H
const NIAGARA_FALLS_WIDTH = NIAGARA_GAP.xMaxExclusive - NIAGARA_GAP.xMin
const NIAGARA_FALLS_HEIGHT = 88

export interface StructureLayer {
  group: THREE.Group
  version: number
  mapId: string | null
  palette: TowerPalette
  sky: THREE.Mesh
  skyMaterial: THREE.MeshBasicMaterial
  ground: THREE.Mesh
  dimOverlay: THREE.Mesh
  dimMaterial: THREE.MeshBasicMaterial
  /** Full-cover precipitation quads (rain, snow); one is shown at a time via weather. */
  rainMesh: THREE.Mesh
  snowMesh: THREE.Mesh
  /** Niagara's map-defining falls, visible on that map even when motion is reduced. */
  waterfallMesh: THREE.Mesh
  /** Deterministic spray plume at the foot of Niagara's falls. */
  waterfallMist: THREE.Points
  rebuilt: THREE.Group
  unitMesh: THREE.InstancedMesh | null
  /** Parallel to unitMesh instances, for night-window retints. */
  unitRefs: Unit[]
  unitBaseColors: number[]
  lastTimeBucket: number
}

const QUAD = new THREE.PlaneGeometry(1, 1)
QUAD.userData.cached = true

function flatMaterial(vertexColors: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors })
}

/** Deterministic [0,1) hash — precipitation texel layout must never touch rng or Math.random. */
function precipHashUnit(n: number): number {
  let h = (n | 0) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 0x100000000
}

/**
 * Build a small RGBA precipitation texture procedurally (no atlas art, no
 * canvas — a raw pixel array works identically in the browser and headless
 * tests). Texel positions come from a fixed hash, so the pattern is stable.
 */
function makePrecipTexture(kind: 'rain' | 'snow'): THREE.DataTexture {
  const size = PRECIP_TEX_SIZE
  const data = new Uint8Array(size * size * 4)
  const plot = (px: number, py: number, r: number, g: number, b: number, a: number): void => {
    const x = ((px % size) + size) % size
    const y = ((py % size) + size) % size
    const i = (y * size + x) * 4
    if (a > data[i + 3]!) {
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  if (kind === 'rain') {
    for (let s = 0; s < 40; s++) {
      const x = Math.floor(precipHashUnit(s * 2 + 1) * size)
      const y = Math.floor(precipHashUnit(s * 2 + 2) * size)
      const len = 5 + Math.floor(precipHashUnit(s * 2 + 3) * 4)
      for (let t = 0; t < len; t++) {
        plot(x - Math.floor(t / 3), y + t, 190, 214, 255, 150)
      }
    }
  } else {
    for (let f = 0; f < 46; f++) {
      const x = Math.floor(precipHashUnit(f * 3 + 1) * size)
      const y = Math.floor(precipHashUnit(f * 3 + 2) * size)
      plot(x, y, 245, 249, 255, 220)
      plot(x + 1, y, 235, 242, 255, 150)
      plot(x, y + 1, 235, 242, 255, 150)
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function makePrecipMesh(kind: 'rain' | 'snow', sky: THREE.Mesh): THREE.Mesh {
  const texture = makePrecipTexture(kind)
  texture.repeat.set(sky.scale.x / PRECIP_TILE_WORLD, sky.scale.y / PRECIP_TILE_WORLD)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false })
  const mesh = new THREE.Mesh(QUAD, material)
  mesh.scale.copy(sky.scale)
  mesh.position.set(sky.position.x, sky.position.y, Z_PRECIP)
  mesh.visible = false
  mesh.name = `weather.${kind}`
  return mesh
}

/** Deterministic animated-water texture; cosmetic presentation never consumes engine rng. */
function makeWaterfallTexture(): THREE.DataTexture {
  const width = 64
  const height = 128
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const edgeFade = Math.min(1, y / 10, (height - 1 - y) / 12)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const strand = precipHashUnit(x * 31 + Math.floor(y / 9) * 17)
      const wave = Math.sin((x + y * 0.18) * 0.34) * 0.5 + 0.5
      const core = Math.max(0, 1 - Math.abs(x - width / 2) / (width * 0.48))
      const alpha = Math.round(210 * edgeFade * core * (0.62 + strand * 0.22 + wave * 0.16))
      data[i] = 218
      data[i + 1] = 246
      data[i + 2] = 250
      data[i + 3] = alpha
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 2.4)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function makeWaterfallMesh(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: makeWaterfallTexture(),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(QUAD, material)
  mesh.name = 'ambience.niagaraWaterfall'
  // The generated backdrop supplies the waterfall body. This animated pass is
  // a broad, quiet shimmer whose crest stays pinned to the lobby/clifftop.
  mesh.scale.set(NIAGARA_FALLS_WIDTH, NIAGARA_FALLS_HEIGHT, 1)
  mesh.position.set(NIAGARA_FALLS_CENTER_X, NIAGARA_FALLS_TOP_Y - NIAGARA_FALLS_HEIGHT / 2, Z_FALLS)
  mesh.visible = false
  return mesh
}

function updateWaterfallMistPositions(points: THREE.Points, phase: number): void {
  const position = points.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < WATERFALL_MIST_PARTICLES; i += 1) {
    const life = (phase + precipHashUnit(i * 7 + 1)) % 1
    const direction = precipHashUnit(i * 7 + 2) * 2 - 1
    const spread = 7 + life * 16
    const curl = Math.sin((life + precipHashUnit(i * 7 + 3)) * Math.PI * 2) * 2.5
    position.setXYZ(i, direction * spread + curl, -3 + life * 13, 0)
  }
  position.needsUpdate = true
}

function makeWaterfallMist(): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WATERFALL_MIST_PARTICLES * 3), 3))
  const material = new THREE.PointsMaterial({
    color: 0xd8f4f5,
    size: 1.65,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'ambience.niagaraMist'
  points.position.set(NIAGARA_FALLS_CENTER_X, NIAGARA_FALLS_TOP_Y - NIAGARA_FALLS_HEIGHT + 2, Z_FALLS + 0.1)
  points.visible = false
  updateWaterfallMistPositions(points, 0)
  return points
}

export function createStructureLayer(scene: THREE.Scene): StructureLayer {
  const palette = getPalette('city')
  const group = new THREE.Group()
  scene.add(group)

  const worldW = GRID_WIDTH
  const worldBottom = FLOOR_MIN * FLOOR_H
  const worldTop = (FLOOR_MAX + 2) * FLOOR_H

  const skyMaterial = new THREE.MeshBasicMaterial({ color: palette.skyDay })
  const sky = new THREE.Mesh(QUAD, skyMaterial)
  sky.scale.set(worldW * 3, (worldTop - worldBottom) * 3, 1)
  sky.position.set(worldW / 2, (worldTop + worldBottom) / 2, Z_SKY)
  group.add(sky)

  const ground = new THREE.Mesh(QUAD, new THREE.MeshBasicMaterial({ color: palette.ground }))
  ground.scale.set(worldW * 3, Math.abs(worldBottom) * 3, 1)
  ground.position.set(worldW / 2, -Math.abs(worldBottom) * 1.5, Z_GROUND)
  group.add(ground)

  const dimMaterial = new THREE.MeshBasicMaterial({ color: 0x0a1028, transparent: true, opacity: 0, depthWrite: false })
  const dimOverlay = new THREE.Mesh(QUAD, dimMaterial)
  dimOverlay.scale.copy(sky.scale)
  dimOverlay.position.set(sky.position.x, sky.position.y, Z_DIM)
  group.add(dimOverlay)

  const rainMesh = makePrecipMesh('rain', sky)
  const snowMesh = makePrecipMesh('snow', sky)
  const waterfallMesh = makeWaterfallMesh()
  const waterfallMist = makeWaterfallMist()
  group.add(rainMesh, snowMesh, waterfallMesh, waterfallMist)

  const rebuilt = new THREE.Group()
  group.add(rebuilt)

  return {
    group,
    version: -1,
    mapId: null,
    palette,
    sky,
    skyMaterial,
    ground,
    dimOverlay,
    dimMaterial,
    rainMesh,
    snowMesh,
    waterfallMesh,
    waterfallMist,
    rebuilt,
    unitMesh: null,
    unitRefs: [],
    unitBaseColors: [],
    lastTimeBucket: -1,
  }
}

function instanced(count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(QUAD, flatMaterial(false), Math.max(count, 1))
  mesh.count = count
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  return mesh
}

const dummy = new THREE.Object3D()
const colorScratch = new THREE.Color()
const stopLabelTextureCache = new Map<string, THREE.CanvasTexture>()

function stopLabelTexture(label: string): THREE.CanvasTexture | null {
  const cached = stopLabelTextureCache.get(label)
  if (cached) {
    return cached
  }
  if (typeof document === 'undefined') {
    return null
  }
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(8, 12, 24, 0.72)'
  context.fillRect(8, 10, 80, 44)
  context.strokeStyle = 'rgba(238, 246, 255, 0.88)'
  context.lineWidth = 3
  context.strokeRect(8, 10, 80, 44)
  context.fillStyle = '#f8fbff'
  context.font = 'bold 34px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, 48, 33)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.NearestFilter
  texture.userData.cached = true
  stopLabelTextureCache.set(label, texture)
  return texture
}

function makeStopLabel(label: string): THREE.Mesh | null {
  const texture = stopLabelTexture(label)
  if (!texture) {
    return null
  }
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  return new THREE.Mesh(QUAD, material)
}

function setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, w: number, h: number, color: number): void {
  dummy.position.set(x, y, 0)
  dummy.scale.set(w, h, 1)
  dummy.rotation.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
  mesh.setColorAt(i, colorScratch.setHex(color))
}

/** Rebuild all structure instancing; no-op unless structureVersion changed. */
export function syncStructure(layer: StructureLayer, state: EngineState): void {
  if (layer.version === state.structureVersion && layer.mapId === state.mapId) {
    return
  }
  layer.version = state.structureVersion
  layer.mapId = state.mapId
  const map = getMap(state.mapId)
  layer.palette = getPalette(map.paletteTheme)
  layer.ground.visible = map.id !== 'niagara-falls'
  layer.waterfallMesh.visible = map.id === 'niagara-falls'
  layer.waterfallMist.visible = map.id === 'niagara-falls'
  const groundMaterial = layer.ground.material as THREE.MeshBasicMaterial
  groundMaterial.color.setHex(layer.palette.ground)
  layer.lastTimeBucket = -1

  while (layer.rebuilt.children.length > 0) {
    const child = layer.rebuilt.children[0]!
    layer.rebuilt.remove(child)
    disposeObject(child)
  }

  const palette = layer.palette
  const units = [...state.units].sort((a, b) => a.id - b.id)

  // Unit + slab-family quads (lobby/skylobby highlight = their palette colors).
  const unitMesh = instanced(units.length)
  layer.unitRefs = []
  layer.unitBaseColors = []
  units.forEach((unit, i) => {
    const height = isSlabFamily(unit.kind) ? unit.storeys * FLOOR_H - 0.3 : unit.storeys * FLOOR_H - 0.4
    const color = unitFillColor(palette, unit)
    setInstance(
      unitMesh,
      i,
      unit.x + unit.width / 2,
      unit.floor * FLOOR_H + (unit.storeys * FLOOR_H) / 2,
      unit.width - 0.15,
      height,
      color,
    )
    layer.unitRefs.push(unit)
    layer.unitBaseColors.push(color)
  })
  layer.rebuilt.add(unitMesh)
  layer.unitMesh = unitMesh

  // Slab edge strips per walkable run.
  const runs = [...getSegments(state).entries()].flatMap(([, segs]) => segs)
  const slabMesh = instanced(runs.length)
  runs.forEach((run, i) => {
    const width = run.x1 - run.x0 + 1
    setInstance(slabMesh, i, run.x0 + width / 2, run.floor * FLOOR_H + 0.15, width, 0.3, palette.slabEdge)
  })
  slabMesh.position.z = Z_SLAB
  layer.rebuilt.add(slabMesh)
  unitMesh.position.z = Z_UNIT

  // Shaft rails + stop markers. Glass elevators render on their own
  // translucent pass (palette.shaftOpacity) so the facade shows through.
  const shafts = state.shafts
  const addRailPass = (list: typeof shafts, opacity: number): void => {
    if (list.length === 0) {
      return
    }
    const railMesh = instanced(list.length)
    const railMaterial = railMesh.material as THREE.MeshBasicMaterial
    railMaterial.transparent = true
    railMaterial.opacity = opacity
    list.forEach((shaft, i) => {
      const def = shaftDef(shaft.kind)
      const floors = shaft.topFloor - shaft.bottomFloor + 1
      setInstance(
        railMesh,
        i,
        shaft.x + def.width / 2,
        (shaft.bottomFloor + floors / 2) * FLOOR_H,
        def.width - 0.1,
        floors * FLOOR_H,
        palette.shaft[shaft.kind],
      )
    })
    railMesh.position.z = Z_RAIL
    layer.rebuilt.add(railMesh)
  }
  addRailPass(shafts.filter((shaft) => palette.shaftOpacity[shaft.kind] === undefined), 0.85)
  for (const kind of ['glass'] as const) {
    addRailPass(shafts.filter((shaft) => shaft.kind === kind), palette.shaftOpacity[kind] ?? 0.85)
  }

  const stops = shafts.flatMap((shaft) =>
    shaft.stops.map((floor) => ({ shaft, floor, enabled: shaft.enabledStops.includes(floor) })),
  )
  const stopMesh = instanced(stops.length)
  stops.forEach((stop, i) => {
    const def = shaftDef(stop.shaft.kind)
    setInstance(
      stopMesh,
      i,
      stop.shaft.x + def.width / 2,
      stop.floor * FLOOR_H + 0.3,
      def.width - 0.2,
      0.35,
      stop.enabled ? palette.stopMarkerEnabled : palette.stopMarker,
    )
  })
  stopMesh.position.z = Z_STOP
  layer.rebuilt.add(stopMesh)

  for (const stop of elevatorStopLabels(shafts)) {
    const label = makeStopLabel(stop.label)
    if (!label) {
      continue
    }
    label.scale.set(Math.min(stop.width, 1.25), 0.75, 1)
    label.position.set(stop.x, stop.floor * FLOOR_H + 0.72, Z_STOP_LABEL)
    layer.rebuilt.add(label)
  }
}

/**
 * Sky lerp + weather sky tint + night dim + warm windows for occupied units
 * (5-min buckets). Weather is a pure function of `day`; its tint composes on top
 * of the day/night sky, scaled by daylight so nights stay their night color.
 */
export function applyTimeOfDay(layer: StructureLayer, minuteOfDay: number, day: number): void {
  const bucket = Math.floor(minuteOfDay / TIME_BUCKET_MIN)
  if (bucket === layer.lastTimeBucket) {
    return
  }
  layer.lastTimeBucket = bucket
  const midBucketMinute = bucket * TIME_BUCKET_MIN + TIME_BUCKET_MIN / 2
  const daylight = daylightAt(midBucketMinute)
  const darkness = 1 - daylight

  layer.skyMaterial.color.setHex(skyColorAt(layer.palette, midBucketMinute))
  const look = weatherLookForDay(day)
  if (look.skyTintStrength > 0 && daylight > 0) {
    layer.skyMaterial.color.lerp(colorScratch.setHex(look.skyTint), look.skyTintStrength * daylight)
  }
  layer.dimMaterial.opacity = 0.35 * darkness

  const unitMesh = layer.unitMesh
  if (!unitMesh) {
    return
  }
  layer.unitRefs.forEach((unit, i) => {
    const base = layer.unitBaseColors[i]!
    const lit = darkness > 0.05 && unit.occupied && !isSlabFamily(unit.kind)
    unitMesh.setColorAt(i, colorScratch.setHex(lit ? nightWindowColor(layer.palette, base, darkness) : base))
  })
  if (unitMesh.instanceColor) {
    unitMesh.instanceColor.needsUpdate = true
  }
}

/**
 * Per-frame precipitation animation. Runs every frame (unlike the bucketed
 * sky/tint pass) because the scroll offset must advance smoothly. Purely a
 * function of `(day, minute)` sim time — no rng, no wall-clock, cosmetic only.
 */
export function applyWeather(layer: StructureLayer, minuteOfDay: number, day: number, reducedMotion = false): void {
  const look = weatherLookForDay(day)
  updatePrecip(layer.rainMesh, look.precip === 'rain' ? 'rain' : 'none', look.precipOpacity, minuteOfDay, day, reducedMotion)
  updatePrecip(layer.snowMesh, look.precip === 'snow' ? 'snow' : 'none', look.precipOpacity, minuteOfDay, day, reducedMotion)
  const showFalls = layer.mapId === 'niagara-falls'
  updateWaterfall(layer.waterfallMesh, showFalls, minuteOfDay, day, reducedMotion)
  updateWaterfallMist(layer.waterfallMist, showFalls, minuteOfDay, day, reducedMotion)
}

function updateWaterfallMist(
  points: THREE.Points,
  visible: boolean,
  minuteOfDay: number,
  day: number,
  reducedMotion: boolean,
): void {
  points.visible = visible
  if (!visible) {
    return
  }
  const animatedMinute = reducedMotion ? 0 : minuteOfDay
  const phase = ((day * 0.031 + animatedMinute / 720) % 1 + 1) % 1
  updateWaterfallMistPositions(points, phase)
}

function updateWaterfall(
  mesh: THREE.Mesh,
  visible: boolean,
  minuteOfDay: number,
  day: number,
  reducedMotion: boolean,
): void {
  const material = mesh.material as THREE.MeshBasicMaterial
  if (!visible || !material.map) {
    mesh.visible = false
    return
  }
  mesh.visible = true
  // Like precipitation, reduced motion freezes phase without erasing the falls.
  const animatedMinute = reducedMotion ? 0 : minuteOfDay
  material.map.offset.y = ((day * 0.037 + animatedMinute / 360) % 1 + 1) % 1
}

function updatePrecip(
  mesh: THREE.Mesh,
  kind: PrecipKind,
  opacity: number,
  minuteOfDay: number,
  day: number,
  reducedMotion: boolean,
): void {
  const material = mesh.material as THREE.MeshBasicMaterial
  if (kind === 'none' || !material.map) {
    mesh.visible = false
    return
  }
  mesh.visible = true
  material.opacity = opacity
  // Reduced motion keeps the precipitation VISIBLE (it is weather information,
  // not decoration) but freezes the scroll at the day's opening phase, so the
  // texture is a still image rather than a continuous scroll.
  const phase = precipScrollPhase(day, reducedMotion ? 0 : minuteOfDay, kind)
  material.map.offset.set(phase.x, phase.y)
}

export function disposeStructureLayer(layer: StructureLayer): void {
  layer.group.parent?.remove(layer.group)
  disposeObject(layer.group)
}
