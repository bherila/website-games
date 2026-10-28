/**
 * The first-run tutorial's card: the current step, a way to reach its floor,
 * and ways out (skip, or load the example block instead).
 */
import { ArrowUp, Building2, GraduationCap, PartyPopper, X } from 'lucide-react'
import type { ReactElement } from 'react'

import { TUTORIAL } from './tutorial'

const BUTTON = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold'

export interface TutorialCardProps {
  /** The first unfinished step's index, or TUTORIAL.length when all are done. */
  step: number
  activeFloor: number
  onGoToFloor: (floor: number) => void
  onSkip: () => void
  onExample: () => void
}

export function TutorialCard({ step, activeFloor, onGoToFloor, onSkip, onExample }: TutorialCardProps): ReactElement {
  const current = TUTORIAL[step]
  if (!current) {
    return (
      <section aria-label="Tutorial" className="pointer-events-auto w-[min(22rem,calc(100vw-5.5rem))] max-sm:self-start rounded-2xl bg-fuchsia-500/95 p-3 text-white shadow-lg shadow-black/30">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-black"><PartyPopper size={16} aria-hidden="true" />That&apos;s a working building</h2>
        <p className="mb-2 text-xs text-white/90">Try the Light and Walk overlays to see what each room wants, then drag rooms around to win more stars.</p>
        <button type="button" onClick={onSkip} className={`${BUTTON} bg-white text-fuchsia-700`}>Keep building</button>
      </section>
    )
  }
  return (
    <section aria-label="Tutorial" className="pointer-events-auto w-[min(22rem,calc(100vw-5.5rem))] max-sm:self-start rounded-2xl bg-slate-950/90 p-3 text-white shadow-lg shadow-black/30 ring-1 ring-fuchsia-400/60 backdrop-blur-md">
      <div className="mb-1 flex items-center gap-2">
        <GraduationCap size={16} aria-hidden="true" className="shrink-0 text-fuchsia-300" />
        <h2 className="text-sm font-black">{current.title}</h2>
        <span className="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-white/50">Step {step + 1} of {TUTORIAL.length}</span>
      </div>
      <p className="mb-2 text-xs text-white/85">{current.body}</p>
      <div className="flex flex-wrap gap-1.5">
        {current.floor !== activeFloor && (
          <button type="button" onClick={() => onGoToFloor(current.floor)} className={`${BUTTON} bg-fuchsia-400 text-slate-950`}>
            <ArrowUp size={13} aria-hidden="true" className={current.floor < activeFloor ? 'rotate-180' : ''} />Go to {current.floor === 0 ? 'the street floor' : `floor ${current.floor}`}
          </button>
        )}
        <button type="button" onClick={onExample} className={`${BUTTON} bg-white/10 hover:bg-white/20`}><Building2 size={13} aria-hidden="true" />Load the example block</button>
        <button type="button" onClick={onSkip} className={`${BUTTON} ml-auto text-white/70 hover:bg-white/10`}><X size={13} aria-hidden="true" />Skip</button>
      </div>
    </section>
  )
}
