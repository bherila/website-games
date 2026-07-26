import * as THREE from 'three'

import { TRACK_HALF_WIDTH } from '../gameEngine'
import { PLAYER_WORLD_Z } from './constants'

const GRID_TILE = 2
const PYLON_SPACING = 8
const PYLONS_PER_SIDE = 14

export interface EnvironmentView {
  update(progress: number): void
}

/**
 * Static-world illusion: the squad stays near the camera while the floor
 * texture and side pylons scroll past at the level's forward speed.
 */
export function createEnvironment(scene: THREE.Scene, levelLength: number): EnvironmentView {
  scene.background = new THREE.Color('#070b21')
  scene.fog = new THREE.Fog('#070b21', 28, 80)

  scene.add(new THREE.HemisphereLight('#8be9ff', '#160024', 2.6))
  const keyLight = new THREE.DirectionalLight('#ffffff', 2.2)
  keyLight.position.set(4, 10, 6)
  keyLight.castShadow = true
  scene.add(keyLight)

  const floorTexture = createGridTexture()
  floorTexture.wrapS = THREE.RepeatWrapping
  floorTexture.wrapT = THREE.RepeatWrapping
  floorTexture.repeat.set((TRACK_HALF_WIDTH * 2 + 0.8) / GRID_TILE, 120 / GRID_TILE)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 + 0.8, 120),
    new THREE.MeshStandardMaterial({ map: floorTexture, color: '#8f9dff', metalness: 0.3, roughness: 0.7 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -0.02, PLAYER_WORLD_Z - 52)
  floor.receiveShadow = true
  scene.add(floor)

  const voidPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 140),
    new THREE.MeshBasicMaterial({ color: '#03040f' }),
  )
  voidPlane.rotation.x = -Math.PI / 2
  voidPlane.position.set(0, -0.35, PLAYER_WORLD_Z - 55)
  scene.add(voidPlane)

  const pylonGeometry = new THREE.BoxGeometry(0.3, 1.6, 0.3)
  const pylonMaterial = new THREE.MeshStandardMaterial({ color: '#7028e4', emissive: '#4c1d95', emissiveIntensity: 1.4 })
  const pylons = new THREE.InstancedMesh(pylonGeometry, pylonMaterial, PYLONS_PER_SIDE * 2)
  scene.add(pylons)

  const finishLine = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2 + 0.8, 0.12, 0.6),
    new THREE.MeshStandardMaterial({ color: '#fff36b', emissive: '#ca8a04', emissiveIntensity: 2 }),
  )
  scene.add(finishLine)

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)

  return {
    update(progress: number): void {
      floorTexture.offset.y = (progress % GRID_TILE) / GRID_TILE

      const firstPylonZ = Math.floor((progress - PLAYER_WORLD_Z - 2) / PYLON_SPACING) * PYLON_SPACING
      let placed = 0
      for (let index = 0; index < PYLONS_PER_SIDE; index += 1) {
        const worldZ = firstPylonZ + index * PYLON_SPACING
        const displayZ = PLAYER_WORLD_Z - (worldZ - progress)
        for (const side of [-1, 1]) {
          position.set(side * (TRACK_HALF_WIDTH + 0.75), 0.8, displayZ)
          matrix.compose(position, quaternion, scale)
          pylons.setMatrixAt(placed, matrix)
          placed += 1
        }
      }
      pylons.count = placed
      pylons.instanceMatrix.needsUpdate = true

      const finishDisplayZ = PLAYER_WORLD_Z - (levelLength - progress)
      finishLine.visible = finishDisplayZ > -80
      finishLine.position.set(0, 0.06, finishDisplayZ)
    },
  }
}

function createGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#101735'
    context.fillRect(0, 0, 128, 128)
    context.strokeStyle = '#233468'
    context.lineWidth = 2
    context.strokeRect(1, 1, 126, 126)
    context.strokeStyle = '#2dd4ff'
    context.globalAlpha = 0.5
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(0, 127)
    context.lineTo(128, 127)
    context.stroke()
    context.globalAlpha = 1
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}
