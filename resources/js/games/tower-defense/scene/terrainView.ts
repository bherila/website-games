import * as THREE from 'three'

import { previewPaths } from '../gameEngine'
import { COLS, type GameState, ROWS, type Terrain } from '../gameTypes'
import { cellIndex } from '../pathfinding'
import { createDiscTexture, createGlowMaterial, createSwirlTexture } from './glow'
import { paintBoard, paintSurroundings } from './groundPaint'
import { ball, box, cone, crystal, cylinder, mergeParts, part } from './parts'
import { addScenery, SURROUNDINGS_LEVEL } from './scenery'
import { THEMES } from './themes'
import { createWater } from './water'

const PATH_MARKERS = 150
const DIRT_DECALS = 720

function jitter(col: number, row: number): number {
  const value = Math.sin((col * 127.1) + (row * 311.7)) * 43758.5453

  return value - Math.floor(value)
}

export interface TerrainView {
  update: (state: GameState, camera: THREE.Camera, time: number, showGrid: boolean, reducedMotion: boolean) => void
}

export function createTerrainView(scene: THREE.Scene, state: GameState): TerrainView {
  const theme = THEMES[state.level.theme]
  const material = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true })
  const dummy = new THREE.Object3D()
  const tint = new THREE.Color()

  // The land's thickness: its sides show as banks along every stretch of water.
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
            : theme.shore
      tint.setHex(base).offsetHSL(0, 0, (jitter(col, row) - 0.5) * 0.025)
      tiles.setColorAt(cellIndex(col, row), tint)
    }
  }
  scene.add(tiles)

  // The painted surface: all the ground detail in one texture and one draw call.
  const boardTexture = paintBoard(state, theme)
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS, ROWS),
    boardTexture
      ? new THREE.MeshStandardMaterial({ map: boardTexture, alphaTest: 0.5, roughness: 1 })
      : new THREE.MeshStandardMaterial({ color: theme.groundA, transparent: true, opacity: 0, roughness: 1 }),
  )
  land.rotation.x = -Math.PI / 2
  land.position.set(COLS / 2, 0.002, ROWS / 2)
  land.receiveShadow = true
  scene.add(land)

  // The land beyond the board, wide enough to fill the screen at any aspect ratio.
  const surroundings = paintSurroundings(theme)
  if (surroundings) {
    surroundings.repeat.set((COLS + 60) / 12, (ROWS + 60) / 12)
  }
  const rim = new THREE.Mesh(new THREE.BoxGeometry(COLS + 60, 0.4, ROWS + 60), new THREE.MeshStandardMaterial({ color: surroundings ? 0xffffff : theme.rim, map: surroundings, roughness: 1 }))
  rim.position.set(COLS / 2, SURROUNDINGS_LEVEL - 0.2, ROWS / 2)
  rim.receiveShadow = true
  scene.add(rim)

  // A low lip of darker ground marks where the buildable board ends.
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: theme.groundDark, roughness: 1 })
  for (const [w, d, x, z] of [[COLS + 0.36, 0.18, COLS / 2, -0.09], [COLS + 0.36, 0.18, COLS / 2, ROWS + 0.09], [0.18, ROWS, -0.09, ROWS / 2], [0.18, ROWS, COLS + 0.09, ROWS / 2]] as const) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), edgeMaterial)
    edge.position.set(x, -0.1, z)
    edge.receiveShadow = true
    scene.add(edge)
  }

  addScenery(scene, state.level.theme, theme)

  // Rocks are irregular lumps, so they read as immovable next to the tidy buildings.
  const rockGeometry = mergeParts([
    part(ball(0.42, 0), theme.rock, [0, 0.24, 0], [0.3, 0.4, 0], [1.14, 0.85, 1.1]),
    part(ball(0.3, 0), theme.rockTop, [0.1, 0.5, -0.06], [0.7, 0, 0.3], [1, 0.8, 1]),
    part(ball(0.17, 0), theme.rock, [-0.28, 0.14, 0.24], [0.2, 0.9, 0]),
    part(ball(0.12, 0), theme.rockTop, [0.32, 0.1, 0.26], [0.9, 0.2, 0]),
  ])
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), Math.max(1, counts.rock ?? 0))
  rocks.castShadow = true
  rocks.receiveShadow = true
  rocks.count = 0
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (state.terrain[cellIndex(col, row)] !== 'rock') {
        continue
      }
      dummy.position.set(col + 0.5, 0, row + 0.5)
      dummy.rotation.set(0, jitter(col, row) * Math.PI * 2, 0)
      const size = 0.95 + (jitter(row, col) * 0.2)
      dummy.scale.set(size, size, size)
      dummy.updateMatrix()
      rocks.setMatrixAt(rocks.count, dummy.matrix)
      rocks.count += 1
    }
  }
  scene.add(rocks)

  const water = createWater(scene, state, theme, state.level.theme === 'ember')

  // Spawns: an upright stone ring around a swirling gateway, turned to face the player.
  const portals: THREE.Group[] = []
  const swirls: THREE.Mesh[] = []
  const portalGlows: THREE.Mesh[] = []
  const portalGlowMaterial = createGlowMaterial()
  portalGlowMaterial.color.setHex(0x6d28d9)
  const swirlMaterial = new THREE.MeshBasicMaterial({ map: createSwirlTexture(), toneMapped: false, color: 0xffffff })
  const PORTAL_STONES = 9
  const portalRing = mergeParts([
    ...Array.from({ length: PORTAL_STONES }, (_, index) => {
      const angle = (index / PORTAL_STONES) * Math.PI * 2

      return part(box(0.24, 0.3, 0.24), index % 2 === 0 ? theme.rockTop : theme.rock, [Math.cos(angle) * 0.52, 0.62 + (Math.sin(angle) * 0.52), 0], [0, 0, angle + (Math.PI / 2)])
    }),
    part(box(1.05, 0.14, 0.42), theme.rock, [0, 0.07, 0]),
    part(crystal(0.1), 0xf59e0b, [0.46, 0.2, 0.08], [0, 0, 0], [0.8, 1.6, 0.8]),
    part(crystal(0.09), 0xf59e0b, [-0.46, 0.18, 0.08], [0, 0, 0], [0.8, 1.6, 0.8]),
  ])
  const portalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true })
  for (const { col, row } of state.spawns) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), portalGlowMaterial)
    glow.rotation.x = -Math.PI / 2
    glow.position.set(col + 0.5, 0.02, row + 0.5)
    glow.renderOrder = 1
    scene.add(glow)
    portalGlows.push(glow)
    const portal = new THREE.Group()
    portal.position.set(col + 0.5, 0, row + 0.5)
    const leaning = new THREE.Group()
    // Leaning back keeps the ring round from the board's high camera.
    leaning.rotation.x = -0.5
    leaning.position.z = -0.1
    const ring = new THREE.Mesh(portalRing, portalMaterial)
    ring.castShadow = true
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), swirlMaterial)
    swirl.position.set(0, 0.62, 0.01)
    leaning.add(ring, swirl)
    portal.add(leaning)
    scene.add(portal)
    portals.push(portal)
    swirls.push(swirl)
  }

  // Walkers wear a dirt path along their route, so the path bends with the player's maze.
  const dirtTexture = createDiscTexture()
  const dirt = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: theme.path, map: dirtTexture, transparent: true, depthWrite: false, roughness: 1 }), DIRT_DECALS)
  dirt.frustumCulled = false
  dirt.receiveShadow = true
  dirt.renderOrder = 1
  dirt.count = 0
  scene.add(dirt)

  // The keep: what the player is defending. It stands larger than a tower, on the paved ground around it.
  const STONE = 0xb4ada3
  const STONE_LIGHT = 0xd6cfc4
  const ROOF = 0x5583ec
  const WINDOW = 0xffc23d
  const turret = (x: number, z: number): THREE.BufferGeometry[] => [
    part(cylinder(0.17, 0.2, 0.86, 8), STONE, [x * 0.43, 0.43, z * 0.43]),
    part(cylinder(0.23, 0.17, 0.11, 8), STONE_LIGHT, [x * 0.43, 0.91, z * 0.43]),
    part(cone(0.24, 0.42, 8), ROOF, [x * 0.43, 1.18, z * 0.43]),
  ]
  const gate = (x: number, z: number): THREE.BufferGeometry[] => [
    part(box(x === 0 ? 0.26 : 0.05, 0.36, x === 0 ? 0.05 : 0.26), WINDOW, [x * 0.43, 0.2, z * 0.43]),
    part(box(x === 0 ? 0.32 : 0.04, 0.05, x === 0 ? 0.04 : 0.32), 0x6b4522, [x * 0.45, 0.4, z * 0.45]),
    // A banner either side of the gate.
    part(box(x === 0 ? 0.09 : 0.03, 0.26, x === 0 ? 0.03 : 0.09), 0x1e40af, [(x * 0.44) + (z * 0.26), 0.42, (z * 0.44) + (x * 0.26)]),
    part(box(x === 0 ? 0.09 : 0.03, 0.26, x === 0 ? 0.03 : 0.09), 0x1e40af, [(x * 0.44) - (z * 0.26), 0.42, (z * 0.44) - (x * 0.26)]),
  ]
  const keepGeometry = mergeParts([
    part(box(1.04, 0.09, 1.04), 0x8f867c, [0, 0.045, 0]),
    part(box(0.84, 0.56, 0.84), STONE, [0, 0.32, 0]),
    part(box(0.56, 0.42, 0.56), STONE_LIGHT, [0, 0.8, 0]),
    part(cone(0.5, 0.5, 4), ROOF, [0, 1.25, 0], [0, Math.PI / 4, 0]),
    ...[-0.31, 0, 0.31].flatMap((offset) => [
      part(box(0.13, 0.12, 0.08), STONE_LIGHT, [offset, 0.66, 0.4]),
      part(box(0.13, 0.12, 0.08), STONE_LIGHT, [offset, 0.66, -0.4]),
      part(box(0.08, 0.12, 0.13), STONE_LIGHT, [0.4, 0.66, offset]),
      part(box(0.08, 0.12, 0.13), STONE_LIGHT, [-0.4, 0.66, offset]),
    ]),
    ...gate(0, 1), ...gate(0, -1), ...gate(1, 0), ...gate(-1, 0),
    part(box(0.09, 0.14, 0.03), WINDOW, [0, 0.84, 0.29]),
    part(box(0.03, 0.14, 0.09), WINDOW, [0.29, 0.84, 0]),
    part(box(0.03, 0.14, 0.09), WINDOW, [-0.29, 0.84, 0]),
    part(box(0.09, 0.14, 0.03), WINDOW, [0, 0.84, -0.29]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x = 0, z = 0]) => turret(x, z)),
    part(cylinder(0.02, 0.02, 0.5, 4), 0x475569, [0, 1.65, 0]),
    part(cone(0.13, 0.3, 3), 0xfacc15, [0.15, 1.8, 0], [0, 0, -Math.PI / 2], [1, 1, 0.3]),
  ])
  const keepMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true })
  for (const { col, row } of state.exits) {
    const keep = new THREE.Mesh(keepGeometry, keepMaterial)
    keep.position.set(col + 0.5, 0, row + 0.5)
    keep.scale.setScalar(1.25)
    keep.castShadow = true
    keep.receiveShadow = true
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

  function wearDirt(): void {
    let index = 0
    for (const route of routes) {
      for (let point = 0; point < route.points.length - 1; point += 1) {
        const from = route.points[point]
        const to = route.points[point + 1]
        for (const share of [0, 1 / 3, 2 / 3]) {
          if (!from || !to || index >= DIRT_DECALS) {
            continue
          }
          const x = from.x + ((to.x - from.x) * share)
          const z = from.y + ((to.y - from.y) * share)
          dummy.position.set(x, 0.006, z)
          dummy.rotation.set(0, 0, 0)
          // A little width variation keeps the edge from looking machine-cut.
          dummy.scale.setScalar(0.92 + (jitter(Math.round(x * 3), Math.round(z * 3)) * 0.1))
          dummy.updateMatrix()
          dirt.setMatrixAt(index, dummy.matrix)
          index += 1
        }
      }
    }
    dirt.count = index
    dirt.instanceMatrix.needsUpdate = true
  }

  function refreshRoutes(): void {
    routes = previewPaths(state).map((path) => ({ points: path.points, color: path.blocked ? BLOCKED_COLOR : OK_COLOR }))
    wearDirt()
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
    update(current, camera, time, showGrid, reducedMotion) {
      for (const portal of portals) {
        portal.rotation.y = Math.atan2(camera.position.x - portal.position.x, camera.position.z - portal.position.z)
      }
      for (const swirl of swirls) {
        swirl.rotation.z = reducedMotion ? 0 : time * -1.6
      }
      if (!reducedMotion) {
        const pulse = 1 + (Math.sin(time * 2.4) * 0.14)
        for (const glow of portalGlows) {
          glow.scale.set(pulse, pulse, 1)
        }
      }
      water.update(reducedMotion ? 0 : time)
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
