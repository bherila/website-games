import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { CompassDir, MapDef, WallTextureKind } from '../maps/mapTypes'
import { cellKindAt, rampDirAt } from '../maps/mapTypes'
import { createFloorTexture, createSkyGradientTexture, createWallTexture } from './canvasTextures'

/**
 * Builds the static per-map scenery (floor, merged wall meshes, lights) into
 * the given group and applies theme fog/sky to the scene. All materials are
 * DoubleSide so the mirror pass (x-flipped projection) renders correctly.
 */
export function buildMapScene(scene: THREE.Scene, staticGroup: THREE.Group, map: MapDef): void {
  const { theme } = map
  const worldWidth = map.cols * map.cellSize
  const worldDepth = map.rows.length * map.cellSize

  scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity)
  disposeSceneBackground(scene)
  scene.background = createSkyGradientTexture(theme.skyTopColor, theme.skyBottomColor)

  const floorTexture = createFloorTexture(theme.floorColorA, theme.floorColorB, theme.floorPattern ?? 'checker')
  floorTexture.repeat.set(map.cols, map.rows.length)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldDepth),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(worldWidth / 2, 0, worldDepth / 2)
  floor.receiveShadow = true
  staticGroup.add(floor)

  const highWalls = buildWallMesh(map, 'wallHigh', map.highWallHeight, theme.wallColorA, theme.wallColorB, theme.wallTexture)
  if (highWalls) {
    staticGroup.add(highWalls)
  }
  const lowWalls = buildWallMesh(map, 'wallLow', map.lowWallHeight, theme.lowWallColor, theme.wallColorB, theme.wallTexture)
  if (lowWalls) {
    staticGroup.add(lowWalls)
  }
  const platforms = buildWallMesh(map, 'platform', map.lowWallHeight, theme.lowWallColor, theme.wallColorB, theme.wallTexture)
  if (platforms) {
    staticGroup.add(platforms)
  }
  const ramps = buildRampMesh(map)
  if (ramps) {
    staticGroup.add(ramps)
  }

  const hemisphere = new THREE.HemisphereLight(theme.skyTopColor, theme.floorColorB, theme.ambientIntensity)
  staticGroup.add(hemisphere)

  const sun = new THREE.DirectionalLight(theme.lightColor, theme.directionalIntensity)
  sun.position.set(worldWidth * 0.25, 40, worldDepth * 0.2)
  sun.target.position.set(worldWidth / 2, 0, worldDepth / 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.6
  const shadowSpan = Math.max(worldWidth, worldDepth) * 0.75
  sun.shadow.camera.left = -shadowSpan
  sun.shadow.camera.right = shadowSpan
  sun.shadow.camera.top = shadowSpan
  sun.shadow.camera.bottom = -shadowSpan
  sun.shadow.camera.far = Math.max(worldWidth, worldDepth) * 1.5 + 60
  staticGroup.add(sun)
  staticGroup.add(sun.target)

  const accent = new THREE.PointLight(theme.accentColor, 40, worldWidth)
  accent.position.set(worldWidth / 2, map.highWallHeight * 2, worldDepth / 2)
  staticGroup.add(accent)
}

/** Rounds are endless — the previous round's sky texture must not leak. */
export function disposeSceneBackground(scene: THREE.Scene): void {
  if (scene.background instanceof THREE.Texture) {
    scene.background.dispose()
  }
  scene.background = null
}

function buildWallMesh(
  map: MapDef,
  kind: 'wallHigh' | 'wallLow' | 'platform',
  height: number,
  colorA: number,
  colorB: number,
  textureKind: WallTextureKind,
): THREE.Mesh | null {
  const geometries: THREE.BufferGeometry[] = []

  for (let row = 0; row < map.rows.length; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (cellKindAt(map, col, row) !== kind) {
        continue
      }
      const box = new THREE.BoxGeometry(map.cellSize, height, map.cellSize)
      box.translate((col + 0.5) * map.cellSize, height / 2, (row + 0.5) * map.cellSize)
      geometries.push(box)
    }
  }

  if (geometries.length === 0) {
    return null
  }

  const merged = mergeGeometries(geometries)
  for (const geometry of geometries) {
    geometry.dispose()
  }
  if (!merged) {
    return null
  }

  const texture = createWallTexture(textureKind, colorA, colorB)
  const emissiveIntensity = map.theme.wallEmissiveIntensity ?? 0
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.75,
      metalness: 0.08,
      side: THREE.DoubleSide,
      ...(emissiveIntensity > 0 ? { emissive: 0xffffff, emissiveMap: texture, emissiveIntensity } : {}),
    }),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Rotation putting a wedge's uphill (+x) edge on a compass direction. */
const RAMP_ROTATION: Record<CompassDir, number> = {
  east: 0,
  south: -Math.PI / 2,
  west: Math.PI,
  north: Math.PI / 2,
}

/** One merged mesh of every ramp cell: triangular prisms sloping 0 → lowWallHeight. */
function buildRampMesh(map: MapDef): THREE.Mesh | null {
  const geometries: THREE.BufferGeometry[] = []

  for (let row = 0; row < map.rows.length; row++) {
    for (let col = 0; col < map.cols; col++) {
      const dir = rampDirAt(map, col, row)
      if (!dir) {
        continue
      }
      const wedge = createWedgeGeometry(map.cellSize, map.lowWallHeight)
      wedge.rotateY(RAMP_ROTATION[dir])
      wedge.translate((col + 0.5) * map.cellSize, 0, (row + 0.5) * map.cellSize)
      geometries.push(wedge)
    }
  }

  if (geometries.length === 0) {
    return null
  }

  const merged = mergeGeometries(geometries)
  for (const geometry of geometries) {
    geometry.dispose()
  }
  if (!merged) {
    return null
  }

  const texture = createWallTexture(map.theme.wallTexture, map.theme.lowWallColor, map.theme.wallColorB)
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * Triangular prism covering one cell: 0 at local -x rising to `height` at
 * local +x (rotated per direction before translating into place).
 */
function createWedgeGeometry(size: number, height: number): THREE.BufferGeometry {
  const s = size / 2
  const a = [-s, 0, -s]
  const b = [s, 0, -s]
  const c = [s, 0, s]
  const d = [-s, 0, s]
  const e = [s, height, -s]
  const f = [s, height, s]

  const positions = new Float32Array(
    [a, d, f, a, f, e, b, e, f, b, f, c, a, e, b, d, c, f].flat(),
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const vertexCount = positions.length / 3
  const uvs = new Float32Array(vertexCount * 2)
  for (let i = 0; i < vertexCount; i++) {
    uvs[i * 2] = ((positions[i * 3] ?? 0) + s) / size
    uvs[i * 2 + 1] = ((positions[i * 3 + 2] ?? 0) + s) / size
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}
