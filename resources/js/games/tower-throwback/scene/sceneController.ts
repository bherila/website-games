/**
 * Scene controller — the composition seam TowerScene.tsx consumes. Owns the
 * renderer, scene graph, camera rig, structure/dynamic/heatmap layers; the
 * React wrapper only calls this API. `render(state)` is safe to call every
 * frame: the structure pass no-ops unless structureVersion changed, issue
 * badges throttle to 4 Hz, time-of-day retints only on 5-minute buckets, and
 * the dynamic pools are fixed-cap.
 *
 * Build-mode support: `screenToTile` maps canvas-relative pixels through the
 * ortho frustum to a grid tile; `setGhost` shows translucent placement
 * preview quads (green valid / red invalid).
 */

import * as THREE from 'three'

import { getMap } from '../engine/maps'
import type { EngineState } from '../gameTypes'
import { FLOOR_MAX, FLOOR_MIN, GRID_WIDTH } from '../gameTypes'
import type { DiagnosticPaletteMode } from '../presentationPrefs'
import {
  type CameraViewport,
  cameraViewport,
  clampToState,
  createCameraRig,
  fitAll as rigFitAll,
  goToFloor as rigGoToFloor,
  panByPixels,
  updateAspect,
  zoomBy as rigZoomBy,
} from './camera'
import {
  createConstructionEnvelopeLayer,
  disposeConstructionEnvelopeLayer,
  setConstructionEnvelope,
} from './constructionEnvelopeLayer'
import { attachContextLossHandlers, type ContextLossCallbacks } from './contextLoss'
import { createDynamicPools, disposeDynamicPools, syncDynamic } from './dynamicPools'
import { createEvalLayer, disposeEvalLayer, syncEvalLayer } from './evalLayer'
import { createHeatmapLayer, disposeHeatmapLayer, type HeatmapKind, setHeatmap } from './heatmapLayer'
import { createIssuesLayer, disposeIssuesLayer, syncIssuesLayer } from './issuesLayer'
import { FLOOR_H, TILE_W } from './palette'
import type { PlacementRangeTile } from './placementRange'
import {
  createPlacementRangeLayer,
  disposePlacementRangeLayer,
  setPlacementRange as syncPlacementRange,
} from './placementRangeLayer'
import { createCarGlideStore, prepareSceneFrame } from './sceneFrame'
import { applyTimeOfDay, applyWeather, createStructureLayer, disposeStructureLayer, syncStructure } from './structureMesh'
import { createStyleGateArtLayer, disposeStyleGateArtLayer, isStyleGateArtReady, syncStyleGateArt } from './styleGateArt'
import { styleGateDetailLevelForVisibleFloors } from './styleGateFrames'

export interface PlacementGhost {
  floor: number
  x: number
  widthTiles: number
  storeys: number
  valid: boolean
}

export interface RenderMetrics {
  drawCalls: number
  frameMs: number
  triangles: number
}

export interface SceneController {
  /** dtSec = REAL frame seconds, used only by the presentation glide layer. */
  render(state: EngineState, dtSec?: number): void
  setOverlay(kind: HeatmapKind | null, field: Float32Array | null): void
  /** Toggle per-unit eval tinting over income-bearing units. */
  setEvalOverlay(enabled: boolean): void
  /** Swap the diagnostic colour ramp (noise/congestion/eval/catchment) in place. */
  setDiagnosticPalette(mode: DiagnosticPaletteMode): void
  /**
   * Suppress nonessential presentation motion (precipitation scroll, car/person
   * glides). Authoritative positions are unchanged — reduced motion snaps to
   * them instead of interpolating toward them.
   */
  setReducedMotion(enabled: boolean): void
  /** Zoom out to fit the whole built tower, clamped to the current extents. */
  fitTower(): void
  /** Highlight a venue's reachable tiles (null clears); independent of setOverlay. */
  setCatchment(field: Float32Array | null): void
  /** Canvas-relative pixels → grid tile; null outside the grid. */
  screenToTile(px: number, py: number): { floor: number; x: number } | null
  /** Canvas-relative pixels → world coordinates (unclamped, un-floored). */
  screenToWorld(px: number, py: number): { x: number; y: number }
  /** Translucent build preview(s) (green valid / red invalid); null hides. */
  setGhost(ghost: PlacementGhost | PlacementGhost[] | null): void
  /** Service/impact reach shown behind the footprint while placing a unit. */
  setPlacementRange(tiles: readonly PlacementRangeTile[]): void
  /** Niagara's map-authored buildable plateaus and bridge-only falls void. */
  setBuildMode(enabled: boolean): void
  /** Pan by POINTER-PIXEL deltas (converted through the ortho frustum). */
  panBy(dxPx: number, dyPx: number): void
  /** Center a floor, preserving zoom and respecting the current tower bounds. */
  goToFloor(floor: number): void
  getViewport(): CameraViewport
  getRenderMetrics(): RenderMetrics
  zoomBy(factor: number, focusPoint?: { x: number; y: number }): void
  resize(width: number, height: number): void
  /**
   * Register pause/resume hooks for GPU context loss. `onLost` fires when the
   * WebGL context is lost (rendering should pause; the sim is untouched);
   * `onRestored` fires after GPU-side resources have been rebuilt.
   */
  setContextLossHandlers(handlers: ContextLossCallbacks): void
  isReady(): boolean
  dispose(): void
}

const GHOST_VALID = 0x3fae52
const GHOST_INVALID = 0xd83a2a
const Z_GHOST = 7
const ISSUE_SYNC_SEC = 0.25
const GHOST_CAP = 512

/**
 * Reduced-motion presentation delta. Every glide in the scene derives its per-
 * frame budget as `RATE * dtSec` and feeds it to `approach()`, which returns the
 * TARGET outright once the budget covers the remaining distance. An unbounded
 * delta therefore snaps cars and people straight onto their authoritative
 * positions — the opposite of `dtSec = 0`, which would freeze them mid-glide.
 */
const SNAP_DT_SEC = Number.POSITIVE_INFINITY

export function createSceneController(canvas: HTMLCanvasElement): SceneController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()

  const structure = createStructureLayer(scene)
  const pools = createDynamicPools(scene)
  const styleGateArt = createStyleGateArtLayer(scene)
  const carGlides = createCarGlideStore()
  const heatmap = createHeatmapLayer(scene)
  const issues = createIssuesLayer(scene)
  issues.enabled = true
  const evalLayer = createEvalLayer(scene)
  const placementRange = createPlacementRangeLayer(scene)
  const constructionEnvelope = createConstructionEnvelopeLayer(scene)
  // A second heatmap instance for the selection-driven catchment highlight, one
  // z-slice below the toggle overlay so the two can coexist without z-fighting.
  const catchment = createHeatmapLayer(scene)
  catchment.mesh.position.z = 1.9
  let viewWidth = canvas.clientWidth || canvas.width || 1
  let viewHeight = canvas.clientHeight || canvas.height || 1
  const rig = createCameraRig(viewWidth / viewHeight)
  renderer.setSize(viewWidth, viewHeight, false)

  const ghostMaterial = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    opacity: 0.58,
    toneMapped: false,
    transparent: true,
  })
  const ghostMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ghostMaterial, GHOST_CAP)
  ghostMesh.count = 0
  ghostMesh.visible = false
  ghostMesh.position.z = Z_GHOST
  ghostMesh.renderOrder = 60
  ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  ghostMesh.frustumCulled = false
  scene.add(ghostMesh)
  const ghostDummy = new THREE.Object3D()
  const ghostColor = new THREE.Color()

  let lastState: EngineState | null = null
  let issueSyncAccum = ISSUE_SYNC_SEC
  let renderMetrics: RenderMetrics = { drawCalls: 0, frameMs: 0, triangles: 0 }
  let contextLost = false
  let externalLossHandlers: ContextLossCallbacks | null = null
  let paletteMode: DiagnosticPaletteMode = 'classic'
  let reducedMotion = false
  let buildMode = false
  // Last fill for each heatmap mesh, retained so a colour-mode swap can repaint
  // the tiles already on screen without waiting for the next field update.
  let overlayFill: { field: Float32Array; kind: HeatmapKind } | null = null
  let catchmentFill: Float32Array | null = null

  /**
   * Force every GPU-backed layer to rebuild on the next render. The structure
   * and style-gate layers rebuild from their tracked version when it no longer
   * matches state; resetting to -1 guarantees fresh uploads after the context
   * comes back. Person glide caches re-snap from scratch.
   */
  const rebuildGpuResources = (): void => {
    structure.version = -1
    styleGateArt.structureVersion = -1
    styleGateArt.personVisual.clear()
  }

  const detachContextLoss = attachContextLossHandlers(canvas, {
    onLost: () => {
      contextLost = true
      externalLossHandlers?.onLost()
    },
    onRestored: () => {
      contextLost = false
      rebuildGpuResources()
      externalLossHandlers?.onRestored()
    },
  })

  const screenToWorld = (px: number, py: number): { x: number; y: number } => {
    const camera = rig.camera
    return {
      x: camera.left + (px / Math.max(1, viewWidth)) * (camera.right - camera.left),
      y: camera.top - (py / Math.max(1, viewHeight)) * (camera.top - camera.bottom),
    }
  }

  return {
    render(state: EngineState, dtSec = 0): void {
      lastState = state
      // Skip all GPU work while the context is gone; three's renderer would
      // no-op anyway, but this avoids churning buffer uploads to a dead context.
      if (contextLost) {
        return
      }
      syncStructure(structure, state)
      setConstructionEnvelope(constructionEnvelope, state.mapId, buildMode)
      const presentationDt = reducedMotion ? SNAP_DT_SEC : dtSec
      const frame = prepareSceneFrame(state, carGlides, presentationDt)
      // The style-gate atlas is the primary renderer for people + elevator cars once
      // loaded; dynamicPools then draws only badges/bars and leaves people/cars to the
      // atlas. The flag must be the NEGATION of `loaded` — passing `loaded` directly
      // (the pre-#1550 bug) double-drew the near-white fallback quads behind every
      // sprite, visible through transparent pixels as a "white box" silhouette.
      syncDynamic(pools, state, frame, dtSec, !styleGateArt.loaded)
      syncStyleGateArt(styleGateArt, state, frame, styleGateDetailLevelForVisibleFloors((rig.halfHeight * 2) / FLOOR_H), dtSec)
      issueSyncAccum += dtSec
      if (issueSyncAccum >= ISSUE_SYNC_SEC) {
        issueSyncAccum %= ISSUE_SYNC_SEC
        syncIssuesLayer(issues, state)
        // Eval tints change on the daily occupancy pass; re-uploading 4096
        // instance matrices per frame is waste — share the 4 Hz throttle.
        syncEvalLayer(evalLayer, state, paletteMode)
      }
      applyTimeOfDay(structure, state.clock.minute, state.clock.day)
      // Reduced motion keeps the weather KIND (it is deterministic and
      // informational) but pins the scroll phase so precipitation is static.
      applyWeather(structure, state.clock.minute, state.clock.day, reducedMotion)
      clampToState(rig, state)
      const renderStart = performance.now()
      renderer.render(scene, rig.camera)
      const renderMs = performance.now() - renderStart
      renderMetrics = {
        drawCalls: renderer.info.render.calls,
        frameMs: renderMetrics.frameMs === 0 ? renderMs : renderMetrics.frameMs * 0.9 + renderMs * 0.1,
        triangles: renderer.info.render.triangles,
      }
    },
    setOverlay(kind: HeatmapKind | null, field: Float32Array | null): void {
      if (kind === null || field === null) {
        overlayFill = null
        setHeatmap(heatmap, null, kind ?? 'noise')
        return
      }
      overlayFill = { field, kind }
      setHeatmap(heatmap, field, kind)
    },
    setEvalOverlay(enabled: boolean): void {
      evalLayer.enabled = enabled
      if (lastState) {
        syncEvalLayer(evalLayer, lastState) // show/hide immediately, don't wait out the throttle
      }
    },
    setCatchment(field: Float32Array | null): void {
      catchmentFill = field
      setHeatmap(catchment, field, 'catchment')
    },
    setDiagnosticPalette(mode: DiagnosticPaletteMode): void {
      if (mode === paletteMode) {
        return
      }
      paletteMode = mode
      heatmap.paletteMode = mode
      catchment.paletteMode = mode
      // Instance colours are baked at fill time, so a mode swap has to re-run
      // whatever fill is currently on screen rather than wait for the next one.
      if (overlayFill) {
        setHeatmap(heatmap, overlayFill.field, overlayFill.kind)
      }
      setHeatmap(catchment, catchmentFill, 'catchment')
      if (lastState) {
        syncEvalLayer(evalLayer, lastState, mode)
      }
    },
    setReducedMotion(enabled: boolean): void {
      reducedMotion = enabled
    },
    fitTower(): void {
      if (lastState) {
        clampToState(rig, lastState)
      }
      rigFitAll(rig)
    },
    screenToWorld,
    screenToTile(px: number, py: number): { floor: number; x: number } | null {
      const world = screenToWorld(px, py)
      const x = Math.floor(world.x / TILE_W)
      const floor = Math.floor(world.y / FLOOR_H)
      if (x < 0 || x >= GRID_WIDTH || floor < FLOOR_MIN || floor > FLOOR_MAX) {
        return null
      }
      return { floor, x }
    },
    setGhost(ghost: PlacementGhost | PlacementGhost[] | null): void {
      if (ghost === null) {
        ghostMesh.visible = false
        ghostMesh.count = 0
        return
      }
      const ghosts = Array.isArray(ghost) ? ghost : [ghost]
      let count = 0
      for (const item of ghosts) {
        if (count >= GHOST_CAP) {
          break
        }
        ghostDummy.position.set(
          item.x * TILE_W + (item.widthTiles * TILE_W) / 2,
          item.floor * FLOOR_H + (item.storeys * FLOOR_H) / 2,
          0,
        )
        ghostDummy.scale.set(item.widthTiles * TILE_W, item.storeys * FLOOR_H, 1)
        ghostDummy.rotation.set(0, 0, 0)
        ghostDummy.updateMatrix()
        ghostMesh.setMatrixAt(count, ghostDummy.matrix)
        ghostMesh.setColorAt(count, ghostColor.setHex(item.valid ? GHOST_VALID : GHOST_INVALID))
        count += 1
      }
      ghostMesh.count = count
      ghostMesh.visible = count > 0
      ghostMesh.instanceMatrix.needsUpdate = true
      if (ghostMesh.instanceColor) {
        ghostMesh.instanceColor.needsUpdate = true
      }
    },
    setPlacementRange(tiles: readonly PlacementRangeTile[]): void {
      syncPlacementRange(placementRange, tiles)
    },
    setBuildMode(enabled: boolean): void {
      buildMode = enabled
      if (lastState) {
        setConstructionEnvelope(constructionEnvelope, lastState.mapId, enabled)
      }
    },
    panBy(dx: number, dy: number): void {
      if (lastState) {
        clampToState(rig, lastState)
      }
      panByPixels(rig, dx, dy, viewHeight)
    },
    goToFloor(floor: number): void {
      if (lastState) {
        clampToState(rig, lastState)
        rigGoToFloor(rig, floor, getMap(lastState.mapId).floorRange)
        return
      }
      rigGoToFloor(rig, floor)
    },
    getViewport(): CameraViewport {
      return cameraViewport(rig)
    },
    getRenderMetrics(): RenderMetrics {
      return renderMetrics
    },
    zoomBy(factor: number, focusPoint?: { x: number; y: number }): void {
      if (lastState) {
        clampToState(rig, lastState)
      }
      rigZoomBy(rig, factor, focusPoint)
    },
    resize(nextWidth: number, nextHeight: number): void {
      viewWidth = Math.max(1, nextWidth)
      viewHeight = Math.max(1, nextHeight)
      renderer.setSize(nextWidth, nextHeight, false)
      updateAspect(rig, viewWidth / viewHeight)
    },
    setContextLossHandlers(handlers: ContextLossCallbacks): void {
      externalLossHandlers = handlers
    },
    isReady(): boolean {
      return isStyleGateArtReady(styleGateArt)
    },
    dispose(): void {
      detachContextLoss()
      disposeStructureLayer(structure)
      disposeDynamicPools(pools)
      disposeStyleGateArtLayer(styleGateArt)
      disposeHeatmapLayer(heatmap)
      disposeHeatmapLayer(catchment)
      disposeIssuesLayer(issues)
      disposeEvalLayer(evalLayer)
      disposePlacementRangeLayer(placementRange)
      disposeConstructionEnvelopeLayer(constructionEnvelope)
      ghostMesh.dispose()
      ghostMesh.geometry.dispose()
      ghostMaterial.dispose()
      renderer.dispose()
    },
  }
}
