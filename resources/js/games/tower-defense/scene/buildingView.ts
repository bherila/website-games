import * as THREE from 'three'

import { TOWERS,towerStats } from '../catalog'
import type { Building, GameState, Plan, TowerId } from '../gameTypes'
import { towerGeometry } from './models'

export interface BoardOverlay {
  /** The armed build tool. */
  tool: TowerId | null
  /** The cell the pointer is on while a tool is armed. */
  hover: { col: number; row: number; valid: boolean } | null
  selectedId: number | null
  heroSelected: boolean
}

interface BuildingEntry {
  mesh: THREE.Mesh
  tier: number
  tower: TowerId
}

export interface BuildingView {
  update: (state: GameState, overlay: BoardOverlay, time: number, reducedMotion: boolean) => void
}

export function createBuildingView(scene: THREE.Scene): BuildingView {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true })
  const ghostMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.8, flatShading: true, depthWrite: false })
  const entries = new Map<number, BuildingEntry>()
  const planMeshes = new Map<number, THREE.Mesh>()

  const hoverCell = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }))
  hoverCell.rotation.x = -Math.PI / 2
  hoverCell.position.y = 0.03
  hoverCell.visible = false
  hoverCell.renderOrder = 3
  scene.add(hoverCell)
  const hoverGhost = new THREE.Mesh(new THREE.BufferGeometry(), ghostMaterial)
  hoverGhost.visible = false
  scene.add(hoverGhost)

  const ringGeometry = new THREE.RingGeometry(0.97, 1, 64)
  ringGeometry.rotateX(-Math.PI / 2)
  const rangeRing = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }))
  rangeRing.position.y = 0.05
  rangeRing.visible = false
  rangeRing.renderOrder = 3
  scene.add(rangeRing)
  const rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }))
  rangeFill.rotation.x = -Math.PI / 2
  rangeFill.position.y = 0.04
  rangeFill.visible = false
  scene.add(rangeFill)

  const selectedCell = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.56, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, depthWrite: false }))
  selectedCell.rotation.x = -Math.PI / 2
  selectedCell.position.y = 0.05
  selectedCell.visible = false
  scene.add(selectedCell)

  function showRange(col: number, row: number, range: number, color: number): void {
    const visible = range > 0
    rangeRing.visible = visible
    rangeFill.visible = visible
    if (!visible) {
      return
    }
    rangeRing.position.set(col + 0.5, 0.05, row + 0.5)
    rangeRing.scale.set(range, 1, range)
    rangeFill.position.set(col + 0.5, 0.04, row + 0.5)
    rangeFill.scale.set(range, range, 1)
    ;(rangeRing.material as THREE.MeshBasicMaterial).color.setHex(color)
    ;(rangeFill.material as THREE.MeshBasicMaterial).color.setHex(color)
  }

  function syncBuilding(building: Building, reducedMotion: boolean): void {
    let entry = entries.get(building.id)
    if (!entry) {
      const mesh = new THREE.Mesh(towerGeometry(building.tower, building.tier), material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      entry = { mesh, tier: building.tier, tower: building.tower }
      entries.set(building.id, entry)
    }
    if (entry.tier !== building.tier) {
      entry.tier = building.tier
      entry.mesh.geometry = towerGeometry(building.tower, building.tier)
    }
    // It rises out of the ground as the hero works, and shudders when struck.
    const rise = 0.15 + (0.85 * building.progress)
    const shake = !reducedMotion && building.hitAge < 0.15 ? Math.sin(building.hitAge * 90) * 0.04 : 0
    entry.mesh.position.set(building.col + 0.5 + shake, 0, building.row + 0.5)
    entry.mesh.scale.set(1, rise, 1)
    if (TOWERS[building.tower].damage > 0) {
      entry.mesh.rotation.y = Math.atan2(Math.cos(building.aim), Math.sin(building.aim))
    }
  }

  function syncPlan(plan: Plan): void {
    if (plan.buildingId !== null && plan.type === 'build') {
      const mesh = planMeshes.get(plan.id)
      if (mesh) {
        scene.remove(mesh)
        planMeshes.delete(plan.id)
      }

      return
    }
    let mesh = planMeshes.get(plan.id)
    if (!mesh) {
      mesh = new THREE.Mesh(towerGeometry(plan.tower, 1), ghostMaterial)
      mesh.position.set(plan.col + 0.5, plan.type === 'upgrade' ? 0.6 : 0, plan.row + 0.5)
      mesh.scale.setScalar(plan.type === 'upgrade' ? 0.45 : 1)
      scene.add(mesh)
      planMeshes.set(plan.id, mesh)
    }
  }

  return {
    update(state, overlay, time, reducedMotion) {
      const live = new Set<number>()
      for (const building of state.buildings) {
        live.add(building.id)
        syncBuilding(building, reducedMotion)
      }
      for (const [id, entry] of entries) {
        if (!live.has(id)) {
          scene.remove(entry.mesh)
          entries.delete(id)
        }
      }
      const livePlans = new Set<number>()
      for (const plan of state.plans) {
        livePlans.add(plan.id)
        syncPlan(plan)
      }
      for (const [id, mesh] of planMeshes) {
        if (!livePlans.has(id)) {
          scene.remove(mesh)
          planMeshes.delete(id)
        }
        else if (!reducedMotion && mesh.scale.x < 1) {
          // Upgrades waiting for the hero float above their tower.
          mesh.position.y = 1.5 + (Math.sin(time * 4) * 0.08)
        }
      }

      const selected = overlay.selectedId === null ? undefined : state.buildings.find((building) => building.id === overlay.selectedId)
      selectedCell.visible = Boolean(selected)
      if (selected) {
        selectedCell.position.set(selected.col + 0.5, 0.05, selected.row + 0.5)
      }

      const hover = overlay.hover
      if (overlay.tool && hover) {
        hoverCell.visible = true
        hoverCell.position.set(hover.col + 0.5, 0.03, hover.row + 0.5)
        ;(hoverCell.material as THREE.MeshBasicMaterial).color.setHex(hover.valid ? 0x22c55e : 0xef4444)
        hoverGhost.visible = hover.valid
        hoverGhost.geometry = towerGeometry(overlay.tool, 1)
        hoverGhost.position.set(hover.col + 0.5, 0, hover.row + 0.5)
        showRange(hover.col, hover.row, towerStats(overlay.tool, 1).range, hover.valid ? 0x4ade80 : 0xf87171)
      } else {
        hoverCell.visible = false
        hoverGhost.visible = false
        if (selected) {
          showRange(selected.col, selected.row, towerStats(selected.tower, selected.tier).range, 0xfacc15)
        } else {
          showRange(0, 0, 0, 0xffffff)
        }
      }
    },
  }
}
