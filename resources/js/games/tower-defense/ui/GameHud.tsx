import { Coins, Flag, Heart } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { ELEMENTS, elementWeakTo, ENEMIES } from '../catalog'
import type { HudSnapshot, WaveDef } from '../gameTypes'
import { GameIcon, INLINE_ICON } from './GameIcon'

interface GameHudProps {
  title: string
  hud: HudSnapshot
}

function Stat({ icon, label, value, testId, className }: { icon: ReactElement; label: string; value: string; testId: string; className?: string }): ReactElement {
  return (
    <div className={cn('flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-800 px-2.5 py-1', className)} title={label}>
      {icon}
      <span className="sr-only">{label}: </span>
      <span className="text-base font-black tabular-nums leading-5 md:text-lg" data-testid={testId}>{value}</span>
    </div>
  )
}

/** What is coming and what beats it, so the next build can be a decision and not a guess. */
export function waveSummary(wave: WaveDef): string {
  return wave.groups.map((group) => `${group.count} ${ENEMIES[group.kind].name}`).join(' + ')
}

export function GameHud({ title, hud }: GameHudProps): ReactElement {
  const wave = hud.nextWave
  const element = wave?.element ? ELEMENTS[wave.element] : null
  const counter = wave ? elementWeakTo(wave.element ?? 'fire') : null

  return (
    <header className="z-10 flex shrink-0 flex-col gap-1 bg-slate-900 px-[max(0.75rem,env(safe-area-inset-left))] pb-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] text-white" data-testid="tower-defense-hud">
      <div className="flex flex-wrap items-center gap-1.5">
        <h1 className="mr-auto min-w-0 truncate text-sm font-black md:text-base">{title}</h1>
        <Stat icon={<Flag aria-hidden="true" className="size-4 text-sky-300" />} label="Wave" testId="wave" value={`${hud.waveNumber}/${hud.totalWaves}`} />
        <Stat icon={<Heart aria-hidden="true" className="size-4 fill-rose-500 text-rose-500" />} label="Lives" testId="lives" value={String(hud.lives)} />
        <Stat className="border-amber-300/40" icon={<Coins aria-hidden="true" className="size-4 text-amber-300" />} label="Gold" testId="gold" value={String(hud.gold)} />
      </div>
      <p className="flex min-h-5 items-center gap-1.5 truncate text-xs font-semibold text-slate-300" data-testid="next-wave">
        {wave ? (
          <>
            <span className={cn('shrink-0 rounded-full px-1.5 font-black', wave.boss ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-100')}>{wave.boss ? 'BOSS' : 'NEXT'}</span>
            {hud.nextWaveIn !== null && <span className="shrink-0 font-black tabular-nums text-amber-200">{Math.ceil(hud.nextWaveIn)}s</span>}
            <span className="truncate">{element && <span><GameIcon className={INLINE_ICON} name={element.id} /> {element.name} </span>}{waveSummary(wave)}</span>
            {element && counter && <span className="shrink-0 text-emerald-300">· <GameIcon className={INLINE_ICON} name={counter} /> beats it</span>}
          </>
        ) : (
          <span>Final wave. Hold the keep!</span>
        )}
      </p>
    </header>
  )
}
