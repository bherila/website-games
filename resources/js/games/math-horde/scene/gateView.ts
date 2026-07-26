import * as THREE from 'three'

import { GATE_SIDE_X } from '../gameEngine'
import type { GameState, RuntimeGateSide } from '../gameTypes'
import { toDisplayZ } from './constants'
import { CanvasLabel } from './labels'

const PANEL_WIDTH = 2.4
const PANEL_HEIGHT = 2.6
const FADE_SECONDS = 0.4

export interface GateView {
  update(state: GameState, dt: number): void
}

interface GateSideView {
  group: THREE.Group
  panelMaterial: THREE.MeshBasicMaterial
  frameMaterial: THREE.MeshStandardMaterial
  label: CanvasLabel
  positive: boolean
}

function isPositiveSide(side: RuntimeGateSide): boolean {
  return side.op === 'add' || side.op === 'mul'
}

export function sideLabelText(side: RuntimeGateSide): string {
  const symbol = side.op === 'add' ? '+' : side.op === 'sub' ? '−' : side.op === 'mul' ? '×' : '÷'

  return `${symbol}${side.value}`
}

function createGateSideView(scene: THREE.Scene, side: RuntimeGateSide, x: number): GateSideView {
  const positive = isPositiveSide(side)
  const group = new THREE.Group()

  const panelMaterial = new THREE.MeshBasicMaterial({
    color: positive ? '#1d9bff' : '#ff2d5e',
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT), panelMaterial)
  panel.position.y = PANEL_HEIGHT / 2
  group.add(panel)

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: positive ? '#1dd3ff' : '#ff2d78',
    emissive: positive ? '#0891b2' : '#be123c',
    emissiveIntensity: 1.6,
  })
  const postGeometry = new THREE.BoxGeometry(0.1, PANEL_HEIGHT, 0.1)
  const barGeometry = new THREE.BoxGeometry(PANEL_WIDTH + 0.1, 0.1, 0.1)
  const leftPost = new THREE.Mesh(postGeometry, frameMaterial)
  const rightPost = new THREE.Mesh(postGeometry, frameMaterial)
  const topBar = new THREE.Mesh(barGeometry, frameMaterial)
  leftPost.position.set(-PANEL_WIDTH / 2, PANEL_HEIGHT / 2, 0)
  rightPost.position.set(PANEL_WIDTH / 2, PANEL_HEIGHT / 2, 0)
  topBar.position.set(0, PANEL_HEIGHT, 0)
  group.add(leftPost, rightPost, topBar)

  const label = new CanvasLabel({
    color: '#ffffff',
    glow: positive ? '#22d3ee' : '#fb7185',
    fontPx: 96,
  })
  label.setTextNow(sideLabelText(side))
  label.sprite.position.set(0, PANEL_HEIGHT / 2 + 0.25, 0.06)
  label.sprite.scale.set(2.1, 1.05, 1)
  group.add(label.sprite)

  group.position.x = x
  scene.add(group)

  return { group, panelMaterial, frameMaterial, label, positive }
}

export function createGateView(scene: THREE.Scene, state: GameState): GateView {
  const views = state.gatePairs.map((gatePair) => ({
    left: createGateSideView(scene, gatePair.left, -GATE_SIDE_X),
    right: createGateSideView(scene, gatePair.right, GATE_SIDE_X),
    fadeAge: 0,
  }))

  return {
    update(current: GameState, dt: number): void {
      current.gatePairs.forEach((gatePair, index) => {
        const view = views[index]
        if (!view) {
          return
        }
        if (gatePair.resolved) {
          view.fadeAge += dt
        }
        const fading = gatePair.resolved && view.fadeAge <= FADE_SECONDS
        const displayZ = toDisplayZ(gatePair.z, current.progress)
        for (const sideId of ['left', 'right'] as const) {
          const sideView = view[sideId]
          const side = gatePair[sideId]
          sideView.group.visible = (fading || !gatePair.resolved) && displayZ < 60
          sideView.group.position.z = displayZ
          if (!sideView.group.visible) {
            continue
          }
          if (fading) {
            const t = view.fadeAge / FADE_SECONDS
            if (gatePair.chosen === sideId) {
              sideView.panelMaterial.color.set('#f5fdff')
              sideView.panelMaterial.opacity = 0.7 * (1 - t)
              sideView.frameMaterial.emissiveIntensity = 2.4 * (1 - t)
            } else {
              sideView.panelMaterial.opacity = Math.max(0, 0.28 * (1 - t * 2.5))
              sideView.frameMaterial.emissiveIntensity = Math.max(0, 1.6 * (1 - t * 2.5))
            }
            const material = sideView.label.sprite.material as THREE.SpriteMaterial
            material.opacity = 1 - t
          } else {
            sideView.label.setTextNow(sideLabelText(side))
            sideView.label.tick(dt)
          }
        }
      })
    },
  }
}
