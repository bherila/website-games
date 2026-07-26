/**
 * Niagara's endgame hint. Like GettingStarted, it is presentation-only: every
 * checklist state is derived from HudSnapshot and dismissal is an additive UI
 * preference. It never mutates the engine or consumes rng.
 */
import { type ReactElement, useState } from 'react'

import { itemDef } from '../engine/catalog'
import { dismissObservationDeckHint, isObservationDeckHintDismissed } from '../gameProgress'
import type { HudSnapshot } from '../gameTypes'

interface ObservationDeckHintProps {
  snapshot: HudSnapshot | null
}

export interface ObservationDeckHintStep {
  id: string
  label: string
  done: boolean
}

/** Both tile counts come from the catalog so the hint cannot drift from the placement rule. */
function cantileverSpans(snapshot: HudSnapshot): { anchored: number; overhanging: number } {
  const def = itemDef(snapshot.endgame.kind)
  const overhanging = def.cantileverTiles ?? 0
  return { anchored: def.width - overhanging, overhanging }
}

export function observationDeckHintSteps(snapshot: HudSnapshot): ObservationDeckHintStep[] {
  const { anchored, overhanging } = cantileverSpans(snapshot)
  return [
    { id: 'fullRating', label: 'Hold a full 5★ rating', done: snapshot.star === 5 },
    {
      id: 'cantilever',
      label: `On floor ${snapshot.endgame.floorLabel}, anchor ${anchored} bank-side tiles and cantilever ${overhanging} toward the Falls`,
      done: snapshot.endgame.built,
    },
  ]
}

export function shouldShowObservationDeckHint(snapshot: HudSnapshot | null): boolean {
  return snapshot !== null
    && snapshot.endgame.kind === 'observationDeck'
    && snapshot.maxStarReached >= 4
    && !snapshot.towerAchieved
}

export function ObservationDeckHint({ snapshot }: ObservationDeckHintProps): ReactElement | null {
  const [dismissed, setDismissed] = useState<boolean>(() => isObservationDeckHintDismissed())

  if (dismissed || !shouldShowObservationDeckHint(snapshot) || snapshot === null) {
    return null
  }

  const steps = observationDeckHintSteps(snapshot)
  const completed = steps.filter((step) => step.done).length

  const onDismiss = (): void => {
    dismissObservationDeckHint()
    setDismissed(true)
  }

  return (
    <div
      data-testid="observation-deck-hint"
      className="mt-2 w-72 max-w-full rounded-xl border border-cyan-300/30 bg-slate-950/75 px-3 py-2 text-sm shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-cyan-100">Observation Deck</span>
            <span className="text-[10px] tabular-nums text-white/50" data-testid="observation-deck-hint-count">
              {completed}/{steps.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-cyan-50/65">
            Build at {snapshot.endgame.floorLabel} from either bank, cantilevered toward the Falls.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss Observation Deck hint"
          title="Dismiss"
          className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2" data-testid={`observation-deck-hint-step-${step.id}`}>
            <span aria-hidden="true" className={step.done ? 'text-emerald-400' : 'text-white/30'}>
              {step.done ? '☑' : '☐'}
            </span>
            <span className={step.done ? 'text-white/50 line-through' : 'text-white/85'}>{step.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
