import './plate-escape.css'

import { ArrowLeft, Check, CircleHelp, House, LockKeyhole, RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { type ComponentProps, type CSSProperties, type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { SoundToggle } from '../_shared/audio/SoundToggle'
import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import { StarRow } from '../_shared/StarRow'
import { PortraitGameShell } from '../PortraitGameShell'
import { CollectionTrays, ScrewHead } from './CollectionTrays'
import { createPuzzle, freedPlates, hasWon, type PuzzleState, removeScrew, screwLock } from './engine'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import { COLORS, getLevel, LEVELS, type PuzzleLevel, type ScrewColor } from './level'
import { PlateEscapeScene, type PlateEvent, type ScrewTarget, type ViewCommand } from './PlateEscapeScene'
import { createPlateSfx, plateMute, type PlateSound } from './sfx'

interface FlyingScrew { color: ScrewColor, x: number, y: number, dx: number, dy: number }

export function PlateEscapeGame(): ReactElement {
  const [levelId, setLevelId] = useState<number | null>(null)
  const [progress, setProgress] = useState(loadProgress)
  const [muted, setMuted] = useState(plateMute.load)
  // The engine only opens an AudioContext on the first gesture, so creating it here is free.
  const [sfx] = useState(() => createPlateSfx(muted))
  useEffect(() => () => sfx.dispose(), [sfx])
  useEffect(() => {
    sfx.setMuted(muted)
    plateMute.save(muted)
  }, [sfx, muted])
  const recordClear = (id: number): void => {
    const next = recordWin(progress, id, 3)
    saveProgress(next)
    setProgress(next)
  }
  if (levelId === null) {
    return (
      <PortraitGameShell className="bg-[#e9edf0] text-slate-800" contentClassName="plate-escape">
        <LevelSelectGrid emoji="🔩" title="Plate Escape" levelIds={LEVELS.map((level) => level.id)} progress={progress} exitHref="/" footer="Turn the house. Match three. Free every plate." onSelectLevel={setLevelId} />
      </PortraitGameShell>
    )
  }
  return <LevelSession key={levelId} level={getLevel(levelId)} cleared={(progress.stars[levelId] ?? 0) > 0} onSelect={setLevelId} onLevels={() => setLevelId(null)} onWin={recordClear} play={sfx.play} unlockSound={sfx.unlock} muted={muted} onMutedChange={setMuted} />
}

interface LevelSessionProps {
  level: PuzzleLevel
  cleared: boolean
  onSelect: (id: number) => void
  onLevels: () => void
  onWin: (id: number) => void
  play: (sound: PlateSound) => void
  unlockSound: () => void
  muted: boolean
  onMutedChange: (muted: boolean) => void
}

function LevelSession({ level, cleared, onSelect, onLevels, onWin, play, unlockSound, muted, onMutedChange }: LevelSessionProps): ReactElement {
  const { plates: PLATES, screws: SCREWS, spareCapacity: SPARE_CAPACITY } = level
  const [puzzle, setPuzzle] = useState(() => createPuzzle(level.id))
  const [history, setHistory] = useState<PuzzleState[]>([])
  const [targets, setTargets] = useState<ScrewTarget[]>([])
  const [view, setView] = useState<ViewCommand>({ action: 'reset', sequence: 0 })
  const [sceneKey, setSceneKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const [help, setHelp] = useState(Boolean(level.introduction) && !cleared)
  const [message, setMessage] = useState('Drag to turn the assembly. Tap an exposed screw to collect it.')
  const [fly, setFly] = useState<FlyingScrew | null>(null)
  const [hint, setHint] = useState<{ text: string, screw: string, sequence: number } | null>(null)
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const won = hasWon(puzzle)
  const lost = puzzle.overflow !== null
  const storageFull = puzzle.spare.length === SPARE_CAPACITY
  // Browsers only start audio from a gesture; any press in the level unlocks it.
  useEffect(() => {
    window.addEventListener('pointerdown', unlockSound, { capture: true })
    window.addEventListener('keydown', unlockSound, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlockSound, { capture: true })
      window.removeEventListener('keydown', unlockSound, { capture: true })
    }
  }, [unlockSound])
  useEffect(() => () => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
  }, [])
  useEffect(() => {
    if (!won) return
    const timer = setTimeout(() => setFinished(true), 1500)
    return () => clearTimeout(timer)
  }, [won])

  const turn = (action: ViewCommand['action']): void => {
    setView((current) => ({ action, sequence: current.sequence + 1 }))
  }
  /** A refused tap is explained on screen as well as to assistive technology. */
  const explain = (text: string, screw: string): void => {
    play('blocked')
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    setMessage(text)
    setHint((current) => ({ text, screw, sequence: (current?.sequence ?? 0) + 1 }))
    hintTimerRef.current = setTimeout(() => setHint(null), 3200)
  }
  const lockedReason = (id: string): string => {
    const screw = SCREWS.find((candidate) => candidate.id === id)!
    const lock = screwLock(puzzle, screw)
    const plate = (plateId: string): string => PLATES.find((candidate) => candidate.id === plateId)!.name
    if (lock?.kind === 'bearing') return `${plate(screw.plate)} is holding up the ${plate(lock.plate).toLowerCase()}. Free the roof first.`
    if (lock?.kind === 'cover') return `The ${plate(lock.plate).toLowerCase()} covers that screw. Release it first.`
    return 'No room for that screw. Collect a matching color or undo.'
  }
  const restart = (): void => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
    setPuzzle(createPuzzle(level.id))
    setHistory([])
    setTargets([])
    setBusy(false)
    setFinished(false)
    setFly(null)
    setHint(null)
    setError('')
    setMessage('Fresh start. Drag to turn; tap a screw to unscrew it.')
    setSceneKey((current) => current + 1)
  }
  const unscrew = (id: string, button: HTMLButtonElement): void => {
    if (busy || won || lost || error) return
    const next = removeScrew(puzzle, id)
    if (next === puzzle) {
      explain(lockedReason(id), id)
      return
    }
    const screw = SCREWS.find((candidate) => candidate.id === id)!
    if (next.overflow !== null) {
      setHistory((previous) => [...previous, puzzle])
      setPuzzle(next)
      setMessage(`${COLORS[screw.color].name} screw has no room. Undo the last move or retry the level.`)
      play('overflow')
      return
    }
    const bounds = button.getBoundingClientRect()
    const activeTray = puzzle.trays.find((tray) => tray.color === screw.color)
    const destination = activeTray ? document.querySelector(`[data-tray-color="${screw.color}"] [data-tray-slot="${activeTray.count}"]`) : document.querySelector(`[data-spare-slot="${puzzle.spare.length}"]`)
    const tray = destination?.getBoundingClientRect()
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    setFly({ color: screw.color, x, y, dx: (tray ? tray.x + tray.width / 2 : x) - x, dy: (tray ? tray.y + tray.height / 2 : y) - y })
    setHistory((previous) => [...previous, puzzle])
    setPuzzle(next)
    if (hasWon(next)) onWin(level.id)
    setBusy(true)
    setMessage(`${COLORS[screw.color].name} screw collected. ${next.removed.length} of ${SCREWS.length} screws removed; ${freedPlates(next)} of ${PLATES.length} plates released.`)
    play('unscrew')
    // The landing sound plays as the flying head reaches its tray or spare slot.
    const landing: PlateSound = next.completed.length > puzzle.completed.length ? 'tray-complete' : activeTray ? 'tray' : 'spare'
    moveTimerRef.current = setTimeout(() => {
      setBusy(false)
      setFly(null)
      play(hasWon(next) ? 'win' : landing)
    }, 650)
  }
  const undo = (): void => {
    const previous = history.at(-1)
    if (!previous || busy) return
    setPuzzle(previous)
    setHistory((current) => current.slice(0, -1))
    setFinished(false)
    setFly(null)
    play('undo')
    setMessage('Last screw restored, along with its plate and tray space.')
  }
  const reportError = useCallback((text: string) => setError(text), [])
  const plateEvent = useCallback((event: PlateEvent) => play(event), [play])

  return (
    <PortraitGameShell className="bg-[#e9edf0] text-slate-800" contentClassName="plate-escape">
      <header className="flex items-center gap-2 px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button type="button" onClick={onLevels} aria-label="Levels" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/70"><ArrowLeft size={20} aria-hidden="true" /></button>
        <h1 className="min-w-0 flex-1 whitespace-nowrap text-lg font-bold tracking-tight">Plate Escape<span className="text-orange-500">.</span></h1>
        <span role="img" aria-label={`Level ${level.id}: ${level.name}${cleared || won ? ', cleared' : ''}`} className={`flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/65 px-3 text-xs font-bold tabular-nums ${cleared || won ? 'text-emerald-700' : 'text-slate-500'}`}>
          {String(level.id).padStart(2, '0')}{(cleared || won) && <Check size={13} aria-hidden="true" />}
        </span>
        {level.introduction && <button type="button" aria-label="Level guide" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/70" onClick={() => setHelp(true)}><CircleHelp size={20} aria-hidden="true" /></button>}
      </header>
      <CollectionTrays state={busy && fly ? history.at(-1) ?? puzzle : puzzle} />
      <main className="relative min-h-0 flex-1" aria-label="Plate puzzle">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#fff9ed_0%,transparent_70%)]" />
        <PlateEscapeScene key={sceneKey} state={puzzle} view={view} onTargets={setTargets} onError={reportError} onPlateEvent={plateEvent} />
        {targets.map((target) => {
          const screw = SCREWS.find((candidate) => candidate.id === target.id)!
          if (target.coveredBy) return <span key={target.id} role="img" aria-label={`${COLORS[screw.color].name} screw covered by ${target.coveredBy.toLowerCase()}`} data-covered-screw-id={screw.id} className="pointer-events-none absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-white/80 text-slate-700 shadow-sm" style={{ left: target.x, top: target.y }}><LockKeyhole size={13} aria-hidden="true" /></span>
          const label = `${COLORS[screw.color].name} screw on ${PLATES.find((plate) => plate.id === screw.plate)!.name.toLowerCase()}`
          if (target.holdsUp) {
            return (
              <TapTarget key={target.id} className="screw-target absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700" style={{ left: target.x, top: target.y, touchAction: 'none' }} aria-label={`${label}, holding up the ${target.holdsUp.toLowerCase()}`} data-bearing-screw-id={screw.id}
                onTap={() => { if (!busy && !won && !lost && !error) explain(lockedReason(target.id), target.id) }}>
                <span key={hint?.screw === target.id ? hint.sequence : 0} aria-hidden="true" className="plate-bearing-badge absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-orange-500 bg-white text-orange-600 shadow-sm dark:bg-slate-900 dark:text-orange-400"><House size={11} strokeWidth={2.5} /></span>
              </TapTarget>
            )
          }
          return (
            <TapTarget key={target.id} className="screw-target absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700" style={{ left: target.x, top: target.y, touchAction: 'none' }} disabled={busy || won || lost || Boolean(error)} aria-label={`Unscrew ${label.toLowerCase()}`} data-screw-id={screw.id}
              onTap={(button) => unscrew(target.id, button)} />
          )
        })}
        <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs font-semibold text-slate-500" data-testid="plate-progress">{freedPlates(puzzle)} / {PLATES.length} plates released</div>
        {hint && <p key={hint.sequence} aria-hidden="true" data-testid="plate-hint" className="plate-hint pointer-events-none absolute inset-x-4 bottom-[4.25rem] mx-auto w-fit max-w-full rounded-2xl border border-orange-200 bg-white/95 px-4 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm">{hint.text}</p>}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-white/80 bg-white/80 p-1 shadow-sm">
          <button type="button" aria-label="Rotate left" onClick={() => turn('left')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100"><RotateCcw size={20} aria-hidden="true" /></button>
          <button type="button" onClick={() => turn('reset')} className="whitespace-nowrap px-2 text-xs font-semibold text-slate-600">Reset view</button>
          <button type="button" aria-label="Rotate right" onClick={() => turn('right')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100"><RotateCw size={20} aria-hidden="true" /></button>
        </div>
        {lost && <div role="alertdialog" aria-labelledby="storage-full-title" aria-describedby="storage-full-help" className="absolute inset-4 grid place-content-center rounded-3xl bg-[#fffbf2]/95 p-6 text-center shadow-xl">
          <div className="mb-3 flex justify-center"><ScrewHead color={puzzle.overflow!} size={48} /></div>
          <h2 id="storage-full-title" className="text-2xl font-bold">No room for that screw</h2>
          <p id="storage-full-help" className="mt-3 text-sm text-slate-600">All {SPARE_CAPACITY} spare slots are full, and this <span className="sr-only">{COLORS[puzzle.overflow!].name.toLowerCase()} </span>screw has no matching tray. Try a different order.</p>
          <button autoFocus type="button" onClick={undo} className="mt-5 rounded-full bg-slate-800 px-5 py-3 font-semibold text-white">Undo last move</button>
          <button type="button" onClick={restart} className="mt-2 rounded-full bg-white px-5 py-3 font-semibold">Retry level</button>
        </div>}
        {error && <div role="alert" className="absolute inset-4 grid place-content-center rounded-3xl bg-white/95 p-6 text-center"><p>{error}</p><button type="button" onClick={restart} className="mt-4 rounded-full bg-slate-800 px-5 py-3 text-white">Restart level</button></div>}
        {finished && (
          <div className="absolute inset-4 grid place-content-center rounded-3xl bg-[#fffbf2]/95 p-6 text-center shadow-xl">
            <StarRow stars={3} />
            <h2 className="mt-3 text-3xl font-bold">All plates free!</h2>
            <p className="mt-2 text-sm text-slate-500">{SCREWS.length} screws sorted. A little room to breathe.</p>
            {level.id < LEVELS.length && <button type="button" onClick={() => onSelect(level.id + 1)} className="mt-5 rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white">Next level</button>}
            <button type="button" onClick={restart} className="mt-3 rounded-full bg-slate-800 px-6 py-3 font-semibold text-white">Play again</button>
          </div>
        )}
      </main>
      <footer className="px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
        <p className={`mb-3 text-center text-xs ${storageFull && level.overflowLoses ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>{level.overflowLoses ? storageFull ? 'Storage full · Match a tray or the next screw will overflow' : `${SPARE_CAPACITY} spare slots · An unmatched screw with no room ends the attempt` : 'Drag to turn · Tap a screw · The gable walls hold up the roof'}</p>
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/65 p-2">
          <button type="button" onClick={undo} disabled={history.length === 0 || busy || won} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-35"><Undo2 size={16} aria-hidden="true" />Undo</button>
          <span className="text-xs tabular-nums text-slate-500" data-testid="screw-progress">{puzzle.removed.length} / {SCREWS.length} screws</span>
          <button type="button" onClick={restart} className="rounded-xl px-4 py-2 text-sm font-semibold">Restart</button>
          <SoundToggle muted={muted} onMutedChange={onMutedChange} className="text-slate-600" />
          <FullscreenIconButton className="text-slate-600" />
        </div>
      </footer>
      {level.introduction && <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>{level.name}</DialogTitle><DialogDescription>{level.introduction}</DialogDescription></DialogHeader><button type="button" onClick={() => setHelp(false)} className="rounded-full bg-slate-800 px-6 py-3 font-semibold text-white">Let's play</button></DialogContent></Dialog>}
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {fly && <span aria-hidden="true" className="plate-screw-flight" style={{ left: fly.x, top: fly.y, '--fly-x': `${fly.dx}px`, '--fly-y': `${fly.dy}px` } as CSSProperties}><ScrewHead color={fly.color} size={30} /></span>}
    </PortraitGameShell>
  )
}

/** A drag that begins on a screw orbits the view instead of tapping it. */
function TapTarget({ onTap, ...props }: Omit<ComponentProps<'button'>, 'onClick' | 'type'> & { onTap: (button: HTMLButtonElement) => void }): ReactElement {
  const contactRef = useRef({ x: 0, y: 0, dragged: false })
  return (
    <button type="button" {...props}
      onPointerDown={(event) => {
        contactRef.current = { x: event.clientX, y: event.clientY, dragged: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (Math.hypot(event.clientX - contactRef.current.x, event.clientY - contactRef.current.y) > 8) contactRef.current.dragged = true
      }}
      onClick={(event) => { if (event.detail === 0 || !contactRef.current.dragged) onTap(event.currentTarget) }} />
  )
}
