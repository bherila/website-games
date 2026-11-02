import * as THREE from 'three'

import { ENEMIES, heroMagnet } from '../catalog'
import { COIN_LIFETIME_SECONDS, COIN_SETTLE_SECONDS, COIN_WARNING_SECONDS } from '../gameEngine'
import { COLS, type Enemy, type EnemyKind, type GameState } from '../gameTypes'
import { enemyGeometry } from './models'
import { ball, box, cone, cylinder, mergeParts, part } from './parts'
import { ELEMENT_TINT, TOWER_SHOT_COLOR } from './themes'

const ENEMY_CAPACITY: Record<EnemyKind, number> = { grunt: 60, swift: 60, brute: 30, swarm: 90, flyer: 40, sapper: 40, boss: 6 }
const BAR_CAPACITY = 320
const COIN_CAPACITY = 160
const SHOT_CAPACITY = 150
/** Slightly larger than life, so they still read at a phone's 28 px per cell. */
const ENEMY_SCALE = 1.25

export interface UnitView {
  update: (state: GameState, camera: THREE.Camera, reducedMotion: boolean, heroSelected: boolean) => void
}

function faceAngle(heading: number): number {
  return Math.atan2(Math.cos(heading), Math.sin(heading))
}

export function createUnitView(scene: THREE.Scene): UnitView {
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const SLOWED = new THREE.Color(0x7dd3fc)

  // Enemies: one instanced model per kind, tinted by the wave's element.
  const enemyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, flatShading: true })
  const enemyMeshes = (Object.keys(ENEMY_CAPACITY) as EnemyKind[]).reduce((meshes, kind) => {
    const mesh = new THREE.InstancedMesh(enemyGeometry(kind), enemyMaterial, ENEMY_CAPACITY[kind])
    mesh.castShadow = true
    mesh.frustumCulled = false
    mesh.count = 0
    scene.add(mesh)
    meshes[kind] = mesh

    return meshes
  }, {} as Record<EnemyKind, THREE.InstancedMesh>)

  // Health bars face the camera and appear only once there is something to report.
  const barGeometry = new THREE.PlaneGeometry(1, 1)
  const barBack = new THREE.InstancedMesh(barGeometry, new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.75, depthTest: false }), BAR_CAPACITY)
  const barFill = new THREE.InstancedMesh(barGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), BAR_CAPACITY)
  barBack.frustumCulled = false
  barFill.frustumCulled = false
  barBack.renderOrder = 10
  barFill.renderOrder = 11
  barBack.count = 0
  barFill.count = 0
  scene.add(barBack, barFill)

  // Coins glow so they stand out against every map, and flip as they sit.
  const coinGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12)
  const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xb45309, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 })
  const coins = new THREE.InstancedMesh(coinGeometry, coinMaterial, COIN_CAPACITY)
  coins.castShadow = true
  coins.frustumCulled = false
  coins.count = 0
  scene.add(coins)

  const shots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), SHOT_CAPACITY)
  shots.frustumCulled = false
  shots.count = 0
  scene.add(shots)

  // The hero: bright blue with a gold helmet and a hammer, standing on a beacon so it is never lost.
  const heroMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true })
  const hero = new THREE.Group()
  const heroBody = new THREE.Mesh(mergeParts([
    part(cylinder(0.17, 0.25, 0.46, 8), 0x2563eb, [0, 0.37, 0]),
    part(box(0.11, 0.17, 0.15), 0x1e3a8a, [0.1, 0.09, 0]),
    part(box(0.11, 0.17, 0.15), 0x1e3a8a, [-0.1, 0.09, 0]),
    part(ball(0.17, 1), 0xfcd9b6, [0, 0.71, 0]),
    part(ball(0.19, 1), 0xfacc15, [0, 0.77, -0.02], [0, 0, 0], [1, 0.72, 1]),
    part(cone(0.06, 0.16, 5), 0xfacc15, [0, 0.96, -0.02]),
    part(ball(0.035, 0), 0x0f172a, [0.07, 0.72, 0.15]),
    part(ball(0.035, 0), 0x0f172a, [-0.07, 0.72, 0.15]),
    part(box(0.3, 0.32, 0.12), 0x92400e, [0, 0.42, -0.2]),
  ]), heroMaterial)
  heroBody.castShadow = true
  hero.add(heroBody)
  const heroArm = new THREE.Group()
  heroArm.position.set(0.24, 0.52, 0)
  const hammer = new THREE.Mesh(mergeParts([
    part(cylinder(0.025, 0.025, 0.42, 5), 0x78350f, [0, -0.12, 0.14], [1.1, 0, 0]),
    part(box(0.2, 0.13, 0.13), 0x94a3b8, [0, -0.03, 0.31]),
  ]), heroMaterial)
  hammer.castShadow = true
  heroArm.add(hammer)
  hero.add(heroArm)
  scene.add(hero)

  const beacon = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9, depthWrite: false }))
  beacon.rotation.x = -Math.PI / 2
  beacon.renderOrder = 4
  scene.add(beacon)
  const magnetRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 48), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5, depthWrite: false }))
  magnetRing.rotation.x = -Math.PI / 2
  magnetRing.visible = false
  scene.add(magnetRing)

  const quaternion = new THREE.Quaternion()
  const barMatrix = new THREE.Matrix4()
  const barPosition = new THREE.Vector3()
  const barScale = new THREE.Vector3()
  let barCount = 0

  function pushBar(x: number, height: number, z: number, width: number, share: number): void {
    if (barCount >= BAR_CAPACITY) {
      return
    }
    barPosition.set(x, height, z)
    barScale.set(width + 0.05, 0.11, 1)
    barBack.setMatrixAt(barCount, barMatrix.compose(barPosition, quaternion, barScale))
    // The fill grows from the left, whatever way the camera has been turned.
    const left = barPosition.clone().add(new THREE.Vector3(-(width * (1 - share)) / 2, 0, 0).applyQuaternion(quaternion))
    barScale.set(width * share, 0.07, 1)
    barFill.setMatrixAt(barCount, barMatrix.compose(left, quaternion, barScale))
    barFill.setColorAt(barCount, color.setHex(share > 0.5 ? 0x22c55e : share > 0.25 ? 0xeab308 : 0xef4444))
    barCount += 1
  }

  function updateEnemy(enemy: Enemy, mesh: THREE.InstancedMesh, index: number, reducedMotion: boolean): void {
    const hop = reducedMotion ? 0 : Math.abs(Math.sin(enemy.walk * 5)) * 0.06
    const lunge = enemy.attackingId !== null && !reducedMotion ? Math.max(0, Math.sin(enemy.walk + (performance.now() * 0.012))) * 0.12 : 0
    const flyHeight = enemy.flying ? 0.95 + (reducedMotion ? 0 : Math.sin(enemy.walk * 2) * 0.06) : 0
    dummy.position.set(enemy.x + (Math.cos(enemy.heading) * lunge), flyHeight + hop, enemy.y + (Math.sin(enemy.heading) * lunge))
    dummy.rotation.set(0, faceAngle(enemy.heading), 0)
    dummy.scale.setScalar(ENEMY_SCALE)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    color.setHex(ELEMENT_TINT[enemy.element ?? 'neutral'] ?? 0xffffff)
    if (enemy.slowTimer > 0) {
      color.lerp(SLOWED, 0.6)
    } else if (enemy.burnTimer > 0) {
      color.offsetHSL(0, 0, -0.08)
    }
    mesh.setColorAt(index, color)
    if (enemy.hp < enemy.maxHp) {
      const def = ENEMIES[enemy.kind]
      pushBar(enemy.x, flyHeight + (def.size * 2.6) + 0.3, enemy.y, Math.max(0.34, def.size * 1.5), Math.max(0, enemy.hp / enemy.maxHp))
    }
  }

  return {
    update(state, camera, reducedMotion, heroSelected) {
      const time = state.clock
      quaternion.copy(camera.quaternion)
      barCount = 0

      const counts: Partial<Record<EnemyKind, number>> = {}
      for (const enemy of state.enemies) {
        const index = counts[enemy.kind] ?? 0
        const mesh = enemyMeshes[enemy.kind]
        if (index >= ENEMY_CAPACITY[enemy.kind]) {
          continue
        }
        updateEnemy(enemy, mesh, index, reducedMotion)
        counts[enemy.kind] = index + 1
      }
      for (const kind of Object.keys(enemyMeshes) as EnemyKind[]) {
        const mesh = enemyMeshes[kind]
        mesh.count = counts[kind] ?? 0
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true
        }
      }

      for (const building of state.buildings) {
        if (building.hp < building.maxHp || building.progress < 1) {
          const share = building.progress < 1 ? building.progress : building.hp / building.maxHp
          pushBar(building.col + 0.5, building.tower === 'wall' ? 0.95 : 1.65, building.row + 0.5, 0.74, Math.max(0, share))
        }
      }
      barBack.count = barCount
      barFill.count = barCount
      barBack.instanceMatrix.needsUpdate = true
      barFill.instanceMatrix.needsUpdate = true
      if (barFill.instanceColor) {
        barFill.instanceColor.needsUpdate = true
      }

      let coinCount = 0
      for (const coin of state.coins) {
        if (coinCount >= COIN_CAPACITY) {
          break
        }
        const remaining = COIN_LIFETIME_SECONDS - coin.age
        const blinkOff = !reducedMotion && remaining < COIN_WARNING_SECONDS && Math.floor(remaining * 5) % 2 === 0
        const settling = coin.settle / COIN_SETTLE_SECONDS
        const bounce = reducedMotion ? 0 : Math.sin(settling * Math.PI) * 0.75
        const size = 0.9 + Math.min(0.9, coin.value * 0.05)
        dummy.position.set(coin.x, 0.22 + bounce, coin.y)
        dummy.rotation.set(reducedMotion ? 0 : (Math.PI / 2) + (Math.sin(time * 1.5 + coin.id) * 0.5), reducedMotion ? 0 : (time * 3) + coin.id, 0)
        const scale = blinkOff ? size * 0.55 : size
        dummy.scale.set(scale, scale, scale)
        dummy.updateMatrix()
        coins.setMatrixAt(coinCount, dummy.matrix)
        coinCount += 1
      }
      coins.count = coinCount
      coins.instanceMatrix.needsUpdate = true

      let shotCount = 0
      for (const shot of state.projectiles) {
        if (shotCount >= SHOT_CAPACITY) {
          break
        }
        const travelled = Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / shot.flight
        // Boulders lob in a high arc; everything else flies flat from the tower's top.
        const arc = shot.tower === 'boulder' ? Math.sin(Math.min(1, travelled) * Math.PI) * 1.2 : 0
        dummy.position.set(shot.x, 0.65 + arc, shot.y)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar((shot.tower === 'boulder' ? 1.9 : 1) * (1 + ((shot.tier - 1) * 0.2)))
        dummy.updateMatrix()
        shots.setMatrixAt(shotCount, dummy.matrix)
        shots.setColorAt(shotCount, color.setHex(TOWER_SHOT_COLOR[shot.tower] ?? 0xffffff))
        shotCount += 1
      }
      shots.count = shotCount
      shots.instanceMatrix.needsUpdate = true
      if (shots.instanceColor) {
        shots.instanceColor.needsUpdate = true
      }

      const heroState = state.hero
      const bob = reducedMotion || !heroState.moving ? 0 : Math.abs(Math.sin(heroState.walk * 3.2)) * 0.1
      const climbing = state.buildingAt[(Math.floor(heroState.y) * COLS) + Math.floor(heroState.x)] != null
      hero.position.set(heroState.x, bob + (climbing ? 0.62 : 0), heroState.y)
      hero.rotation.y = faceAngle(heroState.heading)
      heroArm.rotation.x = heroState.working && !reducedMotion
        ? Math.sin(performance.now() * 0.02) * 0.9
        : heroState.moving && !reducedMotion ? Math.sin(heroState.walk * 3.2) * 0.4 : 0
      beacon.position.set(heroState.x, 0.03, heroState.y)
      if (!reducedMotion) {
        const pulse = 1 + (Math.sin(performance.now() * 0.004) * 0.08)
        beacon.scale.set(pulse, pulse, 1)
      }
      magnetRing.visible = heroSelected
      magnetRing.position.set(heroState.x, 0.03, heroState.y)
      const reach = heroMagnet(heroState.magnetLevel)
      magnetRing.scale.set(reach, reach, 1)
    },
  }
}
