/**
 * Three.js canvas host: mount-once render loop (hover pattern — props mirrored
 * to refs, fixed cleanup, rAF park/wake on tab visibility). The scene layers
 * live behind scene/sceneController; this component owns engine stepping,
 * command draining, HUD snapshots, overlay refresh, and pointer input
 * (pan/zoom, build-tool ghost + drag placement, click-to-inspect).
 */
import currency from 'currency.js'
import { type ReactElement, useEffect, useRef, useState } from 'react'

import { itemDef, shaftDef } from './engine/catalog'
import { buildHudSnapshot, stepEngine } from './engine/engine'
import { congestionField, noiseField } from './engine/heatmaps'
import { applyPlacement, validatePlacement } from './engine/placement'
import type { EngineCommand, EngineEvent, EngineState, HudSnapshot, ItemKind, ShaftKind } from './gameTypes'
import { TUNING } from './gameTypes'
import type { SelectedTool } from './hud/BuildPalette'
import { RendererUnavailable } from './overlays/RendererUnavailable'
import { bulkPlacementCells } from './scene/bulkPlacement'
import type { CameraViewport } from './scene/camera'
import { stopToggleCommandForClick } from './scene/elevatorStops'
import { type HeatmapTileSample, type InspectableHeatmapKind, sampleHeatmapField } from './scene/heatmapLayer'
import { placementRangeTiles } from './scene/placementRange'
import { createSceneController, type PlacementGhost, type RenderMetrics, type SceneController } from './scene/sceneController'
import { shaftCapAt, type ShaftCapHit, shaftResizeCommandForDrag, shaftResizePreview } from './scene/shaftResize'
import {
  normalizeWheelPx,
  type PinchSnapshot,
  pinchSnapshot,
  pinchUpdate,
  wheelPanDelta,
  wheelZoomFactor,
} from './scene/touchGestures'
import { getVisualTestConfig, markVisualReady } from './visualTestMode'

export type OverlayKind = 'noise' | 'congestion' | 'eval' | null

export interface Tile {
  floor: number
  x: number
}

export interface PlacementDragSession {
  anchor: Tile
  bulkMode: boolean
  pointerId: number
  tool: SelectedTool
}

export function beginPlacementDrag(
  tool: SelectedTool,
  anchor: Tile,
  pointerId: number,
  shiftKey: boolean,
): PlacementDragSession {
  return {
    anchor,
    bulkMode: shiftKey && !tool.isShaft,
    pointerId,
    tool: { ...tool },
  }
}

interface TowerSceneProps {
  /** Mutable engine state owned by TowerGame; the scene steps it in place. */
  engineState: EngineState
  /** Commands queued by the HUD since the last frame; drained into stepEngine. */
  commandQueueRef: React.RefObject<EngineCommand[]>
  /** Active build tool; null = pointer pans/inspects. Mirrored by TowerGame. */
  buildToolRef: React.RefObject<SelectedTool | null>
  onSnapshot?: (snapshot: HudSnapshot) => void
  onEvents?: (events: EngineEvent[]) => void
  /** Fired when a build drag/click completes; TowerGame enqueues the command. */
  onPlaceCommand?: (cmd: EngineCommand) => void
  /** Fired on a plain click with no tool active (inspect). */
  onSelectTile?: (tile: Tile) => void
  /** Sample from the exact field currently uploaded to the active heatmap. */
  onOverlaySample?: (sample: HeatmapTileSample | null) => void
  onViewportChange?: (viewport: CameraViewport) => void
  onRenderMetrics?: (metrics: RenderMetrics) => void
  /** Fired when a plain click on a shaft landing toggles an elevator stop. */
  onToggleStop?: (cmd: Extract<EngineCommand, { type: 'setStopEnabled' }>) => void
  /** Fired on right-click while a tool is active. */
  onToolCancel?: () => void
  onController?: (controller: SceneController) => void
  /**
   * Escape hatch offered when the renderer cannot start at all. TowerScene owns
   * no navigation, so TowerGame supplies the save-and-leave behaviour.
   */
  onExit?: () => void
  /**
   * Suspend simulation while a blocking modal covers the playfield. Queued
   * commands still apply; only the passage of time stops.
   */
  paused?: boolean
  overlay?: OverlayKind
  /** Reachability highlight for the inspected venue; null clears it. */
  catchmentField?: Float32Array | null
}

const SNAPSHOT_INTERVAL = 1 / TUNING.time.hudHz
const OVERLAY_REFRESH_SEC = 2
const RENDER_METRICS_INTERVAL_SEC = 0.5
const MAX_FRAME_DT = 0.25
const CLICK_SLOP_PX = 4
const VISUAL_BULK_GHOSTS: PlacementGhost[] = [4, 5, 6, 7].map((floor) => ({
  floor,
  x: 150,
  widthTiles: 1,
  storeys: 1,
  valid: true,
}))

export type TowerSceneKeyboardAction =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number }
  | { type: 'cancel' }
  | { type: 'activate' }

export function keyboardActionForKey(key: string, shiftKey = false): TowerSceneKeyboardAction | null {
  const panStep = shiftKey ? 120 : 40
  switch (key.toLowerCase()) {
    case 'arrowleft':
    case 'a':
      return { type: 'pan', dx: panStep, dy: 0 }
    case 'arrowright':
    case 'd':
      return { type: 'pan', dx: -panStep, dy: 0 }
    case 'arrowup':
    case 'w':
      return { type: 'pan', dx: 0, dy: panStep }
    case 'arrowdown':
    case 's':
      return { type: 'pan', dx: 0, dy: -panStep }
    case '+':
    case '=':
      return { type: 'zoom', factor: 0.8 }
    case '-':
    case '_':
      return { type: 'zoom', factor: 1.25 }
    case 'escape':
      return { type: 'cancel' }
    case 'enter':
      return { type: 'activate' }
    default:
      return null
  }
}

type PlacementCmd = Extract<EngineCommand, { type: 'place' } | { type: 'placeShaft' }>
type PlaceItemCmd = Extract<EngineCommand, { type: 'place' }>

export function overlayRefreshRequired(
  wantedOverlay: OverlayKind,
  shownOverlay: OverlayKind,
  elapsedSec: number,
  structureVersion: number,
  shownStructureVersion: number,
): boolean {
  return wantedOverlay !== shownOverlay
    || (wantedOverlay !== null && (elapsedSec >= OVERLAY_REFRESH_SEC || structureVersion !== shownStructureVersion))
}

/** Translate a tool + drag anchor/current tile into the placement command. */
function buildToolCommand(tool: SelectedTool, anchor: Tile, current: Tile): PlacementCmd {
  if (tool.isShaft) {
    const bottomFloor = Math.min(anchor.floor, current.floor)
    const topFloor = Math.max(anchor.floor, current.floor)
    return {
      type: 'placeShaft',
      kind: tool.kind as ShaftKind,
      x: anchor.x,
      bottomFloor,
      topFloor: topFloor === bottomFloor ? bottomFloor + 1 : topFloor,
    }
  }
  const kind = tool.kind as ItemKind
  if (itemDef(kind).perTile) {
    const x = Math.min(anchor.x, current.x)
    return { type: 'place', kind, floor: anchor.floor, x, widthTiles: Math.abs(current.x - anchor.x) + 1 }
  }
  return { type: 'place', kind, floor: current.floor, x: current.x }
}

function itemStoreys(kind: ItemKind, state: EngineState): number {
  return kind === 'lobby' ? state.lobbyHeight : itemDef(kind).storeys
}

function toolIdentity(tool: SelectedTool | null): string | null {
  return tool ? `${tool.isShaft ? 'shaft' : 'item'}:${tool.kind}` : null
}

export function hoverPreviewRequiresClear(
  placementDragActive: boolean,
  previewToolIdentity: string | null,
  selectedTool: SelectedTool | null,
): boolean {
  return !placementDragActive && previewToolIdentity !== toolIdentity(selectedTool)
}

function bulkPlaceCommands(tool: SelectedTool, anchor: Tile, current: Tile, state: EngineState): PlaceItemCmd[] {
  const kind = tool.kind as ItemKind
  const def = itemDef(kind)
  if (def.perTile) {
    const x = Math.min(anchor.x, current.x)
    const widthTiles = Math.abs(current.x - anchor.x) + 1
    return bulkPlacementCells(widthTiles, 1, anchor, current).map((cell) => ({ type: 'place', kind, floor: cell.floor, x, widthTiles }))
  }

  return bulkPlacementCells(def.width, itemStoreys(kind, state), anchor, current).map((cell) => ({
    type: 'place',
    kind,
    floor: cell.floor,
    x: cell.x,
  }))
}

function ghostForCommand(cmd: PlacementCmd, state: EngineState, valid: boolean): PlacementGhost {
  if (cmd.type === 'placeShaft') {
    return {
      floor: cmd.bottomFloor,
      x: cmd.x,
      widthTiles: shaftDef(cmd.kind).width,
      storeys: cmd.topFloor - cmd.bottomFloor + 1,
      valid,
    }
  }

  const def = itemDef(cmd.kind)
  return {
    floor: cmd.floor,
    x: cmd.x,
    widthTiles: cmd.widthTiles ?? def.width,
    storeys: itemStoreys(cmd.kind, state),
    valid,
  }
}

/**
 * Validate a bulk preview against the same bottom-to-top sequence that will
 * run when the drag is released. Accepted cells are applied only to a scratch
 * state, allowing each stacked slab to support the next preview cell.
 */
export function bulkGhostsForCommands(state: EngineState, commands: PlaceItemCmd[]): PlacementGhost[] {
  const scratchState: EngineState = {
    ...state,
    units: [...state.units],
    shafts: [...state.shafts],
    grid: {
      slab: new Uint8Array(state.grid.slab),
      unit: new Int32Array(state.grid.unit),
      shaft: new Int32Array(state.grid.shaft),
    },
  }

  return commands.map((cmd) => {
    const verdict = validatePlacement(scratchState, cmd)
    if (verdict.ok) {
      applyPlacement(scratchState, cmd)
    }

    return ghostForCommand(cmd, state, verdict.ok)
  })
}

export function TowerScene({
  engineState,
  commandQueueRef,
  buildToolRef,
  onSnapshot,
  onEvents,
  onPlaceCommand,
  onSelectTile,
  onOverlaySample,
  onViewportChange,
  onRenderMetrics,
  onToggleStop,
  onToolCancel,
  onController,
  onExit,
  paused = false,
  overlay = null,
  catchmentField = null,
}: TowerSceneProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [resizeReadout, setResizeReadout] = useState<{ cost: number; refund: number; reason: string | null } | null>(null)
  const [contextRecovering, setContextRecovering] = useState(false)
  // Read inside the rAF loop, which is created once and must not be torn down
  // and rebuilt every time a modal opens.
  const pausedRef = useRef(paused)
  // Non-null once renderer construction has failed; bumping `initAttempt`
  // re-runs the scene effect so "Try again" is a real retry, not a page reload.
  const [rendererError, setRendererError] = useState<string | null>(null)
  const [initAttempt, setInitAttempt] = useState(0)

  const stateRef = useRef(engineState)
  const overlayRef = useRef<OverlayKind>(overlay)
  const catchmentRef = useRef<Float32Array | null>(catchmentField)
  const onSnapshotRef = useRef(onSnapshot)
  const onEventsRef = useRef(onEvents)
  const onPlaceCommandRef = useRef(onPlaceCommand)
  const onSelectTileRef = useRef(onSelectTile)
  const onOverlaySampleRef = useRef(onOverlaySample)
  const onViewportChangeRef = useRef(onViewportChange)
  const onRenderMetricsRef = useRef(onRenderMetrics)
  const onToggleStopRef = useRef(onToggleStop)
  const onToolCancelRef = useRef(onToolCancel)
  const onControllerRef = useRef(onController)

  useEffect(() => {
    stateRef.current = engineState
  }, [engineState])
  useEffect(() => {
    overlayRef.current = overlay
  }, [overlay])
  useEffect(() => {
    catchmentRef.current = catchmentField
  }, [catchmentField])
  useEffect(() => {
    onSnapshotRef.current = onSnapshot
  }, [onSnapshot])
  useEffect(() => {
    onEventsRef.current = onEvents
  }, [onEvents])
  useEffect(() => {
    onPlaceCommandRef.current = onPlaceCommand
  }, [onPlaceCommand])
  useEffect(() => {
    onSelectTileRef.current = onSelectTile
  }, [onSelectTile])
  useEffect(() => {
    onOverlaySampleRef.current = onOverlaySample
  }, [onOverlaySample])
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange
  }, [onViewportChange])
  useEffect(() => {
    onRenderMetricsRef.current = onRenderMetrics
  }, [onRenderMetrics])
  useEffect(() => {
    onToggleStopRef.current = onToggleStop
  }, [onToggleStop])
  useEffect(() => {
    onToolCancelRef.current = onToolCancel
  }, [onToolCancel])
  useEffect(() => {
    onControllerRef.current = onController
  }, [onController])
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    // Renderer construction is the one step with no recovery path of its own:
    // if it throws, there is no context to lose and nothing to rebuild. Catch it
    // here so the React shell (and with it the player's save controls) survives,
    // rather than letting the exception unmount the whole game.
    let controller: SceneController
    try {
      controller = createSceneController(canvas)
    } catch (error) {
      setRendererError(error instanceof Error ? error.message : 'WebGL could not be initialised.')
      return
    }
    setRendererError(null)
    onControllerRef.current?.(controller)

    let rafId = 0
    let parked = false
    let renderPaused = false
    let lastTime = performance.now()
    let snapshotAccum = 0
    let renderMetricsAccum = RENDER_METRICS_INTERVAL_SEC
    let overlayAccum = OVERLAY_REFRESH_SEC
    let overlayShown: OverlayKind = null
    let activeHeatmapField: Float32Array | null = null
    let activeHeatmapKind: InspectableHeatmapKind | null = null
    let lastCatchmentApplied: Float32Array | null = null
    let overlayStructureVersion = -1
    let visualReadyMarked = false
    let visualReadyFrames = 0
    let visualResizeShown = false
    let lastViewport: CameraViewport | null = null
    const visualTestConfig = getVisualTestConfig()

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      controller.resize(rect.width, rect.height)
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const frame = (now: number): void => {
      rafId = requestAnimationFrame(frame)
      const state = stateRef.current
      const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_DT)
      lastTime = now

      const queue = commandQueueRef.current ?? []
      const drained = queue.splice(0, queue.length)
      // Pausing is expressed as a ZERO STEP, not as a speed change. `stepEngine`
      // dispatches queued commands before it checks dt, so the HUD stays fully
      // functional behind a blocking modal (saving, loading, answering a loan)
      // while no time passes and no rng is drawn. It also means the player's
      // speed selection is never mutated, so there is nothing to "restore" —
      // and no way for a crash mid-modal to strand them at 0×.
      const stepDt = pausedRef.current ? 0 : dt
      const events = stepEngine(state, drained, stepDt)
      if (events.length > 0) {
        onEventsRef.current?.(events)
      }

      snapshotAccum += dt
      if (snapshotAccum >= SNAPSHOT_INTERVAL) {
        snapshotAccum %= SNAPSHOT_INTERVAL
        onSnapshotRef.current?.(buildHudSnapshot(state))
      }

      // Rendering is paused while the GPU context is lost: the sim above keeps
      // stepping (and autosaves), but every controller/GPU interaction below is
      // skipped until the context is restored.
      if (renderPaused) {
        return
      }

      const wantedOverlay = overlayRef.current
      overlayAccum += dt
      if (overlayRefreshRequired(wantedOverlay, overlayShown, overlayAccum, state.structureVersion, overlayStructureVersion)) {
        overlayAccum = 0
        overlayShown = wantedOverlay
        overlayStructureVersion = state.structureVersion
        // 'eval' is a per-unit tint layer, not a heatmap field.
        controller.setEvalOverlay(wantedOverlay === 'eval')
        const heatmapKind = wantedOverlay === 'noise' || wantedOverlay === 'congestion' ? wantedOverlay : null
        if (heatmapKind === null) {
          activeHeatmapField = null
          activeHeatmapKind = null
          controller.setOverlay(null, null)
        } else {
          activeHeatmapKind = heatmapKind
          activeHeatmapField = heatmapKind === 'noise' ? noiseField(state) : congestionField(state)
          controller.setOverlay(heatmapKind, activeHeatmapField)
        }
      }

      if (catchmentRef.current !== lastCatchmentApplied) {
        lastCatchmentApplied = catchmentRef.current
        controller.setCatchment(catchmentRef.current)
      }

      if (visualTestConfig?.surface === 'bulkGhost') {
        controller.setGhost(VISUAL_BULK_GHOSTS)
      } else if (visualTestConfig?.surface === 'shaftResize') {
        const shaft = state.shafts[0]
        if (!visualResizeShown && shaft) {
          updateResizeGhost({ shaftId: shaft.id, end: 'top' }, { floor: shaft.topFloor, x: shaft.x })
          visualResizeShown = true
        }
      } else if (ghostVisible && hoverPreviewRequiresClear(placementDrag !== null, hoverPreviewToolIdentity, buildToolRef.current)) {
        controller.setGhost(null)
        controller.setPlacementRange([])
        hoverPreviewToolIdentity = null
        ghostVisible = false
      }
      // Presentation glides share the pause: interpolating toward positions the
      // sim is no longer producing would drift the render away from state.
      controller.render(state, stepDt)
      renderMetricsAccum += dt
      if (renderMetricsAccum >= RENDER_METRICS_INTERVAL_SEC) {
        renderMetricsAccum %= RENDER_METRICS_INTERVAL_SEC
        onRenderMetricsRef.current?.(controller.getRenderMetrics())
      }
      const viewport = controller.getViewport()
      if (
        lastViewport === null
        || Math.abs(viewport.centerFloor - lastViewport.centerFloor) > 0.001
        || Math.abs(viewport.minFloor - lastViewport.minFloor) > 0.001
        || Math.abs(viewport.maxFloor - lastViewport.maxFloor) > 0.001
      ) {
        lastViewport = viewport
        onViewportChangeRef.current?.(viewport)
      }
      if (!visualReadyMarked && visualTestConfig !== null) {
        visualReadyFrames = controller.isReady() ? visualReadyFrames + 1 : 0
        if (visualReadyFrames >= 8) {
          visualReadyMarked = true
          markVisualReady()
        }
      }
    }

    const park = (): void => {
      if (!parked) {
        parked = true
        cancelAnimationFrame(rafId)
      }
    }
    const wake = (): void => {
      if (parked) {
        parked = false
        lastTime = performance.now()
        rafId = requestAnimationFrame(frame)
      }
    }
    const onVisibility = (): void => {
      if (document.hidden) {
        park()
      } else {
        wake()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = stateRef.current
      const action = keyboardActionForKey(event.key, event.shiftKey)
      if (!action) {
        return
      }
      if (action.type === 'pan') {
        controller.panBy(action.dx, action.dy)
      } else if (action.type === 'zoom') {
        controller.zoomBy(action.factor)
      } else if (action.type === 'cancel') {
        onToolCancelRef.current?.()
      } else {
        const rect = canvas.getBoundingClientRect()
        const tile = controller.screenToTile(rect.width / 2, rect.height / 2)
        if (!tile) {
          return
        }
        const tool = buildToolRef.current
        if (!tool) {
          onSelectTileRef.current?.(tile)
        } else {
          const command = buildToolCommand(tool, tile, tile)
          if (validatePlacement(state, command).ok) {
            onPlaceCommandRef.current?.(command)
          }
        }
      }
      event.preventDefault()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const tileAt = (e: PointerEvent): Tile | null => {
      const rect = canvas.getBoundingClientRect()
      return controller.screenToTile(e.clientX - rect.left, e.clientY - rect.top)
    }

    const reportOverlaySample = (tile: Tile): void => {
      onOverlaySampleRef.current?.(
        activeHeatmapField && activeHeatmapKind && overlayRef.current === activeHeatmapKind
          ? sampleHeatmapField(activeHeatmapField, activeHeatmapKind, tile)
          : null,
      )
    }

    const updateGhost = (tool: SelectedTool, anchor: Tile, current: Tile, bulkMode: boolean): void => {
      ghostVisible = true
      if (bulkMode && !tool.isShaft) {
        const state = stateRef.current
        const commands = bulkPlaceCommands(tool, anchor, current, state)
        controller.setGhost(bulkGhostsForCommands(state, commands))
        controller.setPlacementRange(placementRangeTiles(state, commands))
        return
      }

      const state = stateRef.current
      const cmd = buildToolCommand(tool, anchor, current)
      controller.setGhost(ghostForCommand(cmd, state, validatePlacement(state, cmd).ok))
      controller.setPlacementRange(cmd.type === 'place' ? placementRangeTiles(state, [cmd]) : [])
    }

    const updateResizeGhost = (cap: ShaftCapHit, tile: Tile): void => {
      hoverPreviewToolIdentity = null
      const state = stateRef.current
      const command = shaftResizeCommandForDrag(state, cap, tile.floor, { moved: true, toolActive: false })
      const shaft = state.shafts.find((candidate) => candidate.id === cap.shaftId)
      if (!command || !shaft) {
        return
      }
      const verdict = shaftResizePreview(state, command)
      controller.setGhost({
        floor: command.bottomFloor,
        x: shaft.x,
        widthTiles: shaftDef(shaft.kind).width,
        storeys: Math.max(1, command.topFloor - command.bottomFloor + 1),
        valid: verdict.ok,
      })
      controller.setPlacementRange([])
      ghostVisible = true
      setResizeReadout(verdict.ok ? { cost: verdict.cost, refund: verdict.refund, reason: null } : { cost: 0, refund: 0, reason: verdict.reason })
    }

    let panning = false
    let ghostVisible = false
    let hoverPreviewToolIdentity: string | null = null
    let placementDrag: PlacementDragSession | null = null
    let resizeDrag: ShaftCapHit | null = null
    let shiftPressed = false
    let downAt = { x: 0, y: 0 }
    let moved = false
    let lastPointer = { x: 0, y: 0 }

    // Active touch/pen pointers for pinch + two-finger pan (mouse stays single-pointer).
    const touchPointers = new Map<number, { x: number; y: number }>()
    let pinch: PinchSnapshot | null = null

    const firstTwoPointers = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
      if (touchPointers.size < 2) {
        return null
      }
      const values = touchPointers.values()
      const a = values.next().value as { x: number; y: number }
      const b = values.next().value as { x: number; y: number }
      return [a, b]
    }

    const cancelSinglePointerAction = (): void => {
      panning = false
      placementDrag = null
      resizeDrag = null
      hoverPreviewToolIdentity = null
      setResizeReadout(null)
      if (ghostVisible) {
        controller.setGhost(null)
        controller.setPlacementRange([])
        ghostVisible = false
      }
    }

    const beginOrRebaselinePinch = (): void => {
      const pair = firstTwoPointers()
      if (pair) {
        pinch = pinchSnapshot(pair[0], pair[1])
      }
    }

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse') {
        touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        canvas.setPointerCapture(e.pointerId)
        if (touchPointers.size >= 2) {
          cancelSinglePointerAction() // a second finger arrived → switch to pinch/two-finger pan
          beginOrRebaselinePinch()
          return
        }
      }
      if (e.button !== 0) {
        return
      }
      downAt = { x: e.clientX, y: e.clientY }
      lastPointer = downAt
      moved = false
      const tool = buildToolRef.current
      const tile = tileAt(e)
      if (tool && tile) {
        placementDrag = beginPlacementDrag(tool, tile, e.pointerId, e.shiftKey || shiftPressed)
        hoverPreviewToolIdentity = null
        updateGhost(placementDrag.tool, tile, tile, placementDrag.bulkMode)
      } else if (tile) {
        resizeDrag = shaftCapAt(stateRef.current, tile)
        panning = resizeDrag === null
      } else {
        panning = true
      }
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (touchPointers.has(e.pointerId)) {
        touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      }
      if (pinch && touchPointers.size >= 2) {
        const pair = firstTwoPointers()
        if (pair) {
          const next = pinchSnapshot(pair[0], pair[1])
          const update = pinchUpdate(pinch, next)
          const rect = canvas.getBoundingClientRect()
          controller.zoomBy(update.zoomFactor, controller.screenToWorld(update.focusX - rect.left, update.focusY - rect.top))
          controller.panBy(update.panDxPx, update.panDyPx)
          pinch = next
        }
        return
      }
      if (Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > CLICK_SLOP_PX) {
        moved = true
      }
      if (resizeDrag) {
        const tile = tileAt(e)
        if (moved && tile) {
          updateResizeGhost(resizeDrag, tile)
        }
        return
      }
      if (placementDrag?.pointerId === e.pointerId) {
        const tile = tileAt(e)
        if (tile) {
          updateGhost(placementDrag.tool, placementDrag.anchor, tile, placementDrag.bulkMode)
        }
        return
      }
      const tool = buildToolRef.current
      if (!panning && placementDrag === null && tool) {
        const tile = tileAt(e)
        if (tile) {
          updateGhost(tool, tile, tile, false)
          hoverPreviewToolIdentity = toolIdentity(tool)
        }
        return
      }
      if (panning) {
        controller.panBy(lastPointer.x - e.clientX, e.clientY - lastPointer.y)
        lastPointer = { x: e.clientX, y: e.clientY }
      }
    }
    const onPointerUp = (e: PointerEvent): void => {
      if (touchPointers.has(e.pointerId)) {
        touchPointers.delete(e.pointerId)
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId)
        }
        if (pinch) {
          if (touchPointers.size >= 2) {
            beginOrRebaselinePinch() // 3+ fingers: re-anchor on the remaining pair
          } else {
            pinch = null
            // Hand a surviving finger a fresh pan baseline so it neither jumps nor fires a click.
            moved = true
            placementDrag = null
            const rest = touchPointers.values().next().value as { x: number; y: number } | undefined
            panning = rest !== undefined && !buildToolRef.current
            if (rest) {
              lastPointer = { x: rest.x, y: rest.y }
              downAt = { x: rest.x, y: rest.y }
            }
          }
          return
        }
      }
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId)
      }
      const tool = buildToolRef.current
      if (resizeDrag) {
        const tile = tileAt(e)
        const command = tile
          ? shaftResizeCommandForDrag(stateRef.current, resizeDrag, tile.floor, { moved, toolActive: tool !== null })
          : null
        if (command) {
          onPlaceCommandRef.current?.(command)
        } else if (!moved && tile) {
          reportOverlaySample(tile)
          onSelectTileRef.current?.(tile) // plain click on an empty machinery tile — normal tile click (deselect)
        }
        resizeDrag = null
        controller.setGhost(null)
        controller.setPlacementRange([])
        ghostVisible = false
        setResizeReadout(null)
        panning = false
        return
      }
      if (placementDrag?.pointerId === e.pointerId) {
        const finishedDrag = placementDrag
        const tile = tileAt(e) ?? finishedDrag.anchor
        const commands = finishedDrag.bulkMode
          ? bulkPlaceCommands(finishedDrag.tool, finishedDrag.anchor, tile, stateRef.current)
          : [buildToolCommand(finishedDrag.tool, finishedDrag.anchor, tile)]
        for (const command of commands) {
          onPlaceCommandRef.current?.(command)
        }
        placementDrag = null
        hoverPreviewToolIdentity = null
        controller.setGhost(null)
        controller.setPlacementRange([])
        ghostVisible = false
      } else if (panning && !moved) {
        const tile = tileAt(e)
        if (tile) {
          reportOverlaySample(tile)
          const toggle = stopToggleCommandForClick(stateRef.current, tile, { moved, toolActive: tool !== null })
          if (toggle) {
            onToggleStopRef.current?.(toggle)
          }
          onSelectTileRef.current?.(tile)
        }
      }
      panning = false
    }
    const onPointerCancel = (e: PointerEvent): void => {
      if (touchPointers.has(e.pointerId)) {
        touchPointers.delete(e.pointerId)
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId)
        }
      }
      if (touchPointers.size < 2) {
        pinch = null
      }
      cancelSinglePointerAction()
    }
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      placementDrag = null
      resizeDrag = null
      hoverPreviewToolIdentity = null
      controller.setGhost(null)
      controller.setPlacementRange([])
      ghostVisible = false
      setResizeReadout(null)
      onToolCancelRef.current?.()
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      if (e.ctrlKey) {
        // Trackpad pinch (or ctrl+wheel) → zoom anchored at the cursor.
        const deltaY = normalizeWheelPx(e.deltaY, e.deltaMode, rect.height)
        controller.zoomBy(wheelZoomFactor(deltaY), controller.screenToWorld(e.clientX - rect.left, e.clientY - rect.top))
        return
      }
      // Plain wheel / trackpad two-finger scroll → pan.
      const { panDxPx, panDyPx } = wheelPanDelta(
        normalizeWheelPx(e.deltaX, e.deltaMode, rect.width),
        normalizeWheelPx(e.deltaY, e.deltaMode, rect.height),
      )
      controller.panBy(panDxPx, panDyPx)
    }
    const onModifierKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Shift') {
        shiftPressed = true
      }
    }
    const onModifierKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Shift') {
        shiftPressed = false
      }
    }
    const onWindowBlur = (): void => {
      shiftPressed = false
      cancelSinglePointerAction()
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', onModifierKeyDown)
    window.addEventListener('keyup', onModifierKeyUp)
    window.addEventListener('blur', onWindowBlur)

    // Pause rendering (not the sim) on GPU context loss; the controller rebuilds
    // GPU resources before onRestored fires, so we just resume the render path.
    controller.setContextLossHandlers({
      onLost: () => {
        renderPaused = true
        setContextRecovering(true)
      },
      onRestored: () => {
        renderPaused = false
        lastTime = performance.now() // avoid one huge catch-up dt after the gap
        setContextRecovering(false)
      },
    })

    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', onModifierKeyDown)
      window.removeEventListener('keyup', onModifierKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      resizeObserver.disconnect()
      controller.dispose()
    }
  }, [buildToolRef, commandQueueRef, initAttempt])

  return (
    <>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Tower playfield. Use arrow keys or WASD to pan, plus and minus to zoom, and Enter to inspect or build at the center."
        className="h-full w-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300"
      />
      {rendererError !== null && (
        <RendererUnavailable
          detail={rendererError}
          onRetry={() => setInitAttempt((attempt) => attempt + 1)}
          onExit={() => onExit?.()}
        />
      )}
      {contextRecovering && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-amber-400/60 bg-slate-950/90 px-3 py-1.5 text-sm font-semibold text-amber-100 shadow-lg"
          data-testid="context-recovering"
          role="status"
        >
          Renderer recovering…
        </div>
      )}
      {resizeReadout && (
        <div
          className={`pointer-events-none absolute bottom-4 left-1/2 max-w-72 -translate-x-1/2 rounded-md border px-3 py-1.5 text-sm font-bold shadow-lg ${
            resizeReadout.reason === null
              ? 'border-emerald-400/60 bg-slate-950/90 text-emerald-100'
              : 'border-red-400/60 bg-red-950/90 text-red-100'
          }`}
          data-testid="shaft-resize-readout"
        >
          {resizeReadout.reason ??
            (resizeReadout.cost > resizeReadout.refund
              ? `${currency(currency(resizeReadout.cost).subtract(resizeReadout.refund).value, { precision: 0 }).format()} cost`
              : `${currency(currency(resizeReadout.refund).subtract(resizeReadout.cost).value, { precision: 0 }).format()} refund`)}
        </div>
      )}
    </>
  )
}
