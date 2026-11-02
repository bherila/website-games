import * as THREE from 'three'

import { previewPaths } from '../gameEngine'
import { COLS, type GameState, ROWS, type Terrain } from '../gameTypes'
import { cellIndex } from '../pathfinding'
import { ball, box, cone, cylinder, mergeParts, part } from './parts'
import { THEMES } from './themes'

const PATH_MARKERS = 150
const SCENERY_COUNT = 90

function jitter(col: number, row: number): number {
  const value = Math.sin((col * 127.1) + (row * 311.7)) * 43758.5453

  return value - Math.floor(value)
}

export interface TerrainView {
  update: (state: GameState, time: number, showGrid: boolean, reducedMotion: boolean) => void
}

export function createTerrainView(scene: THREE.Scene, state: GameState): TerrainView {
  const theme = THEMES[state.level.theme]
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true })
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()

  // The land itself: one instanced slab per cell, checkered faintly so cells can be read.
  const counts: Partial<Record<Terrain, number>> = {}
  for (const terrain of state.terrain) {
    counts[terrain] = (counts[terrain] ?? 0) + 1
  }
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1), material, COLS * ROWS)
  tiles.receiveShadow = true
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const terrain = state.terrain[cellIndex(col, row)] ?? 'ground'
      const isWater = terrain === 'water'
      // Water cells sit low, so the sheet of water above them shows through as a sunken channel.
      dummy.position.set(col + 0.5, isWater ? -0.42 : -0.2, row + 0.5)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      tiles.setMatrixAt(cellIndex(col, row), dummy.matrix)
      const base = terrain === 'pad' || terrain === 'spawn' || terrain === 'exit'
        ? theme.pad
        : terrain === 'rock'
          ? theme.rock
          : isWater
            ? theme.waterGlow
            : (col + row) % 2 === 0 ? theme.groundA : theme.groundB
      tint.setHex(base).offsetHSL(0, 0, (jitter(col, row) - 0.5) * 0.025)
      tiles.setColorAt(cellIndex(col, row), tint)
    }
  }
  scene.add(tiles)

  // A rim under the board, wide enough to fill the screen at any aspect ratio.
  const rim = new THREE.Mesh(new THREE.BoxGeometry(COLS + 60, 0.4, ROWS + 60), new THREE.MeshStandardMaterial({ color: theme.rim, roughness: 1 }))
  rim.position.set(COLS / 2, -0.62, ROWS / 2)
  rim.receiveShadow = true
  scene.add(rim)

  const edgeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.rim).offsetHSL(0, 0, -0.08), roughness: 1 })
  for (const [w, d, x, z] of [[COLS + 0.5, 0.25, COLS / 2, -0.12], [COLS + 0.5, 0.25, COLS / 2, ROWS + 0.12], [0.25, ROWS, -0.12, ROWS / 2], [0.25, ROWS, COLS + 0.12, ROWS / 2]] as const) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), edgeMaterial)
    edge.position.set(x, -0.2, z)
    scene.add(edge)
  }

  // Scenery beyond the board fills the rest of a wide screen and frames the field.
  const scenery = mergeParts(state.level.theme === 'meadow' || state.level.theme === 'tundra'
    ? [
        part(cylinder(0.08, 0.11, 0.4, 5), 0x5e3c1b, [0, 0.2, 0]),
        part(cone(0.42, 0.7, 6), theme.rock === 0x7b7f86 ? 0x2f6b34 : 0x4f7f6b, [0, 0.66, 0]),
        part(cone(0.32, 0.56, 6), theme.rock === 0x7b7f86 ? 0x3a8240 : 0x6b9a88, [0, 1.02, 0]),
      ]
    : [part(ball(0.42, 0), theme.rock, [0, 0.2, 0], [0.4, 0.2, 0], [1.15, 0.8, 1.05]), part(ball(0.22, 0), theme.rockTop, [0.2, 0.38, 0.12])])
  const sceneryMesh = new THREE.InstancedMesh(scenery, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), SCENERY_COUNT)
  sceneryMesh.castShadow = true
  for (let index = 0; index < SCENERY_COUNT; index += 1) {
    // Scatter on a jittered grid around the board, skipping the board itself and its edge.
    const u = jitter(index, 3)
    const v = jitter(7, index)
    let x = (u * (COLS + 34)) - 17
    let z = (v * (ROWS + 34)) - 17
    if (x > -1 && x < COLS + 1 && z > -1 && z < ROWS + 1) {
      if (u < 0.5) {
        x = -1.6 - (u * 12)
      } else {
        x = COLS + 1.6 + ((u - 0.5) * 12)
      }
      z = (v * (ROWS + 6)) - 3
    }
    dummy.position.set(x, -0.42, z)
    dummy.rotation.set(0, jitter(index, index) * Math.PI * 2, 0)
    dummy.scale.setScalar(0.8 + (jitter(index, 11) * 0.7))
    dummy.updateMatrix()
    sceneryMesh.setMatrixAt(index, dummy.matrix)
  }
  scene.add(sceneryMesh)

  // Rocks are irregular lumps, so they read as immovable next to the tidy buildings.
  const rockGeometry = mergeParts([
    part(ball(0.42, 0), theme.rock, [0, 0.26, 0], [0.3, 0.4, 0], [1.1, 0.95, 1.1]),
    part(ball(0.27, 0), theme.rockTop, [0.12, 0.56, -0.06], [0.7, 0, 0.3]),
  ])
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), Math.max(1, counts.rock ?? 0))
  rocks.castShadow = true
  rocks.count = 0
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (state.terrain[cellIndex(col, row)] !== 'rock') {
        continue
      }
      dummy.position.set(col + 0.5, 0, row + 0.5)
      dummy.rotation.set(0, jitter(col, row) * Math.PI * 2, 0)
      const size = 0.9 + (jitter(row, col) * 0.2)
      dummy.scale.set(size, size, size)
      dummy.updateMatrix()
      rocks.setMatrixAt(rocks.count, dummy.matrix)
      rocks.count += 1
    }
  }
  scene.add(rocks)

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS, ROWS),
    new THREE.MeshStandardMaterial({ color: theme.water, emissive: theme.waterGlow, emissiveIntensity: state.level.theme === 'ember' ? 1.6 : 0.4, roughness: 0.35, metalness: 0.1 }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.set(COLS / 2, -0.16, ROWS / 2)
  water.visible = (counts.water ?? 0) > 0
  scene.add(water)

  // Spawns: a dark gateway enemies climb out of.
  const portals: THREE.Mesh[] = []
  for (const { col, row } of state.spawns) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), new THREE.MeshBasicMaterial({ color: 0x1e1033 }))
    hole.rotation.x = -Math.PI / 2
    hole.position.set(col + 0.5, 0.02, row + 0.5)
    scene.add(hole)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 20), new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7c3aed, emissiveIntensity: 0.9 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(col + 0.5, 0.05, row + 0.5)
    scene.add(ring)
    portals.push(ring)
  }

  // The keep: what the player is defending.
  const keepGeometry = mergeParts([
    part(box(0.82, 0.6, 0.82), 0xcbd5e1, [0, 0.3, 0]),
    part(box(0.2, 0.32, 0.06), 0x57341a, [0, 0.16, 0.42]),
    part(box(0.2, 0.32, 0.06), 0x57341a, [0, 0.16, -0.42]),
    part(box(0.06, 0.32, 0.2), 0x57341a, [0.42, 0.16, 0]),
    part(box(0.06, 0.32, 0.2), 0x57341a, [-0.42, 0.16, 0]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x = 0, z = 0]) => [
      part(cylinder(0.14, 0.16, 0.98, 8), 0xe2e8f0, [x * 0.4, 0.49, z * 0.4]),
      part(cone(0.2, 0.3, 8), 0x2563eb, [x * 0.4, 1.13, z * 0.4]),
    ]),
    part(cylinder(0.02, 0.02, 0.6, 4), 0x475569, [0, 0.9, 0]),
    part(box(0.26, 0.15, 0.02), 0xfacc15, [0.14, 1.12, 0]),
  ])
  const keepMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true })
  for (const { col, row } of state.exits) {
    const keep = new THREE.Mesh(keepGeometry, keepMaterial)
    keep.position.set(col + 0.5, 0, row + 0.5)
    keep.castShadow = true
    scene.add(keep)
  }

  // The route markers show where walkers will actually go, so mazing can be planned by eye.
  const markerGeometry = new THREE.ConeGeometry(0.13, 0.3, 3)
  markerGeometry.rotateX(Math.PI / 2)
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false })
  const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, PATH_MARKERS)
  markers.count = 0
  markers.frustumCulled = false
  markers.renderOrder = 2
  scene.add(markers)
  const OK_COLOR = new THREE.Color(0xfff8e1)
  const BLOCKED_COLOR = new THREE.Color(0xff4d4f)
  const FLIGHT_COLOR = new THREE.Color(0x67e8f9)

  const gridPoints: number[] = []
  for (let col = 0; col <= COLS; col += 1) {
    gridPoints.push(col, 0.012, 0, col, 0.012, ROWS)
  }
  for (let row = 0; row <= ROWS; row += 1) {
    gridPoints.push(0, 0.012, row, COLS, 0.012, row)
  }
  const gridGeometry = new THREE.BufferGeometry()
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3))
  const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.22 }))
  grid.visible = false
  scene.add(grid)

  let routes: { points: { x: number; y: number }[]; color: THREE.Color }[] = []
  let routedVersion = -1
  let routedWave = -1

  function refreshRoutes(): void {
    routes = previewPaths(state).map((path) => ({ points: path.points, color: path.blocked ? BLOCKED_COLOR : OK_COLOR }))
    // Flyers ignore the maze entirely, so show their straight line before they arrive.
    const nextFlyers = state.waves[state.waveNumber]?.groups.some((group) => group.kind === 'flyer') ?? false
    const liveFlyers = state.enemies.some((enemy) => enemy.flying)
    const exit = state.exits[0]
    if ((nextFlyers || liveFlyers) && exit) {
      for (const spawn of state.spawns) {
        const dx = exit.col - spawn.col
        const dy = exit.row - spawn.row
        const length = Math.max(1, Math.ceil(Math.hypot(dx, dy)))
        routes.push({
          color: FLIGHT_COLOR,
          points: Array.from({ length: length + 1 }, (_, step) => ({
            x: spawn.col + 0.5 + ((dx * step) / length),
            y: spawn.row + 0.5 + ((dy * step) / length),
          })),
        })
      }
    }
  }

  return {
    update(current, time, showGrid, reducedMotion) {
      for (const ring of portals) {
        ring.rotation.z = reducedMotion ? 0 : time * 1.5
      }
      grid.visible = showGrid
      if (routedVersion !== current.gridVersion || routedWave !== current.waveNumber) {
        routedVersion = current.gridVersion
        routedWave = current.waveNumber
        refreshRoutes()
      }
      const phase = reducedMotion ? 0.5 : (time * 0.9) % 1
      let index = 0
      for (const route of routes) {
        for (let point = 0; point < route.points.length - 1 && index < PATH_MARKERS; point += 1) {
          const from = route.points[point]
          const to = route.points[point + 1]
          if (!from || !to) {
            continue
          }
          dummy.position.set(from.x + ((to.x - from.x) * phase), 0.06, from.y + ((to.y - from.y) * phase))
          dummy.rotation.set(0, Math.atan2(to.x - from.x, to.y - from.y), 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          markers.setMatrixAt(index, dummy.matrix)
          markers.setColorAt(index, route.color)
          index += 1
        }
      }
      markers.count = index
      markers.instanceMatrix.needsUpdate = true
      if (markers.instanceColor) {
        markers.instanceColor.needsUpdate = true
      }
    },
  }
}
