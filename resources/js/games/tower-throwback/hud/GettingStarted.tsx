/**
 * First-session onboarding checklist. Presentation + preference persistence
 * only: every step's done/pending state is DERIVED read-only from the live
 * HudSnapshot (population, starProgress, vipGoal, star) — the engine is never
 * touched and no rng is consumed. The panel auto-hides once the tower passes
 * Star 1, and is user-dismissible; the dismissal persists additively through
 * `gameProgress`.
 */
import { type ReactElement, useState } from 'react'

import { dismissGettingStarted, isGettingStartedDismissed } from '../gameProgress'
import type { HudSnapshot } from '../gameTypes'

interface GettingStartedProps {
  snapshot: HudSnapshot | null
}

export interface GettingStartedStep {
  id: string
  label: string
  done: boolean
}

/**
 * The early-game arc, derived purely from what the snapshot exposes. While the
 * panel is visible the tower is still Star 1, so `starProgress.nextStar === 2`
 * and `vipGoal.target === 2`: every threshold below reads against the Star 2
 * goal. Pure function — deterministic per snapshot, no side effects.
 */
export function gettingStartedSteps(snapshot: HudSnapshot): GettingStartedStep[] {
  const { population, star, starProgress, vipGoal } = snapshot
  const armed = vipGoal !== null && vipGoal.status !== 'notArmed'
  const hosting = vipGoal !== null && (vipGoal.status === 'visiting' || vipGoal.status === 'resident')
  return [
    { id: 'firstActivity', label: 'Build a unit and an elevator so people can arrive', done: snapshot.activePeople >= 1 || population >= 1 },
    { id: 'firstTenants', label: 'Lease to your first tenants', done: population >= 1 },
    { id: 'growPopulation', label: 'Grow halfway to the Star 2 population', done: starProgress !== null && starProgress.progress >= 0.5 },
    { id: 'reachThreshold', label: 'Reach the Star 2 population goal', done: armed || (starProgress !== null && starProgress.remaining === 0) },
    { id: 'hostInspector', label: 'Host the Star 2 VIP inspection', done: hosting || star >= 2 },
    { id: 'reachStar2', label: 'Reach Star 2', done: star >= 2 },
  ]
}

/** Onboarding is only relevant while the tower is still Star 1. */
export function shouldShowGettingStarted(snapshot: HudSnapshot | null): boolean {
  return snapshot !== null && snapshot.star < 2
}

export function GettingStarted({ snapshot }: GettingStartedProps): ReactElement | null {
  const [dismissed, setDismissed] = useState<boolean>(() => isGettingStartedDismissed())

  if (dismissed || !shouldShowGettingStarted(snapshot) || snapshot === null) {
    return null
  }

  const steps = gettingStartedSteps(snapshot)
  const completed = steps.filter((step) => step.done).length

  const onDismiss = (): void => {
    dismissGettingStarted()
    setDismissed(true)
  }

  return (
    <div
      data-testid="getting-started"
      className="mt-2 w-64 max-w-full rounded-xl bg-slate-950/70 px-3 py-2 text-sm shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-amber-200">Getting started</span>
          <span className="text-[10px] tabular-nums text-white/50" data-testid="getting-started-count">
            {completed}/{steps.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss getting started"
          title="Dismiss"
          className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2" data-testid={`getting-started-step-${step.id}`}>
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
