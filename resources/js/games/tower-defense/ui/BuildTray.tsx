import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { ELEMENTS, TOWERS } from '../catalog'
import type { HudSnapshot, TowerId } from '../gameTypes'

interface BuildTrayProps {
  hud: HudSnapshot
  tool: TowerId | null
  heroOpen: boolean
  disabled: boolean
  onTool: (tower: TowerId) => void
  onHero: () => void
}

const CARD = 'relative flex h-20 w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 pb-1 pt-1.5 shadow-sm transition-transform active:scale-95 md:h-24 md:w-[5.75rem]'

/**
 * What can be built now: a strip along the bottom in portrait and a left column on wide
 * screens, with the same generous cards and edge insets as Marble Works' tray so nothing
 * sits under a tablet's edge swipes.
 */
export function BuildTray({ hud, tool, heroOpen, disabled, onTool, onHero }: BuildTrayProps): ReactElement {
  const towers: TowerId[] = ['wall', 'arrow', ...hud.unlocked.map((element) => ELEMENTS[element].tower)]

  return (
    <div
      aria-label="Build tray"
      className={cn(
        'z-10 flex shrink-0 select-none gap-1.5 overflow-x-auto border-t border-white/10 bg-slate-900/95 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
        'md:flex-col md:gap-2 md:overflow-x-visible md:overflow-y-auto md:border-r md:border-t-0 md:py-3 md:pl-[max(1.25rem,env(safe-area-inset-left))] md:pr-4',
        disabled && 'pointer-events-none opacity-50',
      )}
      data-testid="build-tray"
      role="toolbar"
    >
      <button
        aria-label="Hero upgrades"
        aria-pressed={heroOpen}
        className={cn(CARD, heroOpen ? 'border-amber-300 bg-amber-300/20 ring-2 ring-amber-300' : 'border-white/10 bg-slate-800', 'text-slate-100')}
        data-testid="tray-hero"
        type="button"
        onClick={onHero}
      >
        <span aria-hidden="true" className="text-2xl leading-none md:text-3xl">🛠️</span>
        <span className="w-full truncate text-center text-[10px] font-bold leading-tight md:text-xs">Hero</span>
      </button>
      {towers.map((tower, index) => {
        const def = TOWERS[tower]
        const cost = def.costs[0]
        const affordable = hud.gold >= cost
        const selected = tool === tower

        return (
          <button
            aria-label={`${def.name}, ${cost} gold${affordable ? '' : ', not enough gold'}`}
            aria-pressed={selected}
            className={cn(
              CARD,
              selected ? '-translate-y-1 border-emerald-300 bg-emerald-400/20 ring-2 ring-emerald-300 md:translate-x-1 md:translate-y-0' : 'border-white/10 bg-slate-800',
              affordable ? 'text-slate-100' : 'text-slate-400',
            )}
            data-testid={`tray-${tower}`}
            key={tower}
            title={`${def.blurb} (key ${index + 1})`}
            type="button"
            onClick={() => onTool(tower)}
          >
            <span aria-hidden="true" className={cn('text-2xl leading-none md:text-3xl', !affordable && 'opacity-40 grayscale')}>{def.symbol}</span>
            <span className="w-full truncate text-center text-[10px] font-bold leading-tight md:text-xs">{def.name.replace(' Tower', '')}</span>
            <span className={cn('rounded-full px-1.5 text-[11px] font-black leading-4 tabular-nums', affordable ? 'bg-amber-400 text-amber-950' : 'bg-slate-600 text-slate-200')}>{cost}</span>
          </button>
        )
      })}
    </div>
  )
}
