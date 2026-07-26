import currency from 'currency.js'
import type { ReactElement } from 'react'

import type { ItemKind } from '../gameTypes'

interface TowerCompleteProps {
  daysElapsed: number
  population: number
  funds: number
  endgameKind: ItemKind
  onDismiss: () => void
}

/** Full-screen TOWER celebration; the sim is paused while it is up. */
export function TowerComplete({ daysElapsed, population, funds, endgameKind, onDismiss }: TowerCompleteProps): ReactElement {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85" data-testid="tower-complete">
      <div className="w-[26rem] rounded-2xl border border-amber-400/60 bg-gradient-to-b from-slate-900 to-slate-950 p-8 text-center shadow-2xl">
        <div className="text-6xl leading-none">👑</div>
        <div className="mt-2 text-5xl leading-none">🏙️</div>
        <h1 className="mt-4 text-4xl font-black tracking-[0.3em] text-amber-300">TOWER</h1>
        <p className="mt-2 text-sm text-white/70">
          {endgameKind === 'observationDeck'
            ? 'The Observation Deck opens above the gorge — Niagara has earned the highest honor.'
            : 'The cathedral bells ring out — your skyscraper has earned the highest honor.'}
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg bg-white/5 p-2">
            <dt className="text-[10px] tracking-widest text-white/50">DAYS</dt>
            <dd className="font-bold tabular-nums" data-testid="stat-days">
              {daysElapsed.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <dt className="text-[10px] tracking-widest text-white/50">POPULATION</dt>
            <dd className="font-bold tabular-nums" data-testid="stat-population">
              {population.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <dt className="text-[10px] tracking-widest text-white/50">FUNDS</dt>
            <dd className="font-bold tabular-nums" data-testid="stat-funds">
              {currency(funds, { precision: 0 }).format()}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          data-testid="keep-building"
          onClick={onDismiss}
          className="mt-6 w-full rounded-lg bg-amber-500/85 px-4 py-2 font-bold text-slate-950 hover:bg-amber-400"
        >
          Keep building
        </button>
      </div>
    </div>
  )
}
