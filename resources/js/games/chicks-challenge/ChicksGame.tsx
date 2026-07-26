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
import { type GamePhase, INPUT_BUFFER_MAX, INPUT_REPEAT_MS, starsForMoves, STEP_TWEEN_MS, TOTAL_LEVELS } from './gameTypes'
import { GameHud } from './hud/GameHud'
import { GameToolbar } from './hud/GameToolbar'
import { HintBanner } from './hud/HintBanner'
import { createInputQueue, keyboardIntent } from './input/inputQueue'
import { cycleBoardOrientationPreference, rotateIntent } from './input/orientation'
import { loadBoardOrientationPreference, saveBoardOrientationPreference } from './input/orientationStorage'
import { useBoardOrientation } from './input/useBoardOrientation'
import { useStuckProbe } from './input/useStuckProbe'
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
  const [moveSeq, setMoveSeq] = useState(0)
  const [events, setEvents] = useState<readonly EngineEvent[]>([])
  const [winSummary, setWinSummary] = useState<WinSummary | null>(null)
  const [touchEnabled] = useState(isTouchDevice)
  const [muted, setMuted] = useState(() => loadMuted())
  const [stuck, setStuck] = useState(false)
  const [orientationPreference, setOrientationPreference] = useState(loadBoardOrientationPreference)

  const queueRef = useRef(createInputQueue(INPUT_BUFFER_MAX))
  const gameStateRef = useRef(gameState)
  const deathTimeoutRef = useRef<number | null>(null)
  const heldKeyRef = useRef<string | null>(null)
  const repeatIntervalRef = useRef<number | null>(null)
  const recordedRef = useRef<string>('')
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
      engine.playSfx(name)
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
    if (repeatIntervalRef.current !== null) {
      window.clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
    heldKeyRef.current = null
  }, [])

  const startLevel = useCallback((def: ChicksLevelDef): void => {
    clearDeathTimeout()
    clearKeyRepeat()
    queueRef.current.clear()
    recordedRef.current = ''
    setLevelDef(def)
    setGameState(parseLevel(def))
    setMoveSeq(0)
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

  const handleRestart = useCallback((): void => {
    if (levelDef) {
      startLevel(levelDef)
    }
  }, [levelDef, startLevel])

  const handleGoToSelect = useCallback((): void => {
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
    if (!levelDef) {
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
    if (!current || !levelDef) {
      return
    }

    const intent = queueRef.current.dequeue()
    if (!intent) {
      return
    }

    const result = applyMove(current, intent)
    if (!result.accepted) {
      playEventSfx(result.events)

      return
    }

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
  }, [clearDeathTimeout, devModes.record, levelDef, playEventSfx])

  const handleStuck = useCallback((): void => {
    setStuck(true)
    sfx().playSfx('stuck')
  }, [sfx])

  useStuckProbe({ active: phase === 'playing' && !stuck, onStuck: handleStuck, state: gameState })

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
    queueRef.current.enqueue(rotateIntent(intent, quarterTurnsRef.current))
  }, [])

  // Keyboard: arrows/WASD step, hold auto-repeats; Space = wait; R = restart; Esc = level select.
  useEffect(() => {
    if (phase === 'select') {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'r' || event.key === 'R') {
        handleRestart()

        return
      }

      if (event.key === 'Escape') {
        handleGoToSelect()

        return
      }

      if (phase !== 'playing' || event.repeat) {
        return
      }

      const intent = keyboardIntent(event.key)
      if (!intent || heldKeyRef.current === event.key) {
        return
      }

      heldKeyRef.current = event.key
      enqueueIntent(intent)

      if (repeatIntervalRef.current !== null) {
        window.clearInterval(repeatIntervalRef.current)
      }
      repeatIntervalRef.current = window.setInterval(() => enqueueIntent(intent), INPUT_REPEAT_MS)
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
  }, [phase, enqueueIntent, handleRestart, handleGoToSelect, clearKeyRepeat])

  const touchRepeatRef = useRef<number | null>(null)

  const stopTouchRepeat = useCallback((): void => {
    if (touchRepeatRef.current !== null) {
      window.clearInterval(touchRepeatRef.current)
      touchRepeatRef.current = null
    }
  }, [])

  // Shared with 2048 via `useSwipeGesture`; Chick's Challenge layers on
  // hold-to-repeat (a swipe kept pressed re-issues its direction) and the
  // tap-to-wait affordance near the player character.
  const { boardRef: boardSwipeRef, ...boardSwipeHandlers } = useSwipeGesture({
    threshold: SWIPE_THRESHOLD_PX,
    enabled: phase === 'playing',
    onSwipe: (direction): void => {
      enqueueIntent(direction)
      stopTouchRepeat()
      touchRepeatRef.current = window.setInterval(() => enqueueIntent(direction), INPUT_REPEAT_MS)
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
          levelId={levelDef.id}
          muted={muted}
          par={levelDef.par}
          state={gameState}
          onLevelSelect={handleGoToSelect}
          onRestart={handleRestart}
          onToggleMute={handleToggleMute}
        />

        {/* Playfield and controls: stacked in portrait, side-by-side in landscape. */}
        <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
          <div
            className="relative min-h-0 min-w-0 flex-1 touch-none overscroll-none select-none [-webkit-touch-callout:none]"
            data-testid="chips-board"
            ref={setBoardElement}
            onContextMenu={(event) => event.preventDefault()}
            {...boardSwipeHandlers}
          >
            <BoardRotor height={boardBox?.height ?? null} quarterTurns={quarterTurns} width={boardBox?.width ?? null}>
              <ChicksScene events={events} moveSeq={moveSeq} state={gameState} />
            </BoardRotor>

            {showHint && gameState.hint !== null && <HintBanner text={gameState.hint} />}
          </div>

          <GameToolbar
            orientationPreference={orientationPreference}
            quarterTurns={quarterTurns}
            showDpad={touchEnabled && phase === 'playing'}
            onCycleOrientation={handleCycleOrientation}
            onIntent={enqueueIntent}
          />
        </div>

        {phase === 'won' && winSummary && (
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

        {phase === 'dead' && (
          <DeathOverlay cause={gameState.deathCause} onMenu={handleGoToSelect} onRestart={handleRestart} />
        )}

        {phase === 'playing' && stuck && <StuckOverlay onMenu={handleGoToSelect} onRestart={handleRestart} />}
      </section>
    </PortraitGameShell>
  )
}
