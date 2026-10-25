import { Flame, Grid3x3, Key, RotateCcw, Snowflake, Waves, Wind } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { SoundToggle } from '../../_shared/audio/SoundToggle'
import type { BootKind, GameState, KeyColor } from '../engine/types'
import { inventoryRow, type InventorySlot } from './inventorySlots'

interface GameHudProps {
  state: GameState
  levelId: number
  par: number
  /** Item kinds this level can hand out; their row is reserved from the start. */
  inventorySlots: readonly InventorySlot[]
  muted: boolean
  onRestart: () => void
  onLevelSelect: () => void
  onToggleMute: () => void
}

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

/** Compact, fixed-height inventory chips; an empty slot is a dashed outline. */
const slotClass = 'flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-bold tabular-nums'
const heldSlotClass = 'border-white/70 bg-white/90 text-slate-800 shadow-md dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100'
const emptySlotClass = 'border-dashed border-slate-400/60 text-slate-500 opacity-60 dark:border-slate-500/60 dark:text-slate-400'

const chipClass =
  'pointer-events-auto flex h-11 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 text-sm font-bold text-slate-800 shadow-md dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100'

/**
 * In-level HUD top bar (level, chips, moves/par, restart/level-select buttons)
 * plus an inventory row for keys/boots. See docs/games/chicks-challenge.md
 * "HUD & screens". It is a flow sibling of the playfield — not an overlay — so it
 * can never cover board tiles; the hint banner is `hud/HintBanner.tsx`.
 */
export function GameHud({ state, levelId, par, inventorySlots, muted, onRestart, onLevelSelect, onToggleMute }: GameHudProps): ReactElement {
  const row = inventoryRow(inventorySlots, state)

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
            <SoundToggle muted={muted} onMutedChange={onToggleMute} className={iconButtonClass} iconClassName="size-5" />
            <button aria-label="Restart level" className={iconButtonClass} type="button" onClick={onRestart}>
              <RotateCcw aria-hidden="true" className="size-5" />
            </button>
            <button aria-label="Level select" className={iconButtonClass} type="button" onClick={onLevelSelect}>
              <Grid3x3 aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        {row.length > 0 && (
          // One line that never wraps: the board below keeps its size as items come and go.
          <div aria-label="Inventory" className="flex h-9 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0" data-testid="inventory-row" role="group">
            {row.map((slot) => slot.kind === 'key' ? <KeySlot key={`key-${slot.color}`} color={slot.color} count={state.keys[slot.color]} /> : <BootSlot key={`boot-${slot.boot}`} boot={slot.boot} held={state.boots[slot.boot]} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function KeySlot({ color, count }: { color: KeyColor, count: number }): ReactElement {
  const held = count > 0
  const label = `${color} key${held ? (color === 'green' ? ' (reusable)' : `: ${count}`) : ': not collected'}`
  return (
    <span aria-label={label} className={cn(slotClass, held ? heldSlotClass : emptySlotClass)} data-held={held} role="img">
      <Key aria-hidden="true" className={cn('size-4', KEY_COLOR_CLASS[color])} />
      {held && (color === 'green' ? '∞' : count)}
    </span>
  )
}

function BootSlot({ boot, held }: { boot: BootKind, held: boolean }): ReactElement {
  const { icon: Icon, label } = BOOT_ICONS[boot]
  return (
    <span aria-label={held ? label : `${label}: not collected`} className={cn(slotClass, held ? heldSlotClass : emptySlotClass)} data-held={held} role="img">
      <Icon aria-hidden="true" className="size-4" />
    </span>
  )
}
