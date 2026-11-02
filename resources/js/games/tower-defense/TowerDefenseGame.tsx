import { FastForward, Grid3x3, Pause, Play, SkipForward } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

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
import type { BoardOverlay } from './scene/buildingView'
import { type BoardPointer, TowerDefenseScene } from './TowerDefenseScene'
import { BuildTray } from './ui/BuildTray'
import { GameHud } from './ui/GameHud'
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
  const [phase, setPhase] = useState<Phase>('select')
  const [game, setGame] = useState<GameState | null>(null)
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const [attempt, setAttempt] = useState(0)
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

  const startLevel = useCallback((id: number): void => {
    const level = levelById(id)
    if (!level) {
      return
    }
    sfx.unlock()
    const next = createGameState(level)
    clearSelections()
    setGame(next)
    setHud(buildHudSnapshot(next))
    setPhase('playing')
    setSpeed(1)
    setNotice(null)
    setAttempt((value) => value + 1)
    setShowTutorial(!tutorialSeen())
  }, [clearSelections, sfx])

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
    clearSelections()
    setProgress(loadProgress())
    setPhase('select')
  }, [clearSelections])

  const handleFinish = useCallback((finished: GameState): void => {
    clearSelections()
    if (finished.status === 'lost') {
      playSfx('lose')
      setPhase('lost')

      return
    }
    playSfx('win')
    const stars = computeStars(finished)
    setEarned(stars)
    setPhase('won')
    setProgress((current) => {
      const next = recordWin(current, finished.level.id, stars)
      saveProgress(next)

      return next
    })
  }, [clearSelections, playSfx])

  const refreshHud = useCallback((state: GameState): void => setHud(buildHudSnapshot(state)), [])

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
    if (!game || phase !== 'playing' || showTutorial || game.pendingPicks > 0) {
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
    setPhase((current) => (current === 'paused' ? 'playing' : current === 'playing' ? 'paused' : current))
  }, [])

  const chooseTool = useCallback((tower: TowerId): void => {
    sfx.unlock()
    setSelectedId(null)
    setHeroOpen(false)
    setTool(overlayRef.current.tool === tower ? null : tower)
  }, [setHeroOpen, setSelectedId, setTool, sfx])

  const handleCallWave = useCallback((): void => {
    if (!game) {
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
    if (game && pickElement(game, element)) {
      playSfx('pick')
      refreshHud(game)
    }
  }, [game, playSfx, refreshHud])

  const handleBuyHero = useCallback((upgrade: HeroUpgrade): void => {
    if (game && buyHeroUpgrade(game, upgrade)) {
      playSfx('upgraded')
      refreshHud(game)
    }
  }, [game, playSfx, refreshHud])

  // A game running in a hidden tab would lose lives nobody could defend.
  useEffect(() => {
    const handleVisibility = (): void => {
      if (document.hidden) {
        setPhase((current) => (current === 'playing' ? 'paused' : current))
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

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
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest(SHORTCUT_TARGETS))) {
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
        <LevelSelectGrid
          emoji="🏰"
          exitHref="/"
          footer="Build a maze, collect the gold, and hold the keep."
          levelIds={LEVELS.map((level) => level.id)}
          progress={progress}
          title="Tower Defense"
          onSelectLevel={startLevel}
        />
      </PortraitGameShell>
    )
  }

  const level = game.level
  const needsPick = hud.pendingPicks > 0
  const active = phase === 'playing' && !showTutorial && !needsPick
  const hint = level.id === 1 && phase === 'playing' && !notice ? firstLevelHint(hud, tool) : null

  return (
    <PortraitGameShell allowLandscape className="bg-slate-950">
      <div
        className={`relative flex min-h-0 flex-1 flex-col ${GAME_TOOLBAR_PADDING_CLASS}`}
        data-buildings={hud.buildingCount}
        data-enemies={hud.enemiesAlive}
        data-phase={phase}
        data-testid="tower-defense-play"
      >
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
              onFinish={handleFinish}
              onHud={setHud}
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
                  if (sellBuilding(game, selected.id)) {
                    setSelectedId(null)
                    refreshHud(game)
                  }
                }}
                onUpgrade={() => {
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
            disabled={phase !== 'playing'}
            heroOpen={heroOpen}
            hud={hud}
            tool={tool}
            onHero={() => {
              setTool(null)
              setSelectedId(null)
              setHeroOpen(!heroOpen)
            }}
            onTool={chooseTool}
          />
        </div>

        <GameBottomToolbar>
          <BottomControlButton disabled={false} icon={<Grid3x3 />} label="Level select" variant="ghost" onClick={toSelect} />
          <BottomControlButton
            disabled={phase !== 'playing' && phase !== 'paused'}
            icon={phase === 'paused' ? <Play /> : <Pause />}
            label={phase === 'paused' ? 'Resume' : 'Pause'}
            variant="ghost"
            onClick={togglePause}
          />
          <BottomControlButton
            accentClassName="border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-500 dark:border-emerald-500 dark:bg-emerald-500 dark:text-white"
            {...(hud.nextWaveIn !== null ? { count: Math.ceil(hud.nextWaveIn) } : {})}
            disabled={hud.nextWaveIn === null || phase !== 'playing' || needsPick}
            icon={<SkipForward className="fill-current" />}
            label="Send next wave"
            onClick={handleCallWave}
          />
          <BottomControlButton
            active={speed > 1}
            disabled={false}
            icon={<FastForward />}
            label={speed > 1 ? 'Normal speed' : 'Double speed'}
            variant="ghost"
            onClick={() => setSpeed((current) => (current > 1 ? 1 : 2))}
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

        {showTutorial && <TutorialOverlay onStart={finishTutorial} />}
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
