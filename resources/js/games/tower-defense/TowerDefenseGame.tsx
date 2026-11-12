import { FastForward, Grid3x3, Pause, Play, SkipForward } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import { createMuteStorage } from '../_shared/audio/muteStorage'
import { SoundBottomControlButton } from '../_shared/audio/SoundToggle'
import { FullscreenBottomControlButton } from '../_shared/FullscreenButton'
import { BottomControlButton, GAME_TOOLBAR_PADDING_CLASS, GameBottomToolbar } from '../_shared/GameControlPrimitives'
import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import { PortraitGameShell } from '../PortraitGameShell'
import { createSfxEngine, type SfxName } from './audio/sfx'
import { ELEMENTS } from './catalog'
import {
  buildHudSnapshot,
  buyHeroUpgrade,
  callNextWave,
  cancelPlan,
  computeStars,
  createGameState,
  moveHero,
  orderBuild,
  orderUpgrade,
  pickElement,
  placementProblem,
  sellBuilding,
  setHeroInput,
} from './gameEngine'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import type { ElementId, GameState, HeroUpgrade, HudSnapshot, TowerId } from './gameTypes'
import { levelById, LEVELS, TOTAL_LEVELS } from './levels'
import { clearRun, discardInvalidBrowserRun, loadRun, saveRun } from './runProgress'
import { restoreRun } from './runSnapshot'
import type { BoardOverlay } from './scene/buildingView'
import { type BoardPointer, TowerDefenseScene } from './TowerDefenseScene'
import { BuildTray } from './ui/BuildTray'
import { GameHud } from './ui/GameHud'
import { GraphicsUnavailable } from './ui/GraphicsUnavailable'
import { ElementPickOverlay, LostOverlay, PauseOverlay, TutorialOverlay, WonOverlay } from './ui/Overlays'
import { BuildingPanel, HeroPanel } from './ui/Panels'

const TUTORIAL_STORAGE_KEY = 'bwh.tower-defense.tutorial.v1'
const MUTED_STORAGE_KEY = 'bwh.tower-defense.muted.v1'
const mute = createMuteStorage(MUTED_STORAGE_KEY, 'flag')

type Phase = 'select' | 'playing' | 'paused' | 'won' | 'lost'

const PLACEMENT_MESSAGE = {
  terrain: 'You can\'t build there.',
  occupied: 'That spot is taken.',
  gold: 'Not enough gold. Collect more coins!',
  locked: 'That tower is locked.',
} as const

function tutorialSeen(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'seen'
  } catch {
    return false
  }
}

const SHORTCUT_TARGETS = 'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [role="textbox"], [contenteditable]:not([contenteditable="false"])'

export function TowerDefenseGame(): ReactElement {
  const [progress, setProgress] = useState(loadProgress)
  const [recovery, setRecovery] = useState(loadRun)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingLevel, setPendingLevel] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('select')
  const [game, setGame] = useState<GameState | null>(null)
  const [retainedRun, setRetainedRun] = useState<GameState | null>(null)
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [graphicsReady, setGraphicsReady] = useState(false)
  const [graphicsFailed, setGraphicsFailed] = useState(false)
  const graphicsReadyRef = useRef(false)
  const playRef = useRef<HTMLDivElement | null>(null)
  const selectRef = useRef<HTMLDivElement | null>(null)
  const [speed, setSpeed] = useState(1)
  const [tool, setToolState] = useState<TowerId | null>(null)
  const [selectedId, setSelectedIdState] = useState<number | null>(null)
  const [heroOpen, setHeroOpenState] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [earned, setEarned] = useState<1 | 2 | 3>(1)
  const [muted, setMuted] = useState(mute.load)
  const [sfx] = useState(() => createSfxEngine(mute.load()))

  // The scene reads this every frame, so hovering never has to re-render React.
  const overlayRef = useRef<BoardOverlay>({ tool: null, hover: null, selectedId: null, heroSelected: false })
  const paintedCellRef = useRef<string | null>(null)
  const noticeTimerRef = useRef<number | undefined>(undefined)
  const heldKeysRef = useRef(new Set<string>())
  const activeRunRef = useRef<GameState | null>(null)
  const checkpointTimerRef = useRef<number | undefined>(undefined)
  const savedWaveRef = useRef(0)
  const replacementOriginRef = useRef<HTMLElement | null>(null)
  const keepRunRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => () => {
    sfx.dispose()
    window.clearTimeout(noticeTimerRef.current)
  }, [sfx])

  const playSfx = useCallback((name: SfxName, intensity?: number): void => sfx.play(name, intensity), [sfx])

  const flash = useCallback((message: string): void => {
    setNotice(message)
    window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2200)
  }, [])

  const setTool = useCallback((next: TowerId | null): void => {
    overlayRef.current.tool = next
    overlayRef.current.hover = null
    setToolState(next)
  }, [])
  const setSelectedId = useCallback((next: number | null): void => {
    overlayRef.current.selectedId = next
    setSelectedIdState(next)
  }, [])
  const setHeroOpen = useCallback((next: boolean): void => {
    overlayRef.current.heroSelected = next
    setHeroOpenState(next)
  }, [])

  const clearSelections = useCallback((): void => {
    setTool(null)
    setSelectedId(null)
    setHeroOpen(false)
  }, [setHeroOpen, setSelectedId, setTool])

  const checkpoint = useCallback((): void => {
    const current = activeRunRef.current
    if (!current || current.status !== 'playing') return
    const result = saveRun(current)
    if (result.ok) {
      setRecovery({ snapshot: result.snapshot, problem: null })
      setSaveError(null)
    } else {
      setSaveError(result.reason === 'conflict'
        ? 'Another tab or device changed this run. Reload before saving.'
        : 'Your latest changes could not be saved. The previous saved run is unchanged.')
    }
  }, [])

  const resetPhysicalInput = useCallback((): void => {
    heldKeysRef.current.clear()
    paintedCellRef.current = null
    overlayRef.current.hover = null
    if (activeRunRef.current) setHeroInput(activeRunRef.current, 0, 0)
  }, [])

  const handleGraphicsAvailable = useCallback((state: GameState, available: boolean): void => {
    if (activeRunRef.current !== state) return
    graphicsReadyRef.current = available
    setGraphicsReady(available)
    setGraphicsFailed(!available)
    if (!available) {
      resetPhysicalInput()
      clearSelections()
      setPhase('paused')
      window.clearTimeout(checkpointTimerRef.current)
      checkpoint()
    }
  }, [checkpoint, clearSelections, resetPhysicalInput])

  const retryGraphics = useCallback((): void => {
    graphicsReadyRef.current = false
    setGraphicsReady(false)
    resetPhysicalInput()
    setPhase('paused')
    setAttempt((value) => value + 1)
  }, [resetPhysicalInput])

  const scheduleCheckpoint = useCallback((): void => {
    window.clearTimeout(checkpointTimerRef.current)
    checkpointTimerRef.current = window.setTimeout(checkpoint, 750)
  }, [checkpoint])

  const startLevel = useCallback((id: number): boolean => {
    const level = levelById(id)
    if (!level) {
      return false
    }
    sfx.unlock()
    const next = createGameState(level)
    const result = saveRun(next)
    if (!result.ok && (retainedRun || recovery.snapshot || recovery.problem === 'invalid')) {
      setSaveError('The new run could not be saved. Your previous saved run is unchanged.')
      return false
    }
    if (result.ok) {
      discardInvalidBrowserRun()
      setRecovery({ snapshot: result.snapshot, problem: null })
      setSaveError(null)
    } else {
      setSaveError('Saving is unavailable. You can play, but this run may be lost when you leave.')
    }
    graphicsReadyRef.current = false
    setGraphicsReady(false)
    setGraphicsFailed(false)
    setRetainedRun(null)
    activeRunRef.current = next
    savedWaveRef.current = next.waveNumber
    window.clearTimeout(checkpointTimerRef.current)
    clearSelections()
    setGame(next)
    setHud(buildHudSnapshot(next))
    setPhase('playing')
    setSpeed(1)
    setNotice(null)
    setAttempt((value) => value + 1)
    setShowTutorial(!tutorialSeen())
    setPendingLevel(null)
    return true
  }, [clearSelections, recovery.problem, recovery.snapshot, retainedRun, sfx])

  const requestLevel = useCallback((id: number): void => {
    if (retainedRun || recovery.snapshot || recovery.problem === 'invalid') {
      replacementOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setPendingLevel(id)
    } else startLevel(id)
  }, [recovery.problem, recovery.snapshot, retainedRun, startLevel])

  const resumeRun = useCallback((): void => {
    const current = loadRun()
    setRecovery(current)
    const next = retainedRun ?? (current.snapshot ? restoreRun(current.snapshot) : null)
    if (!next) return
    // Physical keys are not held after a reload. Queued movement/jobs still resume.
    setHeroInput(next, 0, 0)
    graphicsReadyRef.current = false
    setGraphicsReady(false)
    setGraphicsFailed(false)
    setRetainedRun(null)
    activeRunRef.current = next
    savedWaveRef.current = next.waveNumber
    clearSelections()
    setGame(next)
    setHud(buildHudSnapshot(next))
    setPhase('paused')
    setSpeed(1)
    setShowTutorial(false)
    if (!retainedRun) setSaveError(null)
    setAttempt((value) => value + 1)
  }, [clearSelections, retainedRun])

  const finishTutorial = useCallback((): void => {
    sfx.unlock()
    setShowTutorial(false)
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'seen')
    } catch {
      // Private browsing can decline this preference without blocking play.
    }
  }, [sfx])

  const toSelect = useCallback((): void => {
    graphicsReadyRef.current = false
    resetPhysicalInput()
    const current = activeRunRef.current
    // Keep the live run even if this checkpoint or a later checkpoint cannot be written.
    setRetainedRun(current?.status === 'playing' ? current : null)
    checkpoint()
    activeRunRef.current = null
    window.clearTimeout(checkpointTimerRef.current)
    clearSelections()
    setProgress(loadProgress())
    setPhase('select')
  }, [checkpoint, clearSelections, resetPhysicalInput])

  const handleFinish = useCallback((finished: GameState): void => {
    activeRunRef.current = null
    window.clearTimeout(checkpointTimerRef.current)
    const removeFinishedRun = (): void => {
      if (clearRun()) {
        setRecovery({ snapshot: null, problem: null })
        setSaveError(null)
      } else {
        setSaveError('The completed run could not be removed from saved games.')
      }
    }
    clearSelections()
    if (finished.status === 'lost') {
      removeFinishedRun()
      playSfx('lose')
      setPhase('lost')

      return
    }
    playSfx('win')
    const stars = computeStars(finished)
    setEarned(stars)
    setPhase('won')
    const next = recordWin(loadProgress(), finished.level.id, stars)
    setProgress(next)
    // Queue/commit the victory first. Deleting its recovery point before the
    // progress write would lose both if the write fails or the page exits.
    if (saveProgress(next)) removeFinishedRun()
    else setSaveError('Your stars could not be saved. The previous saved run was kept so you can try again.')
  }, [clearSelections, playSfx])

  const refreshHud = useCallback((state: GameState): void => {
    setHud(buildHudSnapshot(state))
    scheduleCheckpoint()
  }, [scheduleCheckpoint])

  const handleHud = useCallback((next: HudSnapshot): void => {
    setHud(next)
    if (savedWaveRef.current !== next.waveNumber) {
      savedWaveRef.current = next.waveNumber
      scheduleCheckpoint()
    }
  }, [scheduleCheckpoint])

  const placeTool = useCallback((state: GameState, tower: TowerId, col: number, row: number, quiet: boolean): void => {
    const problem = placementProblem(state, tower, col, row)
    if (problem) {
      if (!quiet) {
        playSfx('deny')
        flash(PLACEMENT_MESSAGE[problem])
      }

      return
    }
    orderBuild(state, tower, col, row)
    playSfx('place')
    refreshHud(state)
  }, [flash, playSfx, refreshHud])

  const handlePointer = useCallback((pointer: BoardPointer): void => {
    if (!graphicsReadyRef.current || !game || phase !== 'playing' || showTutorial || game.pendingPicks > 0) {
      return
    }
    const armed = overlayRef.current.tool
    if (armed) {
      overlayRef.current.hover = pointer.inBoard
        ? { col: pointer.col, row: pointer.row, valid: placementProblem(game, armed, pointer.col, pointer.row) === null }
        : null
      // Walls paint as the finger drags, so a whole line of maze takes one stroke.
      if (armed === 'wall' && pointer.pressed && pointer.inBoard) {
        const key = `${pointer.col},${pointer.row}`
        if (paintedCellRef.current !== key) {
          const firstCell = paintedCellRef.current === null
          paintedCellRef.current = key
          placeTool(game, armed, pointer.col, pointer.row, !firstCell)
        }
      } else if (armed !== 'wall' && pointer.phase === 'up' && pointer.inBoard) {
        // A tower lands on release, after the finger has lined up its ghost.
        placeTool(game, armed, pointer.col, pointer.row, false)
      }
      if (pointer.phase === 'up' || pointer.phase === 'cancel') {
        paintedCellRef.current = null
        overlayRef.current.hover = null
      }

      return
    }

    if (pointer.phase === 'down') {
      const plan = pointer.inBoard ? game.plans.find((entry) => entry.type === 'build' && entry.buildingId === null && entry.col === pointer.col && entry.row === pointer.row) : undefined
      if (plan) {
        cancelPlan(game, plan.id)
        playSfx('sold')
        refreshHud(game)

        return
      }
      setHeroOpen(false)
      if (pointer.buildingId !== null) {
        setSelectedId(pointer.buildingId)

        return
      }
      setSelectedId(null)
      if (pointer.inBoard) {
        moveHero(game, pointer.x, pointer.y)
      }
    } else if (pointer.phase === 'move' && pointer.pressed && overlayRef.current.selectedId === null && pointer.inBoard) {
      // Holding on the ground keeps the hero chasing the finger.
      moveHero(game, pointer.x, pointer.y)
    }
  }, [game, phase, placeTool, playSfx, refreshHud, setHeroOpen, setSelectedId, showTutorial])

  const togglePause = useCallback((): void => {
    if (!graphicsReadyRef.current) return
    sfx.unlock()
    checkpoint()
    setPhase((current) => (current === 'paused' ? 'playing' : current === 'playing' ? 'paused' : current))
  }, [checkpoint, sfx])

  const chooseTool = useCallback((tower: TowerId): void => {
    if (!graphicsReadyRef.current) return
    sfx.unlock()
    setSelectedId(null)
    setHeroOpen(false)
    setTool(overlayRef.current.tool === tower ? null : tower)
  }, [setHeroOpen, setSelectedId, setTool, sfx])

  const handleCallWave = useCallback((): void => {
    if (!graphicsReadyRef.current || !game) {
      return
    }
    sfx.unlock()
    const bonus = callNextWave(game)
    if (bonus !== null) {
      if (bonus > 0) {
        flash(`Called early: +${bonus} gold`)
      }
      refreshHud(game)
    }
  }, [flash, game, refreshHud, sfx])

  const handlePick = useCallback((element: ElementId): void => {
    if (graphicsReadyRef.current && game && pickElement(game, element)) {
      playSfx('pick')
      refreshHud(game)
    }
  }, [game, playSfx, refreshHud])

  const handleBuyHero = useCallback((upgrade: HeroUpgrade): void => {
    if (graphicsReadyRef.current && game && buyHeroUpgrade(game, upgrade)) {
      playSfx('upgraded')
      refreshHud(game)
    }
  }, [game, playSfx, refreshHud])

  // A game running in a hidden tab would lose lives nobody could defend.
  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.hidden) {
        setPhase((current) => (current === 'playing' ? 'paused' : current))
        checkpoint()
      }
    }
    const interval = window.setInterval(checkpoint, 10_000)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', checkpoint)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(checkpointTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', checkpoint)
      checkpoint()
    }
  }, [checkpoint])

  useEffect(() => {
    if (!game || phase === 'select') {
      return undefined
    }
    const applySteering = (): void => {
      const keys = heldKeysRef.current
      const x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)
      const y = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0)
      setHeroInput(game, x, y)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!graphicsReadyRef.current || event.defaultPrevented || (event.target instanceof Element && event.target.closest(SHORTCUT_TARGETS))) {
        return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        event.preventDefault()
        heldKeysRef.current.add(event.code)
        applySteering()
      } else if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        togglePause()
      } else if (event.code === 'Escape') {
        clearSelections()
      } else if (event.code === 'KeyN' && !event.repeat) {
        handleCallWave()
      } else if (/^Digit[1-8]$/.test(event.code)) {
        const unlocked: TowerId[] = ['wall', 'arrow', ...game.unlocked.map((element) => ELEMENTS[element].tower)]
        const choice = unlocked[Number(event.code.slice(5)) - 1]
        if (choice) {
          chooseTool(choice)
        }
      }
    }
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (heldKeysRef.current.delete(event.code)) {
        applySteering()
      }
    }
    const held = heldKeysRef.current
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      held.clear()
      setHeroInput(game, 0, 0)
    }
  }, [chooseTool, clearSelections, game, handleCallWave, phase, togglePause])

  // Looked up on every render: the HUD ticks ten times a second, which keeps the panel's numbers
  // live, and a building that is destroyed simply takes its panel with it.
  const selected = game && selectedId !== null ? game.buildings.find((building) => building.id === selectedId) ?? null : null

  if (phase === 'select' || !game || !hud) {
    return (
      <PortraitGameShell className="dark bg-[radial-gradient(circle_at_top,#14532d,#020617_70%)]">
        <div className="flex min-h-0 flex-1 flex-col" ref={selectRef}>
          {pendingLevel === null && (saveError || recovery.problem) && (
            <p className="mx-auto mt-3 max-w-md px-4 text-center text-sm font-bold text-amber-200" role="alert">
              {saveError ?? (recovery.problem === 'invalid' ? 'The saved run is damaged or from an incompatible version. You can start a new level; your stars are safe.' : 'Saving is unavailable in this browser.')}
            </p>
          )}
          {(retainedRun || recovery.snapshot) && (
            <div className="mx-auto mt-3 flex max-w-md flex-wrap items-center justify-center gap-3 px-4 text-sm text-white">
              <span>Level {retainedRun?.level.id ?? recovery.snapshot?.levelId} · wave {retainedRun?.waveNumber ?? recovery.snapshot?.waveNumber}/{retainedRun?.level.waves ?? levelById(recovery.snapshot?.levelId ?? 0)?.waves}</span>
              <button type="button" data-testid="resume-run" className="min-h-12 rounded-full bg-amber-400 px-5 font-black text-amber-950" onClick={resumeRun}>{retainedRun ? 'Resume current run' : 'Resume saved run'}</button>
            </div>
          )}
          <div className="min-h-0 flex-1">
        <LevelSelectGrid
          emoji="🏰"
          exitHref="/"
          footer="Build a maze, collect the gold, and hold the keep."
          levelIds={LEVELS.map((level) => level.id)}
          progress={progress}
          title="Tower Defense"
          onSelectLevel={requestLevel}
        />
          </div>
        </div>
        <Dialog open={pendingLevel !== null} onOpenChange={(open) => { if (!open) setPendingLevel(null) }}>
          <DialogContent
            className="dark max-w-sm rounded-3xl border-white/15 bg-slate-900 p-5 text-white"
            showCloseButton={false}
            finalFocus={replacementOriginRef}
            onOpenAutoFocus={(event) => { event.preventDefault(); keepRunRef.current?.focus() }}
          >
            <DialogTitle className="text-xl font-black">Replace saved run</DialogTitle>
            <DialogDescription className="text-sm text-slate-200">{recovery.problem === 'invalid' ? 'This saved run cannot be loaded by this version. Starting a new run permanently replaces it.' : 'Starting a new run replaces your saved run. Your earned stars stay safe.'}</DialogDescription>
            {saveError && <p role="alert" className="text-sm text-amber-200">{saveError}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="min-h-12 rounded-full bg-amber-400 px-4 font-black text-amber-950" onClick={() => { if (pendingLevel !== null) startLevel(pendingLevel) }}>Start new run</button>
              <button ref={keepRunRef} type="button" className="min-h-12 rounded-full bg-white/10 px-4 font-bold" onClick={() => setPendingLevel(null)}>Keep saved run</button>
            </div>
          </DialogContent>
        </Dialog>
      </PortraitGameShell>
    )
  }

  const level = game.level
  const needsPick = hud.pendingPicks > 0
  const active = graphicsReady && phase === 'playing' && !showTutorial && !needsPick
  const hint = level.id === 1 && phase === 'playing' && !notice ? firstLevelHint(hud, tool) : null

  return (
    <PortraitGameShell allowLandscape className="bg-slate-950">
      <div
        className={`relative flex min-h-0 flex-1 flex-col ${GAME_TOOLBAR_PADDING_CLASS}`}
        data-buildings={hud.buildingCount}
        data-enemies={hud.enemiesAlive}
        data-phase={phase}
        data-testid="tower-defense-play"
        ref={playRef}
      >
        <div className="contents" inert={!graphicsReady}>
          {saveError && <p className="absolute inset-x-3 top-16 z-40 rounded-xl bg-amber-950/95 p-2 text-center text-xs font-bold text-amber-100" role="alert">{saveError}</p>}
          <GameHud hud={hud} title={`${level.id}. ${level.title}`} />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <section aria-label="Battlefield" className="relative min-h-0 flex-1 overflow-hidden md:order-2">
              <TowerDefenseScene
                active={active}
                key={`${level.id}-${attempt}`}
                overlayRef={overlayRef}
                playSfx={playSfx}
                speed={speed}
                state={game}
                onGraphicsAvailable={handleGraphicsAvailable}
                onFinish={handleFinish}
                onHud={handleHud}
                onPointer={handlePointer}
              />

              {hud.pathBlocked && (
                <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center" data-testid="path-blocked" role="status">
                  <span className="rounded-full bg-rose-600/95 px-3 py-1 text-xs font-black text-white shadow-lg">Path blocked: enemies will smash through!</span>
                </div>
              )}
              {(notice ?? hint) && (
                <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex justify-center" data-testid="game-notice" role="status">
                  <span className="rounded-2xl bg-slate-950/90 px-3 py-1.5 text-center text-xs font-bold text-amber-100 shadow-lg md:text-sm">{notice ?? hint}</span>
                </div>
              )}

              {selected && phase === 'playing' && (
                <BuildingPanel
                  building={selected}
                  gold={hud.gold}
                  upgradeQueued={game.plans.some((plan) => plan.buildingId === selected.id && plan.type === 'upgrade')}
                  onClose={() => setSelectedId(null)}
                  onSell={() => {
                    if (!graphicsReadyRef.current) return
                    if (sellBuilding(game, selected.id)) {
                      setSelectedId(null)
                      refreshHud(game)
                    }
                  }}
                  onUpgrade={() => {
                    if (!graphicsReadyRef.current) return
                    if (orderUpgrade(game, selected.id)) {
                      playSfx('place')
                      refreshHud(game)
                    }
                  }}
                />
              )}
              {heroOpen && phase === 'playing' && <HeroPanel hud={hud} onBuy={handleBuyHero} onClose={() => setHeroOpen(false)} />}
            </section>
            <BuildTray
              disabled={!graphicsReady || phase !== 'playing'}
              heroOpen={heroOpen}
              hud={hud}
              tool={tool}
              onHero={() => {
                if (!graphicsReadyRef.current) return
                setTool(null)
                setSelectedId(null)
                setHeroOpen(!heroOpen)
              }}
              onTool={chooseTool}
            />
          </div>

          <GameBottomToolbar>
            <BottomControlButton disabled={!graphicsReady} icon={<Grid3x3 />} label="Level select" variant="ghost" onClick={toSelect} />
            <BottomControlButton
              disabled={!graphicsReady || (phase !== 'playing' && phase !== 'paused')}
              icon={phase === 'paused' ? <Play /> : <Pause />}
              label={phase === 'paused' ? 'Resume' : 'Pause'}
              variant="ghost"
              onClick={togglePause}
            />
            <BottomControlButton
              accentClassName="border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-white"
              {...(hud.nextWaveIn !== null ? { count: Math.ceil(hud.nextWaveIn) } : {})}
              disabled={!graphicsReady || hud.nextWaveIn === null || phase !== 'playing' || needsPick}
              icon={<SkipForward className="fill-current" />}
              label="Send next wave"
              onClick={handleCallWave}
            />
            <BottomControlButton
              active={speed > 1}
              disabled={!graphicsReady}
              icon={<FastForward />}
              label={speed > 1 ? 'Normal speed' : 'Double speed'}
              variant="ghost"
              onClick={() => { if (graphicsReadyRef.current) setSpeed((current) => (current > 1 ? 1 : 2)) }}
            />
            <SoundBottomControlButton
              muted={muted}
              onMutedChange={(next) => {
                setMuted(next)
                sfx.setMuted(next)
                mute.save(next)
              }}
            />
            <FullscreenBottomControlButton />
          </GameBottomToolbar>

          {showTutorial && phase === 'playing' && <TutorialOverlay onStart={finishTutorial} />}
          {!showTutorial && needsPick && phase === 'playing' && <ElementPickOverlay nextWave={hud.nextWave} unlocked={hud.unlocked} onPick={handlePick} />}
          {phase === 'paused' && <PauseOverlay onExit={toSelect} onResume={togglePause} />}
          {phase === 'lost' && <LostOverlay wave={hud.waveNumber} onExit={toSelect} onRetry={() => startLevel(level.id)} />}
          {phase === 'won' && (
            <WonOverlay
              finalLevel={level.id >= TOTAL_LEVELS}
              lives={hud.lives}
              maxLives={hud.maxLives}
              stars={earned}
              onExit={toSelect}
              onNext={() => startLevel(level.id + 1)}
              onRetry={() => startLevel(level.id)}
            />
          )}
        </div>
        {graphicsFailed && (
          <GraphicsUnavailable
            onRetry={retryGraphics}
            onExit={toSelect}
            onRestoreFocus={() => {
              if (activeRunRef.current === game) {
                playRef.current?.querySelector<HTMLButtonElement>('[aria-label="Game paused"] button')?.focus()
              } else if (!activeRunRef.current) {
                selectRef.current?.querySelector<HTMLButtonElement>('[data-testid="resume-run"], [data-testid="level-tile-1"]')?.focus()
              }
            }}
          />
        )}
      </div>
    </PortraitGameShell>
  )
}

/** Teaches the first level by what the player has not done yet. */
function firstLevelHint(hud: HudSnapshot, tool: TowerId | null): string | null {
  if (hud.buildingCount === 0 && hud.plans === 0) {
    return tool ? 'Now tap the ground beside the arrows.' : 'Pick the Arrow tower, then tap the ground beside the arrows.'
  }
  if (hud.coinsOnGround > 0) {
    return 'Tap near the coins so your hero collects them.'
  }
  if (hud.waveNumber === 0 && hud.plans === 0) {
    return 'Ready? Press the green button to send the first wave early.'
  }

  return null
}
