import './plate-escape.css'

import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleHelp, House, LockKeyhole, Pause, Play, RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { type ComponentProps, type CSSProperties, type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { createMuteStorage } from '../_shared/audio/muteStorage'
import { SoundToggle } from '../_shared/audio/SoundToggle'
import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import { StarRow } from '../_shared/StarRow'
import { PortraitGameShell } from '../PortraitGameShell'
import { CollectionTrays, ScrewHead } from './CollectionTrays'
import { createPuzzle, dialLock, freedPlates, hasWon, panelState, type PuzzleState, removeScrew, screwLock, showing, turnDial } from './engine'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import { labLevelFromSearch } from './labLevels'
import { COLORS, getLevel, LEVELS, type PuzzleLevel, type ScrewColor } from './level'
import { PlateEscapeScene, type PlateEvent, type ScrewTarget, type ViewCommand } from './PlateEscapeScene'
import { createPlateSfx, plateMute, type PlateSound } from './sfx'

interface FlyingScrew { color: ScrewColor, x: number, y: number, dx: number, dy: number }

/** The Motion setting, kept like the sound setting: true when the player has stopped turning parts. */
const motionStill = createMuteStorage('bwh.plate-escape.still.v1')

export function PlateEscapeGame(): ReactElement {
  // A lab board opens straight from its link and is never listed or saved.
  const [levelId, setLevelId] = useState<number | null>(() => labLevelFromSearch(window.location.search))
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
    if (!LEVELS.some((level) => level.id === id)) return
    const next = recordWin(progress, id, 3)
    saveProgress(next)
    setProgress(next)
  }
  if (levelId === null) {
    return (
      <PortraitGameShell className="bg-[#e9edf0] text-slate-800 dark:bg-[#121a21] dark:text-slate-100" contentClassName="plate-escape">
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
  const DIALS = PLATES.filter((plate) => plate.dial)
  const [still, setStill] = useState(motionStill.load)
  // Under reduced motion nothing turns, so there is nothing to pause.
  const [reduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => motionStill.save(still), [still])
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

  const orbit = (action: ViewCommand['action']): void => {
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
    if (lock?.kind === 'bearing') {
      const load = PLATES.find((candidate) => candidate.id === lock.plate)!
      return `${plate(lock.support ?? screw.plate)} is holding up the ${load.name.toLowerCase()}. Free the ${load.finish === 'roof' ? 'roof' : load.name.toLowerCase()} first.`
    }
    if (lock?.kind === 'cover' && panelState(puzzle, lock.plate) === 'open') {
      const cover = PLATES.find((candidate) => candidate.id === lock.plate)!
      return `The ${cover.name.toLowerCase()} is ${cover.rail ? 'resting' : 'hanging'} over that screw. It comes away with the ${plate(cover.host!).toLowerCase()}.`
    }
    if (lock?.kind === 'dial') return `Turn the ${plate(lock.plate).toLowerCase()} until its window is over that screw.`
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
    play(`unscrew-${screw.color}`)
    // The landing sound plays as the flying head reaches its tray or spare slot.
    const landing: PlateSound = next.completed.length > puzzle.completed.length ? 'tray-complete' : activeTray ? 'tray' : 'spare'
    moveTimerRef.current = setTimeout(() => {
      setBusy(false)
      setFly(null)
      play(hasWon(next) ? 'win' : landing)
    }, 650)
  }
  /** What a dial's window shows now, for the status line and the dial's own label. */
  const dialReading = (state: PuzzleState, id: string): string => {
    const dial = PLATES.find((plate) => plate.id === id)!
    const heads = SCREWS.filter((screw) => screw.underDial?.dial === id && !state.removed.includes(screw.id) && showing(state, screw))
    const view = heads.length ? `${heads.map((screw) => `a ${COLORS[screw.color].name.toLowerCase()} screw`).join(' and ')} in the window` : 'the window empty'
    return `Stop ${(state.dials[id] ?? 0) + 1} of ${dial.dial!.stops}, ${view}`
  }
  const dialHeld = (id: string): string | null => {
    const lock = dialLock(puzzle, id)
    if (!lock) return null
    const dial = PLATES.find((plate) => plate.id === id)!.name.toLowerCase()
    const screw = SCREWS.find((candidate) => candidate.id === lock.screw)!
    return lock.kind === 'pin' ? `The stop pin holds the ${dial}. Take it out first.`
      : `The ${COLORS[screw.color].name.toLowerCase()} screw in the window catches the ${dial}. Take it out first.`
  }
  const turn = (id: string, step: 1 | -1): void => {
    if (busy || won || lost || error) return
    const next = turnDial(puzzle, id, step)
    if (next === puzzle) {
      const lock = dialLock(puzzle, id)
      if (lock) explain(dialHeld(id)!, lock.screw)
      return
    }
    setHistory((previous) => [...previous, puzzle])
    setPuzzle(next)
    play('dial')
    setMessage(`${PLATES.find((plate) => plate.id === id)!.name} turned. ${dialReading(next, id)}.`)
  }
  const undo = (): void => {
    const previous = history.at(-1)
    if (!previous || busy) return
    setPuzzle(previous)
    setHistory((current) => current.slice(0, -1))
    setFinished(false)
    setFly(null)
    play('undo')
    const turned = DIALS.find((dial) => previous.dials[dial.id] !== puzzle.dials[dial.id])
    setMessage(turned ? `${turned.name} turned back. ${dialReading(previous, turned.id)}.` : 'Last screw restored, along with its plate and tray space.')
  }
  const reportError = useCallback((text: string) => setError(text), [])
  const plateEvent = useCallback((event: PlateEvent) => play(event), [play])

  return (
    <PortraitGameShell className="bg-[#e9edf0] text-slate-800 dark:bg-[#121a21] dark:text-slate-100" contentClassName="plate-escape">
      <header className="flex items-center gap-2 px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button type="button" onClick={onLevels} aria-label="Levels" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-white/10"><ArrowLeft size={20} aria-hidden="true" /></button>
        <h1 className="min-w-0 flex-1 whitespace-nowrap text-lg font-bold tracking-tight">Plate Escape<span className="text-orange-500">.</span></h1>
        <span role="img" aria-label={`Level ${level.id}: ${level.name}${cleared || won ? ', cleared' : ''}`} className={`flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/65 px-3 text-xs font-bold tabular-nums dark:bg-white/10 ${cleared || won ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {String(level.id).padStart(2, '0')}{(cleared || won) && <Check size={13} aria-hidden="true" />}
        </span>
        {level.introduction && <button type="button" aria-label="Level guide" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-white/10" onClick={() => setHelp(true)}><CircleHelp size={20} aria-hidden="true" /></button>}
      </header>
      <CollectionTrays state={busy && fly ? history.at(-1) ?? puzzle : puzzle} />
      <section className="relative min-h-0 flex-1" aria-label="Plate puzzle">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#fff9ed_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,#2a3640_0%,transparent_70%)]" />
        <PlateEscapeScene key={sceneKey} state={puzzle} view={view} motion={!still} onTargets={setTargets} onError={reportError} onPlateEvent={plateEvent} />
        {targets.map((target) => {
          const screw = SCREWS.find((candidate) => candidate.id === target.id)!
          if (target.coveredBy) return <span key={target.id} role="img" aria-label={`${COLORS[screw.color].name} screw covered by ${target.coveredBy.toLowerCase()}`} data-covered-screw-id={screw.id} className="pointer-events-none absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-white/80 text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-200" style={{ left: target.x, top: target.y }}><LockKeyhole size={13} aria-hidden="true" /></span>
          const label = `${COLORS[screw.color].name} screw on ${PLATES.find((plate) => plate.id === screw.plate)!.name.toLowerCase()}`
          if (target.holdsUp) {
            return (
              <TapTarget key={target.id} className="screw-target absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 dark:focus-visible:outline-slate-200" style={{ left: target.x, top: target.y, touchAction: 'none' }} aria-label={`${label}, holding up the ${target.holdsUp.toLowerCase()}`} data-bearing-screw-id={screw.id}
                onTap={() => { if (!busy && !won && !lost && !error) explain(lockedReason(target.id), target.id) }}>
                <span key={hint?.screw === target.id ? hint.sequence : 0} aria-hidden="true" className="plate-bearing-badge absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-orange-500 bg-white text-orange-600 shadow-sm dark:bg-slate-900 dark:text-orange-400"><House size={11} strokeWidth={2.5} /></span>
              </TapTarget>
            )
          }
          return (
            <TapTarget key={target.id} className="screw-target absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 dark:focus-visible:outline-slate-200" style={{ left: target.x, top: target.y, touchAction: 'none' }} disabled={busy || won || lost || Boolean(error)} aria-label={`Unscrew ${label.toLowerCase()}`} data-screw-id={screw.id}
              onTap={(button) => unscrew(target.id, button)} />
          )
        })}
        <div className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400" data-testid="plate-progress">{freedPlates(puzzle)} / {PLATES.length} plates released</div>
        {DIALS.map((dial) => panelState(puzzle, dial.id) === 'open' && (
          <div key={dial.id} className="absolute bottom-[4.25rem] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/80 bg-white/80 p-1 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
            <button type="button" aria-label={`Turn the ${dial.name.toLowerCase()} left`} onClick={() => turn(dial.id, -1)} disabled={busy || won || lost || Boolean(error)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-800"><ChevronLeft size={20} aria-hidden="true" /></button>
            {/* Arrow keys turn the focused dial one stop, and focus stays on it. */}
            <div role="slider" tabIndex={0} aria-label={dial.name} aria-valuemin={1} aria-valuemax={dial.dial!.stops} aria-valuenow={(puzzle.dials[dial.id] ?? 0) + 1} aria-disabled={busy || won || lost || Boolean(error)}
              aria-valuetext={`${dialReading(puzzle, dial.id)}${dialHeld(dial.id) ? `. ${dialHeld(dial.id)}` : ''}`} data-dial-id={dial.id}
              onKeyDown={(event) => {
                const step = ({ ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 } as const)[event.key as 'ArrowLeft']
                if (step === undefined) return
                event.preventDefault()
                turn(dial.id, step)
              }}
              className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-semibold tabular-nums text-slate-600 focus-visible:outline-2 focus-visible:outline-slate-700 dark:text-slate-300 dark:focus-visible:outline-slate-200">
              {dialHeld(dial.id) && <LockKeyhole size={13} aria-hidden="true" />}Dial {(puzzle.dials[dial.id] ?? 0) + 1}/{dial.dial!.stops}
            </div>
            <button type="button" aria-label={`Turn the ${dial.name.toLowerCase()} right`} onClick={() => turn(dial.id, 1)} disabled={busy || won || lost || Boolean(error)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-35 dark:text-slate-200 dark:hover:bg-slate-800"><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
        ))}
        {hint && <p key={hint.sequence} aria-hidden="true" data-testid="plate-hint" className={`plate-hint pointer-events-none absolute inset-x-4 ${DIALS.length ? 'bottom-[7.5rem]' : 'bottom-[4.25rem]'} mx-auto w-fit max-w-full rounded-2xl border border-orange-200 bg-white/95 px-4 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm dark:border-orange-400/40 dark:bg-slate-900/95 dark:text-slate-100`}>{hint.text}</p>}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-white/80 bg-white/80 p-1 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
          <button type="button" aria-label="Rotate left" onClick={() => orbit('left')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><RotateCcw size={20} aria-hidden="true" /></button>
          <button type="button" onClick={() => orbit('reset')} className="whitespace-nowrap px-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Reset view</button>
          <button type="button" aria-label="Rotate right" onClick={() => orbit('right')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><RotateCw size={20} aria-hidden="true" /></button>
          {level.rotor && !reduceMotion && <button type="button" aria-label={still ? 'Resume motion' : 'Pause motion'} onClick={() => setStill(!still)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">{still ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}</button>}
        </div>
        {lost && <div role="alertdialog" aria-labelledby="storage-full-title" aria-describedby="storage-full-help" className="absolute inset-4 grid place-content-center rounded-3xl bg-[#fffbf2]/95 p-6 text-center shadow-xl dark:bg-slate-900/95">
          <div className="mb-3 flex justify-center"><ScrewHead color={puzzle.overflow!} size={48} /></div>
          <h2 id="storage-full-title" className="text-2xl font-bold">No room for that screw</h2>
          <p id="storage-full-help" className="mt-3 text-sm text-slate-600 dark:text-slate-300">All {SPARE_CAPACITY} spare slots are full, and this <span className="sr-only">{COLORS[puzzle.overflow!].name.toLowerCase()} </span>screw has no matching tray. Try a different order.</p>
          <button autoFocus type="button" onClick={undo} className="mt-5 rounded-full bg-slate-800 px-5 py-3 font-semibold text-white dark:bg-slate-100 dark:text-slate-900">Undo last move</button>
          <button type="button" onClick={restart} className="mt-2 rounded-full bg-white px-5 py-3 font-semibold dark:bg-slate-800">Retry level</button>
        </div>}
        {error && <div role="alert" className="absolute inset-4 grid place-content-center rounded-3xl bg-white/95 p-6 text-center dark:bg-slate-900/95"><p>{error}</p><button type="button" onClick={restart} className="mt-4 rounded-full bg-slate-800 px-5 py-3 text-white dark:bg-slate-100 dark:text-slate-900">Restart level</button></div>}
        {finished && (
          <div className="absolute inset-4 grid place-content-center rounded-3xl bg-[#fffbf2]/95 p-6 text-center shadow-xl dark:bg-slate-900/95">
            <StarRow stars={3} />
            <h2 className="mt-3 text-3xl font-bold">All plates free!</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{SCREWS.length} screws sorted. A little room to breathe.</p>
            {level.id < LEVELS.length && <button type="button" onClick={() => onSelect(level.id + 1)} className="mt-5 rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white">Next level</button>}
            <button type="button" onClick={restart} className="mt-3 rounded-full bg-slate-800 px-6 py-3 font-semibold text-white dark:bg-slate-100 dark:text-slate-900">Play again</button>
          </div>
        )}
      </section>
      <footer className="px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
        <p className={`mb-3 text-center text-xs ${storageFull && level.overflowLoses ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>{level.overflowLoses ? storageFull ? 'Storage full · Match a tray or the next screw will overflow' : `${SPARE_CAPACITY} spare slots · An unmatched screw with no room ends the attempt` : 'Drag to turn · Tap a screw · The gable walls hold up the roof'}</p>
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/65 p-2 dark:bg-white/5">
          <button type="button" onClick={undo} disabled={history.length === 0 || busy || won} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-35"><Undo2 size={16} aria-hidden="true" />Undo</button>
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400" data-testid="screw-progress">{puzzle.removed.length} / {SCREWS.length} screws</span>
          <button type="button" onClick={restart} className="rounded-xl px-4 py-2 text-sm font-semibold">Restart</button>
          <SoundToggle muted={muted} onMutedChange={onMutedChange} className="text-slate-600 dark:text-slate-300" />
          <FullscreenIconButton className="text-slate-600 dark:text-slate-300" />
        </div>
      </footer>
      {level.introduction && <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>{level.name}</DialogTitle><DialogDescription>{level.introduction}</DialogDescription></DialogHeader><button type="button" onClick={() => setHelp(false)} className="rounded-full bg-slate-800 px-6 py-3 font-semibold text-white dark:bg-slate-100 dark:text-slate-900">Let's play</button></DialogContent></Dialog>}
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
