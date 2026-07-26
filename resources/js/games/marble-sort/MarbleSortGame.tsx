import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { GAME_TOOLBAR_PADDING_CLASS } from '../_shared/GameControlPrimitives'
import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import { TapHint, type TapHintPosition } from '../_shared/TapHint'
import { PortraitGameShell } from '../PortraitGameShell'
import { ensureAudioRunning, isAudioMuted, setAudioMuted } from './audio/audioEngine'
import { isMusicRunning, startMusic, stopMusic } from './audio/music'
import { playPowerUp } from './audio/sfx'
import { useGameSounds } from './audio/useGameSounds'
import { GameControls, type GameStats } from './GameControls'
import {
  advanceToNextLevel,
  applyExtraBeltPowerUp,
  applyMagnetPowerUp,
  applyShufflePowerUp,
  arriveFallingMarble,
  availableConveyorSlots,
  BOX_MARBLE_COUNT,
  clearLevelSnapshot,
  type GameState,
  isBoxOpenable,
  loadLevelSnapshot,
  loadProgress,
  MARBLE_LEVELS,
  openBox,
  processBeltTick,
  recordWin,
  restartLevel,
  type SavedGameProgress,
  saveLevelSnapshot,
  saveProgress,
  startLevel,
} from './gameEngine'
import { LevelCompleteOverlay } from './LevelCompleteOverlay'
import { MarbleSortScene } from './MarbleSortScene'
import { CONVEYOR_TICK_INTERVAL_MS } from './scene/conveyorProgress'
import { TutorialOverlay } from './TutorialOverlay'

const COLORBLIND_MODE_STORAGE_KEY = 'bwh.marble-sort.colorblind.v1'

export function MarbleSortGame(): ReactElement {
  const [progress, setProgress] = useState<SavedGameProgress>(() => loadProgress())
  const [state, setState] = useState<GameState | null>(() => loadLevelSnapshot())
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [hintPosition, setHintPosition] = useState<TapHintPosition | null>(null)
  const [colorblindMode, setColorblindMode] = useState(() => loadColorblindMode())
  const [soundMuted, setSoundMuted] = useState(() => isAudioMuted())
  const recordedWinKeyRef = useRef<string | null>(null)

  useGameSounds(state)

  useEffect(() => stopMusic, [])

  const commitProgress = useCallback((next: SavedGameProgress): void => {
    saveProgress(next)
    setProgress(next)
  }, [])

  // Browsers keep audio suspended until a user gesture, so the first pointer
  // interaction anywhere in the game unlocks playback and starts the ambience.
  const handleAudioUnlock = useCallback((): void => {
    if (soundMuted) {
      return
    }
    ensureAudioRunning()
    if (!isMusicRunning()) {
      startMusic()
    }
  }, [soundMuted])

  const handleSoundMutedChange = useCallback((muted: boolean): void => {
    setSoundMuted(muted)
    setAudioMuted(muted)
    if (muted) {
      stopMusic()
    } else {
      ensureAudioRunning()
      if (!isMusicRunning()) {
        startMusic()
      }
    }
  }, [])

  useEffect(() => {
    if (!state) {
      return
    }

    if (state.completedLevel) {
      const winKey = `${state.completedLevel.level}:${state.completedLevel.score}`
      if (winKey !== recordedWinKeyRef.current) {
        recordedWinKeyRef.current = winKey
        commitProgress(recordWin(loadProgress(), state))
      }
      // Queue durable progress first; save-slot clears are delayed/coalesced by
      // the shared adapter so a completed board cannot disappear first.
      clearLevelSnapshot()

      return
    }

    saveLevelSnapshot(state)
    // Persist power-up consumption as it happens; only saving at wins would
    // refund mid-level spends when the player exits to the menu and restarts.
    const current = loadProgress()
    if (
      current.powerUps.magnet !== state.powerUps.magnet
      || current.powerUps.shuffle !== state.powerUps.shuffle
      || current.powerUps.extraBelt !== state.powerUps.extraBelt
    ) {
      commitProgress({ ...current, powerUps: { ...state.powerUps } })
    }
  }, [commitProgress, state])

  const beltActive = Boolean(
    state
    && !state.completedLevel
    && !state.gameOver
    && (state.conveyor.length > 0 || state.fallingMarbles.length > 0),
  )

  useEffect(() => {
    if (!beltActive) {
      return
    }

    const interval = window.setInterval(() => {
      setState((current) => (current ? processBeltTick(current) : current))
    }, CONVEYOR_TICK_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [beltActive])

  // Self-teaching level 1: point at an openable tile until the first pop.
  const hintCell = useMemo(() => {
    if (!state || state.level !== 1 || state.moves > 0 || state.completedLevel || state.gameOver) {
      return null
    }

    const box = state.boxes.find((candidate) => isBoxOpenable(candidate, state.boxes))

    return box ? box.position : null
  }, [state])

  const stats = useMemo<GameStats>(() => (state
    ? {
        boxCount: state.boxes.length,
        conveyorCount: state.conveyor.length + state.fallingMarbles.length,
      }
    : { boxCount: 0, conveyorCount: 0 }), [state])

  const handleBoxClick = useCallback((boxId: string): void => {
    setState((current) => (current ? openBox(current, boxId) : current))
  }, [])

  const handleMarbleArrived = useCallback((marbleId: string): void => {
    setState((current) => (current ? arriveFallingMarble(current, marbleId) : current))
  }, [])

  const handleMagnet = useCallback((): void => {
    playPowerUp()
    setState((current) => (current ? applyMagnetPowerUp(current) : current))
  }, [])

  const handleShuffle = useCallback((): void => {
    playPowerUp()
    setState((current) => (current ? applyShufflePowerUp(current) : current))
  }, [])

  const handleExtraBelt = useCallback((): void => {
    setState((current) => (current ? applyExtraBeltPowerUp(current) : current))
  }, [])

  const handleColorblindModeChange = useCallback((enabled: boolean): void => {
    setColorblindMode(enabled)
    saveColorblindMode(enabled)
  }, [])

  const handleNextLevel = useCallback((): void => {
    clearLevelSnapshot()
    recordedWinKeyRef.current = null
    setState((current) => (current ? advanceToNextLevel(current) : current))
  }, [])

  const handleReset = useCallback((): void => {
    clearLevelSnapshot()
    recordedWinKeyRef.current = null
    setState((current) => (current ? restartLevel(current) : current))
  }, [])

  const handleSelectLevel = useCallback((levelId: number): void => {
    recordedWinKeyRef.current = null
    // Tapping the in-progress level resumes its snapshot; picking a different
    // level intentionally abandons it.
    const snapshot = loadLevelSnapshot(undefined, progress)
    if (snapshot && snapshot.level === levelId) {
      setState(snapshot)

      return
    }

    clearLevelSnapshot()
    setState(startLevel(levelId, progress))
  }, [progress])

  const handleBackToMenu = useCallback((): void => {
    recordedWinKeyRef.current = null
    setState(null)
  }, [])

  if (!state) {
    return (
      <div className="bg-sky-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50" onPointerDown={handleAudioUnlock}>
        <PortraitGameShell contentClassName="gap-2 px-2 py-2 sm:gap-2.5 sm:px-4 sm:py-3 lg:px-5">
          <section className="relative min-h-0 flex-1">
            <LevelSelectGrid
              emoji="🎱"
              exitHref="/"
              footer="More levels coming soon."
              levelIds={MARBLE_LEVELS.map((level) => level.id)}
              progress={progress}
              title="Marble Sort"
              onSelectLevel={handleSelectLevel}
            />
          </section>
        </PortraitGameShell>
      </div>
    )
  }

  return (
    <div className="bg-sky-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50" onPointerDown={handleAudioUnlock}>
      <PortraitGameShell contentClassName="gap-2 px-2 py-2 sm:gap-2.5 sm:px-4 sm:py-3 lg:px-5">
        <GameControls
          colorblindMode={colorblindMode}
          soundMuted={soundMuted}
          stats={stats}
          statsExpanded={statsExpanded}
          state={state}
          onBackToMenu={handleBackToMenu}
          onColorblindModeChange={handleColorblindModeChange}
          onExtraBelt={handleExtraBelt}
          onMagnet={handleMagnet}
          onReset={handleReset}
          onShuffle={handleShuffle}
          onSoundMutedChange={handleSoundMutedChange}
          onStatsExpandedChange={setStatsExpanded}
          onTutorialOpen={() => setTutorialOpen(true)}
        />

        <section className={cn('relative min-h-0 flex-1', GAME_TOOLBAR_PADDING_CLASS)}>
          <MarbleSortScene
            colorblindMode={colorblindMode}
            hintCell={hintCell}
            state={state}
            onBoxClick={handleBoxClick}
            onHintPosition={setHintPosition}
            onMarbleArrived={handleMarbleArrived}
          />

          <TapHint position={hintCell ? hintPosition : null} />

          <div
            className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[calc(100%-2rem)] sm:text-sm dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-100"
            key={state.lastMessage}
          >
            <span
              className={cn(
                'size-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-950/20',
                availableConveyorSlots(state) < BOX_MARBLE_COUNT && 'bg-amber-400',
                state.completedLevel && 'bg-sky-400',
                state.gameOver && 'bg-rose-500',
              )}
              aria-hidden="true"
            />
            <span>{state.lastMessage}</span>
          </div>

          <LevelCompleteOverlay
            state={state}
            onBackToMenu={handleBackToMenu}
            onNextLevel={handleNextLevel}
            onRestart={handleReset}
          />
        </section>
      </PortraitGameShell>

      <TutorialOverlay open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </div>
  )
}

function loadColorblindMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(COLORBLIND_MODE_STORAGE_KEY) === '1'
}

function saveColorblindMode(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(COLORBLIND_MODE_STORAGE_KEY, enabled ? '1' : '0')
}
