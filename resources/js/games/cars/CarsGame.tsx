import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { TapHint, type TapHintPosition } from '../_shared/TapHint'
import { PortraitGameShell } from '../PortraitGameShell'
import { playSfx } from './audio/audioManager'
import { CarsScene } from './CarsScene'
import {
  BottomControls,
  DesktopStatsHeader,
  type GameStats,
  MobileStatsOverlay,
} from './GameControls'
import {
  advanceToNextLevel,
  applyFillPowerUp,
  applyShufflePowerUp,
  applyVipPowerUp,
  canMoveCar,
  clearLevelSnapshot,
  type GameState,
  generateLevel,
  loadLevelSnapshot,
  loadProgress,
  moveCarToParking,
  openParkingSlot,
  PARKING_LEVELS,
  processBoardingAtParkingGate,
  recordWin,
  restartLevel,
  type SavedGameProgress,
  saveLevelSnapshot,
  saveProgress,
  startLevel,
} from './gameEngine'
import { LevelCompleteOverlay } from './LevelCompleteOverlay'
import { LevelSelect } from './LevelSelect'
import { TutorialOverlay } from './TutorialOverlay'
import { readParkingPickupVisualTestOptions } from './visualTestMode'

const COLORBLIND_MODE_STORAGE_KEY = 'bwh.cars-game.colorblind.v1'

export function CarsGame(): ReactElement {
  const visualTestOptions = useMemo(() => readParkingPickupVisualTestOptions(), [])
  const [progress, setProgress] = useState<SavedGameProgress>(() => loadProgress())
  const [state, setState] = useState<GameState | null>(() => {
    if (visualTestOptions.enabled) {
      return generateLevel(visualTestOptions.level ?? 1)
    }

    return loadLevelSnapshot()
  })
  const [vipSelectionActive, setVipSelectionActive] = useState(false)
  const [blockedCarAttempt, setBlockedCarAttempt] = useState<{ carId: string, nonce: number } | null>(null)
  const [statsExpanded, setStatsExpanded] = useState(() => {
    if (visualTestOptions.enabled) {
      return visualTestOptions.hud === 'normal'
    }

    return false
  })
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [hintPosition, setHintPosition] = useState<TapHintPosition | null>(null)
  const [colorblindMode, setColorblindMode] = useState(() => {
    if (visualTestOptions.enabled && visualTestOptions.colorblind !== null) {
      return visualTestOptions.colorblind
    }

    return loadColorblindMode()
  })
  const stateRef = useRef(state)
  const recordedWinKeyRef = useRef<string | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const commitState = useCallback((next: GameState): void => {
    stateRef.current = next
    setState(next)
  }, [])

  const commitProgress = useCallback((next: SavedGameProgress): void => {
    saveProgress(next)
    setProgress(next)
  }, [])

  useEffect(() => {
    if (visualTestOptions.enabled || !state) {
      return
    }

    if (state.completedLevel) {
      const winKey = completedLevelKey(state.completedLevel)
      if (winKey && winKey !== recordedWinKeyRef.current) {
        recordedWinKeyRef.current = winKey
        playSfx('level-complete')
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
      current.powerUps.vip !== state.powerUps.vip
      || current.powerUps.shuffle !== state.powerUps.shuffle
      || current.powerUps.fill !== state.powerUps.fill
    ) {
      commitProgress({ ...current, powerUps: { ...state.powerUps } })
    }
  }, [commitProgress, state, visualTestOptions.enabled])

  // Self-teaching level 1: point at a movable car until the first successful move.
  const hintCarId = useMemo(() => {
    if (
      visualTestOptions.enabled
      || !state
      || state.level !== 1
      || state.completedLevel
      || state.failedLevel
      || state.cars.some((car) => car.status !== 'field')
    ) {
      return null
    }

    return state.cars.find((car) => car.status === 'field' && canMoveCar(state, car.id))?.id ?? null
  }, [state, visualTestOptions.enabled])

  const stats = useMemo<GameStats>(() => {
    if (!state) {
      return { parkedCars: 0, hasLockedRegularSlot: false }
    }

    return {
      parkedCars: state.cars.filter((car) => car.status === 'parked').length,
      hasLockedRegularSlot: state.parkingSlots.some((slot) => slot.kind === 'regular' && !slot.unlocked),
    }
  }, [state])

  const handleCarClick = useCallback((carId: string): void => {
    const current = stateRef.current
    if (!current) {
      return
    }

    if (current.failedLevel) {
      setVipSelectionActive(false)

      return
    }

    if (vipSelectionActive) {
      commitState(applyVipPowerUp(current, carId))
      setVipSelectionActive(false)

      return
    }

    const clickedCar = current.cars.find((car) => car.id === carId)
    const blocked = clickedCar?.status === 'field' && !canMoveCar(current, carId)
    const next = moveCarToParking(current, carId)
    const parkedCar = next.cars.find((car) => car.id === carId)

    if (blocked) {
      setBlockedCarAttempt({ carId, nonce: Date.now() })
      playSfx('car-blocked')
    }

    if (clickedCar?.status === 'field' && parkedCar?.status === 'parked') {
      playSfx('car-park-success')
    }

    commitState(next)
    setVipSelectionActive(false)
  }, [commitState, vipSelectionActive])

  const handleShuffle = useCallback((): void => {
    setVipSelectionActive(false)
    if (stateRef.current) {
      commitState(applyShufflePowerUp(stateRef.current))
    }
  }, [commitState])

  const handleFill = useCallback((): void => {
    setVipSelectionActive(false)
    if (stateRef.current) {
      commitState(applyFillPowerUp(stateRef.current))
    }
  }, [commitState])

  const handleOpenSlot = useCallback((): void => {
    if (stateRef.current) {
      commitState(openParkingSlot(stateRef.current))
    }
  }, [commitState])

  const handleColorblindModeChange = useCallback((enabled: boolean): void => {
    setColorblindMode(enabled)
    if (!visualTestOptions.enabled) {
      saveColorblindMode(enabled)
    }
  }, [visualTestOptions.enabled])

  const handlePassengerGate = useCallback((passengerId: string): void => {
    const current = stateRef.current
    if (!current) {
      return
    }

    const next = processBoardingAtParkingGate(current, passengerId)
    if (next !== current && next.passengerQueue.length < current.passengerQueue.length) {
      playSfx('passenger-board')
    }

    commitState(next)
  }, [commitState])

  const handleSelectLevel = useCallback((levelId: number): void => {
    setVipSelectionActive(false)
    recordedWinKeyRef.current = null
    if (!visualTestOptions.enabled) {
      // Tapping the in-progress level resumes its snapshot; picking a
      // different level intentionally abandons it.
      const snapshot = loadLevelSnapshot(undefined, progress)
      if (snapshot && snapshot.level === levelId) {
        commitState(snapshot)

        return
      }

      clearLevelSnapshot()
    }

    commitState(startLevel(levelId, progress))
  }, [commitState, progress, visualTestOptions.enabled])

  const handleNextLevel = useCallback((): void => {
    setVipSelectionActive(false)
    recordedWinKeyRef.current = null
    if (!visualTestOptions.enabled) {
      clearLevelSnapshot()
    }

    const current = stateRef.current
    if (current) {
      commitState(advanceToNextLevel(current))
    }
  }, [commitState, visualTestOptions.enabled])

  const handleReset = useCallback((): void => {
    setVipSelectionActive(false)
    recordedWinKeyRef.current = null
    if (!visualTestOptions.enabled) {
      clearLevelSnapshot()
    }

    if (stateRef.current) {
      commitState(restartLevel(stateRef.current))
    }
  }, [commitState, visualTestOptions.enabled])

  const handleBackToMenu = useCallback((): void => {
    setVipSelectionActive(false)
    recordedWinKeyRef.current = null
    stateRef.current = null
    setState(null)
  }, [])

  if (!state) {
    return (
      <div className="bg-sky-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
        <PortraitGameShell contentClassName="gap-1 px-0 py-0 sm:gap-2.5 sm:px-4 sm:py-3 lg:px-5">
          <section className="relative min-h-0 flex-1">
            <LevelSelect levels={PARKING_LEVELS} progress={progress} onSelectLevel={handleSelectLevel} />
          </section>
        </PortraitGameShell>
      </div>
    )
  }

  return (
    <div className="bg-sky-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <PortraitGameShell contentClassName="gap-1 px-0 py-0 sm:gap-2.5 sm:px-4 sm:py-3 lg:px-5">
        <DesktopStatsHeader
          colorblindMode={colorblindMode}
          state={state}
          onBackToMenu={handleBackToMenu}
          onColorblindModeChange={handleColorblindModeChange}
        />

        <section className="relative min-h-0 flex-1">
          <CarsScene
            blockedCarAttempt={blockedCarAttempt}
            colorblindMode={colorblindMode}
            hintCarId={hintCarId}
            state={state}
            vipSelectionActive={vipSelectionActive}
            visualTestOptions={visualTestOptions}
            onCarClick={handleCarClick}
            onHintPosition={setHintPosition}
            onPassengerGate={handlePassengerGate}
          />

          <TapHint position={hintCarId ? hintPosition : null} />

          <MobileStatsOverlay
            colorblindMode={colorblindMode}
            statsExpanded={statsExpanded}
            state={state}
            onBackToMenu={handleBackToMenu}
            onColorblindModeChange={handleColorblindModeChange}
            onStatsExpandedChange={setStatsExpanded}
          />

          <BottomControls
            stats={stats}
            state={state}
            vipSelectionActive={vipSelectionActive}
            onBackToMenu={handleBackToMenu}
            onFill={handleFill}
            onOpenSlot={handleOpenSlot}
            onReset={handleReset}
            onShuffle={handleShuffle}
            onTutorialOpen={() => setTutorialOpen(true)}
            onVipSelectionActiveChange={setVipSelectionActive}
          />

          <style>{`
            @keyframes cars-blocked-toast-pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55);
                transform: scale(1);
              }

              45% {
                box-shadow: 0 0 0 0.45rem rgba(239, 68, 68, 0.18);
                transform: scale(1.015);
              }

              100% {
                box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
                transform: scale(1);
              }
            }

            .cars-blocked-toast-pulse {
              animation: cars-blocked-toast-pulse 420ms ease-out both;
            }

            @media (prefers-reduced-motion: reduce) {
              .cars-blocked-toast-pulse {
                animation: none;
              }
            }
          `}</style>
          <div
            className={cn(
              'pointer-events-none absolute left-3 top-[4.75rem] z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[calc(100%-2rem)] sm:text-sm dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-100',
              statsExpanded && 'top-[7.5rem] sm:top-4',
              blockedCarAttempt && 'cars-blocked-toast-pulse border-rose-300 bg-rose-50/90 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/75 dark:text-rose-100',
            )}
            key={blockedCarAttempt?.nonce ?? 'cars-message'}
          >
            <span
              className={cn(
                'size-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-950/20',
                vipSelectionActive && 'bg-amber-400',
                blockedCarAttempt && 'bg-rose-500',
              )}
              aria-hidden="true"
            />
            <span>{vipSelectionActive ? 'VIP selection active' : state.lastMessage}</span>
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

function completedLevelKey(completedLevel: GameState['completedLevel']): string | null {
  if (!completedLevel) {
    return null
  }

  return `${completedLevel.level}:${completedLevel.score}:${completedLevel.awardedPowerUp}`
}
