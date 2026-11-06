import { RotateCcw, Undo2 } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { SoundBottomControlButton } from '../_shared/audio/SoundToggle'
import { FullscreenBottomControlButton } from '../_shared/FullscreenButton'
import {
  BottomControlButton,
  GAME_TOOLBAR_PADDING_CLASS,
  GameBottomToolbar,
  Metric,
} from '../_shared/GameControlPrimitives'
import { directionFromKey, isTouchDevice } from '../_shared/swipeInput'
import { PortraitGameShell } from '../PortraitGameShell'
import { loadMuted, saveMuted } from './audio/muteStorage'
import { createSfxEngine, type SfxName } from './audio/sfx'
import { BoardView } from './board/BoardView'
import { highestTileValue } from './engine/board'
import { canUndo, continueAfterWin, markRunRecorded, performMove, startRun, undoMove } from './engine/gameRun'
import { createRunSeed } from './engine/rng'
import {
  clearSavedRun,
  loadProgress,
  loadRunRecovery,
  recordBest,
  recordRunEnd,
  replaceSavedRun,
  saveProgress,
  saveRun,
} from './gameProgress'
import type { BoardSize, Direction, GameRun, SavedProgress, Tile } from './gameTypes'
import { BOARD_SIZES, DEFAULT_BOARD_SIZE, GHOST_LIFETIME_MS } from './gameTypes'
import { OverlayButton, RunOverlay } from './overlays/RunOverlay'

interface MoveAnimation {
  ghosts: readonly Tile[]
  mergedTileIds: readonly number[]
  spawnedTileId: number | null
}

const IDLE_ANIMATION: MoveAnimation = { ghosts: [], mergedTileIds: [], spawnedTileId: null }

export interface Game2048Props {
  /** Fixes the RNG so tests can assert on exact boards. Production omits it. */
  initialSeed?: number
}

/**
 * 2048. The board and every rule live in the pure `engine/`; this shell owns
 * React state, persistence, input, and the overlays.
 *
 * Persistence: bests and games played go to the `profile/default` row (keyed by
 * board size); the live run is autosaved to `save/autosave`, which the shared
 * adapter debounces and flushes with `keepalive` when the page is hidden. The
 * save row is cleared when a run ends, so a finished game never resumes.
 */
export function Game2048({ initialSeed }: Game2048Props): ReactElement {
  const [progress, setProgress] = useState<SavedProgress>(() => loadProgress())
  const [recovery, setRecovery] = useState(loadRunRecovery)
  const [run, setRun] = useState<GameRun>(() => recovery.run ?? startRun(DEFAULT_BOARD_SIZE, initialSeed ?? createRunSeed()))
  const [animation, setAnimation] = useState<MoveAnimation>(IDLE_ANIMATION)
  const [pendingSize, setPendingSize] = useState<BoardSize | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [replacementPending, setReplacementPending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const replacementOriginRef = useRef<HTMLElement | null>(null)
  const keepSavedRef = useRef<HTMLButtonElement | null>(null)
  const replacingRef = useRef(false)
  const mountedRef = useRef(false)
  const [muted, setMuted] = useState(loadMuted)
  const [sfx] = useState(() => createSfxEngine(loadMuted()))
  const [movementHint] = useState(() => (
    isTouchDevice() ? 'Swipe the board to move tiles' : 'Arrow keys or WASD to move · Z to undo'
  ))

  const seedCounterRef = useRef(0)
  const persistedProgressRef = useRef(progress)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; sfx.dispose() }
  }, [sfx])

  const playSfx = useCallback((name: SfxName, intensity?: number): void => {
    sfx.play(name, intensity)
  }, [sfx])

  const nextSeed = useCallback((): number => {
    seedCounterRef.current += 1

    return initialSeed === undefined ? createRunSeed() : (initialSeed + seedCounterRef.current) >>> 0
  }, [initialSeed])

  useEffect(() => {
    if (persistedProgressRef.current === progress) {
      return
    }
    persistedProgressRef.current = progress
    saveProgress(progress)
  }, [progress])

  useEffect(() => {
    if (recovery.problem !== null) return
    if (run.status === 'over') {
      clearSavedRun()

      return
    }
    saveRun(run)
  }, [recovery.problem, run])

  useEffect(() => {
    if (animation === IDLE_ANIMATION) {
      return
    }

    const timer = window.setTimeout(() => setAnimation(IDLE_ANIMATION), GHOST_LIFETIME_MS)

    return () => window.clearTimeout(timer)
  }, [animation])

  const handleMove = useCallback((direction: Direction): void => {
    if (recovery.problem !== null || pendingSize !== null || run.status !== 'playing') {
      return
    }
    sfx.unlock()

    const application = performMove(run, direction)
    const outcome = application.outcome
    if (!application.changed || !outcome) {
      playSfx('blocked')

      return
    }

    setAnimation({
      ghosts: outcome.absorbed,
      mergedTileIds: outcome.mergedTileIds,
      spawnedTileId: application.spawnedTileId,
    })

    if (outcome.merges > 0) {
      playSfx('merge', Math.min(1, outcome.gained / 512))
    } else {
      playSfx('slide')
    }

    const moved = application.run
    if (moved.status === 'won') {
      playSfx('win')
      // Recorded without counting a game: the run continues if the player
      // chooses "keep going", and is counted once when it finally ends.
      setProgress((current) => recordBest(current, moved.board.size, moved.bestScore, moved.bestTile))
      setRun(moved)

      return
    }
    if (moved.status === 'over') {
      playSfx('gameOver')
      setProgress((current) => recordRunEnd(current, moved))
      // Latched now, so reviving this run with undo and letting it die again
      // raises its bests without counting a second game.
      setRun(markRunRecorded(moved))

      return
    }
    setRun(moved)
  }, [pendingSize, playSfx, recovery.problem, run, sfx])

  const handleUndo = useCallback((): void => {
    // The win overlay owns the run until the player picks "keep going" or "new
    // game": undoing out from under it would dismiss it silently, and the win
    // latch means it would never be offered again.
    if (recovery.problem !== null || !canUndo(run) || pendingSize !== null || run.status === 'won') {
      return
    }
    setAnimation(IDLE_ANIMATION)
    setRun(undoMove(run))
    playSfx('undo')
  }, [pendingSize, playSfx, recovery.problem, run])

  const startNewRun = useCallback((size: BoardSize): void => {
    sfx.unlock()
    // A run abandoned mid-game is still a game played, and its high-water marks
    // still count towards the best for that board size. `recordRunEnd` is what
    // keeps a run that was already counted — because it ended and undo revived
    // it — from being counted a second time here.
    if (run.moves > 0) {
      setProgress((current) => recordRunEnd(current, run))
    }
    setAnimation(IDLE_ANIMATION)
    setPendingSize(null)
    setRun(startRun(size, nextSeed()))
  }, [nextSeed, run, sfx])

  /** Starts play only after the explicitly chosen replacement commits. */
  const replaceRun = useCallback(async (): Promise<void> => {
    if (pendingSize === null || replacingRef.current) return
    replacingRef.current = true
    setReplacing(true)
    setSaveError(null)
    const next = startRun(pendingSize, nextSeed())
    const result = await replaceSavedRun(next)
    replacingRef.current = false
    if (!mountedRef.current) return
    setReplacing(false)
    if (!result.ok) {
      setReplacementPending(result.reason === 'pending')
      setSaveError(result.reason === 'pending'
        ? 'The replacement has not reached your account yet. It may still sync when connected. Reload once connected to check the saved game.'
        : result.reason === 'conflict'
        ? 'Another tab or device changed this saved game. Reload before replacing it.'
        : 'The new game could not be saved. Your previous saved game has been kept. Try again when saving is available.')
      return
    }
    setRun(next)
    setRecovery({ run: next, problem: null })
    setPendingSize(null)
  }, [nextSeed, pendingSize])

  /** Confirms before discarding a game in progress or an unreadable save. */
  const requestNewRun = useCallback((size: BoardSize): void => {
    if (recovery.problem !== null) {
      replacementOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setSaveError(null)
      setPendingSize(size)
      return
    }
    if (run.moves > 0 && run.status === 'playing') {
      setPendingSize(size)

      return
    }
    startNewRun(size)
  }, [recovery.problem, run, startNewRun])

  const handleKeepGoing = useCallback((): void => {
    setRun((current) => continueAfterWin(current))
  }, [])

  const toggleMute = useCallback((): void => {
    setMuted((current) => {
      const next = !current
      sfx.setMuted(next)
      saveMuted(next)

      return next
    })
  }, [sfx])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (pendingSize !== null || recovery.problem !== null || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault()
        handleUndo()

        return
      }
      const direction = directionFromKey(event.key)
      if (!direction) {
        return
      }
      // Arrow keys would otherwise scroll the page behind the board.
      event.preventDefault()
      handleMove(direction)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleMove, handleUndo, pendingSize, recovery.problem])

  const size = run.board.size
  const bestScore = Math.max(progress.boards[size]?.bestScore ?? 0, run.bestScore)
  const undosLeft = run.undosRemaining
  const undoAvailable = recovery.problem === null && canUndo(run) && pendingSize === null && run.status !== 'won'

  return (
    <PortraitGameShell className="bg-slate-100 dark:bg-slate-950">
      <div
        className="relative flex h-full min-h-0 flex-col gap-2 px-3 pt-3"
        style={{
          touchAction: 'manipulation',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-3xl font-black leading-none text-slate-900 dark:text-slate-50">2048</h1>
            <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">{movementHint}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Metric emphasis label="Score" value={run.score.toLocaleString()} />
            <Metric label="Best" value={bestScore.toLocaleString()} />
          </div>
        </header>

        <div aria-label="Board size" className="flex shrink-0 items-center justify-center gap-1.5" role="group">
          {BOARD_SIZES.map((option) => (
            <button
              aria-pressed={option === size}
              className={cn(
                'min-h-9 min-w-14 rounded-full border px-3 text-xs font-black transition active:scale-95',
                option === size
                  ? 'border-amber-300 bg-amber-300 text-amber-950 shadow-sm'
                  : 'border-slate-300 bg-white/70 text-slate-600 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10',
              )}
              data-testid={`board-size-${option}`}
              key={option}
              type="button"
              onClick={() => requestNewRun(option)}
            >
              {option}×{option}
            </button>
          ))}
        </div>

        {recovery.problem !== null && (
          <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">
            {replacementPending
              ? 'Your confirmed replacement may still sync to your account. Reload once connected to check the saved game.'
              : recovery.problem === 'invalid'
              ? 'Your saved game cannot be loaded by this version. It has been kept. Choose New game or a board size to replace it.'
              : 'Your saved game could not be read because storage is unavailable. Choose New game to try saving a replacement.'}
          </p>
        )}

        {/* Centred vertically: on a tall phone the board is width-limited, so the
            slack belongs above and below it rather than all underneath. */}
        <div className={cn('flex min-h-0 flex-1 items-center justify-center', GAME_TOOLBAR_PADDING_CLASS)}>
          <BoardView
            board={run.board}
            ghosts={animation.ghosts}
            mergedTileIds={animation.mergedTileIds}
            spawnedTileId={animation.spawnedTileId}
            onSwipe={handleMove}
          />
        </div>

        <span aria-live="polite" className="sr-only" data-testid="score-readout">
          Score {run.score}, best {bestScore}, {undosLeft} undos left
        </span>

        <GameBottomToolbar>
          <span data-testid="new-game-button">
            <BottomControlButton
              disabled={false}
              icon={<RotateCcw />}
              label="New game"
              onClick={() => requestNewRun(size)}
            />
          </span>
          <span data-testid="undo-button">
            <BottomControlButton
              count={undosLeft}
              disabled={!undoAvailable}
              icon={<Undo2 />}
              label="Undo"
              onClick={handleUndo}
            />
          </span>
          <span data-testid="mute-button">
            <SoundBottomControlButton muted={muted} onMutedChange={toggleMute} />
          </span>
          <FullscreenBottomControlButton />
        </GameBottomToolbar>

        {run.status === 'won' && pendingSize === null && (
          <RunOverlay label="You reached 2048" testId="win-overlay">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-50">2048!</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {run.score.toLocaleString()} points on the {size}×{size} board. Keep going for a bigger tile?
            </p>
            <div className="mt-5 flex gap-2">
              <OverlayButton label="Keep going" primary testId="keep-going-button" onClick={handleKeepGoing} />
              <OverlayButton label="New game" testId="win-new-game-button" onClick={() => startNewRun(size)} />
            </div>
          </RunOverlay>
        )}

        {run.status === 'over' && pendingSize === null && (
          <RunOverlay label="Game over" testId="game-over-overlay">
            <div className="text-5xl">🧱</div>
            <h2 className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-50">No moves left</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {run.score.toLocaleString()} points · best {bestScore.toLocaleString()} · highest tile {highestTileValue(run.board).toLocaleString()}
            </p>
            {/* The overlay covers the bottom toolbar, so without this button undo
                would be desktop-only (Z) exactly when it matters most: taking
                back the fatal move. Hidden once the allowance is spent. */}
            <div className="mt-5 flex gap-2">
              {undoAvailable && (
                <OverlayButton
                  label="Undo last move"
                  primary
                  testId="game-over-undo-button"
                  onClick={handleUndo}
                />
              )}
              <OverlayButton
                label="New game"
                primary={!undoAvailable}
                testId="game-over-new-game-button"
                onClick={() => startNewRun(size)}
              />
            </div>
          </RunOverlay>
        )}

        {pendingSize !== null && recovery.problem === null && (
          <RunOverlay label="Start a new game" testId="confirm-new-game-overlay">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
              Start a new {pendingSize}×{pendingSize} game?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              This game scored {run.score.toLocaleString()} so far. It will be recorded and cleared.
            </p>
            <div className="mt-5 flex gap-2">
              <OverlayButton label="Cancel" testId="cancel-new-game-button" onClick={() => setPendingSize(null)} />
              <OverlayButton
                label="Start"
                primary
                testId="confirm-new-game-button"
                onClick={() => startNewRun(pendingSize)}
              />
            </div>
          </RunOverlay>
        )}
        <Dialog open={pendingSize !== null && recovery.problem !== null} onOpenChange={(open) => { if (!open && !replacingRef.current) setPendingSize(null) }}>
          <DialogContent
            showCloseButton={false}
            finalFocus={replacementOriginRef}
            onOpenAutoFocus={(event) => { event.preventDefault(); keepSavedRef.current?.focus() }}
          >
            <DialogTitle>Replace saved game?</DialogTitle>
            <DialogDescription>
              Starting a new {pendingSize}×{pendingSize} game permanently replaces the saved game that could not be loaded. Your best scores stay safe.
            </DialogDescription>
            {saveError && <p role="alert">{saveError}</p>}
            <div className="flex gap-3">
              <button ref={keepSavedRef} className="min-h-12 rounded-full border px-4 font-bold" disabled={replacing} type="button" onClick={() => setPendingSize(null)}>{replacementPending ? 'Close' : 'Keep saved game'}</button>
              <button className="min-h-12 rounded-full bg-amber-300 px-4 font-bold text-amber-950" disabled={replacing} type="button" onClick={() => { void replaceRun() }}>{replacing ? 'Saving…' : 'Replace and start'}</button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PortraitGameShell>
  )
}
