import { Flame, Grid3x3, Key, RotateCcw, Snowflake, Volume2, VolumeX, Waves, Wind } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { BootKind, GameState, KeyColor } from '../engine/types'

interface GameHudProps {
  state: GameState
  levelId: number
  par: number
  muted: boolean
  onRestart: () => void
  onLevelSelect: () => void
  onToggleMute: () => void
}

const KEY_COLORS: readonly KeyColor[] = ['red', 'green', 'blue', 'yellow']

const KEY_COLOR_CLASS: Readonly<Record<KeyColor, string>> = {
  red: 'text-rose-500',
  green: 'text-emerald-500',
  blue: 'text-sky-500',
  yellow: 'text-amber-500',
}

const BOOT_ICONS: Readonly<Record<BootKind, { icon: typeof Waves, label: string }>> = {
  flippers: { icon: Waves, label: 'Flippers' },
  fireBoots: { icon: Flame, label: 'Fire boots' },
  skates: { icon: Snowflake, label: 'Skates' },
  suctionBoots: { icon: Wind, label: 'Suction boots' },
}

const iconButtonClass =
  'pointer-events-auto flex size-11 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-800 shadow-md transition-transform active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100'

const chipClass =
  'pointer-events-auto flex h-11 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 text-sm font-bold text-slate-800 shadow-md dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100'

/**
 * In-level HUD top bar (level, chips, moves/par, restart/level-select buttons)
 * plus an inventory row for keys/boots. See docs/games/chicks-challenge.md
 * "HUD & screens". It is a flow sibling of the playfield — not an overlay — so it
 * can never cover board tiles; the hint banner is `hud/HintBanner.tsx`.
 */
export function GameHud({ state, levelId, par, muted, onRestart, onLevelSelect, onToggleMute }: GameHudProps): ReactElement {
  const heldKeyColors = KEY_COLORS.filter((color) => state.keys[color] > 0)
  const heldBoots = (Object.keys(state.boots) as BootKind[]).filter((boot) => state.boots[boot])

  return (
    <div
      className="pointer-events-none z-10 flex shrink-0 select-none flex-col
        pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]
        pl-[max(0.75rem,env(safe-area-inset-left))]"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span aria-label={`Level ${levelId}`} className={chipClass}>#{levelId}</span>
            <span aria-label={`${state.chipsRemaining} chips remaining`} className={chipClass}>
              💠 {state.chipsRemaining}
            </span>
            <span aria-label={`${state.moves} of ${par} moves`} className={cn(chipClass, 'tabular-nums')}>
              {state.moves} / {par}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              className={iconButtonClass}
              type="button"
              onClick={onToggleMute}
            >
              {muted ? <VolumeX aria-hidden="true" className="size-5" /> : <Volume2 aria-hidden="true" className="size-5" />}
            </button>
            <button aria-label="Restart level" className={iconButtonClass} type="button" onClick={onRestart}>
              <RotateCcw aria-hidden="true" className="size-5" />
            </button>
            <button aria-label="Level select" className={iconButtonClass} type="button" onClick={onLevelSelect}>
              <Grid3x3 aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        {(heldKeyColors.length > 0 || heldBoots.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            {heldKeyColors.map((color) => (
              <span
                aria-label={`${color} key${color === 'green' ? ' (reusable)' : `: ${state.keys[color]}`}`}
                className={chipClass}
                key={color}
              >
                <Key aria-hidden="true" className={cn('size-4', KEY_COLOR_CLASS[color])} />
                {color === 'green' ? '∞' : state.keys[color]}
              </span>
            ))}
            {heldBoots.map((boot) => {
              const { icon: Icon, label } = BOOT_ICONS[boot]

              return (
                <span aria-label={label} className={chipClass} key={boot}>
                  <Icon aria-hidden="true" className="size-4" />
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
