import { ChevronDown, Crown, HelpCircle, LayoutGrid, Plus, RotateCcw, Shuffle, Users, Volume2, VolumeX } from 'lucide-react'
import { type Dispatch, type ReactElement, type SetStateAction, useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import {
  BottomControlButton,
  ColorblindToggle,
  GameBottomToolbar,
  Metric,
  type PowerUpConfirmation,
} from '../_shared/GameControlPrimitives'
import { preloadSfx, setMuted } from './audio/audioManager'
import { type GameState, getLevelDifficulty } from './gameEngine'

export interface GameStats {
  hasLockedRegularSlot: boolean
  parkedCars: number
}

const POWER_UP_CONFIRMATIONS = {
  vip: {
    actionLabel: 'Use VIP',
    description: 'VIP lets you select one visible car and send it to the VIP space, bypassing normal blocking. It is spent when you choose the car.',
    title: 'Use VIP power-up?',
  },
  shuffle: {
    actionLabel: 'Use Shuffle',
    description: 'Shuffle swaps the active car colors into another solvable setup without moving any cars.',
    title: 'Use Shuffle power-up?',
  },
  fill: {
    actionLabel: 'Use Fill',
    description: 'Fill pulls passengers from the queue in FIFO order to fill currently parked cars as much as possible.',
    title: 'Use Fill power-up?',
  },
} satisfies Record<string, PowerUpConfirmation>

export const AUDIO_MUTED_STORAGE_KEY = 'bwh.cars-game.audio.v1'

interface StatsHeaderProps {
  colorblindMode: boolean
  state: GameState
  onBackToMenu: () => void
  onColorblindModeChange: (enabled: boolean) => void
}

interface MobileStatsHeaderProps extends StatsHeaderProps {
  statsExpanded: boolean
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
}

export function MobileStatsOverlay({
  colorblindMode,
  statsExpanded,
  state,
  onBackToMenu,
  onColorblindModeChange,
  onStatsExpandedChange,
}: MobileStatsHeaderProps): ReactElement {
  return (
    <header className="pointer-events-none absolute inset-x-2 top-2 z-30 sm:hidden">
      <div className="pointer-events-auto flex min-h-12 w-full items-stretch gap-1.5 rounded-xl border border-white/70 bg-white/85 p-1.5 shadow-sm shadow-slate-950/5 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80 dark:shadow-slate-950/25">
        <button
          aria-label="Back to level select"
          className="flex min-w-14 flex-col items-center justify-center rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 px-2 py-1 text-white shadow-sm shadow-indigo-950/25 active:scale-95"
          type="button"
          onClick={onBackToMenu}
        >
          <span className="block text-[10px] font-semibold uppercase text-white/70">Level</span>
          <span className="block text-xl font-bold leading-none">{state.level}</span>
          <DifficultyBadge level={state.level} compact />
        </button>
        <button
          className="flex flex-1 items-center justify-between gap-3 rounded-lg px-1.5 text-left"
          type="button"
          onClick={() => onStatsExpandedChange((current) => !current)}
        >
          <span className="flex items-center gap-3">
            <span>
              <span className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Score</span>
              <span className="block text-xl font-bold leading-none tabular-nums">{state.levelScore.toLocaleString()}</span>
            </span>
            <span>
              <span className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Queue</span>
              <span className="block text-xl font-bold leading-none tabular-nums">{state.passengerQueue.length.toLocaleString()}</span>
            </span>
          </span>
          <ChevronDown className={cn('size-5 text-slate-500 transition-transform', statsExpanded && 'rotate-180')} />
        </button>
      </div>
      <div
        className={cn('pointer-events-auto mt-2 rounded-xl border border-white/60 bg-white/70 p-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70', !statsExpanded && 'hidden')}
        data-testid="cars-mobile-stats-panel"
      >
        <ColorblindToggle
          checked={colorblindMode}
          id="cars-colorblind-mobile"
          onCheckedChange={onColorblindModeChange}
        />
      </div>
    </header>
  )
}

export function DesktopStatsHeader({ colorblindMode, state, onBackToMenu, onColorblindModeChange }: StatsHeaderProps): ReactElement {
  return (
    <header className="hidden items-center justify-between gap-4 rounded-xl border border-white/70 bg-white/75 px-3 py-2 shadow-sm shadow-slate-950/5 backdrop-blur-md sm:flex dark:border-white/10 dark:bg-slate-900/75 dark:shadow-slate-950/25">
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label="Back to level select"
          className="flex min-w-24 flex-col items-center rounded-2xl bg-gradient-to-b from-violet-500 to-indigo-600 px-3 py-2 text-white shadow-md shadow-indigo-950/25 transition-transform hover:-translate-y-0.5 active:scale-95"
          type="button"
          onClick={onBackToMenu}
        >
          <span className="text-[10px] font-bold uppercase leading-none text-white/70">Level</span>
          <span className="text-2xl font-black leading-none tabular-nums">{state.level}</span>
          <DifficultyBadge level={state.level} />
        </button>
        <div className="flex items-center gap-1.5">
          <Metric label="Score" value={state.levelScore.toLocaleString()} />
          <Metric label="Queue" value={state.passengerQueue.length.toLocaleString()} />
        </div>
      </div>
      <ColorblindToggle
        checked={colorblindMode}
        id="cars-colorblind-desktop"
        onCheckedChange={onColorblindModeChange}
      />
    </header>
  )
}

interface BottomControlsProps {
  stats: GameStats
  state: GameState
  vipSelectionActive: boolean
  onBackToMenu: () => void
  onFill: () => void
  onOpenSlot: () => void
  onReset: () => void
  onShuffle: () => void
  onTutorialOpen: () => void
  onVipSelectionActiveChange: Dispatch<SetStateAction<boolean>>
}

export function BottomControls({
  stats,
  state,
  vipSelectionActive,
  onBackToMenu,
  onFill,
  onOpenSlot,
  onReset,
  onShuffle,
  onTutorialOpen,
  onVipSelectionActiveChange,
}: BottomControlsProps): ReactElement {
  const levelEnded = Boolean(state.completedLevel || state.failedLevel)
  const [audioMuted, setAudioMuted] = useState(loadAudioMuted)

  useEffect(() => {
    setMuted(audioMuted)
    saveAudioMuted(audioMuted)
  }, [audioMuted])

  useEffect(() => {
    void preloadSfx()
  }, [])

  return (
    <GameBottomToolbar>
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 hover:from-amber-300 hover:to-amber-500"
          active={vipSelectionActive}
          confirmation={vipSelectionActive ? undefined : POWER_UP_CONFIRMATIONS.vip}
          count={state.powerUps.vip}
          disabled={state.powerUps.vip < 1 || levelEnded}
          icon={<Crown />}
          label="VIP"
          onClick={() => onVipSelectionActiveChange((current) => !current)}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-violet-400 to-violet-600 text-white hover:from-violet-400 hover:to-violet-600"
          confirmation={POWER_UP_CONFIRMATIONS.shuffle}
          count={state.powerUps.shuffle}
          disabled={state.powerUps.shuffle < 1 || levelEnded}
          icon={<Shuffle />}
          label="Shuffle"
          onClick={onShuffle}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-sky-400 to-sky-600 text-white hover:from-sky-400 hover:to-sky-600"
          confirmation={POWER_UP_CONFIRMATIONS.fill}
          count={state.powerUps.fill}
          disabled={state.powerUps.fill < 1 || stats.parkedCars < 1 || levelEnded}
          icon={<Users />}
          label="Fill"
          onClick={onFill}
        />
        <span className="mx-0.5 h-9 w-px shrink-0 bg-slate-300/70 dark:bg-white/10" />
        <BottomControlButton
          disabled={!stats.hasLockedRegularSlot || levelEnded}
          icon={<Plus />}
          label="Open Spot"
          variant="outline"
          onClick={onOpenSlot}
        />
        <BottomControlButton
          disabled={false}
          icon={<RotateCcw />}
          label="Reset"
          variant="ghost"
          onClick={onReset}
        />
        <BottomControlButton
          disabled={false}
          icon={<LayoutGrid />}
          label="Level select"
          variant="ghost"
          onClick={onBackToMenu}
        />
        <BottomControlButton
          disabled={false}
          icon={<HelpCircle />}
          label="Tutorial"
          variant="ghost"
          onClick={onTutorialOpen}
        />
        <BottomControlButton
          active={audioMuted}
          disabled={false}
          icon={audioMuted ? <VolumeX /> : <Volume2 />}
          label={audioMuted ? 'Unmute audio' : 'Mute audio'}
          variant="ghost"
          onClick={() => setAudioMuted((current) => !current)}
        />
    </GameBottomToolbar>
  )
}

function DifficultyBadge({ compact = false, level }: { compact?: boolean, level: number }): ReactElement | null {
  const difficulty = getLevelDifficulty(level)
  if (difficulty.kind === 'regular') {
    return null
  }

  return (
    <span
      className={cn(
        'mt-1 rounded bg-red-600 px-1.5 py-0.5 font-black uppercase leading-none tracking-normal text-white shadow-sm shadow-red-950/25 dark:bg-red-500 dark:text-white',
        compact ? 'text-[8px]' : 'text-[9px]',
        difficulty.kind === 'super-hard' && 'bg-red-700 dark:bg-red-600',
      )}
    >
      {difficulty.label}
    </span>
  )
}

function loadAudioMuted(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY) === '1'
}

function saveAudioMuted(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, enabled ? '1' : '0')
}
