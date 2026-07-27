/**
 * Shell/controller: owns the engine state's lifecycle (new game / resume /
 * autosave), HUD composition, and the command queue — the single mutation
 * path into the engine. The scene steps the sim; components stay
 * presentational and enqueue commands through the callbacks here.
 */
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useGameSounds } from './audio/useGameSounds'
import { isBlockingModalOpen } from './blockingModals'
import { encodeChallengeCode, randomSeed } from './challengeCode'
import { isStateChangingCommand } from './dirtyCommands'
import { itemDef } from './engine/catalog'
import { createEngineState } from './engine/engine'
import { isSlabFamily, selectableAt } from './engine/grid'
import { catchmentField as computeCatchmentField } from './engine/heatmaps'
import { CITY_TOWER, getMap } from './engine/maps'
import { evalBreakdown } from './engine/occupancy'
import { buildScenario } from './engine/scenarios'
import {
  claimSandboxSlot,
  clearSandbox,
  exportSandbox,
  getOrCreateTabSessionId,
  importSandbox,
  isSandboxSlotOwnedByAnotherTab,
  loadSandbox,
  loadSandboxSlotSummaries,
  recordMilestone,
  restoreSandbox,
  sandboxLoadFailure,
  sandboxOwnerStorageKey,
  saveSandbox,
} from './gameProgress'
import {
  type EngineCommand,
  type EngineEvent,
  type EngineState,
  type GameSpeed,
  type HudSnapshot,
  SANDBOX_SLOT_LABELS,
  type SandboxSlotId,
} from './gameTypes'
import { BuildPalette, type SelectedTool } from './hud/BuildPalette'
import { CameraControls } from './hud/CameraControls'
import { DisplaySettings } from './hud/DisplaySettings'
import { FinancialsPanel } from './hud/FinancialsPanel'
import { FloorNavigator, floorRangeForState } from './hud/FloorNavigator'
import { GettingStarted } from './hud/GettingStarted'
import { FireBanner, IncidentBanner } from './hud/IncidentBanner'
import { InspectPanel, type InspectSelection } from './hud/InspectPanel'
import { LoanDialog } from './hud/LoanDialog'
import { ObservationDeckHint } from './hud/ObservationDeckHint'
import { type OverlayChoice, OverlayToggles } from './hud/OverlayToggles'
import { RenderPoolReadout } from './hud/RenderPoolReadout'
import { SaveHealthReadout } from './hud/SaveHealthReadout'
import { SpeedControls } from './hud/SpeedControls'
import {
  appendToastHistory,
  ToastHistoryButton,
  ToastHistoryDrawer,
  type ToastHistoryItem,
} from './hud/ToastHistoryDrawer'
import { type ToastItem, Toasts, toastsFromEvents } from './hud/Toasts'
import { TopBar } from './hud/TopBar'
import { NewGameOverlay } from './overlays/NewGameOverlay'
import { SaveLoadOverlay } from './overlays/SaveLoadOverlay'
import { ShortcutHelpOverlay } from './overlays/ShortcutHelpOverlay'
import { TowerComplete } from './overlays/TowerComplete'
import type { CameraViewport } from './scene/camera'
import { measureDynamicPoolUtilization } from './scene/dynamicPools'
import type { HeatmapTileSample } from './scene/heatmapLayer'
import type { RenderMetrics, SceneController } from './scene/sceneController'
import { STYLE_GATE_PERSON_CAP } from './scene/styleGateArt'
import { TowerScene } from './TowerScene'
import { useCloudSaveSync } from './useCloudSaveSync'
import { type AutosaveOutcome, useDirtyAutosave } from './useDirtyAutosave'
import { usePresentationPrefs } from './usePresentationPrefs'
import { useTowerKeyboardShortcuts } from './useTowerKeyboardShortcuts'
import { getVisualTestConfig, visualToastHistoryFixture } from './visualTestMode'

type GameMode = 'run' | 'build'

type SaveMessage = { kind: 'success' | 'error'; text: string }

/** One press of the HUD zoom buttons; matches roughly one wheel notch. */
const ZOOM_STEP = 1.25

interface CatchmentCache {
  structureVersion: number
  fields: Map<number, Float32Array>
}

const catchmentCache = new WeakMap<EngineState, CatchmentCache>()

function storageFailureMessage(reason: 'storageUnavailable' | 'quotaExceeded' | 'slotOwnedByAnotherTab'): string {
  if (reason === 'slotOwnedByAnotherTab') {
    return 'This save is open in another tab. Autosave stopped here to prevent overwriting newer progress.'
  }

  return reason === 'storageUnavailable' ? 'Browser storage is unavailable.' : 'Browser storage is full. The save was not written.'
}

function importFailureMessage(reason: 'invalidJson' | 'invalidPayload' | 'storageUnavailable' | 'quotaExceeded'): string {
  switch (reason) {
    case 'invalidJson':
      return 'Import failed: the JSON is incomplete or malformed.'
    case 'invalidPayload':
      return 'Import failed: the payload is not a compatible Tower Throwback save.'
    case 'storageUnavailable':
    case 'quotaExceeded':
      return storageFailureMessage(reason)
  }
}

function slotLabel(slotId: SandboxSlotId): string {
  return SANDBOX_SLOT_LABELS[slotId]
}

/**
 * A save on a map this build does not know is intact — it just needs a newer
 * version. Saying "empty or unreadable" would tell the player their tower is
 * gone when it is not.
 */
function slotFailureMessage(slotId: SandboxSlotId): string {
  return sandboxLoadFailure(slotId) === 'unknownMap'
    ? `${slotLabel(slotId)} was built on a map this version doesn't have. Update to load it.`
    : `${slotLabel(slotId)} is empty or unreadable.`
}

export function catchmentFieldForSelection(state: EngineState | null, selection: InspectSelection | null): Float32Array | null {
  if (!state || !selection || selection.type !== 'unit' || itemDef(selection.unit.kind).category !== 'commerce') {
    return null
  }

  let cache = catchmentCache.get(state)
  if (!cache || cache.structureVersion !== state.structureVersion) {
    cache = { structureVersion: state.structureVersion, fields: new Map() }
    catchmentCache.set(state, cache)
  }

  let field = cache.fields.get(selection.unit.id)
  if (!field) {
    field = computeCatchmentField(state, selection.unit)
    cache.fields.set(selection.unit.id, field)
  }

  return field
}

export function saveAndExit(
  state: EngineState,
  slotId: SandboxSlotId,
  sessionId: string,
  navigate: () => void,
  persist: typeof saveSandbox = saveSandbox,
): ReturnType<typeof saveSandbox> {
  const result = persist(state, slotId, sessionId)
  if (result.ok) {
    navigate()
  }
  return result
}

export function TowerGame(): ReactElement {
  const visualTestConfig = getVisualTestConfig()
  const visualTestMode = visualTestConfig !== null
  const [engineState, setEngineState] = useState<EngineState | null>(() => {
    if (!visualTestConfig) {
      return null
    }
    const state = buildScenario(visualTestConfig.scenario, visualTestConfig.seed)
    if (visualTestConfig.time !== null) {
      state.clock.minute = visualTestConfig.time === 'day' ? 720 : 60
    }
    state.speed = 0
    return state
  })
  const [runId, setRunId] = useState(0)

  const commandQueueRef = useRef<EngineCommand[]>([])
  const buildToolRef = useRef<SelectedTool | null>(null)
  const engineStateRef = useRef<EngineState | null>(engineState)
  const activeSlotRef = useRef<SandboxSlotId>('autosave')
  const sandboxSessionIdRef = useRef(getOrCreateTabSessionId())
  const sceneControllerRef = useRef<SceneController | null>(null)

  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null)
  const [mode, setMode] = useState<GameMode>('run')
  const [selectedTool, setSelectedTool] = useState<SelectedTool | null>(null)
  const [selection, setSelection] = useState<InspectSelection | null>(null)
  const [overlay, setOverlay] = useState<OverlayChoice>(
    visualTestConfig?.surface === 'eval' ? 'eval' : visualTestConfig?.surface === 'heatmap' ? 'noise' : null,
  )
  const [overlaySample, setOverlaySample] = useState<HeatmapTileSample | null>(null)
  const [cameraViewport, setCameraViewport] = useState<CameraViewport | null>(null)
  const [renderMetrics, setRenderMetrics] = useState<RenderMetrics | null>(null)
  const handleRenderMetrics = useCallback((metrics: RenderMetrics) => {
    setRenderMetrics(metrics)
    // Expose the GPU draw-call count so the Playwright draw-call budget spec can
    // assert against the real renderer, not scraped HUD text.
    if (visualTestMode && typeof window !== 'undefined') {
      window.__TOWER_DRAW_CALLS__ = metrics.drawCalls
    }
  }, [visualTestMode])
  const [showFinancials, setShowFinancials] = useState(false)
  const [showSaveLoad, setShowSaveLoad] = useState(visualTestConfig?.surface === 'disasters')
  const [slotSummaries, setSlotSummaries] = useState(loadSandboxSlotSummaries)
  const [activeSlotId, setActiveSlotId] = useState<SandboxSlotId>('autosave')
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)
  const [exportText, setExportText] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [toastHistory, setToastHistory] = useState<ToastHistoryItem[]>(() =>
    visualTestConfig?.surface === 'toastHistory' ? visualToastHistoryFixture() : [],
  )
  const [showToastHistory, setShowToastHistory] = useState(visualTestConfig?.surface === 'toastHistory')
  const [showTowerCard, setShowTowerCard] = useState(false)
  const [showShortcutHelp, setShowShortcutHelp] = useState(false)

  const presentation = usePresentationPrefs()

  // Presentation preferences are pushed into the scene, never into the engine.
  useEffect(() => {
    sceneControllerRef.current?.setDiagnosticPalette(presentation.diagnosticPalette)
  }, [presentation.diagnosticPalette])
  useEffect(() => {
    sceneControllerRef.current?.setReducedMotion(presentation.motionReduced)
  }, [presentation.motionReduced])

  const { playEvents, muted, toggleMute, level, setLevel } = useGameSounds(snapshot)
  const playEventsRef = useRef(playEvents)

  useEffect(() => {
    playEventsRef.current = playEvents
  }, [playEvents])

  useEffect(() => {
    engineStateRef.current = engineState
  }, [engineState])

  useEffect(() => {
    activeSlotRef.current = activeSlotId
  }, [activeSlotId])

  const markDirtyRef = useRef<() => void>(() => {})

  const enqueue = useCallback((cmd: EngineCommand) => {
    commandQueueRef.current.push(cmd)
    if (isStateChangingCommand(cmd)) {
      markDirtyRef.current()
    }
  }, [])

  const selectTool = useCallback((tool: SelectedTool | null) => {
    buildToolRef.current = tool
    setSelectedTool(tool)
    sceneControllerRef.current?.setBuildMode(tool !== null)
  }, [])

  const refreshSlots = useCallback(() => {
    setSlotSummaries(loadSandboxSlotSummaries())
  }, [])

  const localSavedSlots = useMemo(
    () => new Set(slotSummaries.filter((slot) => slot.saved).map((slot) => slot.id)),
    [slotSummaries],
  )
  const cloud = useCloudSaveSync(localSavedSlots)

  // Mirror the just-written local slot to the cloud (best-effort; never blocks).
  const mirrorToCloud = useCallback((slotId: SandboxSlotId) => {
    if (!cloud.enabled) {
      return
    }
    const saved = loadSandbox(slotId)
    if (saved) {
      cloud.pushSlot(slotId, saved)
    }
  }, [cloud])

  const restoreFromCloud = useCallback((slotId: SandboxSlotId) => {
    void (async () => {
      const restored = await cloud.restore(slotId)
      refreshSlots()
      setSaveMessage(
        restored
          ? { kind: 'success', text: `Restored ${slotLabel(slotId)} from the cloud.` }
          : { kind: 'error', text: `Could not restore ${slotLabel(slotId)} from the cloud.` },
      )
    })()
  }, [cloud, refreshSlots])

  const takeOverCloudSlot = useCallback((slotId: SandboxSlotId) => {
    void (async () => {
      const ok = await cloud.takeOver(slotId)
      if (ok) {
        mirrorToCloud(slotId)
        setSaveMessage({ kind: 'success', text: `Took over ${slotLabel(slotId)}. Cloud sync resumed.` })
      } else {
        setSaveMessage({ kind: 'error', text: `Could not take over ${slotLabel(slotId)}.` })
      }
    })()
  }, [cloud, mirrorToCloud])

  const leaveGameForSlotConflict = useCallback((slotId: SandboxSlotId) => {
    setEngineState(null)
    setRunId((id) => id + 1)
    setActiveSlotId(slotId)
    setSelection(null)
    setOverlaySample(null)
    selectTool(null)
    setMode('run')
    setShowSaveLoad(false)
    refreshSlots()
    setSaveMessage({
      kind: 'error',
      text: `${slotLabel(slotId)} was opened in another tab, so this tab stopped autosaving to avoid overwriting newer progress.`,
    })
  }, [refreshSlots, selectTool])

  const startGame = useCallback((lobbyHeight: 1 | 2 | 3, seed?: number, mapId: string = CITY_TOWER.id) => {
    clearSandbox('autosave')
    // A supplied seed replays a shared challenge; it selects a different point
    // in the same rng stream and changes no draw counts or ordering.
    const state = createEngineState({ seed: seed ?? randomSeed(), mapId, lobbyHeight })
    recordMilestone('started')
    const result = saveSandbox(state, 'autosave', sandboxSessionIdRef.current)
    if (!result.ok) {
      setSaveMessage({ kind: 'error', text: storageFailureMessage(result.reason) })
    }
    if (result.ok) {
      claimSandboxSlot('autosave', sandboxSessionIdRef.current)
      mirrorToCloud('autosave')
    }
    setActiveSlotId('autosave')
    refreshSlots()
    setEngineState(state)
    setRunId((id) => id + 1)
    setSelection(null)
    setOverlaySample(null)
    selectTool(null)
    setMode('run')
  }, [mirrorToCloud, refreshSlots, selectTool])

  const resumeGame = useCallback((slotId: SandboxSlotId) => {
    const saved = loadSandbox(slotId)
    if (saved) {
      claimSandboxSlot(slotId, sandboxSessionIdRef.current)
      cloud.openSlot(slotId)
      setEngineState(restoreSandbox(saved))
      setRunId((id) => id + 1)
      setActiveSlotId(slotId)
      setSelection(null)
      setOverlaySample(null)
      selectTool(null)
      setMode('run')
    }
  }, [cloud, selectTool])

  const onSnapshot = useCallback((snap: HudSnapshot) => setSnapshot(snap), [])

  const onEvents = useCallback((events: EngineEvent[]) => {
    const state = engineStateRef.current
    if (!state) {
      return
    }
    playEventsRef.current(events)
    const newToasts = toastsFromEvents(events, state.clock)
    if (newToasts.length > 0) {
      const toastClock = { ...state.clock }
      // Cap the COMBINED list — capping only prev lets one large batch
      // (e.g. a bulk-build rejection wave) flood the stack unbounded.
      setToasts((prev) => [...prev, ...newToasts].slice(-7))
      setToastHistory((history) => appendToastHistory(history, newToasts, toastClock))
    }
    for (const event of events) {
      if (event.type === 'milestone') {
        recordMilestone(event.milestone)
      }
      if (event.type === 'towerAchieved') {
        setShowTowerCard(true)
      }
      if (event.type === 'settlement' || event.type === 'starUp') {
        const result = saveSandbox(state, activeSlotRef.current, sandboxSessionIdRef.current)
        if (result.ok) {
          refreshSlots()
          mirrorToCloud(activeSlotRef.current)
        } else if (result.reason === 'slotOwnedByAnotherTab') {
          leaveGameForSlotConflict(activeSlotRef.current)
        }
      }
      if (event.type === 'demolished') {
        setSelection((prev) => {
          if (!prev) {
            return prev
          }
          const stillThere =
            prev.type === 'unit'
              ? state.units.some((u) => u.id === prev.unit.id)
              : state.shafts.some((s) => s.id === prev.shaft.id)
          return stillThere ? prev : null
        })
      }
    }
  }, [leaveGameForSlotConflict, mirrorToCloud, refreshSlots])

  const onSelectTile = useCallback((tile: { floor: number; x: number }) => {
    const state = engineStateRef.current
    if (!state) {
      return
    }
    setSelection(selectableAt(state, tile.floor, tile.x))
  }, [])

  const onToolCancel = useCallback(() => selectTool(null), [selectTool])

  const onDemolish = useCallback(
    (sel: InspectSelection) => {
      enqueue(sel.type === 'unit' ? { type: 'demolishUnit', unitId: sel.unit.id } : { type: 'demolishShaft', shaftId: sel.shaft.id })
      setSelection(null)
    },
    [enqueue],
  )

  const saveToSlot = useCallback((slotId: SandboxSlotId) => {
    const state = engineStateRef.current
    if (!state) {
      return
    }

    // Take ownership BEFORE writing: an explicit manual save should always win,
    // and claiming first means the write's ownership gate never rejects our own save.
    claimSandboxSlot(slotId, sandboxSessionIdRef.current)
    const result = saveSandbox(state, slotId, sandboxSessionIdRef.current)
    if (result.ok) {
      refreshSlots()
      mirrorToCloud(slotId)
      setSaveMessage({ kind: 'success', text: `Saved to ${slotLabel(slotId)}.` })
      return
    }

    setSaveMessage({ kind: 'error', text: storageFailureMessage(result.reason) })
  }, [mirrorToCloud, refreshSlots])

  const loadFromSlot = useCallback((slotId: SandboxSlotId) => {
    const saved = loadSandbox(slotId)
    if (!saved) {
      setSaveMessage({ kind: 'error', text: slotFailureMessage(slotId) })
      return
    }

    claimSandboxSlot(slotId, sandboxSessionIdRef.current)
    cloud.openSlot(slotId)
    setEngineState(restoreSandbox(saved))
    setRunId((id) => id + 1)
    setActiveSlotId(slotId)
    setSelection(null)
    setOverlaySample(null)
    selectTool(null)
    setMode('run')
    setShowSaveLoad(false)
    setSaveMessage({ kind: 'success', text: `Loaded ${slotLabel(slotId)}.` })
  }, [cloud, selectTool])

  const exportSlot = useCallback((slotId: SandboxSlotId) => {
    const saved = loadSandbox(slotId)
    if (!saved) {
      setExportText('')
      setSaveMessage({ kind: 'error', text: `${slotLabel(slotId)} is empty or unreadable.` })
      return
    }

    setExportText(exportSandbox(saved))
    setSaveMessage({ kind: 'success', text: `Exported ${slotLabel(slotId)}.` })
  }, [])

  const importToSlot = useCallback((slotId: SandboxSlotId, raw: string): SaveMessage => {
    const result = importSandbox(raw, slotId)
    if (!result.ok) {
      const message = { kind: 'error' as const, text: importFailureMessage(result.reason) }
      setSaveMessage(message)
      return message
    }

    claimSandboxSlot(slotId, sandboxSessionIdRef.current)
    refreshSlots()
    mirrorToCloud(slotId)
    const message = { kind: 'success' as const, text: `Imported to ${slotLabel(slotId)}.` }
    setSaveMessage(message)
    return message
  }, [mirrorToCloud, refreshSlots])

  const clearSlot = useCallback((slotId: SandboxSlotId) => {
    clearSandbox(slotId)
    refreshSlots()
    cloud.remove(slotId)
    setExportText('')
    setSaveMessage({ kind: 'success', text: `Cleared ${slotLabel(slotId)}.` })
  }, [cloud, refreshSlots])

  /**
   * The dirty-autosave write. Shares the ownership gate with every other save
   * path: a slot claimed by another tab refuses the write and tears this
   * session down rather than overwriting newer progress.
   */
  const persistCurrentTower = useCallback((): AutosaveOutcome => {
    const state = engineStateRef.current
    if (!state) {
      return { ok: true }
    }
    const slotId = activeSlotRef.current
    const result = saveSandbox(state, slotId, sandboxSessionIdRef.current)
    if (result.ok) {
      refreshSlots()
      mirrorToCloud(slotId)
      return { ok: true }
    }
    if (result.reason === 'slotOwnedByAnotherTab') {
      leaveGameForSlotConflict(slotId)
      return { ok: false, error: storageFailureMessage(result.reason), conflict: true }
    }
    return { ok: false, error: storageFailureMessage(result.reason), conflict: false }
  }, [leaveGameForSlotConflict, mirrorToCloud, refreshSlots])

  const autosave = useDirtyAutosave({
    save: persistCurrentTower,
    enabled: !visualTestMode && engineState !== null,
  })

  useEffect(() => {
    markDirtyRef.current = autosave.markDirty
  }, [autosave.markDirty])

  // Drives only the "saved 30s ago" relative time. Kept off the render path's
  // clock so the readout does not re-render the HUD every frame.
  const [saveHealthNow, setSaveHealthNow] = useState(() => Date.now())
  useEffect(() => {
    if (visualTestMode) {
      return
    }
    const id = setInterval(() => setSaveHealthNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [visualTestMode])

  // Autosave on tab hide and unmount.
  useEffect(() => {
    if (visualTestMode) {
      return
    }

    const save = (): void => {
      const state = engineStateRef.current
      if (state) {
        const slotId = activeSlotRef.current
        if (isSandboxSlotOwnedByAnotherTab(slotId, sandboxSessionIdRef.current)) {
          leaveGameForSlotConflict(slotId)
          return
        }
        saveSandbox(state, slotId, sandboxSessionIdRef.current)
      }
    }
    const onVisibility = (): void => {
      if (document.hidden) {
        save()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      save()
    }
  }, [leaveGameForSlotConflict, visualTestMode])

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      const slotId = activeSlotRef.current
      if (event.key === sandboxOwnerStorageKey(slotId) && event.newValue && event.newValue !== sandboxSessionIdRef.current) {
        leaveGameForSlotConflict(slotId)
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [leaveGameForSlotConflict])

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'run' ? 'build' : 'run'
      if (next === 'run') {
        selectTool(null)
      }
      return next
    })
  }, [selectTool])

  const setSpeed = useCallback((speed: GameSpeed) => enqueue({ type: 'setSpeed', speed }), [enqueue])
  const setFastMode = useCallback((enabled: boolean) => enqueue({ type: 'setFastMode', enabled }), [enqueue])
  const setDisastersEnabled = useCallback((enabled: boolean) => enqueue({ type: 'setDisastersEnabled', enabled }), [enqueue])
  const toggleFinancials = useCallback(() => setShowFinancials((v) => !v), [])
  const toggleToastHistory = useCallback(() => setShowToastHistory((visible) => !visible), [])
  const toggleShortcutHelp = useCallback(() => setShowShortcutHelp((visible) => !visible), [])
  const changeOverlay = useCallback((nextOverlay: OverlayChoice) => {
    setOverlaySample(null)
    setOverlay(nextOverlay)
  }, [])
  const onSceneController = useCallback((controller: SceneController) => {
    sceneControllerRef.current = controller
    // A controller can be replaced after a renderer rebuild, so presentation
    // preferences are re-applied here rather than only on the prefs effect.
    controller.setDiagnosticPalette(presentation.diagnosticPalette)
    controller.setReducedMotion(presentation.motionReduced)
    controller.setBuildMode(buildToolRef.current !== null)
  }, [presentation.diagnosticPalette, presentation.motionReduced])
  const goToFloor = useCallback((floor: number) => {
    sceneControllerRef.current?.goToFloor(floor)
  }, [])
  const zoomIn = useCallback(() => sceneControllerRef.current?.zoomBy(1 / ZOOM_STEP), [])
  const zoomOut = useCallback(() => sceneControllerRef.current?.zoomBy(ZOOM_STEP), [])
  const fitTower = useCallback(() => sceneControllerRef.current?.fitTower(), [])
  const saveCurrentTowerAndExit = useCallback(() => {
    const state = engineStateRef.current
    if (!state) {
      return
    }
    const result = saveAndExit(
      state,
      activeSlotRef.current,
      sandboxSessionIdRef.current,
      () => window.location.assign('/'),
    )
    if (!result.ok) {
      setSaveMessage({ kind: 'error', text: storageFailureMessage(result.reason) })
      refreshSlots()
      setShowSaveLoad(true)
    }
  }, [refreshSlots])

  useTowerKeyboardShortcuts(
    {
      speed: snapshot?.speed ?? engineState?.speed ?? 1,
      overlay,
      hasSelectedTool: selectedTool !== null,
      hasSelection: selection !== null || overlaySample !== null,
      modalOpen: engineState === null || snapshot?.pendingLoanPrompt !== null || showSaveLoad || showTowerCard,
      helpOpen: showShortcutHelp,
    },
    {
      onSetSpeed: setSpeed,
      onToggleBuildMode: toggleMode,
      onCancelTool: onToolCancel,
      onDeselect: () => {
        setSelection(null)
        setOverlaySample(null)
      },
      onSetOverlay: changeOverlay,
      onToggleMute: toggleMute,
      onToggleFinancials: toggleFinancials,
      onToggleToastHistory: toggleToastHistory,
      onToggleHelp: toggleShortcutHelp,
    },
  )

  // Reachability fields are cached per selected venue and tower structure.
  const catchmentField = catchmentFieldForSelection(engineState, selection)

  const blockingModalOpen = isBlockingModalOpen({
    saveLoadOpen: showSaveLoad,
    shortcutHelpOpen: showShortcutHelp,
    towerCardOpen: showTowerCard,
    loanPromptOpen: (snapshot?.pendingLoanPrompt ?? null) !== null,
    financialsOpen: showFinancials,
    toastHistoryOpen: showToastHistory,
  })

  if (!engineState) {
    return (
      <div className="fixed inset-0 touch-none overflow-hidden bg-slate-950 text-white">
        <NewGameOverlay slots={slotSummaries} onStart={startGame} onResume={resumeGame} onImport={importToSlot} />
      </div>
    )
  }

  const renderPoolUtilization = measureDynamicPoolUtilization(engineState, STYLE_GATE_PERSON_CAP)
  const occupiedFloors = floorRangeForState(engineState)
  const inspectorVisible = selection !== null || overlaySample !== null
  const incidentFloors = [
    ...(engineState.activeBombThreat ? [{ floor: engineState.activeBombThreat.floor, kind: 'bomb' as const }] : []),
    ...(engineState.activeFire ? [{ floor: engineState.activeFire.floor, kind: 'fire' as const }] : []),
  ]

  return (
    <div className="fixed inset-0 touch-none overflow-hidden bg-slate-950 text-white" data-map-id={engineState.mapId}>
      <div className="absolute inset-0">
        <TowerScene
          key={runId}
          engineState={engineState}
          commandQueueRef={commandQueueRef}
          buildToolRef={buildToolRef}
          onSnapshot={onSnapshot}
          onEvents={onEvents}
          onPlaceCommand={enqueue}
          onSelectTile={onSelectTile}
          onOverlaySample={setOverlaySample}
          onViewportChange={setCameraViewport}
          onRenderMetrics={handleRenderMetrics}
          onToggleStop={enqueue}
          onToolCancel={onToolCancel}
          onController={onSceneController}
          onExit={saveCurrentTowerAndExit}
          paused={blockingModalOpen}
          overlay={overlay}
          catchmentField={catchmentField}
        />
      </div>

      {snapshot && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-2">
          <div className="pointer-events-auto">
            <TopBar snapshot={snapshot} />
            <div className="mt-2">
              <RenderPoolReadout utilization={renderPoolUtilization} metrics={renderMetrics} />
            </div>
            {!visualTestMode && (
              <div className="mt-2">
                <SaveHealthReadout health={autosave.health} now={saveHealthNow} />
              </div>
            )}
            {!visualTestMode && <GettingStarted snapshot={snapshot} />}
            {!visualTestMode && <ObservationDeckHint snapshot={snapshot} />}
          </div>
          <div className="pointer-events-auto flex w-full max-w-full flex-wrap items-start justify-start gap-2 sm:w-auto sm:justify-end">
            <SpeedControls
              speed={snapshot.speed}
              fastMode={snapshot.fastMode}
              fastModeActive={snapshot.fastModeActive}
              onSetSpeed={setSpeed}
              onSetFastMode={setFastMode}
            />
            <button
              type="button"
              onClick={toggleMode}
              title="Shortcut: B"
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold shadow ${
                mode === 'build' ? 'bg-amber-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <span>{mode === 'build' ? 'Done' : 'Build'}</span>
              <kbd className="rounded bg-black/25 px-1 text-[10px]">B</kbd>
            </button>
            <button
              type="button"
              onClick={toggleFinancials}
              title="Shortcut: F"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-white/20"
            >
              <span>Financials</span>
              <kbd className="rounded bg-black/25 px-1 text-[10px]">F</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                refreshSlots()
                setShowSaveLoad(true)
              }}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-white/20"
            >
              Saves
            </button>
            <button
              type="button"
              onClick={saveCurrentTowerAndExit}
              className="rounded-md bg-emerald-500/25 px-3 py-1.5 text-sm font-semibold text-emerald-100 shadow hover:bg-emerald-500/40"
            >
              Save &amp; Exit
            </button>
            <ToastHistoryButton count={toastHistory.length} open={showToastHistory} onToggle={toggleToastHistory} />
            <OverlayToggles overlay={overlay} onSetOverlay={changeOverlay} paletteMode={presentation.diagnosticPalette} />
            <DisplaySettings
              paletteMode={presentation.diagnosticPalette}
              motion={presentation.motion}
              motionReduced={presentation.motionReduced}
              onSetPaletteMode={presentation.setDiagnosticPalette}
              onSetMotion={presentation.setMotion}
            />
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1.5 shadow">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
                title="Shortcut: M"
                className="inline-flex items-center gap-1.5 text-sm hover:opacity-80"
              >
                <span>{muted ? '🔇' : '🔊'}</span>
                <kbd className="rounded bg-black/25 px-1 text-[10px]">M</kbd>
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={level}
                onChange={(e) => setLevel(Number.parseFloat(e.target.value))}
                aria-label="Master volume"
                title="Master volume"
                className="h-1 w-16 cursor-pointer accent-sky-400"
              />
            </div>
            <button
              type="button"
              onClick={toggleShortcutHelp}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white shadow hover:bg-white/20"
            >
              <kbd className="rounded bg-black/25 px-1 text-[10px]">?</kbd>
            </button>
          </div>
        </div>
      )}

      {blockingModalOpen && snapshot && (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center"
          data-testid="paused-indicator"
          role="status"
        >
          <span className="rounded-full border border-sky-400/50 bg-slate-950/90 px-3 py-1 text-[12px] font-bold text-sky-100 shadow-lg">
            Paused — the tower resumes when you close this
          </span>
        </div>
      )}

      {mode === 'build' && snapshot && (
        <div className="absolute left-2 top-16 z-10">
          <BuildPalette
            maxStarReached={snapshot.maxStarReached}
            mapId={engineState.mapId}
            selectedTool={selectedTool}
            onSelectTool={selectTool}
          />
        </div>
      )}

      {cameraViewport && (
        <div
          className={`pointer-events-auto absolute bottom-2 right-2 z-10 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 ${
            inspectorVisible ? 'sm:right-[21rem]' : 'sm:right-2'
          }`}
        >
          <div className="flex flex-col items-end gap-2">
            <CameraControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFitTower={fitTower} />
            <FloorNavigator
              incidents={incidentFloors}
              occupied={occupiedFloors}
              viewport={cameraViewport}
              floorRange={getMap(engineState.mapId).floorRange}
              onGoToFloor={goToFloor}
            />
          </div>
        </div>
      )}

      {inspectorVisible && (
        <div className="absolute bottom-2 left-2 right-16 z-10 max-h-[42vh] w-auto overflow-y-auto sm:left-auto sm:right-2 sm:top-16 sm:max-h-none sm:w-80">
          <InspectPanel
            selection={selection}
            overlaySample={overlaySample}
            maxStarReached={engineState.maxStarReached}
            vipRecords={engineState.vips}
            evalBreakdown={
              selection?.type === 'unit' && !isSlabFamily(selection.unit.kind)
                ? evalBreakdown(engineState, selection.unit)
                : undefined
            }
            lobbyHeight={engineState.lobbyHeight}
            mapId={engineState.mapId}
            onSetRentTier={(unitId, tier) => enqueue({ type: 'setRentTier', unitId, tier })}
            onApplyUpgrade={(unitId, upgradeId) => enqueue({ type: 'applyUpgrade', unitId, upgradeId })}
            onDemolish={onDemolish}
            onAddCar={(shaftId) => enqueue({ type: 'addCar', shaftId })}
            onSetStopEnabled={(shaftId, floor, enabled) => enqueue({ type: 'setStopEnabled', shaftId, floor, enabled })}
            onSetProgram={(shaftId, program) => enqueue({ type: 'setShaftProgram', shaftId, program })}
            onSetCarHomeFloor={(shaftId, carIndex, floor) => enqueue({ type: 'setCarHomeFloor', shaftId, carIndex, floor })}
            onPestControl={(unitId) => enqueue({ type: 'pestControl', unitId })}
            onRepair={(unitId) => enqueue({ type: 'repairUnit', unitId })}
          />
        </div>
      )}

      {(engineState.activeBombThreat || engineState.activeFire) && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex flex-col items-center gap-2">
          {engineState.activeBombThreat && (
            <IncidentBanner
              threat={engineState.activeBombThreat}
              hasSecurityOffice={engineState.units.some((u) => u.kind === 'securityOffice' && !u.offline)}
              onResolve={(choice) => enqueue({ type: 'resolveBombThreat', choice })}
              onViewFloor={goToFloor}
            />
          )}
          {engineState.activeFire && (
            <FireBanner
              fire={engineState.activeFire}
              onRespond={(choice) => enqueue({ type: 'respondToFire', choice })}
              onViewFloor={goToFloor}
            />
          )}
        </div>
      )}

      {showFinancials && (
        <div className="absolute inset-x-4 top-16 z-20 mx-auto max-h-[70vh] max-w-3xl overflow-y-auto">
          <FinancialsPanel
            ledgerHistory={engineState.ledgerHistory}
            ledgerToday={engineState.ledgerToday}
            loans={engineState.loans}
          />
        </div>
      )}

      {showToastHistory && <ToastHistoryDrawer history={toastHistory} onClose={() => setShowToastHistory(false)} />}

      {showSaveLoad && (
        <SaveLoadOverlay
          slots={slotSummaries}
          activeSlotId={activeSlotId}
          canSave={engineState !== null}
          exportText={exportText}
          challengeCode={encodeChallengeCode({
            seed: engineState.seed,
            lobbyHeight: engineState.lobbyHeight,
            mapId: engineState.mapId,
          })}
          message={saveMessage}
          disastersEnabled={snapshot?.disastersEnabled ?? engineState.options.disastersEnabled}
          onClose={() => setShowSaveLoad(false)}
          onSave={saveToSlot}
          onLoad={loadFromSlot}
          onExport={exportSlot}
          onImport={importToSlot}
          onClear={clearSlot}
          onSetDisastersEnabled={setDisastersEnabled}
          cloudEnabled={cloud.enabled}
          cloudSlots={cloud.slots}
          onCloudRestore={restoreFromCloud}
          onTakeOver={takeOverCloudSlot}
          onCloudRetry={cloud.retry}
        />
      )}

      {snapshot?.pendingLoanPrompt && (
        <LoanDialog
          prompt={snapshot.pendingLoanPrompt}
          hasLoans={engineState.loans.length > 0}
          onAccept={(amount) => enqueue({ type: 'acceptLoan', amount })}
          onDecline={() => enqueue({ type: 'declineLoan' })}
        />
      )}

      {showTowerCard && snapshot && (
        <TowerComplete
          daysElapsed={snapshot.day}
          population={snapshot.population}
          funds={snapshot.funds}
          endgameKind={snapshot.endgame.kind}
          onDismiss={() => setShowTowerCard(false)}
        />
      )}

      {showShortcutHelp && <ShortcutHelpOverlay onClose={() => setShowShortcutHelp(false)} />}

      {!showToastHistory && <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />}
    </div>
  )
}
