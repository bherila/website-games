/**
 * Tower 2 prototype: draw floor plates, corridors, cores and rooms, one
 * isometric floor at a time, and watch visitors use them. It answers one
 * question — is drawing floors fun? — so it has no economy or stars yet.
 */
import {
  ArrowLeft, ArrowUpDown, Bed, Briefcase, Building, ChevronDown, ChevronUp, CircleDashed, Cloud, Coffee, Copy, Eraser, Footprints, Hand,
  HardDrive, Layers, Maximize, Minus, MousePointer2, Pencil, Plus, Redo2, RefreshCcw, RotateCcw, RotateCw, Route, Ruler, ShoppingBag, Square, Star, Sun, Trash,
  TriangleAlert, Undo2, Users, ZoomIn, ZoomOut,
} from 'lucide-react'
import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { readAuthenticationContext } from '../_shared/gameDataPersistence'
import { safeLocalStorage } from '../_shared/progressParsers'
import { hexColor } from '../_shared/three/threeUtils'
import { type Building as BuildingModel, type EditResult, type Facing, floorLabel, nextFacing } from './engine/building'
import { formatCost, OVERHANG_REACH } from './engine/construction'
import { carsIn, MAX_CARS, USES } from './engine/uses'
import { isUseTool, nextTurn, stepperFloors, type ToolId, TOOLS } from './interaction'
import type { OverlayKind } from './scene/Tower2Renderer'
import { type CoreStats, type SceneControls, type Selection, Tower2Scene } from './Tower2Scene'
import { TUTORIAL, tutorialProgress } from './tutorial'
import { TutorialCard } from './TutorialCard'
import { useWorld } from './useWorld'

const SQUARE_METRES_PER_TILE = 9
/** 'on' or 'off' once the player has started, skipped or finished the tutorial. */
const TUTORIAL_KEY = 'tower-2-tutorial'

function readTutorialFlag(firstVisit: boolean): boolean {
  try {
    const flag = safeLocalStorage()?.getItem(TUTORIAL_KEY)
    if (flag === 'on' || flag === 'off') return flag === 'on'
  } catch {
    // Blocked storage: fall through to the first-visit default.
  }
  return firstVisit
}

function writeTutorialFlag(on: boolean): void {
  try {
    safeLocalStorage()?.setItem(TUTORIAL_KEY, on ? 'on' : 'off')
  } catch {
    // The tutorial just won't survive a reload.
  }
}
const MESSAGE_MS = 2600

const TOOL_ICONS: Record<ToolId, typeof Square> = {
  select: MousePointer2,
  plate: Square,
  erase: Eraser,
  atrium: CircleDashed,
  corridor: Route,
  core: ArrowUpDown,
  studio: Bed,
  office: Briefcase,
  shop: ShoppingBag,
  cafe: Coffee,
}

const PANEL = 'rounded-2xl bg-slate-950/80 text-white shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-md'
const ICON_BUTTON_BASE = 'grid h-10 w-10 place-items-center rounded-xl disabled:opacity-35 disabled:hover:bg-transparent'
const ICON_BUTTON = `${ICON_BUTTON_BASE} text-white/90 hover:bg-white/15`
const ICON_BUTTON_ON = `${ICON_BUTTON_BASE} bg-white text-slate-950`

function floorName(floor: number): string {
  return floor === 0 ? 'Street floor' : floor < 0 ? `Basement B${-floor}` : `Floor ${floor}`
}

function Stars({ count }: { count: number }): ReactElement {
  return (
    <span role="img" aria-label={`${count} of 3 stars`} className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => <Star key={i} size={14} aria-hidden="true" className={i < count ? 'fill-yellow-300 text-yellow-300' : 'text-white/30'} />)}
    </span>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T, options: { value: T, label: string, icon: ReactNode }[], onChange: (value: T) => void, label: string }): ReactElement {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl bg-white/10 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          title={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold ${value === option.value ? 'bg-white text-slate-950' : 'text-white/85 hover:bg-white/10'}`}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Tower2Game(): ReactElement {
  const history = useWorld()
  const { world } = history
  const [tool, setTool] = useState<ToolId>('plate')
  const [facing, setFacing] = useState<Facing>('south')
  const [cars, setCars] = useState(1)
  const [coreStats, setCoreStats] = useState<ReadonlyMap<string, CoreStats>>(() => new Map())
  const [activeFloor, setActiveFloor] = useState(0)
  const [overlay, setOverlay] = useState<OverlayKind>('none')
  const [exterior, setExterior] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [touchMode, setTouchMode] = useState<'draw' | 'move'>('draw')
  const [hint, setHint] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string, tone: 'refusal' | 'info' } | null>(null)
  const [visitors, setVisitors] = useState(0)
  const [tutorialOn, setTutorialOn] = useState(() => readTutorialFlag(history.firstVisit))
  const [framings, setFramings] = useState(0)
  const [signedIn] = useState(() => readAuthenticationContext().authenticated)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const controlsRef = useRef<SceneControls>(null)
  const messageTimerRef = useRef<number | undefined>(undefined)

  /** A short message under the toolbar: refusals in red, news in the panel colour. */
  const say = useCallback((text: string, tone: 'refusal' | 'info' = 'refusal') => {
    setMessage({ text, tone })
    window.clearTimeout(messageTimerRef.current)
    messageTimerRef.current = window.setTimeout(() => setMessage(null), MESSAGE_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(messageTimerRef.current), [])

  const apply = useCallback((commit: (building: BuildingModel) => EditResult) => {
    const result = history.apply(commit)
    if (!result.ok) say(result.reason)
    return result
  }, [history, say])

  // Derived HUD numbers; `world` gets a new identity on every change to the building.
  const summary = useMemo(() => {
    const { building, analysis } = world
    const ratings = building.allRooms().map((room) => ({ room, rating: analysis.rate(room) }))
    const unreachable = ratings.filter(({ rating }) => !rating.reachable).length
    const meanStars = ratings.length ? ratings.reduce((sum, { rating }) => sum + rating.stars, 0) / ratings.length : 0
    const built = building.builtFloors()
    const construction = built.map((floor) => building.construction(floor))
    return { ratings, unreachable, meanStars, built, hasEntrance: building.entrance() !== null, shellCost: construction.reduce((sum, floor) => sum + floor.cost, 0) }
  }, [world])

  const selected = useMemo(() => {
    const { building, analysis } = world
    if (selection?.kind === 'room') {
      const room = building.room(selection.id)
      return room ? { kind: 'room' as const, room, rating: analysis.rate(room) } : null
    }
    if (selection?.kind === 'core') {
      const core = building.core(selection.id)
      return core ? { kind: 'core' as const, core } : null
    }
    return null
  }, [world, selection])

  const removeSelected = useCallback(() => {
    if (selected?.kind === 'room') apply((building) => building.removeRoom(selected.room.id))
    if (selected?.kind === 'core') apply((building) => building.removeCore(selected.core.id))
    setSelection(null)
  }, [apply, selected])

  /** Turn the selected room to its next facing that fits, about its centre or its corner. */
  const turnSelected = useCallback(() => {
    if (selected?.kind !== 'room') return
    const { room } = selected
    const turn = nextTurn(world.building, room)
    if (turn) apply((building) => building.moveRoom(room.id, turn.x, turn.y, turn.facing))
    else say('No other way round fits here')
  }, [apply, say, selected, world])

  const turn = useCallback(() => {
    if (selected?.kind === 'room') turnSelected()
    else setFacing((value) => nextFacing(value))
  }, [selected, turnSelected])

  const { floors, topOffered, bottomOffered } = useMemo(() => {
    const offered = stepperFloors(summary.built, activeFloor, world.building.lowestFloor, world.building.highestFloor)
    return { floors: offered, topOffered: offered[0]!, bottomOffered: offered.at(-1)! }
  }, [summary, activeFloor, world])
  const stepFloor = useCallback((delta: number) => {
    setActiveFloor((floor) => Math.min(topOffered, Math.max(bottomOffered, floor + delta)))
  }, [topOffered, bottomOffered])

  const inherit = useCallback(() => {
    const result = apply((building) => building.inheritFloorBelow(activeFloor))
    if (result.ok) say(`${floorName(activeFloor)} now matches the floor below`, 'info')
  }, [apply, activeFloor, say])

  const chooseTool = useCallback((next: ToolId) => {
    setTool(next)
    if (next !== 'select') setSelection(null)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
        return
      }
      if ((event.metaKey || event.ctrlKey) && key === 'y') {
        event.preventDefault()
        history.redo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const toolForKey = TOOLS.find((candidate) => candidate.key === key)
      if (toolForKey) chooseTool(toolForKey.id)
      else if (key === 'pageup' || (key === 'arrowup' && event.shiftKey)) stepFloor(1)
      else if (key === 'pagedown' || (key === 'arrowdown' && event.shiftKey)) stepFloor(-1)
      else if (key === 'q') controlsRef.current?.rotate(-1)
      else if (key === 'e') controlsRef.current?.rotate(1)
      else if (key === 'r') turn()
      else if (key === 'c') setCars((value) => (value % MAX_CARS) + 1)
      else if (key === 'o') setOverlay((value) => (value === 'none' ? 'light' : value === 'light' ? 'walk' : value === 'walk' ? 'structure' : 'none'))
      else if (key === 'x') setExterior((value) => !value)
      else if (key === 'i') inherit()
      else if (key === 'escape') {
        chooseTool('select')
        setSelection(null)
      } else if ((key === 'delete' || key === 'backspace') && selection) removeSelected()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, chooseTool, stepFloor, inherit, removeSelected, selection, turn])

  // The tutorial follows the building, so undo steps back through it too.
  const tutorialStep = useMemo(() => (tutorialOn ? tutorialProgress(world.building, world.analysis) : -1), [tutorialOn, world])
  const [seenStep, setSeenStep] = useState<number | null>(null)
  if (seenStep !== tutorialStep) {
    // A new step picks its tool for the player (adjusting state while rendering, not in an effect).
    setSeenStep(tutorialStep)
    const step = TUTORIAL[tutorialStep]
    if (step) setTool(step.tool)
  }
  const tutorialGuide = TUTORIAL[tutorialStep]?.guide ?? null

  const setTutorial = useCallback((on: boolean) => setTutorialOn(on), [])
  // Store the flag whenever it is decided, including a first visit's default, so a reload resumes the tutorial.
  useEffect(() => writeTutorialFlag(tutorialOn), [tutorialOn])

  const startOver = useCallback((start: 'empty' | 'example') => {
    history.reset(start)
    setSelection(null)
    setActiveFloor(0)
    setTutorial(start === 'empty')
    setFramings((count) => count + 1)
    say(start === 'empty' ? 'An empty site. Undo brings your plan back.' : 'The example block. Undo brings your plan back.', 'info')
  }, [history, say, setTutorial])

  /** Debug reset: save an empty site over the tower (account copy too) and restart the tutorial, then reload as a first visit. */
  const eraseEverything = useCallback(async () => {
    setConfirmingReset(false)
    const outcome = await history.restart()
    if (outcome === 'conflict') {
      say('Reset did not apply: another tab or device saved this tower more recently. Reload to continue from that save.')
      return
    }
    writeTutorialFlag(true)
    if (outcome === 'saved') {
      window.location.reload()
      return
    }
    startOver('empty')
    say('The site is cleared. Reset reaches your account once the connection returns.', 'info')
  }, [history, say, startOver])

  // Frame the new building once the scene has it.
  useEffect(() => {
    if (framings > 0) controlsRef.current?.frame()
  }, [framings])

  const floorStats = {
    ...useMemo(() => world.building.construction(activeFloor), [world, activeFloor]),
    rooms: world.building.roomsOn(activeFloor).length,
  }
  const built = new Set(summary.built)
  const currentTool = TOOLS.find((candidate) => candidate.id === tool)!

  return (
    <div className="fixed inset-0 overflow-hidden text-white" style={{ background: 'radial-gradient(120% 90% at 30% 10%, #3b2a8a 0%, #1d1650 45%, #0d0a26 100%)' }}>
      <Tower2Scene
        world={world}
        activeFloor={activeFloor}
        tool={tool}
        facing={facing}
        guide={tutorialGuide}
        overlay={overlay}
        exterior={exterior}
        selection={selection}
        touchMode={touchMode}
        onApply={apply}
        onSelect={setSelection}
        onHint={setHint}
        onVisitors={setVisitors}
        cars={cars}
        onCoreStats={setCoreStats}
        controlsRef={controlsRef}
      />

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className={`${PANEL} pointer-events-auto flex items-center gap-1 py-1 pl-1 pr-3`}>
          <a href="/" aria-label="All games" className={ICON_BUTTON}><ArrowLeft size={20} aria-hidden="true" /></a>
          <h1 className="text-base font-black tracking-tight">Tower <span className="text-fuchsia-300">2</span></h1>
          <span className="ml-1 hidden rounded-full bg-fuchsia-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200 min-[400px]:inline">Prototype</span>
        </div>
        <div className={`${PANEL} pointer-events-auto relative flex items-center gap-0.5 p-1`}>
          {signedIn
            ? <span data-testid="tower2-save-place" title="Your tower saves to your account" className="flex h-10 items-center gap-1.5 px-2 text-[11px] font-semibold text-emerald-200"><Cloud size={16} aria-hidden="true" /><span className="hidden sm:inline">Saved to your account</span></span>
            : (
                <a data-testid="tower2-save-place" href="/login?next=/tower-2" title="Your tower saves in this browser. Sign in to keep it in your account." className="flex h-10 items-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold text-amber-200 hover:bg-white/10">
                  <HardDrive size={16} aria-hidden="true" /><span className="hidden sm:inline">This browser · Sign in to save</span>
                </a>
              )}
          <button type="button" aria-expanded={confirmingReset} onClick={() => setConfirmingReset((value) => !value)} className="h-10 rounded-xl px-2 text-[11px] font-semibold text-white/80 hover:bg-white/10">Reset</button>
          {confirmingReset && (
            <div role="dialog" aria-label="Reset" className={`${PANEL} absolute left-0 top-12 z-10 w-64 p-3 text-xs`}>
              <p className="mb-2 text-white/85">Erase this tower{signedIn ? ' here and in your account' : ''} and restart the tutorial? This can&apos;t be undone.</p>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => void eraseEverything()} className="rounded-lg bg-rose-500/90 px-2.5 py-1.5 font-semibold hover:bg-rose-500">Erase and restart</button>
                <button type="button" onClick={() => setConfirmingReset(false)} className="rounded-lg px-2.5 py-1.5 font-semibold text-white/80 hover:bg-white/10">Cancel</button>
              </div>
            </div>
          )}
        </div>
        <div className={`${PANEL} pointer-events-auto flex items-center gap-0.5 p-1`}>
          <button type="button" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" className={ICON_BUTTON} disabled={!history.canUndo} onClick={history.undo}><Undo2 size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" className={ICON_BUTTON} disabled={!history.canRedo} onClick={history.redo}><Redo2 size={18} aria-hidden="true" /></button>
        </div>
        <div className={`${PANEL} pointer-events-auto p-1`}>
          <Segmented
            label="Overlay (O)"
            value={overlay}
            onChange={setOverlay}
            options={[
              { value: 'none', label: 'Plan', icon: <Layers size={16} aria-hidden="true" /> },
              { value: 'light', label: 'Light', icon: <Sun size={16} aria-hidden="true" /> },
              { value: 'walk', label: 'Walk', icon: <Footprints size={16} aria-hidden="true" /> },
              { value: 'structure', label: 'Structure', icon: <Ruler size={16} aria-hidden="true" /> },
            ]}
          />
        </div>
        <div className={`${PANEL} pointer-events-auto flex items-center gap-0.5 p-1`}>
          <button type="button" aria-label="Turn view left (Q)" title="Turn view left (Q)" className={ICON_BUTTON} onClick={() => controlsRef.current?.rotate(-1)}><RotateCcw size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Turn view right (E)" title="Turn view right (E)" className={ICON_BUTTON} onClick={() => controlsRef.current?.rotate(1)}><RotateCw size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl+scroll)" className={`${ICON_BUTTON} hidden sm:grid`} onClick={() => controlsRef.current?.zoom(1.25)}><ZoomIn size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl+scroll)" className={`${ICON_BUTTON} hidden sm:grid`} onClick={() => controlsRef.current?.zoom(0.8)}><ZoomOut size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Frame the building" title="Frame the building" className={ICON_BUTTON} onClick={() => controlsRef.current?.frame()}><Maximize size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Exterior view (X)" title="Exterior view (X)" aria-pressed={exterior} className={exterior ? ICON_BUTTON_ON : ICON_BUTTON} onClick={() => setExterior((value) => !value)}><Building size={18} aria-hidden="true" /></button>
          <button type="button" aria-label="Start over on an empty site with the tutorial" title="Start over on an empty site" className={`${ICON_BUTTON} hidden sm:grid`} onClick={() => startOver('empty')}><RefreshCcw size={18} aria-hidden="true" /></button>
        </div>
      </header>

      {/* Hint and messages */}
      {/* The header wraps to two rows below the lg breakpoint. */}
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[calc(max(0.5rem,env(safe-area-inset-top))+7rem)] flex flex-col items-center gap-1.5 px-4 lg:top-[calc(max(0.5rem,env(safe-area-inset-top))+3.75rem)]">
        {message && <p className={`rounded-full px-3 py-1 text-center text-xs font-semibold shadow ${message.tone === 'refusal' ? 'bg-rose-500/90' : 'bg-fuchsia-500/90'}`}>{message.text}</p>}
        <p data-testid="tower2-hint" className="rounded-full bg-slate-950/70 px-3 py-1 text-center text-xs text-white/85">{hint ?? currentTool.hint}</p>
        {overlay !== 'none' && (
          <div className={`${PANEL} px-3 py-1.5 text-[11px]`}>
            {overlay === 'light'
              ? <span className="flex items-center gap-2">Deep plan <span aria-hidden="true" className="h-2 w-20 rounded-full sm:w-24" style={{ background: 'linear-gradient(90deg,#1f3b8a,#6f8ff0,#ffd84d,#fff3a0)' }} /> By a window</span>
              : overlay === 'structure'
                ? <span>Green: supported · Pink: overhang · Red: beyond {OVERHANG_REACH} tiles</span>
                : <span className="flex items-center gap-2">Near a core <span aria-hidden="true" className="h-2 w-20 rounded-full sm:w-24" style={{ background: 'linear-gradient(90deg,#22c55e,#eab308,#ef4444)' }} /> Far · grey: no core</span>}
          </div>
        )}
        {tutorialOn && (
          <TutorialCard
            step={tutorialStep}
            activeFloor={activeFloor}
            onGoToFloor={setActiveFloor}
            onSkip={() => setTutorial(false)}
            onExample={() => startOver('example')}
          />
        )}
      </div>

      {/* Tools */}
      <nav aria-label="Build tools" className={`${PANEL} absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-0.5 overflow-x-auto p-1 md:bottom-auto md:left-3 md:top-1/2 md:max-h-[calc(100vh-8rem)] md:-translate-y-1/2 md:translate-x-0 md:flex-col md:overflow-y-auto`}>
        {TOOLS.map((candidate) => {
          const Icon = TOOL_ICONS[candidate.id]
          const swatch = isUseTool(candidate.id) ? hexColor(USES[candidate.id].color) : null
          const active = tool === candidate.id
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={active}
              aria-label={`${candidate.label} (${candidate.key})`}
              title={`${candidate.hint} (${candidate.key})`}
              onClick={() => chooseTool(candidate.id)}
              className={`relative flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold md:min-w-0 md:flex-row md:gap-2 md:px-2.5 ${active ? 'bg-white text-slate-950' : 'text-white/85 hover:bg-white/10'}`}
            >
              <Icon size={18} aria-hidden="true" style={swatch ? { color: active ? swatch : undefined } : undefined} />
              {swatch && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full md:static md:order-last md:ml-auto" style={{ background: swatch }} />}
              <span className="whitespace-nowrap">{candidate.label}</span>
              <kbd className="hidden rounded bg-black/20 px-1 text-[10px] font-medium md:inline">{candidate.key}</kbd>
            </button>
          )
        })}
        {tool === 'core' && (
          <button type="button" onClick={() => setCars((value) => (value % MAX_CARS) + 1)} title="Cars in the core you place: a core with several is a bank (C)" className="flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10 md:flex-row md:gap-2">
            <ArrowUpDown size={18} aria-hidden="true" />
            <span className="whitespace-nowrap">{cars} {cars === 1 ? 'car' : 'cars'}</span>
            <kbd className="hidden rounded bg-black/20 px-1 text-[10px] font-medium md:inline">C</kbd>
          </button>
        )}
        {isUseTool(tool) && (
          <button type="button" onClick={turn} title="Turn the room so its door faces another way (R)" className="flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/10 md:flex-row md:gap-2">
            <RotateCw size={18} aria-hidden="true" />
            <span className="whitespace-nowrap">Turn</span>
            <kbd className="hidden rounded bg-black/20 px-1 text-[10px] font-medium md:inline">R</kbd>
          </button>
        )}
        <div className="flex shrink-0 md:hidden" role="group" aria-label="One finger">
          <button type="button" aria-pressed={touchMode === 'draw'} onClick={() => setTouchMode('draw')} className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold ${touchMode === 'draw' ? 'bg-fuchsia-400 text-slate-950' : 'text-white/85'}`}><Pencil size={18} aria-hidden="true" />Draw</button>
          <button type="button" aria-pressed={touchMode === 'move'} onClick={() => setTouchMode('move')} className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold ${touchMode === 'move' ? 'bg-fuchsia-400 text-slate-950' : 'text-white/85'}`}><Hand size={18} aria-hidden="true" />Move</button>
        </div>
      </nav>

      {/* Floors */}
      <nav aria-label="Floors" className={`${PANEL} absolute right-2 top-1/2 flex max-h-[calc(100vh-14rem)] -translate-y-1/2 flex-col items-center gap-0.5 p-1 sm:right-3`}>
        <button type="button" aria-label="Floor up (Page Up)" title="Floor up (Page Up)" className={ICON_BUTTON} disabled={activeFloor >= topOffered} onClick={() => stepFloor(1)}><ChevronUp size={18} aria-hidden="true" /></button>
        {/* Built floors, plus one empty floor above and below to build on; the list scrolls when tall. */}
        <div className="flex min-h-0 flex-col items-center gap-0.5 overflow-y-auto">
          {floors.map((floor) => {
            const empty = !built.has(floor)
            return (
              <button
                key={floor}
                type="button"
                aria-pressed={floor === activeFloor}
                aria-label={`${floorName(floor)}${empty ? ', empty: paint or copy a floor here to add it' : ''}`}
                title={empty ? `${floorName(floor)}: empty. Paint or copy a floor here to add it.` : floorName(floor)}
                onClick={() => setActiveFloor(floor)}
                className={`relative grid h-9 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums ${floor === activeFloor ? 'bg-white text-slate-950' : empty ? 'text-white/45 outline-1 -outline-offset-4 outline-dashed outline-white/25 hover:bg-white/10' : 'text-white/80 hover:bg-white/10'}`}
              >
                {floorLabel(floor)}
                {!empty && <span aria-hidden="true" className={`absolute right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${floor === activeFloor ? 'bg-fuchsia-500' : 'bg-cyan-300/80'}`} />}
              </button>
            )
          })}
        </div>
        <button type="button" aria-label="Floor down (Page Down)" title="Floor down (Page Down)" className={ICON_BUTTON} disabled={activeFloor <= bottomOffered} onClick={() => stepFloor(-1)}><ChevronDown size={18} aria-hidden="true" /></button>
        <div className="my-0.5 h-px w-8 shrink-0 bg-white/15" />
        <button type="button" aria-label="Copy the floor below's outline (I)" title="Copy the floor below's outline (I)" className={ICON_BUTTON} disabled={activeFloor <= world.building.lowestFloor || !built.has(activeFloor - 1)} onClick={inherit}><Copy size={18} aria-hidden="true" /></button>
      </nav>

      {/* Stats */}
      <section aria-label="Building summary" className={`${PANEL} absolute bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+4.75rem)] left-2 w-44 p-2.5 text-xs sm:left-3 sm:w-56 sm:p-3 md:bottom-3 md:left-auto md:right-16`}>
        <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">{floorName(activeFloor)}</h2>
        <dl className="hidden grid-cols-[1fr_auto] gap-x-3 gap-y-1 sm:grid">
          <dt className="text-white/70">Floor area</dt>
          <dd data-testid="tower2-floor-area" className="text-right font-semibold tabular-nums">{(floorStats.area * SQUARE_METRES_PER_TILE).toLocaleString()} m²</dd>
          {activeFloor > 0 && (
            <>
              <dt className="text-white/70">Cantilevered</dt>
              <dd className={`text-right font-semibold tabular-nums ${floorStats.overhang > 0 ? 'text-pink-300' : ''}`}>{floorStats.overhang} tiles</dd>
            </>
          )}
          <dt className="text-white/70">Rooms here</dt>
          <dd className="text-right font-semibold tabular-nums">{floorStats.rooms}</dd>
        </dl>
        {overlay === 'structure' && (
          <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[11px]">
            <p className="text-white/85">Reach: up to {OVERHANG_REACH} tiles through connected plate.</p>
            <p data-testid="tower2-overhang-count" className="text-white/85">{floorStats.overhang} overhang {floorStats.overhang === 1 ? 'tile' : 'tiles'} · 3× shell price</p>
            {floorStats.outOfReach > 0 && <p className="text-amber-200">{floorStats.outOfReach} tiles exceed reach. Add support below or trim this floor.</p>}
            <p className="text-white/85">Floor shell <strong data-testid="tower2-floor-cost">{formatCost(floorStats.cost)}</strong></p>
            {floorStats.premium > 0 && <p className="text-pink-300">Includes {formatCost(floorStats.premium)} overhang premium</p>}
            <p className="text-white/85">Tower shell <strong data-testid="tower2-shell-cost">{formatCost(summary.shellCost)}</strong></p>
            <p className="text-white/60">Plan estimate only; no budget yet.</p>
          </div>
        )}
        <div className="my-2 hidden h-px bg-white/10 sm:block" />
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <dt className="text-white/70">Rooms</dt>
          <dd data-testid="tower2-room-count" className="text-right font-semibold tabular-nums">{summary.ratings.length}</dd>
          <dt className="text-white/70">Average rating</dt>
          <dd className="text-right"><Stars count={Math.round(summary.meanStars)} /></dd>
          <dt className="flex items-center gap-1 text-white/70"><Users size={13} aria-hidden="true" />Visitors</dt>
          <dd data-testid="tower2-visitors" className="text-right font-semibold tabular-nums">{visitors}</dd>
        </dl>
        {/* The tutorial already explains the entrance, so its warning waits until the tutorial ends. */}
        {((!summary.hasEntrance && !tutorialOn) || summary.unreachable > 0) && (
          <ul className="mt-2 space-y-1 text-[11px] text-amber-200">
            {!summary.hasEntrance && !tutorialOn && <li className="flex gap-1"><TriangleAlert size={13} className="mt-px shrink-0" aria-hidden="true" />Draw a street-floor corridor: its tile nearest the street is the entrance.</li>}
            {summary.unreachable > 0 && <li className="flex gap-1"><TriangleAlert size={13} className="mt-px shrink-0" aria-hidden="true" />{summary.unreachable} {summary.unreachable === 1 ? 'room has' : 'rooms have'} no route from the street.</li>}
          </ul>
        )}
      </section>

      {/* Inspect */}
      {selected && (
        <section aria-label="Selection" className={`${PANEL} absolute right-16 top-[calc(max(0.5rem,env(safe-area-inset-top))+6rem)] w-60 p-3 text-xs sm:right-20`}>
          {selected.kind === 'room' ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: hexColor(USES[selected.room.use].color) }} />
                <h2 className="text-sm font-bold">{USES[selected.room.use].label}</h2>
                <span className="ml-auto"><Stars count={selected.rating.stars} /></span>
              </div>
              <p className="mb-2 text-white/60">{floorName(selected.room.floor)} · {selected.room.width}×{selected.room.depth} tiles · {selected.room.storefront ? 'storefront onto the street' : `door faces ${selected.room.facing}`} · wants {USES[selected.room.use].wants.toLowerCase()}</p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                <dt className="text-white/70">Daylight</dt>
                <dd className="text-right font-semibold tabular-nums">{Math.round(selected.rating.light * 100)}%</dd>
                <dt className="text-white/70">Walk to a core</dt>
                <dd className="text-right font-semibold tabular-nums">{Number.isFinite(selected.rating.walk) ? `${selected.rating.walk * 3} m` : 'No core'}</dd>
              </dl>
              {selected.rating.notes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-amber-200">{selected.rating.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
            </>
          ) : (
            <>
              <h2 className="mb-1 text-sm font-bold">{carsIn(selected.core) === 1 ? 'Core' : `Elevator bank of ${carsIn(selected.core)}`}</h2>
              <p className="mb-2 text-white/60">Cars, a stair and a riser. Its cars stop on every floor it spans: {floorLabel(selected.core.bottomFloor)}–{floorLabel(selected.core.topFloor)}.</p>
              <dl className="mb-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                <dt className="text-white/70">Average wait</dt>
                <dd data-testid="tower2-core-wait" className="text-right font-semibold tabular-nums">{(() => {
                  const wait = coreStats.get(selected.core.id)?.wait
                  return wait === null || wait === undefined ? 'No riders yet' : `${Math.round(wait)} s`
                })()}</dd>
                <dt className="text-white/70">Waiting now</dt>
                <dd className="text-right font-semibold tabular-nums">{coreStats.get(selected.core.id)?.waiting ?? 0}</dd>
              </dl>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-white/70">Cars</span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label="Remove a car" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" onClick={() => apply((building) => building.setCoreCars(selected.core.id, carsIn(selected.core) - 1))}><Minus size={16} aria-hidden="true" /></button>
                  <span data-testid="tower2-core-cars" className="w-6 text-center font-bold tabular-nums">{carsIn(selected.core)}</span>
                  <button type="button" aria-label="Add a car" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" onClick={() => apply((building) => building.setCoreCars(selected.core.id, carsIn(selected.core) + 1))}><Plus size={16} aria-hidden="true" /></button>
                </span>
              </div>
              {(['top', 'bottom'] as const).map((end) => {
                const core = selected.core
                const value = end === 'top' ? core.topFloor : core.bottomFloor
                const resize = (delta: number) => apply((building) => end === 'top'
                  ? building.resizeCore(core.id, core.bottomFloor, core.topFloor + delta)
                  : building.resizeCore(core.id, core.bottomFloor + delta, core.topFloor))
                return (
                  <div key={end} className="flex items-center justify-between py-0.5">
                    <span className="text-white/70">{end === 'top' ? 'Top floor' : 'Bottom floor'}</span>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={`Lower the ${end}`} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" onClick={() => resize(-1)}><ChevronDown size={16} aria-hidden="true" /></button>
                      <span className="w-6 text-center font-bold tabular-nums">{floorLabel(value)}</span>
                      <button type="button" aria-label={`Raise the ${end}`} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15" onClick={() => resize(1)}><ChevronUp size={16} aria-hidden="true" /></button>
                    </span>
                  </div>
                )
              })}
            </>
          )}
          {selected.kind === 'room' && (
            <>
              <p className="mt-2 text-white/50">Drag the room to move it.</p>
              <button type="button" onClick={turnSelected} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2 font-semibold hover:bg-white/25"><RotateCw size={14} aria-hidden="true" />Turn (R)</button>
            </>
          )}
          <button type="button" onClick={removeSelected} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-500/90 py-2 font-semibold hover:bg-rose-500"><Trash size={14} aria-hidden="true" />Remove</button>
        </section>
      )}
    </div>
  )
}
