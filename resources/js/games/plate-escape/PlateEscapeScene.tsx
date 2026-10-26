import { type ReactElement, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { disposeObject } from '../_shared/three/threeUtils'
import { bearingLock, type PuzzleState, screwLock } from './engine'
import { coverStandoff, createGarden, createPlateMesh, decoratePlate, plateQuaternion, screwAnchorOn, throughShafts } from './houseGeometry'
import { COLORS, getLevel, heldPlates } from './level'
import { FADE_SECONDS, FALL_SECONDS, fallPose, HINGE_SECONDS, hingePose, nextRotorSpeed, ROTOR_IDLE_SECONDS, rotorPose } from './plateMotion'
import { traceScrew } from './screwVisibility'

export interface ScrewTarget {
  id: string
  x: number
  y: number
  coveredBy?: string | undefined
  /** The part resting on this plate, which keeps its last screw in place. */
  holdsUp?: string | undefined
}
export interface ViewCommand { action: 'left' | 'right' | 'reset', sequence: number }
/** A released part starts to fall, a hinged panel swings open, or a part hits the deck or lawn. */
export type PlateEvent = 'fall' | 'swing' | 'land'
interface Props {
  state: PuzzleState
  view: ViewCommand
  /** The player's Motion setting; turning parts also stay still under reduced motion. */
  motion: boolean
  onTargets: (targets: ScrewTarget[]) => void
  onError: (message: string) => void
  onPlateEvent?: (event: PlateEvent) => void
}

const UP = new THREE.Vector3(0, 1, 0)
const NORMAL = new THREE.Vector3(0, 0, 1)

export function PlateEscapeScene({ state, view, motion, onTargets, onError, onPlateEvent }: Props): ReactElement {
  const level = getLevel(state.level)
  const { plates: PLATES, screws: SCREWS } = level
  const hostRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef({ state, motion, onTargets, onError, onPlateEvent })
  const commandRef = useRef<((action: ViewCommand['action']) => void) | null>(null)
  useEffect(() => { latestRef.current = { state, motion, onTargets, onError, onPlateEvent } }, [state, motion, onTargets, onError, onPlateEvent])
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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.domElement.setAttribute('aria-label', 'Rotatable plate assembly. Drag to turn; use the labeled screw buttons to unscrew.')
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(6.4, 4.2, 10)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.1, 0)
    controls.enablePan = false
    controls.enableDamping = true
    controls.rotateSpeed = 0.65
    controls.minDistance = 10
    controls.maxDistance = 16
    controls.minPolarAngle = 0.5
    controls.maxPolarAngle = Math.PI / 2 + 0.12
    controls.update()
    controls.saveState()
    commandRef.current = (action) => {
      // Explicit view commands must stop the preceding drag's damping delta.
      controls.enableDamping = false
      controls.update()
      controls.enableDamping = true
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
    light.castShadow = true
    light.shadow.mapSize.set(512, 512)
    light.shadow.camera.left = -6
    light.shadow.camera.right = 6
    light.shadow.camera.top = 6
    light.shadow.camera.bottom = -6
    light.shadow.camera.near = 1
    light.shadow.camera.far = 24
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.bias = -0.0008
    light.shadow.normalBias = 0.03
    scene.add(light)
    const rim = new THREE.DirectionalLight(0xe1eaff, 2)
    rim.position.set(-5, 1, -5)
    scene.add(rim)

    const assembly = new THREE.Group()
    scene.add(assembly)
    const plateGroups = new Map<string, THREE.Group>()
    const screwGroups = new Map<string, THREE.Group>()
    const garden = createGarden(level.theme)
    scene.add(garden)
    const hitObjects: THREE.Object3D[] = [garden]
    const plateFrames = new Map(PLATES.map((plate) => [plate.id, plateQuaternion(plate)]))
    for (const plate of PLATES) {
      const group = new THREE.Group()
      group.position.fromArray(plate.position)
      group.quaternion.copy(plateFrames.get(plate.id)!)
      assembly.add(group)
      plateGroups.set(plate.id, group)
      const screws = SCREWS.filter((screw) => screw.plate === plate.id)
      const mesh = createPlateMesh(plate, screws)
      group.add(mesh, decoratePlate(plate, coverStandoff(plate, PLATES), screws), ...throughShafts(plate, SCREWS, PLATES))
      hitObjects.push(group)
      for (const screw of screws) {
        const screwGroup = makeScrew(COLORS[screw.color].hex, screw.color)
        screwGroup.position.set(screw.position[0], screw.position[1], 0.18)
        screwGroup.userData.screwId = screw.id
        group.add(screwGroup)
        screwGroups.set(screw.id, screwGroup)

      }
    }

    // Every screw that pins a plate, including shared screws whose head is on another part,
    // and where each one crosses it.
    const plateScrews = new Map(PLATES.map((plate) => [plate.id, SCREWS.filter((screw) => heldPlates(screw).includes(plate.id))]))
    const anchors = new Map(PLATES.flatMap((plate) => plateScrews.get(plate.id)!.map((screw) => [`${screw.id}/${plate.id}`, screwAnchorOn(screw, plate, PLATES)] as const)))
    const rotor = level.rotor
    const rotorPlates = new Set(rotor?.plates ?? [])

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
    // A bearing wall stays square on its last screw; it starts to hang only once its load has gone.
    const bearingPlates = new Set<string>()
    const loadReleasedAt = new Map<string, number>()
    const falling = new Set<string>()
    const landed = new Set<string>()
    const faded = new Map<string, number>()
    const swung = new Set<string>()
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    // A rotor stops while the player reaches for the board: any press, drag, wheel, key or
    // mouse movement over it, or keyboard focus resting on a screw, and resumes once idle.
    const surface = container.parentElement ?? container
    let lastActivity = -Infinity
    const touched = (): void => { lastActivity = performance.now() / 1000 }
    const activity = ['pointerdown', 'pointermove', 'wheel', 'focusin', 'keydown'] as const
    for (const type of activity) surface.addEventListener(type, touched, { passive: true })
    const aiming = (): boolean => {
      const active = document.activeElement
      return active instanceof HTMLElement && active !== document.body && surface.contains(active) && active.matches(':focus-visible')
    }
    let rotorAngle = 0
    let rotorSpeed = 0
    let previousFrame = performance.now() / 1000
    // A turning part lets go at whatever angle it had reached.
    const releaseAngle = new Map<string, number>()
    const basePosition = new THREE.Vector3()
    const baseQuaternion = new THREE.Quaternion()
    // Materials are created per panel, so fading one part never touches another.
    const setOpacity = (group: THREE.Group, id: string, opacity: number): void => {
      if ((faded.get(id) ?? 1) === opacity) return
      faded.set(id, opacity)
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return
        for (const material of [object.material].flat() as THREE.Material[]) {
          material.userData.opacity ??= material.opacity
          material.userData.transparent ??= material.transparent
          const transparent = opacity < 1 || (material.userData.transparent as boolean)
          if (material.transparent !== transparent) material.needsUpdate = true
          material.transparent = transparent
          material.opacity = (material.userData.opacity as number) * opacity
        }
      })
    }
    const ray = new THREE.Raycaster()
    const world = new THREE.Vector3()
    const facing = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    let previousRemoved: string[] = []
    let lastMotionAt = performance.now() / 1000
    let frame = 0
    let lastTargets = -1
    let disposed = false
    const animate = (): void => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      const now = performance.now() / 1000
      const removed = latestRef.current.state.removed
      if (previousRemoved.length !== removed.length || previousRemoved.some((id, index) => id !== removed[index])) lastMotionAt = now
      for (const id of previousRemoved) if (!removed.includes(id)) removedAt.delete(id)
      for (const id of removed) if (!removedAt.has(id)) removedAt.set(id, now)
      previousRemoved = removed
      const dt = Math.min(0.1, Math.max(0, now - previousFrame))
      previousFrame = now
      if (rotor) {
        const turning = !reduceMotion && latestRef.current.motion && now - lastActivity >= ROTOR_IDLE_SECONDS && !aiming()
        rotorSpeed = nextRotorSpeed(rotor, rotorSpeed, turning ? Math.PI * 2 / rotor.period : 0, dt)
        rotorAngle = (rotorAngle + rotorSpeed * dt) % (Math.PI * 2)
        if (rotorSpeed > 0) lastMotionAt = now
      }
      const remainingOn = (id: string): number => plateScrews.get(id)!.filter((screw) => !removed.includes(screw.id)).length
      const releasedAt = (id: string): number => Math.max(...plateScrews.get(id)!.map((screw) => removedAt.get(screw.id) ?? -Infinity))
      for (const plate of PLATES) {
        const group = plateGroups.get(plate.id)!
        const screws = plateScrews.get(plate.id)!
        const remaining = screws.filter((screw) => !removed.includes(screw.id))
        const latest = releasedAt(plate.id)
        if (remaining.length > 0) releaseAngle.delete(plate.id)
        else if (!releaseAngle.has(plate.id)) releaseAngle.set(plate.id, rotorAngle)
        basePosition.fromArray(plate.position)
        baseQuaternion.copy(plateFrames.get(plate.id)!)
        const turns = rotor !== undefined && rotorPlates.has(plate.id)
        if (turns) {
          const turned = rotorPose(rotor, basePosition, baseQuaternion, releaseAngle.get(plate.id) ?? rotorAngle)
          basePosition.copy(turned.position)
          baseQuaternion.copy(turned.quaternion)
        }
        let fall = 0
        if (plate.hinge) {
          // A captive panel swings open and stays with its host; it falls only when the host does.
          const open = remaining.length === 0
          if (!open) swung.delete(plate.id)
          else if (!swung.has(plate.id)) {
            swung.add(plate.id)
            latestRef.current.onPlateEvent?.('swing')
          }
          const pose = open ? hingePose(plate, basePosition, baseQuaternion, reduceMotion ? HINGE_SECONDS : now - latest) : { position: basePosition, quaternion: baseQuaternion }
          if (open && now - latest < HINGE_SECONDS) lastMotionAt = now
          group.position.copy(pose.position)
          group.quaternion.copy(pose.quaternion)
          const host = plate.restsOn?.[0]
          if (host !== undefined && remainingOn(host) === 0) fall = Math.max(0, now - releasedAt(host) - 0.45)
        } else {
          const held = remaining.length === 1 && bearingLock(latestRef.current.state, plate.id, heldPlates(remaining[0]!)) !== null
          if (held) bearingPlates.add(plate.id)
          else if (bearingPlates.delete(plate.id)) loadReleasedAt.set(plate.id, now)
          const hangFrom = Math.max(latest, loadReleasedAt.get(plate.id) ?? -Infinity)
          // Turning parts hang from the hub rather than tilting about it.
          const pivot = held || turns ? undefined : remaining.length === 1 ? remaining[0]
            : remaining.length === 0 ? screws.find((screw) => removedAt.get(screw.id) === latest) : undefined
          const anchor = pivot ? anchors.get(`${pivot.id}/${plate.id}`)! : undefined
          // The unsupported side swings downward around the last screw, whichever
          // side it is on; a released plate keeps that tilt as it falls.
          const swing = anchor && anchor[0] > 0 ? 1 : -1
          const angle = anchor && Number.isFinite(hangFrom) ? swing * 0.3 * Math.min(1, Math.max(0, (now - hangFrom - 0.3) * 3)) : 0
          group.quaternion.copy(baseQuaternion).multiply(quaternion.setFromAxisAngle(NORMAL, angle))
          group.position.copy(basePosition)
          if (anchor) {
            const point = new THREE.Vector3(anchor[0], anchor[1], 0)
            group.position.add(point.clone().applyQuaternion(baseQuaternion)).sub(point.applyQuaternion(group.quaternion))
          }
          fall = remaining.length === 0 ? Math.max(0, now - latest - 0.45) : 0
        }
        if (fall > 0) {
          if (!falling.has(plate.id)) {
            falling.add(plate.id)
            latestRef.current.onPlateEvent?.('fall')
          }
          const lasts = reduceMotion ? FADE_SECONDS : FALL_SECONDS
          // A part that has faded away needs no simulation, and its shadow stops refreshing.
          if (fall >= lasts) {
            group.visible = false
            continue
          }
          const pose = fallPose(plate, group.position, group.quaternion, reduceMotion ? 0 : fall)
          group.position.copy(pose.position)
          group.quaternion.copy(pose.quaternion)
          if (pose.grounded && !landed.has(plate.id)) {
            landed.add(plate.id)
            latestRef.current.onPlateEvent?.('land')
          }
          setOpacity(group, plate.id, Math.min(1, (lasts - fall) / FADE_SECONDS))
          group.visible = true
          lastMotionAt = now
        } else {
          falling.delete(plate.id)
          landed.delete(plate.id)
          setOpacity(group, plate.id, 1)
          group.visible = true
        }
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
      renderer.shadowMap.needsUpdate = now - lastMotionAt < 1.8
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
          const sight = traceScrew(ray, hitObjects)
          if (sight?.screwId !== screw.id) continue
          const lock = screwLock(latestRef.current.state, screw)
          const locker = PLATES.find((plate) => plate.id === lock?.plate)
          targets.push({
            id: screw.id, x: (projected.x + 1) * container.clientWidth / 2, y: (1 - projected.y) * container.clientHeight / 2,
            coveredBy: lock?.kind === 'cover' ? locker?.name : sight.coveredBy,
            holdsUp: lock?.kind === 'bearing' ? locker?.name : undefined,
          })
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
      for (const type of activity) surface.removeEventListener(type, touched)
      light.shadow.dispose()
      disposeObject(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [level, PLATES, SCREWS])
  return <div ref={hostRef} className="absolute inset-x-0 bottom-16 top-0" data-testid="plate-escape-scene" />
}

function makeScrew(color: string, kind: string): THREE.Group {
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.27 })
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.12, 24), metal)
  head.rotation.x = Math.PI / 2
  head.castShadow = true
  group.add(head)
  const washer = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.025, 6, 24), new THREE.MeshStandardMaterial({ color: '#f3e6cf', metalness: 0.45, roughness: 0.38 }))
  washer.position.z = -0.035
  group.add(washer)
  const inset = new THREE.MeshStandardMaterial({ color: '#263747', roughness: 0.8 })
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.055, 0.02), inset)
  horizontal.position.z = 0.07
  if (kind === 'amber') horizontal.rotation.z = Math.PI / 2
  if (kind === 'mint') horizontal.rotation.z = Math.PI / 4
  group.add(horizontal)
  if (kind !== 'blue' && kind !== 'amber') {
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.29, 0.02), inset.clone())
    vertical.position.z = 0.07
    if (kind === 'mint') vertical.rotation.z = Math.PI / 4
    group.add(vertical)
  }
  return group
}
