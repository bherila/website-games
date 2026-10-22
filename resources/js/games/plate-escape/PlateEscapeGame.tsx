import './plate-escape.css'

import { Minus, Plus, RotateCcw, RotateCw, Undo2, X } from 'lucide-react'
import { type CSSProperties, type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { StarRow } from '../_shared/StarRow'
import { PortraitGameShell } from '../PortraitGameShell'
import { createPuzzle, freedPlates, hasWon, type PuzzleState, removeScrew } from './engine'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import { COLORS, PLATES, type ScrewColor, SCREWS, SPARE_CAPACITY } from './level'
import { PlateEscapeScene, type ScrewTarget, type ViewCommand } from './PlateEscapeScene'

interface FlyingScrew { color: ScrewColor, x: number, y: number, dx: number, dy: number }

export function PlateEscapeGame(): ReactElement {
  const [puzzle, setPuzzle] = useState(createPuzzle)
  const [history, setHistory] = useState<PuzzleState[]>([])
  const [targets, setTargets] = useState<ScrewTarget[]>([])
  const [view, setView] = useState<ViewCommand>({ action: 'reset', sequence: 0 })
  const [sceneKey, setSceneKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('Drag to turn the assembly. Tap an exposed screw to collect it.')
  const [fly, setFly] = useState<FlyingScrew | null>(null)
  const [previouslyCleared, setPreviouslyCleared] = useState(() => (loadProgress().stars[1] ?? 0) > 0)
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contactRef = useRef({ x: 0, y: 0, dragged: false })
  const won = hasWon(puzzle)
  useEffect(() => () => { if (moveTimerRef.current) clearTimeout(moveTimerRef.current) }, [])
  useEffect(() => {
    if (!won) return
    saveProgress(recordWin(loadProgress(), 1, 3))
    const timer = setTimeout(() => setFinished(true), 1500)
    return () => clearTimeout(timer)
  }, [won])

  const turn = (action: ViewCommand['action']): void => {
    setView((current) => ({ action, sequence: current.sequence + 1 }))
  }
  const restart = (): void => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
    setPuzzle(createPuzzle())
    setHistory([])
    setTargets([])
    setBusy(false)
    setFinished(false)
    setFly(null)
    setError('')
    setMessage('Fresh start. Drag to turn; tap a screw to unscrew it.')
    setSceneKey((current) => current + 1)
  }
  const unscrew = (id: string, button: HTMLButtonElement): void => {
    if (busy || won || error) return
    const next = removeScrew(puzzle, id)
    if (next === puzzle) {
      setMessage('Spare slots are full. Collect a matching color, or undo your last move.')
      return
    }
    const screw = SCREWS.find((candidate) => candidate.id === id)!
    const bounds = button.getBoundingClientRect()
    const destination = document.querySelector(`[data-tray-color="${screw.color}"]`) ?? document.querySelector('[data-spare-slots]')
    const tray = destination?.getBoundingClientRect()
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    setFly({ color: screw.color, x, y, dx: (tray ? tray.x + tray.width / 2 : x) - x, dy: (tray ? tray.y + tray.height / 2 : y) - y })
    setHistory((previous) => [...previous, puzzle])
    setPuzzle(next)
    if (hasWon(next)) setPreviouslyCleared(true)
    setBusy(true)
    setMessage(`${COLORS[screw.color].name} screw collected. ${next.removed.length} of 9 screws removed; ${freedPlates(next)} of 3 plates released.`)
    moveTimerRef.current = setTimeout(() => { setBusy(false); setFly(null) }, 650)
  }
  const undo = (): void => {
    const previous = history.at(-1)
    if (!previous || busy) return
    setPuzzle(previous)
    setHistory((current) => current.slice(0, -1))
    setFinished(false)
    setFly(null)
    setMessage('Last screw restored, along with its plate and tray space.')
  }
  const reportError = useCallback((text: string) => setError(text), [])

  return (
    <PortraitGameShell className="bg-[#e9edf0] text-slate-800" contentClassName="plate-escape">
      <header className="flex items-center justify-between gap-2 px-5 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
        <div>
          <a href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-900">← All games</a>
          <h1 className="text-2xl font-bold tracking-tight">Plate Escape<span className="text-orange-500">.</span></h1>
        </div>
        <div className="text-right text-xs font-semibold text-slate-500">
          <div>LEVEL 01</div>
          <div className="mt-1 text-emerald-700">{previouslyCleared || won ? 'Cleared' : 'First light'}</div>
        </div>
      </header>
      <section aria-label="Collection trays" className="mx-4 rounded-3xl border border-white/80 bg-white/75 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          <span>Match three</span><span>{puzzle.completed.length} / 3 collected</span>
        </div>
        <div className="flex gap-3">
          {puzzle.trays.map((tray) => (
            <div key={tray.id} data-tray-color={tray.color ?? ''} className="flex flex-1 items-center justify-between gap-2 rounded-2xl bg-slate-100 px-3 py-2" aria-label={tray.color ? `${COLORS[tray.color].name} tray: ${tray.count} of 3` : 'Tray complete'}>
              <span className="text-[11px] font-bold text-slate-600">{tray.color ? COLORS[tray.color].name : 'Done ✓'}</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((slot) => <span key={slot} className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs shadow-inner" style={{ color: tray.color ? COLORS[tray.color].hex : '#a0aaa7' }}>{slot < tray.count && tray.color ? <ScrewMark color={tray.color} /> : '·'}</span>)}
              </span>
            </div>
          ))}
        </div>
        <div data-spare-slots className="mt-3 flex items-center justify-center gap-2" aria-label={`Spare storage: ${puzzle.spare.length} of 4`}>
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Spare</span>
          {Array.from({ length: SPARE_CAPACITY }, (_, slot) => {
            const color = puzzle.spare[slot]
            return <span key={slot} className="grid h-6 w-6 place-items-center rounded-lg border border-dashed border-slate-300 text-sm" style={{ color: color ? COLORS[color].hex : '#cbd5e1' }}>{color ? <ScrewMark color={color} /> : '+'}</span>
          })}
        </div>
      </section>
      <main className="relative min-h-0 flex-1" aria-label="Plate puzzle">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#fff9ed_0%,transparent_70%)]" />
        <PlateEscapeScene key={sceneKey} state={puzzle} view={view} onTargets={setTargets} onError={reportError} />
        {targets.map((target) => {
          const screw = SCREWS.find((candidate) => candidate.id === target.id)!
          return (
            <button key={target.id} type="button" className="screw-target absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700" style={{ left: target.x, top: target.y, touchAction: 'none' }} disabled={busy || won || Boolean(error)} aria-label={`Unscrew ${COLORS[screw.color].name.toLowerCase()} screw on ${PLATES.find((plate) => plate.id === screw.plate)!.name.toLowerCase()}`} data-screw-id={screw.id}
              onPointerDown={(event) => {
                contactRef.current = { x: event.clientX, y: event.clientY, dragged: false }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (Math.hypot(event.clientX - contactRef.current.x, event.clientY - contactRef.current.y) > 8) contactRef.current.dragged = true
              }}
              onClick={(event) => { if (event.detail === 0 || !contactRef.current.dragged) unscrew(target.id, event.currentTarget) }} />
          )
        })}
        <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs font-semibold text-slate-500" data-testid="plate-progress">{freedPlates(puzzle)} / 3 plates released</div>
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-white/80 bg-white/80 p-1 shadow-sm">
          <button type="button" aria-label="Rotate left" onClick={() => turn('left')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100"><RotateCcw size={20} aria-hidden="true" /></button>
          <button type="button" onClick={() => turn('reset')} className="whitespace-nowrap px-2 text-xs font-semibold text-slate-600">Reset view</button>
          <button type="button" aria-label="Rotate right" onClick={() => turn('right')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100"><RotateCw size={20} aria-hidden="true" /></button>
        </div>
        {error && <div role="alert" className="absolute inset-4 grid place-content-center rounded-3xl bg-white/95 p-6 text-center"><p>{error}</p><button type="button" onClick={restart} className="mt-4 rounded-full bg-slate-800 px-5 py-3 text-white">Restart level</button></div>}
        {finished && (
          <div className="absolute inset-4 grid place-content-center rounded-3xl bg-[#fffbf2]/95 p-6 text-center shadow-xl">
            <StarRow stars={3} />
            <h2 className="mt-3 text-3xl font-bold">All plates free!</h2>
            <p className="mt-2 text-sm text-slate-500">Nine screws sorted. A little room to breathe.</p>
            <button type="button" onClick={restart} className="mt-6 rounded-full bg-slate-800 px-6 py-3 font-semibold text-white">Play again</button>
          </div>
        )}
      </main>
      <footer className="px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
        <p className="mb-3 text-center text-xs text-slate-500">Drag to turn · Tap a screw · Look around the back</p>
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/65 p-2">
          <button type="button" onClick={undo} disabled={history.length === 0 || busy || won} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-35"><Undo2 size={16} aria-hidden="true" />Undo</button>
          <span className="text-xs tabular-nums text-slate-500" data-testid="screw-progress">{puzzle.removed.length} / 9 screws</span>
          <button type="button" onClick={restart} className="rounded-xl px-4 py-2 text-sm font-semibold">Restart</button>
          <FullscreenIconButton className="text-slate-600" />
        </div>
      </footer>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {fly && <span aria-hidden="true" className="plate-screw-flight" style={{ left: fly.x, top: fly.y, background: COLORS[fly.color].hex, '--fly-x': `${fly.dx}px`, '--fly-y': `${fly.dy}px` } as CSSProperties}><ScrewMark color={fly.color} /></span>}
    </PortraitGameShell>
  )
}

function ScrewMark({ color }: { color: ScrewColor }): ReactElement {
  const Icon = color === 'coral' ? Plus : color === 'mint' ? X : Minus
  return <Icon size={14} strokeWidth={3} aria-hidden="true" />
}
