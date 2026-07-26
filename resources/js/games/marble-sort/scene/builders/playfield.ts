import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_NORTH_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
  BELT_TOP_Y,
  DECK_TOP_Y,
  GRID_CELL_GAP,
  GRID_CELL_SIZE,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_STEP_X,
  GRID_STEP_Z,
  GROUND_Y,
  SORTING_STACK_Z,
  STACK_BASE_Y,
} from '../sceneConstants'
import { createCanvasTexture } from '../threeUtils'

// Wide enough that the dispenser chutes (out at |x| ~2.4) sit inside the rails.
const ISLAND_HALF_WIDTH = 2.75
const ISLAND_NORTH_Z = -3.6
const ISLAND_SOUTH_Z = 1.32
const ISLAND_CENTER_Z = (ISLAND_NORTH_Z + ISLAND_SOUTH_Z) / 2
const ISLAND_DEPTH = ISLAND_SOUTH_Z - ISLAND_NORTH_Z

const GRASS_TOP = '#7fdf6d'
const GRASS_SIDE = '#5cbb52'
const DIRT = '#a97a4f'
const ROCK = '#8a6242'
const RAIL = '#fff2cf'
const FUNNEL_WALL = '#ff7a59'
const FUNNEL_FLOOR = '#49536b'
// Kept noticeably darker than the island grass so the floating pieces pop.
const MEADOW_LIGHT = '#67bb5c'
const MEADOW_DARK = '#4c9847'

/** Flat-space scenery: the meadow far below and the collector plinth on it. */
export function createPlayfield(): THREE.Group {
  const group = new THREE.Group()

  group.add(createMeadow())
  group.add(createCollectorPlinth())

  return group
}

/**
 * The tiltable board surface: launch island, rails, grid pads, and the funnel
 * hopper. Lives inside the tilted board group; all coordinates are flat
 * physics-space coordinates that the group transform pitches toward the
 * camera.
 */
export function createBoardSurface(): THREE.Group {
  const group = new THREE.Group()

  group.add(createLaunchIsland())
  group.add(createFunnelHopper())

  return group
}

/** The meadow far below the floating contraption; receives all drop shadows. */
function createMeadow(): THREE.Mesh {
  const texture = createCanvasTexture(1024, 1024, (context, w, h) => {
    const gradient = context.createRadialGradient(w / 2, h * 0.55, w * 0.1, w / 2, h * 0.5, w * 0.75)
    gradient.addColorStop(0, MEADOW_LIGHT)
    gradient.addColorStop(1, MEADOW_DARK)
    context.fillStyle = gradient
    context.fillRect(0, 0, w, h)

    const random = seededRandom(7)
    for (let index = 0; index < 340; index += 1) {
      const x = random() * w
      const y = random() * h
      const kind = random()
      if (kind < 0.5) {
        context.fillStyle = 'rgba(255, 255, 255, 0.4)'
        context.beginPath()
        context.arc(x, y, 1 + random() * 1.4, 0, Math.PI * 2)
        context.fill()
      } else if (kind < 0.68) {
        context.fillStyle = 'rgba(255, 214, 90, 0.5)'
        context.beginPath()
        context.arc(x, y, 1 + random() * 1.3, 0, Math.PI * 2)
        context.fill()
      } else {
        context.fillStyle = 'rgba(46, 122, 58, 0.3)'
        context.beginPath()
        context.ellipse(x, y, 5 + random() * 8, 3 + random() * 4, random() * Math.PI, 0, Math.PI * 2)
        context.fill()
      }
    }
  })

  // Small enough that the sky horizon is visible past its edges; fog blends
  // the rim away.
  const meadow = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 24),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }),
  )
  meadow.rotation.x = -Math.PI / 2
  meadow.position.set(0, GROUND_Y, 1.5)
  meadow.receiveShadow = true

  return meadow
}

/** Stone platform on the meadow where the sorting stacks stand. */
function createCollectorPlinth(): THREE.Group {
  const group = new THREE.Group()

  const slab = new THREE.Mesh(
    new RoundedBoxGeometry(7.0, 0.34, 2.9, 4, 0.15),
    new THREE.MeshStandardMaterial({ color: '#eadfc6', roughness: 0.85 }),
  )
  slab.position.set(0, STACK_BASE_Y - 0.15, SORTING_STACK_Z + 0.7)
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)

  const skirt = new THREE.Mesh(
    new RoundedBoxGeometry(7.3, 0.18, 3.2, 4, 0.09),
    new THREE.MeshStandardMaterial({ color: '#d5c8a8', roughness: 0.9 }),
  )
  skirt.position.set(0, STACK_BASE_Y - 0.3, SORTING_STACK_Z + 0.7)
  skirt.receiveShadow = true
  group.add(skirt)

  const random = seededRandom(23)
  for (let index = 0; index < 7; index += 1) {
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22 + random() * 0.16, 1),
      new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? '#4faf4c' : '#3f9e4d', roughness: 1, flatShading: true }),
    )
    const side = index % 2 === 0 ? -1 : 1
    bush.position.set(
      side * (3.9 + random() * 1.6),
      GROUND_Y + 0.12,
      1.5 + random() * 5.4,
    )
    bush.scale.y = 0.66
    bush.castShadow = true
    group.add(bush)
  }

  for (let index = 0; index < 4; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    group.add(createTree(side * (5.4 + random() * 1.4), GROUND_Y, 4.6 + random() * 3.4, 0.9 + random() * 0.5))
  }

  return group
}

function createTree(x: number, groundY: number, z: number, scale: number): THREE.Group {
  const tree = new THREE.Group()

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: '#8a5c3b', roughness: 0.95 }),
  )
  trunk.position.y = 0.25
  trunk.castShadow = true
  tree.add(trunk)

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: '#3f9e4d', roughness: 1, flatShading: true }),
  )
  crown.position.y = 0.95
  crown.castShadow = true
  tree.add(crown)

  const crownTop = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.75, 8),
    new THREE.MeshStandardMaterial({ color: '#4cb35a', roughness: 1, flatShading: true }),
  )
  crownTop.position.y = 1.45
  crownTop.castShadow = true
  tree.add(crownTop)

  tree.position.set(x, groundY, z)
  tree.scale.setScalar(scale)

  return tree
}

/** The floating grass island carrying the 3x5 box grid and its guard rails. */
function createLaunchIsland(): THREE.Group {
  const group = new THREE.Group()

  const grassCap = new THREE.Mesh(
    new RoundedBoxGeometry(ISLAND_HALF_WIDTH * 2, 0.26, ISLAND_DEPTH, 4, 0.13),
    new THREE.MeshStandardMaterial({ color: GRASS_TOP, roughness: 0.9 }),
  )
  grassCap.position.set(0, DECK_TOP_Y - 0.13, ISLAND_CENTER_Z)
  grassCap.castShadow = true
  grassCap.receiveShadow = true
  group.add(grassCap)

  const grassFringe = new THREE.Mesh(
    new RoundedBoxGeometry(ISLAND_HALF_WIDTH * 2 + 0.14, 0.14, ISLAND_DEPTH + 0.14, 4, 0.07),
    new THREE.MeshStandardMaterial({ color: GRASS_SIDE, roughness: 0.95 }),
  )
  grassFringe.position.set(0, DECK_TOP_Y - 0.22, ISLAND_CENTER_Z)
  grassFringe.castShadow = true
  group.add(grassFringe)

  const dirt = new THREE.Mesh(
    new RoundedBoxGeometry(ISLAND_HALF_WIDTH * 2 - 0.25, 0.62, ISLAND_DEPTH - 0.3, 4, 0.24),
    new THREE.MeshStandardMaterial({ color: DIRT, roughness: 1 }),
  )
  dirt.position.set(0, DECK_TOP_Y - 0.56, ISLAND_CENTER_Z)
  dirt.castShadow = true
  group.add(dirt)

  const random = seededRandom(11)
  const rockMaterial = new THREE.MeshStandardMaterial({ color: ROCK, roughness: 1, flatShading: true })
  for (let index = 0; index < 5; index += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + random() * 0.3, 0), rockMaterial)
    rock.position.set(
      (random() * 2 - 1) * (ISLAND_HALF_WIDTH - 0.9),
      DECK_TOP_Y - 0.92 - random() * 0.3,
      ISLAND_NORTH_Z + 0.9 + random() * (ISLAND_DEPTH - 1.8),
    )
    rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI)
    rock.scale.y = 0.72
    rock.castShadow = true
    group.add(rock)
  }

  const railMaterial = new THREE.MeshPhysicalMaterial({
    color: RAIL,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.3,
  })
  const railY = DECK_TOP_Y + 0.17

  const sideRailGeometry = new RoundedBoxGeometry(0.16, 0.38, ISLAND_DEPTH - 0.1, 3, 0.08)
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(sideRailGeometry, railMaterial)
    rail.position.set(side * (ISLAND_HALF_WIDTH - 0.09), railY, ISLAND_CENTER_Z)
    rail.castShadow = true
    rail.receiveShadow = true
    group.add(rail)
  }

  const northRail = new THREE.Mesh(new RoundedBoxGeometry(ISLAND_HALF_WIDTH * 2 - 0.06, 0.38, 0.16, 3, 0.08), railMaterial)
  northRail.position.set(0, railY, ISLAND_NORTH_Z + 0.09)
  northRail.castShadow = true
  northRail.receiveShadow = true
  group.add(northRail)

  // South edge shoulders on either side of the funnel mouth.
  const shoulderGeometry = new RoundedBoxGeometry(ISLAND_HALF_WIDTH - BASIN_TOP_HALF_WIDTH - 0.06, 0.38, 0.16, 3, 0.08)
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeometry, railMaterial)
    shoulder.position.set(side * ((ISLAND_HALF_WIDTH + BASIN_TOP_HALF_WIDTH) / 2), railY, ISLAND_SOUTH_Z - 0.09)
    shoulder.castShadow = true
    shoulder.receiveShadow = true
    group.add(shoulder)
  }

  // Light socket pads marking the 3x5 grid cells. Kept nearly flush with the
  // deck so marbles rolling south don't visibly clip through them.
  const padGeometry = new RoundedBoxGeometry(GRID_CELL_SIZE - GRID_CELL_GAP, 0.05, GRID_CELL_SIZE - GRID_CELL_GAP, 2, 0.025)
  const padMaterial = new THREE.MeshStandardMaterial({ color: '#f4f8ea', roughness: 0.8 })
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const pad = new THREE.Mesh(padGeometry, padMaterial)
      pad.position.set(GRID_ORIGIN_X + column * GRID_STEP_X, DECK_TOP_Y - 0.015, GRID_ORIGIN_Z + row * GRID_STEP_Z)
      pad.receiveShadow = true
      group.add(pad)
    }
  }

  return group
}

/**
 * The 3D hopper bridging the island's south edge onto the conveyor belt. Its
 * angled walls sit exactly over the invisible physics funnel walls so marbles
 * visibly bounce off the geometry that actually deflects them.
 */
function createFunnelHopper(): THREE.Group {
  const group = new THREE.Group()

  const floorShape = new THREE.Shape()
  floorShape.moveTo(-BASIN_TOP_HALF_WIDTH - 0.08, BASIN_NORTH_Z - 0.06)
  floorShape.lineTo(BASIN_TOP_HALF_WIDTH + 0.08, BASIN_NORTH_Z - 0.06)
  floorShape.lineTo(BASIN_EXIT_HALF_WIDTH + 0.12, BASIN_SOUTH_Z + 0.1)
  floorShape.lineTo(-BASIN_EXIT_HALF_WIDTH - 0.12, BASIN_SOUTH_Z + 0.1)
  floorShape.closePath()

  const floorGeometry = new THREE.ExtrudeGeometry(floorShape, { bevelEnabled: false, depth: 0.16 })
  floorGeometry.rotateX(Math.PI / 2)
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshStandardMaterial({ color: FUNNEL_FLOOR, roughness: 0.7 }),
  )
  floor.position.y = DECK_TOP_Y - 0.015
  floor.receiveShadow = true
  floor.castShadow = true
  group.add(floor)

  const wallMaterial = new THREE.MeshPhysicalMaterial({
    color: FUNNEL_WALL,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.35,
  })
  const capMaterial = new THREE.MeshPhysicalMaterial({
    color: RAIL,
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.3,
  })

  const dz = BASIN_SOUTH_Z - BASIN_NORTH_Z
  for (const side of [-1, 1]) {
    const topX = side * BASIN_TOP_HALF_WIDTH
    const bottomX = side * BASIN_EXIT_HALF_WIDTH
    const dx = bottomX - topX
    const length = Math.sqrt(dx * dx + dz * dz)
    const angle = Math.atan2(dx, dz)
    const centerX = (topX + bottomX) / 2
    const centerZ = (BASIN_NORTH_Z + BASIN_SOUTH_Z) / 2

    const wall = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.42, length + 0.12, 3, 0.08), wallMaterial)
    wall.position.set(centerX + side * 0.05, DECK_TOP_Y + 0.17, centerZ)
    wall.rotation.y = angle
    wall.castShadow = true
    wall.receiveShadow = true
    group.add(wall)

    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.07, length + 0.16, 2, 0.035), capMaterial)
    cap.position.set(centerX + side * 0.05, DECK_TOP_Y + 0.41, centerZ)
    cap.rotation.y = angle
    cap.castShadow = true
    group.add(cap)
  }

  // Throat lip carrying the marble from the funnel exit onto the belt.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(BASIN_EXIT_HALF_WIDTH * 2 + 0.24, 0.1, 0.22),
    new THREE.MeshStandardMaterial({ color: FUNNEL_FLOOR, roughness: 0.7 }),
  )
  lip.position.set(0, BELT_TOP_Y - 0.05, BASIN_SOUTH_Z + 0.14)
  lip.castShadow = true
  group.add(lip)

  return group
}

/** Deterministic PRNG so the scenery layout is stable across mounts. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0

    return state / 0xffffffff
  }
}
