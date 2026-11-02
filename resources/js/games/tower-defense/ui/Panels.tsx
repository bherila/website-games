import { ArrowUpCircle, Coins, Trash2, X } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { ELEMENTS, HERO_UPGRADES, MAX_TIER, TOWERS, towerStats, upgradeCost } from '../catalog'
import { sellValue } from '../gameEngine'
import type { Building, HeroUpgrade, HudSnapshot } from '../gameTypes'

function PanelShell({ title, onClose, children, testId }: { title: ReactNode; onClose: () => void; children: ReactNode; testId: string }): ReactElement {
  return (
    <div
      className="absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-white/15 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur"
      data-testid={testId}
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-black">{title}</h2>
        <button aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/10 active:scale-95" type="button" onClick={onClose}>
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {children}
    </div>
  )
}

interface BuildingPanelProps {
  building: Building
  gold: number
  upgradeQueued: boolean
  onUpgrade: () => void
  onSell: () => void
  onClose: () => void
}

export function BuildingPanel({ building, gold, upgradeQueued, onUpgrade, onSell, onClose }: BuildingPanelProps): ReactElement {
  const def = TOWERS[building.tower]
  const stats = towerStats(building.tower, building.tier)
  const next = building.tier < MAX_TIER ? towerStats(building.tower, building.tier + 1) : null
  const cost = upgradeCost(building.tower, building.tier)
  const canAfford = cost !== null && gold >= cost
  const element = def.element ? ELEMENTS[def.element] : null

  return (
    <PanelShell title={<>{def.symbol} {def.name} · tier {building.tier}/{MAX_TIER}</>} testId="building-panel" onClose={onClose}>
      <p className="mb-2 text-xs text-slate-300">
        {def.blurb}
        {element && <> Strong against {ELEMENTS[element.strongAgainst].symbol} {ELEMENTS[element.strongAgainst].name}.</>}
      </p>
      <dl className="mb-2 flex gap-3 text-xs font-bold tabular-nums">
        <div><dt className="text-slate-400">Health</dt><dd>{Math.ceil(building.hp)}/{building.maxHp}{next && <span className="text-emerald-300"> → {next.hp}</span>}</dd></div>
        {def.damage > 0 && <div><dt className="text-slate-400">Damage</dt><dd>{stats.damage}{next && <span className="text-emerald-300"> → {next.damage}</span>}</dd></div>}
        {def.range > 0 && <div><dt className="text-slate-400">Range</dt><dd>{stats.range.toFixed(1)}{next && <span className="text-emerald-300"> → {next.range.toFixed(1)}</span>}</dd></div>}
      </dl>
      <div className="flex gap-2">
        <button
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white active:scale-95 disabled:bg-slate-700 disabled:text-slate-400"
          data-testid="upgrade-building"
          disabled={!canAfford || upgradeQueued}
          type="button"
          onClick={onUpgrade}
        >
          <ArrowUpCircle aria-hidden="true" className="size-4" />
          {cost === null ? 'Top tier' : upgradeQueued ? 'Hero on the way' : `Upgrade · ${cost}`}
        </button>
        <button
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-black text-white active:scale-95"
          data-testid="sell-building"
          type="button"
          onClick={onSell}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Sell · {building.progress < 1 ? building.invested : sellValue(building)}
        </button>
      </div>
    </PanelShell>
  )
}

interface HeroPanelProps {
  hud: HudSnapshot
  onBuy: (upgrade: HeroUpgrade) => void
  onClose: () => void
}

export function HeroPanel({ hud, onBuy, onClose }: HeroPanelProps): ReactElement {
  return (
    <PanelShell title="🛠️ Hero upgrades" testId="hero-panel" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {(Object.keys(HERO_UPGRADES) as HeroUpgrade[]).map((id) => {
          const def = HERO_UPGRADES[id]
          const level = id === 'boots' ? hud.heroSpeedLevel : hud.heroMagnetLevel
          const cost = def.costs[level]

          return (
            <button
              className="flex min-h-12 items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-left active:scale-[0.98] disabled:opacity-50"
              data-testid={`buy-${id}`}
              disabled={cost === undefined || hud.gold < cost}
              key={id}
              type="button"
              onClick={() => onBuy(id)}
            >
              <span aria-hidden="true" className="text-2xl">{def.symbol}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{def.name} · level {level}/{def.costs.length}</span>
                <span className="block truncate text-xs text-slate-300">{def.blurb}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-black tabular-nums text-amber-300">
                {cost === undefined ? 'Max' : <><Coins aria-hidden="true" className="size-4" />{cost}</>}
              </span>
            </button>
          )
        })}
      </div>
    </PanelShell>
  )
}
