import * as THREE from 'three'

import { createCanvasTexture } from '../threeUtils'

const GRASS_COLOR = 0x6ab04c
const FLOWER_COLORS = [0xffffff, 0xf7c948, 0xff6f91]

function createSkyDome(): THREE.Mesh {
  const texture = createCanvasTexture((context, size) => {
    const gradient = context.createLinearGradient(0, 0, 0, size)
    gradient.addColorStop(0, '#5ab7ff')
    gradient.addColorStop(0.65, '#bfe6ff')
    gradient.addColorStop(1, '#eaf7ff')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }, 256)
  const geometry = new THREE.SphereGeometry(50, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.9)
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false })

  return new THREE.Mesh(geometry, material)
}

function createGrassField(): THREE.Group {
  const group = new THREE.Group()

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(48, 32),
    new THREE.MeshLambertMaterial({ color: GRASS_COLOR }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  const flowerGeometry = new THREE.CircleGeometry(0.08, 6)
  const flowerCount = 90
  // Deterministic scatter (no Math.random) so repeated mounts render identically.
  let seed = 42
  const nextRandom = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed % 10000) / 10000
  }

  for (let i = 0; i < flowerCount; i += 1) {
    const angle = nextRandom() * Math.PI * 2
    const radius = 4 + (nextRandom() * 40)
    const colorIndex = i % FLOWER_COLORS.length
    const material = new THREE.MeshBasicMaterial({ color: FLOWER_COLORS[colorIndex] ?? 0xffffff })
    const flower = new THREE.Mesh(flowerGeometry, material)
    flower.rotation.x = -Math.PI / 2
    flower.position.set(Math.cos(angle) * radius, 0.01, Math.sin(angle) * radius)
    group.add(flower)
  }

  return group
}

function createTent(): THREE.Group {
  const group = new THREE.Group()
  const stripeTexture = createCanvasTexture((context, size) => {
    const stripeCount = 8
    const stripeWidth = size / stripeCount
    for (let i = 0; i < stripeCount; i += 1) {
      context.fillStyle = i % 2 === 0 ? '#d93636' : '#f5f0e6'
      context.fillRect(i * stripeWidth, 0, stripeWidth, size)
    }
  })

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.6, 3.2, 12, 1, true),
    new THREE.MeshLambertMaterial({ map: stripeTexture }),
  )
  body.position.y = 1.6
  group.add(body)

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.6, 2.2, 12),
    new THREE.MeshLambertMaterial({ map: stripeTexture }),
  )
  roof.position.y = 4.3
  group.add(roof)

  const flagpole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b }),
  )
  flagpole.position.y = 5.8
  group.add(flagpole)

  group.position.set(-9, 0, -22)

  return group
}

function createFerrisWheel(): THREE.Group {
  const group = new THREE.Group()
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x3f5b7a, transparent: true, opacity: 0.7 })

  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.12, 6, 24), silhouette)
  group.add(ring)

  const spokeCount = 8
  for (let i = 0; i < spokeCount; i += 1) {
    const angle = (i / spokeCount) * Math.PI * 2
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 4), silhouette)
    // A single roll about Z keeps the spoke in the wheel's vertical XY plane, pointing along
    // its cabin's diameter; offsetting the midpoint makes it span hub to rim.
    spoke.rotation.z = (Math.PI / 2) + angle
    spoke.position.set(Math.cos(angle) * 2, Math.sin(angle) * 2, 0)
    group.add(spoke)

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), silhouette)
    cabin.position.set(Math.cos(angle) * 4, Math.sin(angle) * 4, 0)
    group.add(cabin)
  }

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.3, 4.2, 6),
    silhouette,
  )
  tower.position.y = -4.2
  group.add(tower)

  group.position.set(10, 6, -26)

  return group
}

function createBunting(): THREE.Group {
  const group = new THREE.Group()
  const colors = [0xff6f91, 0xf7c948, 0x71d3f0, 0xffffff]
  const postA = new THREE.Vector3(-4.5, 2.6, 6.5)
  const postB = new THREE.Vector3(4.5, 2.6, 6.5)

  const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8a5a2b })
  for (const x of [postA.x, postB.x]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), postMaterial)
    post.position.set(x, 1.3, postA.z)
    group.add(post)
  }

  const flagCount = 9
  for (let i = 0; i < flagCount; i += 1) {
    const t = i / (flagCount - 1)
    const x = THREE.MathUtils.lerp(postA.x, postB.x, t)
    const sag = Math.sin(t * Math.PI) * 0.3
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.26, 3),
      new THREE.MeshBasicMaterial({ color: colors[i % colors.length] ?? 0xffffff, side: THREE.DoubleSide }),
    )
    flag.rotation.z = Math.PI
    flag.position.set(x, postA.y - sag, postA.z)
    group.add(flag)
  }

  return group
}

/**
 * Builds the static carnival environment (sky, grass + flowers, distant tent + ferris wheel,
 * bunting). Built once and never rebuilt — purely decorative, no physics.
 */
export function createEnvironment(): THREE.Group {
  const group = new THREE.Group()
  group.add(createSkyDome())
  group.add(createGrassField())
  group.add(createTent())
  group.add(createFerrisWheel())
  group.add(createBunting())

  return group
}
