import { ChevronDown, Coins, HelpCircle, LayoutGrid, Magnet, MoveRight, RotateCcw, Shuffle, Volume2, VolumeX } from 'lucide-react'
import { type Dispatch, type ReactElement, type ReactNode, type SetStateAction } from 'react'

import { cn } from '@/lib/utils'

import { FullscreenBottomControlButton } from '../_shared/FullscreenButton'
import {
  BottomControlButton,
  ColorblindToggle,
  GameBottomToolbar,
  Metric,
  type PowerUpConfirmation,
} from '../_shared/GameControlPrimitives'
import { type GameState, labelForPowerUp } from './gameEngine'

export interface GameStats {
  boxCount: number
  conveyorCount: number
}

interface GameControlsProps {
  colorblindMode: boolean
  soundMuted: boolean
  stats: GameStats
  statsExpanded: boolean
  state: GameState
  onColorblindModeChange: (enabled: boolean) => void
  onExtraBelt: () => void
  onMagnet: () => void
  onBackToMenu: () => void
  onReset: () => void
  onShuffle: () => void
  onSoundMutedChange: (muted: boolean) => void
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
  onTutorialOpen: () => void
}

const POWER_UP_CONFIRMATIONS = {
  extraBelt: {
    actionLabel: 'Use Extra Belt',
    description: 'Extra Belt adds room for one more opened box worth of marbles on the conveyor for this level.',
    title: 'Use Extra Belt?',
  },
  magnet: {
    actionLabel: 'Use Magnet',
    description: 'Magnet immediately pulls conveyor marbles into matching open sorting blocks while slots are available.',
    title: 'Use Magnet?',
  },
  shuffle: {
    actionLabel: 'Use Shuffle',
    description: 'Shuffle changes the remaining box colors into another solvable arrangement without changing counts.',
    title: 'Use Shuffle?',
  },
} satisfies Record<string, PowerUpConfirmation>

export function GameControls({
  colorblindMode,
  soundMuted,
  stats,
  statsExpanded,
  state,
  onColorblindModeChange,
  onExtraBelt,
  onMagnet,
  onBackToMenu,
  onReset,
  onShuffle,
  onSoundMutedChange,
  onStatsExpandedChange,
  onTutorialOpen,
}: GameControlsProps): ReactElement {
  return (
    <>
      <MobileStatsHeader
        colorblindMode={colorblindMode}
        stats={stats}
        statsExpanded={statsExpanded}
        state={state}
        onBackToMenu={onBackToMenu}
        onColorblindModeChange={onColorblindModeChange}
        onStatsExpandedChange={onStatsExpandedChange}
      />
      <DesktopStatsHeader
        colorblindMode={colorblindMode}
        stats={stats}
        state={state}
        onBackToMenu={onBackToMenu}
        onColorblindModeChange={onColorblindModeChange}
      />
      <BottomControls
        soundMuted={soundMuted}
        stats={stats}
        state={state}
        onExtraBelt={onExtraBelt}
        onMagnet={onMagnet}
        onBackToMenu={onBackToMenu}
        onReset={onReset}
        onShuffle={onShuffle}
        onSoundMutedChange={onSoundMutedChange}
        onTutorialOpen={onTutorialOpen}
      />
    </>
  )
}

interface StatsHeaderProps {
  colorblindMode: boolean
  stats: GameStats
  state: GameState
  onBackToMenu: () => void
  onColorblindModeChange: (enabled: boolean) => void
}

interface MobileStatsHeaderProps extends StatsHeaderProps {
  statsExpanded: boolean
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
}

function MobileStatsHeader({
  colorblindMode,
  stats,
  statsExpanded,
  state,
  onBackToMenu,
  onColorblindModeChange,
  onStatsExpandedChange,
}: MobileStatsHeaderProps): ReactElement {
  return (
    <header className="sm:hidden">
      <div className="flex h-14 w-full items-center gap-2 rounded-2xl border border-white/70 bg-white/85 px-2.5 shadow-lg shadow-slate-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80">
        <LevelPill level={state.level} onClick={onBackToMenu} />
        <button
          className="flex h-full flex-1 items-center justify-between text-left"
          type="button"
          onClick={() => onStatsExpandedChange((current) => !current)}
        >
          <span className="flex items-center gap-2">
            <Chip icon={<Coins className="size-4 text-amber-500" />} value={state.levelScore.toLocaleString()} />
            <Chip icon={<MoveRight className="size-4 text-sky-500" />} value={`${stats.conveyorCount}/${state.conveyorCapacity}`} />
          </span>
          <ChevronDown className={cn('mr-1 size-5 shrink-0 text-slate-400 transition-transform', statsExpanded && 'rotate-180')} />
        </button>
      </div>
      <div className={cn('mt-2 rounded-2xl border border-white/60 bg-white/75 p-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70', !statsExpanded && 'hidden')}>
        <ColorblindToggle
          checked={colorblindMode}
          id="marble-sort-colorblind-mobile"
          onCheckedChange={onColorblindModeChange}
        />
      </div>
    </header>
  )
}

function DesktopStatsHeader({ colorblindMode, stats, state, onBackToMenu, onColorblindModeChange }: StatsHeaderProps): ReactElement {
  return (
    <header className="hidden items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:flex dark:border-white/10 dark:bg-slate-900/75">
      <div className="flex min-w-0 items-center gap-3">
        <LevelPill level={state.level} onClick={onBackToMenu} />
        <div className="flex items-center gap-1.5">
          <Metric label="Score" value={state.levelScore.toLocaleString()} />
          <Metric label="Belt" value={`${stats.conveyorCount}/${state.conveyorCapacity}`} />
        </div>
      </div>
      <ColorblindToggle
        checked={colorblindMode}
        id="marble-sort-colorblind-desktop"
        onCheckedChange={onColorblindModeChange}
      />
    </header>
  )
}

interface BottomControlsProps {
  soundMuted: boolean
  stats: GameStats
  state: GameState
  onExtraBelt: () => void
  onMagnet: () => void
  onBackToMenu: () => void
  onReset: () => void
  onShuffle: () => void
  onSoundMutedChange: (muted: boolean) => void
  onTutorialOpen: () => void
}

function BottomControls({
  soundMuted,
  stats,
  state,
  onExtraBelt,
  onMagnet,
  onBackToMenu,
  onReset,
  onShuffle,
  onSoundMutedChange,
  onTutorialOpen,
}: BottomControlsProps): ReactElement {
  const actionDisabled = Boolean(state.completedLevel || state.gameOver)

  return (
    <GameBottomToolbar>
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-rose-400 to-rose-600 text-white hover:from-rose-400 hover:to-rose-600"
          confirmation={POWER_UP_CONFIRMATIONS.magnet}
          count={state.powerUps.magnet}
          disabled={state.powerUps.magnet < 1 || stats.conveyorCount < 1 || actionDisabled}
          icon={<Magnet />}
          label={labelForPowerUp('magnet')}
          onClick={onMagnet}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-violet-400 to-violet-600 text-white hover:from-violet-400 hover:to-violet-600"
          confirmation={POWER_UP_CONFIRMATIONS.shuffle}
          count={state.powerUps.shuffle}
          disabled={state.powerUps.shuffle < 1 || stats.boxCount < 2 || actionDisabled}
          icon={<Shuffle />}
          label={labelForPowerUp('shuffle')}
          onClick={onShuffle}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-sky-400 to-sky-600 text-white hover:from-sky-400 hover:to-sky-600"
          confirmation={POWER_UP_CONFIRMATIONS.extraBelt}
          count={state.powerUps.extraBelt}
          disabled={state.powerUps.extraBelt < 1 || actionDisabled}
          icon={<MoveRight />}
          label={labelForPowerUp('extraBelt')}
          onClick={onExtraBelt}
        />
        <span className="mx-0.5 h-9 w-px shrink-0 bg-slate-300/70 dark:bg-white/10" />
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
          disabled={false}
          icon={soundMuted ? <VolumeX /> : <Volume2 />}
          label={soundMuted ? 'Unmute sound' : 'Mute sound'}
          variant="ghost"
          onClick={() => onSoundMutedChange(!soundMuted)}
        />
        <FullscreenBottomControlButton />
    </GameBottomToolbar>
  )
}

function LevelPill({ level, onClick }: { level: number, onClick: () => void }): ReactElement {
  return (
    <button
      aria-label="Back to level select"
      className="flex items-center gap-2 rounded-2xl bg-gradient-to-b from-violet-500 to-indigo-600 px-3 py-1.5 text-white shadow-md shadow-indigo-950/25 transition-transform hover:-translate-y-0.5 active:scale-95"
      type="button"
      onClick={onClick}
    >
      <span className="text-[10px] font-bold uppercase leading-none text-white/70">Level</span>
      <span className="text-2xl font-black leading-none tabular-nums">{level}</span>
    </button>
  )
}

interface ChipProps {
  icon: ReactNode
  value: string
}

function Chip({ icon, value }: ChipProps): ReactElement {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/10">
      {icon}
      <span className="text-sm font-black leading-none tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
    </span>
  )
}
