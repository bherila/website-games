import { ArrowRight, Grid3x3, Pause, Play, RotateCcw, Star, Trophy, Users, Volume2, VolumeX, X } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'

import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import { PortraitGameShell } from '../PortraitGameShell'
import { createSfxEngine, type SfxName } from './audio/sfx'
import { buildHudSnapshot, computeStars, createGameState, setTargetX } from './gameEngine'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import type { GamePhase, GameState, HudSnapshot, SavedProgress } from './gameTypes'
import { TOTAL_LEVELS } from './gameTypes'
import { levelById,LEVELS } from './levels'
import { MathHordeScene } from './MathHordeScene'

const TUTORIAL_STORAGE_KEY = 'bwh.math-horde.tutorial.v1'
const MUTED_STORAGE_KEY = 'bwh.math-horde.muted.v1'

function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function MathHordeGame(): ReactElement {
  const [progress, setProgress] = useState<SavedProgress>(() => loadProgress())
  const [phase, setPhase] = useState<GamePhase>('select')
  const [levelId, setLevelId] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const [earnedStars, setEarnedStars] = useState<1 | 2 | 3>(1)
  const [survivors, setSurvivors] = useState(0)
  const [showTutorial, setShowTutorial] = useState(false)
  const [muted, setMuted] = useState(loadMuted)
  const [sfx] = useState(() => createSfxEngine(loadMuted()))

  useEffect(() => () => sfx.dispose(), [sfx])

  const playSfx = useCallback((name: SfxName, intensity?: number): void => {
    sfx.playSfx(name, intensity)
  }, [sfx])

  const toggleMute = useCallback((): void => {
    setMuted((current) => {
      const next = !current
      sfx.setMuted(next)
      try {
        window.localStorage.setItem(MUTED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Private browsing can decline this preference without blocking play.
      }

      return next
    })
  }, [sfx])

  const level = useMemo(() => levelId === null ? null : levelById(levelId), [levelId])

  const startLevel = useCallback((id: number): void => {
    sfx.unlock()
    const selected = levelById(id)
    if (!selected) {
      return
    }
    const nextState = createGameState(selected)
    setLevelId(id)
    setGameState(nextState)
    setHud(buildHudSnapshot(nextState))
    setPhase('playing')
    setAttempt((value) => value + 1)
    try {
      setShowTutorial(window.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'seen')
    } catch {
      setShowTutorial(true)
    }
  }, [sfx])

  const finishTutorial = useCallback((): void => {
    sfx.unlock()
    setShowTutorial(false)
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'seen')
    } catch {
      // Private browsing can decline this preference without blocking play.
    }
  }, [sfx])

  const handleFinish = useCallback((finished: GameState): void => {
    if (finished.status === 'lost') {
      playSfx('lose')
      setPhase('lost')
      return
    }
    playSfx('win')
    const stars = computeStars(finished)
    setEarnedStars(stars)
    setSurvivors(finished.armySize)
    setPhase('won')
    setProgress((current) => {
      const next = recordWin(current, finished.level.id, stars, finished.score, finished.armySize)
      saveProgress(next)

      return next
    })
  }, [playSfx])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!gameState || showTutorial || (phase !== 'playing' && phase !== 'paused')) {
        return
      }
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault()
        if (phase === 'playing') {
          setTargetX(gameState, gameState.targetX - 0.8)
        }
      } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        event.preventDefault()
        if (phase === 'playing') {
          setTargetX(gameState, gameState.targetX + 0.8)
        }
      } else if (event.code === 'Space' || event.code === 'Escape') {
        event.preventDefault()
        setPhase((current) => current === 'paused' ? 'playing' : 'paused')
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, phase, showTutorial])

  if (phase === 'select' || !level || !gameState || !hud) {
    return (
      <PortraitGameShell className="dark bg-[radial-gradient(circle_at_top,#172554,#020617_65%)]">
        <LevelSelectGrid
          emoji="🤖"
          exitHref="/"
          footer="Break the gates. Build the horde. Beat the bosses."
          levelIds={LEVELS.map((entry) => entry.id)}
          progress={progress}
          title="Math Horde"
          onSelectLevel={startLevel}
        />
      </PortraitGameShell>
    )
  }

  const active = phase === 'playing' && !showTutorial

  return (
    <PortraitGameShell className="bg-slate-950">
      <section className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
        <MathHordeScene
          active={active}
          key={`${level.id}-${attempt}`}
          playSfx={playSfx}
          state={gameState}
          onFinish={handleFinish}
          onHud={setHud}
        />

        <GameHud
          hud={hud}
          level={level.id}
          muted={muted}
          paused={phase === 'paused'}
          onExit={() => setPhase('select')}
          onPause={() => setPhase((current) => current === 'paused' ? 'playing' : 'paused')}
          onToggleMute={toggleMute}
        />

        {showTutorial && <TutorialOverlay onStart={finishTutorial} />}
        {phase === 'paused' && <PauseOverlay onExit={() => setPhase('select')} onResume={() => setPhase('playing')} />}
        {phase === 'lost' && <LostOverlay onExit={() => setPhase('select')} onRetry={() => startLevel(level.id)} />}
        {phase === 'won' && (
          <WonOverlay
            finalLevel={level.id === TOTAL_LEVELS}
            stars={earnedStars}
            survivors={survivors}
            onExit={() => setPhase('select')}
            onNext={() => startLevel(level.id + 1)}
            onRetry={() => startLevel(level.id)}
          />
        )}
      </section>
    </PortraitGameShell>
  )
}

interface GameHudProps {
  hud: HudSnapshot
  level: number
  muted: boolean
  paused: boolean
  onExit: () => void
  onPause: () => void
  onToggleMute: () => void
}

function GameHud({ hud, level, muted, paused, onExit, onPause, onToggleMute }: GameHudProps): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-full border border-cyan-300/30 bg-slate-950/75 px-3 py-1.5 shadow-lg backdrop-blur">
          <Users aria-hidden="true" className="size-4 text-cyan-300" />
          <span className="text-lg font-black tabular-nums" data-testid="army-size">{hud.armySize}</span>
        </div>
        <div className="rounded-full border border-violet-300/30 bg-slate-950/75 px-3 py-1.5 text-xs font-bold backdrop-blur">
          SECTOR {level} · {hud.score.toLocaleString()}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button aria-label={muted ? 'Unmute' : 'Mute'} className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 backdrop-blur active:scale-95" type="button" onClick={onToggleMute}>
            {muted ? <VolumeX aria-hidden="true" className="size-4" /> : <Volume2 aria-hidden="true" className="size-4" />}
          </button>
          <button aria-label={paused ? 'Resume' : 'Pause'} className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 backdrop-blur active:scale-95" type="button" onClick={onPause}>
            {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          </button>
          <button aria-label="Level select" className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 backdrop-blur active:scale-95" type="button" onClick={onExit}>
            <Grid3x3 aria-hidden="true" className="size-4" />
          </button>
          <FullscreenIconButton
            className="size-11 rounded-full border border-white/20 bg-slate-950/75 backdrop-blur active:scale-95"
            iconClassName="size-4"
          />
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-[width]" style={{ width: `${hud.progress * 100}%` }} />
      </div>
      {hud.bossCount !== null && (
        <div className="flex items-center gap-2 rounded-full border border-orange-300/30 bg-slate-950/75 px-3 py-1.5 backdrop-blur">
          <span className="text-[10px] font-black tracking-widest text-orange-300">BOSS</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-gradient-to-r from-orange-500 to-rose-500" style={{ width: `${hud.bossInitialCount ? Math.max(0, Math.min(100, hud.bossCount / hud.bossInitialCount * 100)) : 0}%` }} />
          </div>
          <span className="text-xs font-black tabular-nums text-orange-200">{hud.bossCount}</span>
        </div>
      )}
    </div>
  )
}

function TutorialOverlay({ onStart }: { onStart: () => void }): ReactElement {
  return (
    <Overlay label="How to play">
      <div className="max-w-xs rounded-3xl border border-cyan-300/30 bg-slate-950/95 p-6 text-center text-white shadow-2xl">
        <div className="text-5xl">🤖</div>
        <h2 className="mt-3 text-2xl font-black">Build your horde</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">Drag, swipe, or use the ←/→ keys to steer. Your squad fires automatically. Run through gates—blue grows your crowd, red shrinks it. Shoot gates to power them up or defuse the red ones. Outnumber the horde before you collide.</p>
        <button className="mt-5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 font-black text-slate-950 shadow-lg active:scale-95" type="button" onClick={onStart}>START FIRING</button>
      </div>
    </Overlay>
  )
}

function PauseOverlay({ onExit, onResume }: { onExit: () => void, onResume: () => void }): ReactElement {
  return (
    <Overlay label="Game paused">
      <div className="flex flex-col items-center gap-5 text-white">
        <h2 className="text-3xl font-black">PAUSED</h2>
        <div className="flex gap-3">
          <RoundButton label="Resume" onClick={onResume}><Play className="size-6" /></RoundButton>
          <RoundButton label="Level select" onClick={onExit}><Grid3x3 className="size-6" /></RoundButton>
        </div>
      </div>
    </Overlay>
  )
}

function LostOverlay({ onExit, onRetry }: { onExit: () => void, onRetry: () => void }): ReactElement {
  return (
    <Overlay label="Level failed">
      <div className="flex flex-col items-center gap-5 text-white">
        <X aria-hidden="true" className="size-16 text-rose-400" />
        <h2 className="text-3xl font-black">HORDE LOST</h2>
        <div className="flex gap-3">
          <RoundButton label="Retry" primary onClick={onRetry}><RotateCcw className="size-6" /></RoundButton>
          <RoundButton label="Level select" onClick={onExit}><Grid3x3 className="size-6" /></RoundButton>
        </div>
      </div>
    </Overlay>
  )
}

interface WonOverlayProps {
  finalLevel: boolean
  stars: 1 | 2 | 3
  survivors: number
  onExit: () => void
  onNext: () => void
  onRetry: () => void
}

function WonOverlay({ finalLevel, stars, survivors, onExit, onNext, onRetry }: WonOverlayProps): ReactElement {
  return (
    <Overlay label="Level complete">
      <div className="flex flex-col items-center gap-5 text-white">
        <div aria-label={`${stars} stars`} className="flex gap-2">
          {([1, 2, 3] as const).map((position) => <Star aria-hidden="true" className={`size-12 ${position <= stars ? 'fill-amber-400 text-amber-400' : 'text-white/20'}`} key={position} />)}
        </div>
        <h2 className="text-3xl font-black">SECTOR CLEAR</h2>
        <p className="text-sm font-bold text-cyan-200">{survivors} survivors</p>
        <div className="flex gap-3">
          <RoundButton label="Replay" onClick={onRetry}><RotateCcw className="size-6" /></RoundButton>
          {finalLevel
            ? <RoundButton label="Campaign complete" primary onClick={onExit}><Trophy className="size-6" /></RoundButton>
            : <RoundButton label="Next level" primary onClick={onNext}><ArrowRight className="size-6" /></RoundButton>}
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({ children, label }: { children: ReactElement, label: string }): ReactElement {
  return <div aria-label={label} className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-5 backdrop-blur-sm" role="dialog">{children}</div>
}

function RoundButton({ children, label, onClick, primary = false }: { children: ReactElement, label: string, onClick: () => void, primary?: boolean }): ReactElement {
  return (
    <button aria-label={label} className={`flex size-14 items-center justify-center rounded-full border shadow-xl active:scale-95 ${primary ? 'border-cyan-200 bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950' : 'border-white/20 bg-slate-900 text-white'}`} type="button" onClick={onClick}>{children}</button>
  )
}
