import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { LevelSelectProgress } from '../_shared/LevelSelectGrid'
import { isTouchDevice } from '../_shared/swipeInput'
import { type SwipePoint, useSwipeGesture } from '../_shared/useSwipeGesture'
import { PortraitGameShell } from '../PortraitGameShell'
import { sfxForEvents } from './audio/eventSfx'
import { loadMuted, saveMuted } from './audio/muteStorage'
import { createSfxEngine, type SfxEngine } from './audio/sfx'
import { BoardRotor } from './BoardRotor'
import { ChicksScene } from './ChicksScene'
import { applyMove } from './engine/applyMove'
import type { EngineEvent, GameState, MoveIntent } from './engine/types'
import { tileAt } from './engine/types'
import { loadSavedProgress, recordWin, saveProgress } from './gameProgress'
import { type BumpSignal, type GamePhase, type GraphicsStatus, INPUT_BUFFER_MAX, starsForMoves, STEP_TWEEN_MS, TOTAL_LEVELS, UNDO_HISTORY_MAX } from './gameTypes'
import { GameHud } from './hud/GameHud'
import { GameToolbar } from './hud/GameToolbar'
import { HintBanner } from './hud/HintBanner'
import { levelInventorySlots } from './hud/inventorySlots'
import { createHoldRepeat } from './input/holdRepeat'
import { createInputQueue, keyboardIntent } from './input/inputQueue'
import { cycleBoardOrientationPreference, rotateIntent } from './input/orientation'
import { loadBoardOrientationPreference, saveBoardOrientationPreference } from './input/orientationStorage'
import { useBoardOrientation } from './input/useBoardOrientation'
import { useStuckProbe } from './input/useStuckProbe'
import { levelUsesWait } from './input/waitRelevance'
import { getLevelById } from './levels'
import type { ChicksLevelDef } from './levels/levelTypes'
import { parseLevel } from './levels/parseLevel'
import { LevelSelect } from './LevelSelect'
import { DeathOverlay } from './overlays/DeathOverlay'
import { LevelCompleteOverlay } from './overlays/LevelCompleteOverlay'
import { StuckOverlay } from './overlays/StuckOverlay'

/** Death overlay appears after a short, deterministic delay for the death animation. */
const DEATH_DELAY_MS = 600

/** Swipe gesture threshold, in px, before it counts as a directional step. */
const SWIPE_THRESHOLD_PX = 24

/**
 * A tap (no swipe) counts as "on the player" — and thus a wait — only inside
 * this central fraction of the board's width/height. The camera keeps the
 * player centered (or near-centered while following, per
 * docs/games/chicks-challenge.md "Camera fit"), so this is a reasonable
 * screen-space proxy without the UI layer knowing the scene's tile mapping.
 */
const TAP_WAIT_ZONE_FRACTION = 0.5

const INTENT_TO_SOLUTION_CHAR: Readonly<Record<MoveIntent, string>> = {
  up: 'U',
  down: 'D',
  left: 'L',
  right: 'R',
  wait: 'W',
}

/** One undo step: the state before an accepted move (or a restart), plus the recorded input then. */
interface UndoEntry {
  state: GameState
  recorded: string
}

interface WinSummary {
  moves: number
  stars: number
  bestMoves: number
  isNewBest: boolean
}

/** `?level=N` jumps straight into a level; `&record=1` logs the played input string. Read once at mount. */
function resolveDevModes(): { levelId: number | null, record: boolean } {
  if (typeof window === 'undefined') {
    return { levelId: null, record: false }
  }

  const params = new URLSearchParams(window.location.search)
  const rawLevel = params.get('level')
  const parsed = rawLevel === null ? Number.NaN : Number.parseInt(rawLevel, 10)
  const levelId = Number.isInteger(parsed) && getLevelById(parsed) ? parsed : null

  return { levelId, record: params.get('record') === '1' }
}

function toLevelSelectProgress(saved: ReturnType<typeof loadSavedProgress>): LevelSelectProgress {
  return { unlockedLevel: saved.unlockedLevel, stars: saved.stars }
}

/**
 * True when a pointer event landed within the central `TAP_WAIT_ZONE_FRACTION`
 * box of its target element — the "tap the player character" hit zone for
 * the board (see `TAP_WAIT_ZONE_FRACTION`).
 */
function isNearBoardCenter(point: SwipePoint): boolean {
  const rect = point.currentTarget.getBoundingClientRect()
  const halfWidth = (rect.width * TAP_WAIT_ZONE_FRACTION) / 2
  const halfHeight = (rect.height * TAP_WAIT_ZONE_FRACTION) / 2
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  return Math.abs(point.clientX - centerX) <= halfWidth && Math.abs(point.clientY - centerY) <= halfHeight
}

/**
 * Top-level state machine for Chick's Challenge: select / playing / won / dead. Owns the
 * pure engine state and the accepted-move throttle; ChicksScene only consumes
 * `{ state, events, moveSeq }` for animation (docs/games/chicks-challenge.md "Architecture").
 */
export function ChicksGame(): ReactElement {
  const devModes = useMemo(() => resolveDevModes(), [])
  const devLevelDef = useMemo(() => (devModes.levelId ? getLevelById(devModes.levelId) : null), [devModes.levelId])

  const [phase, setPhase] = useState<GamePhase>(devLevelDef ? 'playing' : 'select')
  const [savedProgress, setSavedProgress] = useState(loadSavedProgress)
  const [levelDef, setLevelDef] = useState<ChicksLevelDef | null>(devLevelDef)
  const [gameState, setGameState] = useState<GameState | null>(() => (devLevelDef ? parseLevel(devLevelDef) : null))
  // Read once per level from its starting board, so the inventory row never appears mid-level.
  const startState = useMemo(() => (levelDef ? parseLevel(levelDef) : null), [levelDef])
  const inventorySlots = useMemo(() => (startState ? levelInventorySlots(startState) : []), [startState])
  // Waiting only runs the monster phase; on a monster-free level it would just burn a move.
  const waitEnabled = startState ? levelUsesWait(startState) : false
  const waitEnabledRef = useRef(waitEnabled)
  useLayoutEffect(() => {
    waitEnabledRef.current = waitEnabled
  }, [waitEnabled])
  const [moveSeq, setMoveSeq] = useState(0)
  const [events, setEvents] = useState<readonly EngineEvent[]>([])
  const [bump, setBump] = useState<BumpSignal | null>(null)
  const [sceneResetKey, setSceneResetKey] = useState(0)
  const [undoDepth, setUndoDepth] = useState(0)
  const [winSummary, setWinSummary] = useState<WinSummary | null>(null)
  const [touchEnabled] = useState(isTouchDevice)
  const [muted, setMuted] = useState(() => loadMuted())
  const [graphicsStatus, setGraphicsStatus] = useState<GraphicsStatus>('loading')
  const [graphicsAttempt, setGraphicsAttempt] = useState(0)
  const graphicsReadyRef = useRef(false)
  const boardFocusRef = useRef<HTMLDivElement | null>(null)
  const retryButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusToBoardRef = useRef(false)
  const [stuck, setStuck] = useState(false)
  const [orientationPreference, setOrientationPreference] = useState(loadBoardOrientationPreference)

  const queueRef = useRef(createInputQueue(INPUT_BUFFER_MAX))
  const gameStateRef = useRef(gameState)
  const deathTimeoutRef = useRef<number | null>(null)
  const heldKeyRef = useRef<string | null>(null)
  const keyRepeatRef = useRef(createHoldRepeat())
  const recordedRef = useRef<string>('')
  const historyRef = useRef<UndoEntry[]>([])
  const touchRepeatRef = useRef(createHoldRepeat())
  const sfxRef = useRef<SfxEngine | null>(null)
  const mutedRef = useRef(muted)

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    mutedRef.current = muted
    sfxRef.current?.setMuted(muted)
    saveMuted(muted)
  }, [muted])

  useEffect(() => () => sfxRef.current?.dispose(), [])

  // Board rotation: measured available box + the pure decision rule in
  // input/orientation.ts. Only the board rotates; every other layer stays upright.
  const { areaRef: boardAreaRef, quarterTurns, box: boardBox } = useBoardOrientation({
    levelId: levelDef?.id ?? null,
    cols: gameState?.width ?? 0,
    rows: gameState?.height ?? 0,
    preference: orientationPreference,
  })
  const quarterTurnsRef = useRef(quarterTurns)

  // A *layout* effect, deliberately: a passive effect flushes after paint, which
  // leaves a one-frame window in which the rotated board is already on screen
  // while the ref still holds the previous rotation, and an input landing in that
  // window would be remapped with it (see `enqueueIntent`). Layout effects run in
  // the same task as the DOM mutation, before the browser can paint or dispatch
  // another event, so the remap can never read a stale rotation.
  useLayoutEffect(() => {
    quarterTurnsRef.current = quarterTurns
  }, [quarterTurns])

  // Persisted from an effect, not inside the updater, so the state transition
  // stays pure — same shape as the mute preference above.
  useEffect(() => {
    saveBoardOrientationPreference(orientationPreference)
  }, [orientationPreference])

  const handleCycleOrientation = useCallback((): void => {
    setOrientationPreference(cycleBoardOrientationPreference)
  }, [])

  const sfx = useCallback((): SfxEngine => {
    if (!sfxRef.current) {
      sfxRef.current = createSfxEngine(mutedRef.current)
    }

    return sfxRef.current
  }, [])

  const playEventSfx = useCallback((moveEvents: readonly EngineEvent[]): void => {
    const engine = sfx()
    for (const name of sfxForEvents(moveEvents)) {
      engine.play(name)
    }
  }, [sfx])

  const handleToggleMute = useCallback((): void => {
    setMuted((prev) => !prev)
  }, [])

  const clearDeathTimeout = useCallback((): void => {
    if (deathTimeoutRef.current !== null) {
      window.clearTimeout(deathTimeoutRef.current)
      deathTimeoutRef.current = null
    }
  }, [])

  const clearKeyRepeat = useCallback((): void => {
    keyRepeatRef.current.stop()
    heldKeyRef.current = null
  }, [])

  const handleGraphicsStatus = useCallback((status: GraphicsStatus): void => {
    // The consumption timer and held-input callbacks can run before React commits.
    graphicsReadyRef.current = status === 'ready'
    if (status !== 'ready') {
      clearKeyRepeat()
      touchRepeatRef.current.stop()
      queueRef.current.clear()
    }
    setGraphicsStatus(status)
  }, [clearKeyRepeat])

  const handleRetryGraphics = useCallback((): void => {
    returnFocusToBoardRef.current = true
    handleGraphicsStatus('loading')
    setGraphicsAttempt((attempt) => attempt + 1)
  }, [handleGraphicsStatus])

  useEffect(() => {
    if (graphicsStatus === 'failed') {
      retryButtonRef.current?.focus()
    } else if (graphicsStatus === 'ready' && returnFocusToBoardRef.current) {
      returnFocusToBoardRef.current = false
      boardFocusRef.current?.focus()
    }
  }, [graphicsStatus])

  const pushHistory = useCallback((entry: UndoEntry): void => {
    const history = historyRef.current
    history.push(entry)
    if (history.length > UNDO_HISTORY_MAX) {
      history.shift()
    }
    setUndoDepth(history.length)
  }, [])

  /** `keepHistory` lets a restart stay undoable; every other entry into a level starts a clean history. */
  const startLevel = useCallback((def: ChicksLevelDef, keepHistory = false): void => {
    clearDeathTimeout()
    clearKeyRepeat()
    queueRef.current.clear()
    if (!keepHistory) {
      historyRef.current = []
      setUndoDepth(0)
    }
    recordedRef.current = ''
    setLevelDef(def)
    setGameState(parseLevel(def))
    setMoveSeq(0)
    // An undo can leave the move sequence at 0 already, so a fresh board also needs a new reset key.
    setSceneResetKey((key) => key + 1)
    setEvents([])
    setWinSummary(null)
    setStuck(false)
    setPhase('playing')
  }, [clearDeathTimeout, clearKeyRepeat])

  const handleSelectLevel = useCallback((levelId: number): void => {
    const def = getLevelById(levelId)
    if (def) {
      startLevel(def)
    }
  }, [startLevel])

  // A restart mid-run is undoable (a stray tap on the restart button costs
  // nothing); replaying after a win starts clean.
  const handleRestart = useCallback((): void => {
    if (!graphicsReadyRef.current || !levelDef) {
      return
    }
    const current = gameStateRef.current
    if (current && current.won) {
      startLevel(levelDef)

      return
    }
    if (current && current.alive && current.moves > 0) {
      pushHistory({ state: current, recorded: recordedRef.current })
    }
    startLevel(levelDef, true)
  }, [levelDef, pushHistory, startLevel])

  /** Steps back to the state before the last accepted move (or restart), reviving a death. */
  const handleUndo = useCallback((): void => {
    const current = gameStateRef.current
    if (!graphicsReadyRef.current || !current || current.won) {
      return
    }
    const entry = historyRef.current.pop()
    if (!entry) {
      return
    }
    clearDeathTimeout()
    clearKeyRepeat()
    touchRepeatRef.current.stop()
    queueRef.current.clear()
    recordedRef.current = entry.recorded
    gameStateRef.current = entry.state
    setGameState(entry.state)
    setEvents([])
    setSceneResetKey((key) => key + 1)
    setStuck(false)
    setUndoDepth(historyRef.current.length)
    setPhase('playing')
  }, [clearDeathTimeout, clearKeyRepeat])

  const handleGoToSelect = useCallback((): void => {
    graphicsReadyRef.current = false
    touchRepeatRef.current.stop()
    clearDeathTimeout()
    clearKeyRepeat()
    queueRef.current.clear()
    setPhase('select')
    setLevelDef(null)
    setGameState(null)
    setStuck(false)
    setSavedProgress(loadSavedProgress())
  }, [clearDeathTimeout, clearKeyRepeat])

  const handleNextLevel = useCallback((): void => {
    if (!graphicsReadyRef.current || !levelDef) {
      return
    }
    const next = getLevelById(levelDef.id + 1)
    if (next) {
      startLevel(next)
    }
  }, [levelDef, startLevel])

  // Applies at most one queued intent to the engine, handling win/death transitions.
  const processQueuedIntent = useCallback((): void => {
    const current = gameStateRef.current
    if (!graphicsReadyRef.current || !current || !levelDef) {
      return
    }

    const intent = queueRef.current.dequeue()
    if (!intent) {
      return
    }

    const result = applyMove(current, intent)
    if (!result.accepted) {
      playEventSfx(result.events)
      const bumped = result.events.find((event): event is Extract<EngineEvent, { type: 'bumped' }> => event.type === 'bumped')
      if (bumped) {
        setBump((previous) => ({ seq: (previous?.seq ?? 0) + 1, dir: bumped.dir }))
      }

      return
    }

    pushHistory({ state: current, recorded: recordedRef.current })
    gameStateRef.current = result.state
    setGameState(result.state)
    setEvents(result.events)
    setMoveSeq((seq) => seq + 1)
    playEventSfx(result.events)

    if (devModes.record) {
      recordedRef.current += INTENT_TO_SOLUTION_CHAR[intent]
      console.log(`[chips record] ${recordedRef.current} (${recordedRef.current.length} moves)`)
    }

    if (result.state.won) {
      const currentProgress = loadSavedProgress()
      const previousBest = currentProgress.bestMoves[levelDef.id]
      const stars = starsForMoves(result.state.moves, levelDef.par)
      const next = recordWin(currentProgress, levelDef.id, result.state.moves, stars)
      saveProgress(next)
      setSavedProgress(next)
      setWinSummary({
        moves: result.state.moves,
        stars,
        bestMoves: next.bestMoves[levelDef.id] ?? result.state.moves,
        isNewBest: previousBest === undefined || result.state.moves < previousBest,
      })
      setPhase('won')

      if (devModes.record) {
        console.log(`[chips record] SOLVED level ${levelDef.id}: ${recordedRef.current} (${recordedRef.current.length} moves)`)
      }

      return
    }

    if (!result.state.alive) {
      clearDeathTimeout()
      deathTimeoutRef.current = window.setTimeout(() => setPhase('dead'), DEATH_DELAY_MS)
    }
  }, [clearDeathTimeout, devModes.record, levelDef, playEventSfx, pushHistory])

  const handleStuck = useCallback((): void => {
    setStuck(true)
    sfx().play('stuck')
  }, [sfx])

  useStuckProbe({ active: graphicsStatus === 'ready' && phase === 'playing' && !stuck, onStuck: handleStuck, state: gameState })

  // Throttles intent application to one per STEP_TWEEN_MS so the scene's tween
  // animations can keep up with buffered input (docs/games/chicks-challenge.md "Controls").
  useEffect(() => {
    if (phase !== 'playing') {
      return undefined
    }

    const interval = window.setInterval(processQueuedIntent, STEP_TWEEN_MS)

    return () => window.clearInterval(interval)
  }, [phase, processQueuedIntent])

  useEffect(() => clearDeathTimeout, [clearDeathTimeout])
  useEffect(() => clearKeyRepeat, [clearKeyRepeat])

  /**
   * Every input source (keyboard, swipe, D-pad) reports a *screen-space* intent;
   * this is the single place it becomes the board-space intent the engine
   * consumes. Reading the rotation from a ref (not the render closure) keeps a
   * held auto-repeat correct if the board flips mid-hold; the ref is synced in a
   * layout effect so it is never a frame behind what the player can see.
   */
  const enqueueIntent = useCallback((intent: MoveIntent): void => {
    if (!graphicsReadyRef.current || (intent === 'wait' && !waitEnabledRef.current)) {
      return
    }
    queueRef.current.enqueue(rotateIntent(intent, quarterTurnsRef.current))
  }, [])

  // Keyboard: arrows/WASD step, hold auto-repeats; Space = wait; R = restart; Esc = level select.
  useEffect(() => {
    if (phase === 'select') {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.target instanceof Element) {
        // Editing controls own their keys. Persistent game buttons keep native
        // activation, while movement and game shortcuts still work after a click.
        if (event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) {
          return
        }
        if (event.target.closest('button, a[href], [role="button"]')
          && (!graphicsReadyRef.current || event.key === ' ' || event.key === 'Enter')) {
          return
        }
      }
      if (event.key === 'r' || event.key === 'R') {
        handleRestart()

        return
      }

      if (event.key === 'Escape') {
        handleGoToSelect()

        return
      }

      if (event.key === 'z' || event.key === 'Z' || event.key === 'Backspace') {
        event.preventDefault()
        handleUndo()

        return
      }

      if (!graphicsReadyRef.current || phase !== 'playing' || event.repeat) {
        return
      }

      const intent = keyboardIntent(event.key)
      if (!intent || heldKeyRef.current === event.key) {
        return
      }

      event.preventDefault()
      heldKeyRef.current = event.key
      keyRepeatRef.current.start(() => enqueueIntent(intent))
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (heldKeyRef.current === event.key) {
        clearKeyRepeat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      clearKeyRepeat()
    }
  }, [phase, enqueueIntent, handleRestart, handleGoToSelect, handleUndo, clearKeyRepeat])

  const stopTouchRepeat = useCallback((): void => {
    touchRepeatRef.current.stop()
  }, [])

  // Shared with 2048 via `useSwipeGesture`; Chick's Challenge layers on
  // hold-to-repeat (a swipe kept pressed re-issues its direction) and the
  // tap-to-wait affordance near the player character.
  const { boardRef: boardSwipeRef, ...boardSwipeHandlers } = useSwipeGesture({
    threshold: SWIPE_THRESHOLD_PX,
    enabled: graphicsStatus === 'ready' && phase === 'playing',
    onSwipe: (direction): void => {
      // One swipe is one step; keeping the finger down past the repeat delay walks on.
      touchRepeatRef.current.start(() => enqueueIntent(direction))
    },
    onGestureEnd: stopTouchRepeat,
    onTap: (point): void => {
      // A tap (no swipe) only counts as "wait" near the player's on-screen
      // position — accidental taps elsewhere on the board are ignored.
      if (phase === 'playing' && isNearBoardCenter(point)) {
        enqueueIntent('wait')
      }
    },
  })

  useEffect(() => stopTouchRepeat, [stopTouchRepeat])

  // The playfield needs both the orientation measurer's ref and the swipe hook's
  // native-touch ref; a stable callback fans one element node out to both.
  const setBoardElement = useCallback((element: HTMLDivElement | null): void => {
    boardFocusRef.current = element
    boardAreaRef(element)
    boardSwipeRef(element)
  }, [boardAreaRef, boardSwipeRef])

  if (phase === 'select' || !levelDef || !gameState) {
    return (
      <PortraitGameShell allowLandscape className="bg-slate-100 dark:bg-slate-950">
        <LevelSelect progress={toLevelSelectProgress(savedProgress)} onSelectLevel={handleSelectLevel} />
      </PortraitGameShell>
    )
  }

  const hasNextLevel = levelDef.id < TOTAL_LEVELS && getLevelById(levelDef.id + 1) !== null
  const showHint = gameState.hint !== null && tileAt(gameState, gameState.player.pos) === 'hint'

  return (
    <PortraitGameShell allowLandscape className="bg-slate-100 dark:bg-slate-950">
      <section className="relative flex min-h-0 flex-1 flex-col">
        <GameHud
          inventorySlots={inventorySlots}
          levelId={levelDef.id}
          muted={muted}
          par={levelDef.par}
          state={gameState}
          onLevelSelect={handleGoToSelect}
          onRestart={handleRestart}
          restartDisabled={graphicsStatus !== 'ready'}
          onToggleMute={handleToggleMute}
        />

        {/* Playfield and controls: stacked in portrait, side-by-side in landscape. */}
        <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
          <div
            className="relative min-h-0 min-w-0 flex-1 touch-none overscroll-none select-none [-webkit-touch-callout:none]"
            data-testid="chips-board"
            data-graphics-status={graphicsStatus}
            tabIndex={-1}
            ref={setBoardElement}
            onContextMenu={(event) => event.preventDefault()}
            {...boardSwipeHandlers}
          >
            <BoardRotor height={boardBox?.height ?? null} quarterTurns={quarterTurns} width={boardBox?.width ?? null}>
              <ChicksScene graphicsAttempt={graphicsAttempt} onGraphicsStatus={handleGraphicsStatus} bump={bump} events={events} moveSeq={moveSeq} resetKey={sceneResetKey} state={gameState} />
            </BoardRotor>

            {graphicsStatus === 'loading' && <p role="status" className="absolute inset-0 flex items-center justify-center text-slate-800 dark:text-slate-100">Starting graphics…</p>}

            {graphicsStatus === 'ready' && showHint && gameState.hint !== null && <HintBanner text={gameState.hint} />}
            {graphicsStatus === 'failed' && (
              <div className="absolute inset-0 z-30 flex overflow-y-auto p-4">
                <div role="alert" className="m-auto max-w-sm rounded-2xl bg-white p-5 text-center text-slate-900 shadow-xl dark:bg-slate-800 dark:text-white">
                  <h2 className="text-xl font-bold">Graphics unavailable</h2>
                  <p className="mt-2">Your puzzle is paused. Try starting the graphics again, or return to level select.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <button ref={retryButtonRef} className="min-h-11 rounded-lg bg-amber-400 px-4 font-bold text-slate-950" type="button" onClick={handleRetryGraphics}>Retry graphics</button>
                    <button className="min-h-11 rounded-lg border border-slate-400 px-4 font-bold" type="button" onClick={handleGoToSelect}>Level select</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <GameToolbar
            orientationPreference={orientationPreference}
            quarterTurns={quarterTurns}
            showDpad={graphicsStatus === 'ready' && touchEnabled && phase === 'playing'}
            waitEnabled={waitEnabled}
            canUndo={graphicsStatus === 'ready' && undoDepth > 0 && phase === 'playing'}
            onUndo={handleUndo}
            onCycleOrientation={handleCycleOrientation}
            onIntent={enqueueIntent}
          />
        </div>

        {graphicsStatus === 'ready' && phase === 'won' && winSummary && (
          <LevelCompleteOverlay
            bestMoves={winSummary.bestMoves}
            hasNextLevel={hasNextLevel}
            isNewBest={winSummary.isNewBest}
            moves={winSummary.moves}
            par={levelDef.par}
            stars={winSummary.stars}
            onMenu={handleGoToSelect}
            onNext={handleNextLevel}
            onReplay={handleRestart}
          />
        )}

        {graphicsStatus === 'ready' && phase === 'dead' && (
          <DeathOverlay cause={gameState.deathCause} onMenu={handleGoToSelect} onRestart={handleRestart} onUndo={undoDepth > 0 ? handleUndo : null} />
        )}

        {graphicsStatus === 'ready' && phase === 'playing' && stuck && <StuckOverlay onMenu={handleGoToSelect} onRestart={handleRestart} onUndo={undoDepth > 0 ? handleUndo : null} />}
      </section>
    </PortraitGameShell>
  )
}
