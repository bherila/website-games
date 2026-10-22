import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { disposeObject } from '../_shared/three/threeUtils'
import type { PuzzleState } from './engine'
import { COLORS, PLATES, SCREWS } from './level'

export interface ScrewTarget { id: string, x: number, y: number }
export interface ViewCommand { action: 'left' | 'right' | 'reset', sequence: number }
interface Props {
  state: PuzzleState
  view: ViewCommand
  onTargets: (targets: ScrewTarget[]) => void
  onError: (message: string) => void
}

const UP = new THREE.Vector3(0, 1, 0)
const NORMAL = new THREE.Vector3(0, 0, 1)

export function PlateEscapeScene({ state, view, onTargets, onError }: Props): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef({ state, onTargets, onError })
  const commandRef = useRef<((action: ViewCommand['action']) => void) | null>(null)
  useEffect(() => { latestRef.current = { state, onTargets, onError } }, [state, onTargets, onError])
  useEffect(() => { commandRef.current?.(view.action) }, [view])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      latestRef.current.onError('This browser could not start the 3D view. Try another browser or enable WebGL.')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0, 0)
    renderer.domElement.setAttribute('aria-label', 'Rotatable plate assembly. Drag to turn; use the labeled screw buttons to unscrew.')
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(5.5, 3, 11)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, -0.1, 0)
    controls.enablePan = false
    controls.enableDamping = true
    controls.rotateSpeed = 0.65
    controls.minDistance = 10
    controls.maxDistance = 16
    controls.minPolarAngle = 0.5
    controls.maxPolarAngle = Math.PI - 0.5
    controls.update()
    controls.saveState()
    commandRef.current = (action) => {
      if (action === 'reset') controls.reset()
      else {
        const offset = camera.position.clone().sub(controls.target)
        offset.applyAxisAngle(UP, action === 'left' ? -Math.PI / 4 : Math.PI / 4)
        camera.position.copy(controls.target).add(offset)
      }
      controls.update()
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa5a2b6, 2.4))
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(4, 8, 7)
    scene.add(light)
    const rim = new THREE.DirectionalLight(0xe1eaff, 2)
    rim.position.set(-5, 1, -5)
    scene.add(rim)

    const assembly = new THREE.Group()
    scene.add(assembly)
    const plateGroups = new Map<string, THREE.Group>()
    const screwGroups = new Map<string, THREE.Group>()
    const hitObjects: THREE.Object3D[] = []
    for (const plate of PLATES) {
      const group = new THREE.Group()
      group.position.fromArray(plate.position)
      group.rotation.y = plate.back ? Math.PI : 0
      assembly.add(group)
      plateGroups.set(plate.id, group)
      const shape = roundedPlate(plate.size[0], plate.size[1])
      const screws = SCREWS.filter((screw) => screw.plate === plate.id)
      for (const screw of screws) {
        const hole = new THREE.Path()
        hole.absarc(screw.position[0], screw.position[1], 0.14, 0, Math.PI * 2, true)
        shape.holes.push(hole)
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2, steps: 1 })
      geometry.translate(0, 0, -0.09)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: plate.color, metalness: 0.12, roughness: 0.45 }))
      group.add(mesh)
      hitObjects.push(mesh)
      for (const screw of screws) {
        const screwGroup = makeScrew(COLORS[screw.color].hex, screw.color)
        screwGroup.position.set(screw.position[0], screw.position[1], 0.18)
        screwGroup.userData.screwId = screw.id
        group.add(screwGroup)
        screwGroups.set(screw.id, screwGroup)
        hitObjects.push(screwGroup)
      }
    }

    const resize = (): void => {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const lost = (event: Event): void => {
      event.preventDefault()
      latestRef.current.onTargets([])
      latestRef.current.onError('The 3D view was interrupted. Restart to restore the level.')
    }
    renderer.domElement.addEventListener('webglcontextlost', lost)
    const removedAt = new Map<string, number>()
    const ray = new THREE.Raycaster()
    const world = new THREE.Vector3()
    const facing = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    let previousRemoved: string[] = []
    let frame = 0
    let lastTargets = -1
    let disposed = false
    const animate = (): void => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now() / 1000
      const removed = latestRef.current.state.removed
      if (previousRemoved.some((id) => !removed.includes(id))) removedAt.clear()
      for (const id of removed) if (!removedAt.has(id)) removedAt.set(id, now)
      previousRemoved = removed
      for (const plate of PLATES) {
        const group = plateGroups.get(plate.id)!
        const screws = SCREWS.filter((screw) => screw.plate === plate.id)
        const remaining = screws.filter((screw) => !removed.includes(screw.id))
        const latest = Math.max(...screws.map((screw) => removedAt.get(screw.id) ?? -Infinity))
        const fall = remaining.length === 0 ? Math.max(0, now - latest - 0.45) : 0
        const pivot = remaining.length === 1 ? remaining[0]
          : remaining.length === 0 ? screws.find((screw) => removedAt.get(screw.id) === latest) : undefined
        // The unsupported side swings downward whether the last screw is on
        // the left or the right; the final fall keeps that direction.
        const swing = pivot && pivot.position[0] > 0 ? 1 : -1
        const angle = remaining.length === 0 ? swing * (0.3 + fall * 1.2)
          : pivot ? swing * 0.3 * Math.min(1, Math.max(0, (now - latest - 0.3) * 3)) : 0
        const base = new THREE.Quaternion().setFromAxisAngle(UP, plate.back ? Math.PI : 0)
        group.quaternion.copy(base).multiply(quaternion.setFromAxisAngle(NORMAL, angle))
        group.position.fromArray(plate.position)
        if (pivot) {
          const anchor = new THREE.Vector3(pivot.position[0], pivot.position[1], 0)
          group.position.add(anchor.clone().applyQuaternion(base)).sub(anchor.applyQuaternion(group.quaternion))
        }
        group.position.y -= 6 * fall * fall
        group.visible = fall < 1.1
      }
      for (const screw of SCREWS) {
        const group = screwGroups.get(screw.id)!
        const began = removedAt.get(screw.id)
        const progress = began === undefined ? 0 : Math.min(1, (now - began) / 0.45)
        group.visible = progress < 1
        group.position.z = 0.18 + progress * 0.7
        group.rotation.z = progress * Math.PI * 6
        group.scale.setScalar(1 - progress * 0.5)
      }
      controls.update()
      scene.updateMatrixWorld(true)
      camera.updateMatrixWorld(true)
      renderer.render(scene, camera)
      if (now - lastTargets > 0.1) {
        lastTargets = now
        const targets: ScrewTarget[] = []
        for (const screw of SCREWS) {
          if (removed.includes(screw.id)) continue
          const group = screwGroups.get(screw.id)!
          group.getWorldPosition(world)
          group.getWorldQuaternion(quaternion)
          facing.copy(NORMAL).applyQuaternion(quaternion)
          if (facing.dot(camera.position.clone().sub(world)) <= 0) continue
          const projected = world.clone().project(camera)
          if (Math.abs(projected.x) > 0.92 || Math.abs(projected.y) > 0.92 || projected.z > 1) continue
          ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera)
          const hit = ray.intersectObjects(hitObjects, true).find((entry) => {
            let object: THREE.Object3D | null = entry.object
            while (object) { if (!object.visible) return false; object = object.parent }
            return true
          })
          let object: THREE.Object3D | null = hit?.object ?? null
          while (object && object.userData.screwId === undefined) object = object.parent
          if (object?.userData.screwId !== screw.id) continue
          targets.push({ id: screw.id, x: (projected.x + 1) * container.clientWidth / 2, y: (1 - projected.y) * container.clientHeight / 2 })
        }
        latestRef.current.onTargets(targets)
      }
    }
    animate()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      commandRef.current = null
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      disposeObject(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={hostRef} className="absolute inset-0" data-testid="plate-escape-scene" />
}

function roundedPlate(width: number, height: number): THREE.Shape {
  const x = -width / 2
  const y = -height / 2
  const radius = 0.18
  const shape = new THREE.Shape()
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}

function makeScrew(color: string, kind: string): THREE.Group {
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.27 })
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.12, 24), metal)
  head.rotation.x = Math.PI / 2
  group.add(head)
  const inset = new THREE.MeshStandardMaterial({ color: '#263747', roughness: 0.8 })
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.055, 0.02), inset)
  horizontal.position.z = 0.07
  if (kind === 'mint') horizontal.rotation.z = Math.PI / 4
  group.add(horizontal)
  if (kind !== 'blue') {
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.29, 0.02), inset.clone())
    vertical.position.z = 0.07
    if (kind === 'mint') vertical.rotation.z = Math.PI / 4
    group.add(vertical)
  }
  return group
}
