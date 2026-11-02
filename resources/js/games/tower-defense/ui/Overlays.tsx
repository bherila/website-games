import { ArrowRight, Grid3x3, Play, RotateCcw, Star, Trophy, X } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { ELEMENT_IDS, ELEMENTS, elementWeakTo, TOWERS } from '../catalog'
import type { ElementId, WaveDef } from '../gameTypes'

function Overlay({ children, label }: { children: ReactNode; label: string }): ReactElement {
  return (
    <div aria-label={label} aria-modal="true" className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog">
      {children}
    </div>
  )
}

function ActionButton({ children, label, onClick, primary = false }: { children: ReactNode; label: string; onClick: () => void; primary?: boolean }): ReactElement {
  return (
    <button
      className={`flex min-h-12 items-center gap-2 rounded-full px-5 font-black shadow-xl active:scale-95 ${primary ? 'bg-amber-400 text-amber-950' : 'bg-white/10 text-white'}`}
      type="button"
      onClick={onClick}
    >
      {children}
      {label}
    </button>
  )
}

export function TutorialOverlay({ onStart }: { onStart: () => void }): ReactElement {
  const steps: readonly (readonly [string, string])[] = [
    ['🏹', 'Pick a tower or wall from the tray, then tap the ground. Your hero runs over and builds it.'],
    ['🧱', 'Enemies follow the arrows to your keep. Build walls to make their path longer. Block it completely and they will smash their way through.'],
    ['🪙', 'Defeated enemies drop gold coins. Tap near them so your hero collects them before they fade.'],
    ['⬆️', 'Tap a tower to upgrade or sell it. Waves get tougher, so spend your gold well!'],
  ]

  return (
    <Overlay label="How to play">
      <div className="max-w-sm rounded-3xl border border-white/15 bg-slate-900 p-5 text-white shadow-2xl">
        <h2 className="text-center text-2xl font-black">Defend the keep</h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-5 text-slate-200">
          {steps.map(([icon, text]) => (
            <li className="flex gap-2.5" key={icon}>
              <span aria-hidden="true" className="text-xl">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-center">
          <ActionButton label="Start building" primary onClick={onStart}><Play aria-hidden="true" className="size-4 fill-current" /></ActionButton>
        </div>
      </div>
    </Overlay>
  )
}

export function PauseOverlay({ onResume, onExit }: { onResume: () => void; onExit: () => void }): ReactElement {
  return (
    <Overlay label="Game paused">
      <div className="flex flex-col items-center gap-4 text-white">
        <h2 className="text-3xl font-black">Paused</h2>
        <div className="flex flex-wrap justify-center gap-3">
          <ActionButton label="Resume" primary onClick={onResume}><Play aria-hidden="true" className="size-4 fill-current" /></ActionButton>
          <ActionButton label="Level select" onClick={onExit}><Grid3x3 aria-hidden="true" className="size-4" /></ActionButton>
        </div>
      </div>
    </Overlay>
  )
}

export function LostOverlay({ wave, onRetry, onExit }: { wave: number; onRetry: () => void; onExit: () => void }): ReactElement {
  return (
    <Overlay label="Keep lost">
      <div className="flex flex-col items-center gap-3 text-white">
        <X aria-hidden="true" className="size-14 text-rose-400" />
        <h2 className="text-3xl font-black">The keep has fallen</h2>
        <p className="text-sm font-bold text-slate-300">You held until wave {wave}.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ActionButton label="Try again" primary onClick={onRetry}><RotateCcw aria-hidden="true" className="size-4" /></ActionButton>
          <ActionButton label="Level select" onClick={onExit}><Grid3x3 aria-hidden="true" className="size-4" /></ActionButton>
        </div>
      </div>
    </Overlay>
  )
}

interface WonOverlayProps {
  stars: 1 | 2 | 3
  lives: number
  maxLives: number
  finalLevel: boolean
  onNext: () => void
  onRetry: () => void
  onExit: () => void
}

export function WonOverlay({ stars, lives, maxLives, finalLevel, onNext, onRetry, onExit }: WonOverlayProps): ReactElement {
  return (
    <Overlay label="Level complete">
      <div className="flex flex-col items-center gap-3 text-white">
        <div aria-label={`${stars} stars`} className="flex gap-2" data-stars={stars} data-testid="won-stars" role="img">
          {([1, 2, 3] as const).map((position) => <Star aria-hidden="true" className={`size-12 ${position <= stars ? 'fill-amber-400 text-amber-400' : 'text-white/20'}`} key={position} />)}
        </div>
        <h2 className="text-3xl font-black">Keep defended!</h2>
        <p className="text-sm font-bold text-slate-300">{lives} of {maxLives} lives left. Keep at least 18 for three stars.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ActionButton label="Replay" onClick={onRetry}><RotateCcw aria-hidden="true" className="size-4" /></ActionButton>
          {finalLevel
            ? <ActionButton label="All levels" primary onClick={onExit}><Trophy aria-hidden="true" className="size-4" /></ActionButton>
            : <ActionButton label="Next level" primary onClick={onNext}><ArrowRight aria-hidden="true" className="size-4" /></ActionButton>}
        </div>
      </div>
    </Overlay>
  )
}

interface ElementPickOverlayProps {
  unlocked: readonly ElementId[]
  nextWave: WaveDef | null
  onPick: (element: ElementId) => void
}

export function ElementPickOverlay({ unlocked, nextWave, onPick }: ElementPickOverlayProps): ReactElement {
  const counter = nextWave?.element ? elementWeakTo(nextWave.element) : null
  const options = ELEMENT_IDS.filter((element) => !unlocked.includes(element))

  return (
    <Overlay label="Choose an element">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-4 text-white shadow-2xl">
        <h2 className="text-center text-xl font-black">Choose an element</h2>
        <p className="mt-1 text-center text-xs text-slate-300">
          It unlocks a new tower.
          {nextWave?.element && <> The next wave is {ELEMENTS[nextWave.element].symbol} {ELEMENTS[nextWave.element].name}.</>}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((element) => {
            const def = ELEMENTS[element]
            const tower = TOWERS[def.tower]

            return (
              <button
                className="flex min-h-14 items-start gap-2 rounded-2xl border border-white/10 bg-slate-800 p-2.5 text-left active:scale-[0.98]"
                data-testid={`pick-${element}`}
                key={element}
                type="button"
                onClick={() => onPick(element)}
              >
                <span aria-hidden="true" className="text-2xl leading-none">{def.symbol}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">
                    {tower.name}
                    {counter === element && <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 text-[10px] font-black text-emerald-950">beats next wave</span>}
                  </span>
                  <span className="block text-xs leading-4 text-slate-300">{tower.blurb}</span>
                  <span className="block text-[11px] font-bold text-emerald-300">Strong against {ELEMENTS[def.strongAgainst].symbol} {ELEMENTS[def.strongAgainst].name}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Overlay>
  )
}
