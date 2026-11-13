import { ArrowRight, Grid3x3, Pause, Play, RotateCcw, Star, Trophy, Users, X } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createMuteStorage } from '../_shared/audio/muteStorage'
import { SoundToggle } from '../_shared/audio/SoundToggle'
import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { LevelSelectGrid } from '../_shared/LevelSelectGrid'
import { PortraitGameShell } from '../PortraitGameShell'
import { createSfxEngine, type SfxName } from './audio/sfx'
import { buildHudSnapshot, computeStars, createGameState, setTargetX } from './gameEngine'
import { loadProgress, recordWin, saveProgress } from './gameProgress'
import type { GamePhase, GameState, HudSnapshot, SavedProgress } from './gameTypes'
import { TOTAL_LEVELS } from './gameTypes'
import { levelById,LEVELS } from './levels'
import { type GraphicsStatus, MathHordeScene } from './MathHordeScene'

const TUTORIAL_STORAGE_KEY = 'bwh.math-horde.tutorial.v1'
const MUTED_STORAGE_KEY = 'bwh.math-horde.muted.v1'

const mute = createMuteStorage(MUTED_STORAGE_KEY, 'flag')

export function MathHordeGame(): ReactElement {
  const [progress, setProgress] = useState<SavedProgress>(() => loadProgress())
  const [phase, setPhase] = useState<GamePhase>('select')
  const [levelId, setLevelId] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [graphicsAttempt, setGraphicsAttempt] = useState(0)
  const [graphicsStatus, setGraphicsStatus] = useState<GraphicsStatus>('loading')
  const graphicsReadyRef = useRef(false)
  const focusBlockedRef = useRef(false)
  const steeringKeysRef = useRef(new Set<string>())
  const [recovering, setRecovering] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const [earnedStars, setEarnedStars] = useState<1 | 2 | 3>(1)
  const [survivors, setSurvivors] = useState(0)
  const [showTutorial, setShowTutorial] = useState(false)
  const [muted, setMuted] = useState(mute.load)
  const [sfx] = useState(() => createSfxEngine(mute.load()))

  useEffect(() => () => sfx.dispose(), [sfx])

  const playSfx = useCallback((name: SfxName, intensity?: number): void => {
    sfx.play(name, intensity)
  }, [sfx])

  const toggleMute = useCallback((): void => {
    setMuted((current) => {
      const next = !current
      sfx.setMuted(next)
      mute.save(next)

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
    graphicsReadyRef.current = false
    focusBlockedRef.current = document.hidden
    steeringKeysRef.current.clear()
    setGraphicsStatus('loading')
    setRecovering(false)
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
    if (!graphicsReadyRef.current || document.hidden) {
      return
    }
    focusBlockedRef.current = false
    sfx.unlock()
    setShowTutorial(false)
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'seen')
    } catch {
      // Private browsing can decline this preference without blocking play.
    }
  }, [sfx])

  const handleGraphicsStatus = useCallback((status: GraphicsStatus): void => {
    graphicsReadyRef.current = status === 'ready'
    steeringKeysRef.current.clear()
    setGraphicsStatus(status)
    if (status === 'error') {
      setRecovering(true)
      setPhase((current) => current === 'playing' ? 'paused' : current)
    }
  }, [])

  const retryGraphics = useCallback((): void => {
    graphicsReadyRef.current = false
    steeringKeysRef.current.clear()
    setGraphicsStatus('loading')
    setGraphicsAttempt((value) => value + 1)
  }, [])

  const pauseOrResume = useCallback((): void => {
    if (graphicsReadyRef.current && !document.hidden) {
      focusBlockedRef.current = false
      steeringKeysRef.current.clear()
      setPhase((current) => current === 'paused' ? 'playing' : current === 'playing' ? 'paused' : current)
    }
  }, [])

  const handleHud = useCallback((snapshot: HudSnapshot): void => {
    if (graphicsReadyRef.current) {
      setHud(snapshot)
    }
  }, [])

  const handleFinish = useCallback((finished: GameState): void => {
    if (!graphicsReadyRef.current) {
      return
    }
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
      if (document.hidden || (focusBlockedRef.current && phase === 'playing') || !graphicsReadyRef.current || !gameState || showTutorial || (phase !== 'playing' && phase !== 'paused')) {
        return
      }
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest(
        'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [role="textbox"], [contenteditable]:not([contenteditable="false"])',
      ))) {
        return
      }
      if (event.repeat && !steeringKeysRef.current.has(event.code) && !['Space', 'Escape'].includes(event.code)) {
        return
      }
      if (!event.repeat && phase === 'playing') {
        steeringKeysRef.current.add(event.code)
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
        if (!event.repeat) {
          pauseOrResume()
        }
      }
    }
    function clearKey(event: KeyboardEvent): void {
      steeringKeysRef.current.delete(event.code)
    }
    function suspend(): void {
      focusBlockedRef.current = true
      steeringKeysRef.current.clear()
      if (!showTutorial) {
        setPhase((current) => current === 'playing' ? 'paused' : current)
      }
    }
    function visibilityChanged(): void {
      if (document.hidden) {
        suspend()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', clearKey)
    window.addEventListener('blur', suspend)
    document.addEventListener('visibilitychange', visibilityChanged)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', clearKey)
      window.removeEventListener('blur', suspend)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [gameState, phase, showTutorial, pauseOrResume])

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

  const active = graphicsStatus === 'ready' && phase === 'playing' && !showTutorial

  return (
    <PortraitGameShell className="bg-slate-950">
      <section className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
        <MathHordeScene
          active={active}
          key={`${level.id}-${attempt}`}
          graphicsAttempt={graphicsAttempt}
          onGraphicsStatus={handleGraphicsStatus}
          playSfx={playSfx}
          state={gameState}
          onFinish={handleFinish}
          onHud={handleHud}
        />

        {graphicsStatus === 'ready' && <GameHud
          hud={hud}
          level={level.id}
          muted={muted}
          paused={phase === 'paused'}
          onExit={() => setPhase('select')}
          onPause={pauseOrResume}
          onToggleMute={toggleMute}
        />}

        {graphicsStatus !== 'ready' && <GraphicsRecoveryOverlay loading={graphicsStatus === 'loading'} onRetry={retryGraphics} onExit={() => setPhase('select')} />}
        {graphicsStatus === 'ready' && showTutorial && phase !== 'paused' && <TutorialOverlay onStart={finishTutorial} />}
        {graphicsStatus === 'ready' && phase === 'paused' && <PauseOverlay focusResume={recovering} onExit={() => setPhase('select')} onResume={pauseOrResume} />}
        {graphicsStatus === 'ready' && phase === 'lost' && <LostOverlay onExit={() => setPhase('select')} onRetry={() => startLevel(level.id)} />}
        {graphicsStatus === 'ready' && phase === 'won' && (
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
          <SoundToggle muted={muted} onMutedChange={onToggleMute} iconClassName="size-4" className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-slate-950/75 backdrop-blur active:scale-95" />
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

function PauseOverlay({ onExit, onResume, focusResume }: { onExit: () => void, onResume: () => void, focusResume: boolean }): ReactElement {
  return (
    <Overlay label="Game paused">
      <div className="flex flex-col items-center gap-5 text-white">
        <h2 className="text-3xl font-black">PAUSED</h2>
        <div className="flex gap-3">
          <RoundButton label="Resume" autoFocus={focusResume} onClick={onResume}><Play className="size-6" /></RoundButton>
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

function RoundButton({ children, label, onClick, primary = false, autoFocus = false }: { children: ReactElement, label: string, onClick: () => void, primary?: boolean, autoFocus?: boolean }): ReactElement {
  return (
    <button aria-label={label} autoFocus={autoFocus} className={`flex size-14 items-center justify-center rounded-full border shadow-xl active:scale-95 ${primary ? 'border-cyan-200 bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950' : 'border-white/20 bg-slate-900 text-white'}`} type="button" onClick={onClick}>{children}</button>
  )
}

function GraphicsRecoveryOverlay({ loading, onRetry, onExit }: { loading: boolean, onRetry: () => void, onExit: () => void }): ReactElement {
  return (
    <Overlay label="Graphics unavailable">
      <div className="max-w-xs rounded-3xl border border-cyan-300/30 bg-slate-950 p-6 text-center text-white shadow-2xl">
        <h2 className="text-2xl font-black">{loading ? 'Preparing graphics…' : 'Graphics could not start'}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300" role="status">{loading ? 'Your run is waiting.' : 'Your run is paused. Retry graphics to keep this run, or return to level select.'}</p>
        <div className="mt-5 flex flex-col gap-3">
          {!loading && <button autoFocus className="rounded-full bg-cyan-300 px-5 py-3 font-bold text-slate-950" type="button" onClick={onRetry}>Retry graphics</button>}
          <button autoFocus={loading} className="rounded-full border border-white/30 px-5 py-3 font-bold" type="button" onClick={onExit}>Level select</button>
        </div>
      </div>
    </Overlay>
  )
}
