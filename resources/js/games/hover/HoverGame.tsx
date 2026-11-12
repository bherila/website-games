import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { createSfxEngine, type SfxEngine } from './audio/sfx'
import { createEngineState } from './engine/engine'
import { createRng } from './engine/rng'
import { loadProgress, loadSavedProgress, loadSettings, saveProgress, saveSettings } from './gameProgress'
import type { EngineEvent, EngineState, GamePhase, HudSnapshot } from './gameTypes'
import { MAX_LOSSES_PER_MAP, MAX_SPEED } from './gameTypes'
import { buildHudSnapshot, type GraphicsStatus, HoverScene } from './HoverScene'
import { HudOverlay } from './hud/HudOverlay'
import { ScreenOverlays } from './hud/ScreenOverlays'
import { TouchControls } from './hud/TouchControls'
import { createKeyboardInput, type InputSource, type InputState, neutralInput } from './input/inputState'
import { createTouchInput, isTouchDevice, mergeInputs, type TouchInputHandle } from './input/touchInput'
import { MAPS, TOTAL_LEVELS } from './maps/maps'
import { readHoverVisualTestOptions } from './visualTestMode'

const MAP_INTRO_MS = 2400
const MAP_COMPLETE_MS = 3000
const MAP_LOST_MS = 2600

export function HoverGame(): ReactElement {
  const [graphicsStatus, setGraphicsStatus] = useState<GraphicsStatus>('starting')
  const [graphicsAttempt, setGraphicsAttempt] = useState(0)
  const graphicsReadyRef = useRef(false)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const retryingRef = useRef(false)
  const retryRef = useRef<HTMLButtonElement | null>(null)
  const [phase, setPhase] = useState<GamePhase>('attract')
  const [hud, setHud] = useState<HudSnapshot | null>(null)
  const [muted, setMuted] = useState(() => loadSettings().muted)
  const [bestScore, setBestScore] = useState(() => loadSavedProgress().bestScore)
  const [unlockedLevel, setUnlockedLevel] = useState(() => loadProgress().unlockedLevel)
  const [touchHandle] = useState<TouchInputHandle | null>(() => (isTouchDevice() ? createTouchInput() : null))
  const [minimapSizePx] = useState(() => (isTouchDevice() || (typeof window !== 'undefined' && window.innerWidth < 640) ? 132 : 200))

  const engineRef = useRef<EngineState | null>(null)
  const sfxRef = useRef<SfxEngine | null>(null)
  const inputRef = useRef<InputSource | null>(null)
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const phaseRef = useRef(phase)
  const mutedRef = useRef(muted)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  const sfx = useCallback((): SfxEngine => {
    if (!sfxRef.current) {
      sfxRef.current = createSfxEngine(mutedRef.current)
    }
    return sfxRef.current
  }, [])

  const handleGraphicsStatus = useCallback((status: GraphicsStatus): void => {
    if (status !== 'ready') {
      inputRef.current?.detach()
      touchHandle?.reset()
    }
    graphicsReadyRef.current = status === 'ready'
    setGraphicsStatus(status)
  }, [touchHandle])

  const beginRound = useCallback(
    (roundIndex: number, score: number, lossesOnMap: number): void => {
      handleGraphicsStatus('starting')
      const visual = readHoverVisualTestOptions()
      const seed =
        visual.enabled && visual.seed !== null ? (visual.seed + roundIndex) >>> 0 : (Date.now() ^ (roundIndex * 0x9e3779b9)) >>> 0
      engineRef.current = createEngineState({ roundIndex, rng: createRng(seed), score, lossesOnMap })
      setHud(buildHudSnapshot(engineRef.current))
      setPhase('mapIntro')
    },
    [handleGraphicsStatus],
  )

  useEffect(() => {
    const visual = readHoverVisualTestOptions()
    if (visual.enabled && visual.autoStart) {
      beginRound(visual.round, 0, 0)
    }
  }, [beginRound])

  const handleStart = useCallback(
    (levelIndex: number): void => {
      const engine = sfx()
      engine.unlock()
      engine.play('start')
      beginRound(levelIndex, 0, 0)
    },
    [beginRound, sfx],
  )

  const persistProgress = useCallback((state: EngineState, wonMap: boolean): void => {
    // Visual-test sessions can start at an arbitrary round= index; banking
    // that as real progress would permanently unlock maps in the level grid.
    if (readHoverVisualTestOptions().enabled) {
      return
    }
    const progress = loadSavedProgress()
    progress.bestScore = Math.max(progress.bestScore, state.score)
    if (wonMap) {
      progress.mapsCleared[state.map.id] += 1
      progress.bestRoundIndex = Math.max(progress.bestRoundIndex, state.roundIndex + 1)
      // Unlock from in-memory state, not a storage round-trip — private
      // browsing (storage unavailable) must still unlock within the session.
      setUnlockedLevel((current) => Math.max(current, Math.min(TOTAL_LEVELS, state.roundIndex + 2)))
    }
    saveProgress(progress)
    setBestScore(progress.bestScore)
  }, [])

  const handleEvents = useCallback(
    (events: EngineEvent[]): void => {
      const state = engineRef.current
      const audio = sfx()

      for (const event of events) {
        switch (event.kind) {
          case 'flagBlue':
            audio.play('flagBlue')
            break
          case 'flagRed':
            audio.play('flagRed')
            break
          case 'pod':
            if (event.actor === 'player') {
              audio.play(event.podKind === 'slowDown' ? 'podBad' : 'pod')
            }
            break
          case 'jump':
            if (event.actor === 'player') {
              audio.play('jump')
            }
            break
          case 'land':
            if (event.actor === 'player') {
              audio.play('land')
            }
            break
          case 'trapped':
            audio.play('trapped', event.actor === 'player' ? 1 : 0.6)
            break
          case 'arrow':
            if (event.actor === 'player') {
              audio.play('arrow')
            }
            break
          case 'bounce':
            if (event.actor === 'player') {
              audio.play('bounce', event.intensity ?? 0.5)
            }
            break
          case 'craftBump':
            audio.play('craftBump', event.intensity ?? 0.5)
            break
          case 'win':
            audio.play('win')
            break
          case 'lose':
            audio.play('lose')
            break
        }
      }

      if (!state) {
        return
      }

      if (events.some((event) => event.kind === 'win')) {
        persistProgress(state, true)
        setHud(buildHudSnapshot(state))
        setPhase('mapComplete')
      } else if (events.some((event) => event.kind === 'lose')) {
        state.lossesOnMap += 1
        persistProgress(state, false)
        setHud(buildHudSnapshot(state))
        if (state.lossesOnMap >= MAX_LOSSES_PER_MAP) {
          setPhase('gameOver')
        } else {
          setPhase('mapLost')
        }
      }
    },
    [persistProgress, sfx],
  )

  const handleHudSnapshot = useCallback(
    (snapshot: HudSnapshot): void => {
      setHud(snapshot)
      sfxRef.current?.setEngineIntensity(snapshot.speed / (MAX_SPEED * 1.5))
    },
    [],
  )

  const togglePause = useCallback((): void => {
    if (!graphicsReadyRef.current) return
    if (phaseRef.current === 'playing') {
      setPhase('paused')
    } else if (phaseRef.current === 'paused') {
      setPhase('playing')
    }
  }, [])

  const toggleMute = useCallback((): void => {
    setMuted((current) => {
      const next = !current
      saveSettings({ version: 1, muted: next })
      sfxRef.current?.setMuted(next)
      return next
    })
  }, [])

  const readInput = useCallback((): InputState => {
    if (!graphicsReadyRef.current) return neutralInput()
    const keyboard = inputRef.current?.read() ?? neutralInput()
    const touch = touchHandle?.source.read() ?? neutralInput()
    return mergeInputs(keyboard, touch)
  }, [touchHandle])

  useEffect(() => {
    const keyboard = createKeyboardInput({ onPause: togglePause })
    if (graphicsStatus === 'ready') keyboard.attach()
    inputRef.current = keyboard

    const handleVisibility = (): void => {
      if (document.hidden && phaseRef.current === 'playing') {
        setPhase('paused')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      keyboard.detach()
      inputRef.current = null
    }
  }, [togglePause, graphicsStatus])

  useEffect(() => {
    if (phase === 'playing' && graphicsStatus === 'ready') {
      sfxRef.current?.startEngineHum()
    } else {
      sfxRef.current?.stopEngineHum()
      touchHandle?.reset()
    }
  }, [phase, touchHandle, graphicsStatus])

  // Pause banner deadlines while graphics are unavailable, retaining the
  // remaining duration and the same parent-owned round object.
  const deadlineRef = useRef<{ phase: GamePhase; remaining: number } | null>(null)
  useEffect(() => {
    const duration = phase === 'mapIntro' ? MAP_INTRO_MS : phase === 'mapComplete' ? MAP_COMPLETE_MS : phase === 'mapLost' ? MAP_LOST_MS : null
    if (duration === null) {
      deadlineRef.current = null
      return
    }
    if (deadlineRef.current?.phase !== phase) deadlineRef.current = { phase, remaining: duration }
    const deadline = deadlineRef.current
    if (graphicsStatus !== 'ready') return
    const started = performance.now()
    timerRef.current = setTimeout(() => {
      if (!graphicsReadyRef.current) return
      deadlineRef.current = null
      const state = engineRef.current
      if (phase === 'mapIntro') setPhase('playing')
      else if (state) beginRound(state.roundIndex + (phase === 'mapComplete' ? 1 : 0), state.score, phase === 'mapComplete' ? 0 : state.lossesOnMap)
    }, deadline.remaining)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      deadline.remaining = Math.max(0, deadline.remaining - (performance.now() - started))
    }
  }, [phase, graphicsStatus, beginRound])

  useEffect(() => {
    if (graphicsStatus === 'failed') retryRef.current?.focus()
    else if (graphicsStatus === 'ready' && retryingRef.current) {
      retryingRef.current = false
      const control = phase === 'attract' || phase === 'paused' || phase === 'gameOver'
        ? shellRef.current?.querySelector<HTMLButtonElement>('button')
        : null
      ;(control ?? shellRef.current)?.focus()
    }
  }, [graphicsStatus, phase])

  useEffect(() => () => {
    sfxRef.current?.dispose()
    sfxRef.current = null
  }, [])

  const showHud = hud !== null && phase !== 'attract' && phase !== 'gameOver'

  return (
    <div ref={shellRef} tabIndex={-1} className="fixed inset-0 touch-none overflow-hidden bg-slate-950 text-white">
      <HoverScene
        engineRef={engineRef}
        graphicsAttempt={graphicsAttempt}
        onGraphicsStatus={handleGraphicsStatus}
        running={phase === 'playing' && graphicsStatus === 'ready'}
        idle={phase === 'paused'}
        readInput={readInput}
        onEvents={handleEvents}
        onHudSnapshot={handleHudSnapshot}
        minimapCanvasRef={minimapCanvasRef}
      />
      {graphicsStatus === 'ready' && showHud ? (
        <HudOverlay
          hud={hud}
          muted={muted}
          minimapCanvasRef={minimapCanvasRef}
          minimapSizePx={minimapSizePx}
          hideControlsHint={touchHandle !== null}
          centerMinimap={touchHandle !== null}
          onToggleMute={toggleMute}
        />
      ) : null}
      {graphicsStatus === 'ready' && touchHandle && phase === 'playing' ? (
        <TouchControls handle={touchHandle} onPause={togglePause} jumpEnabled={hud?.hasJumpPower ?? false} />
      ) : null}
      {graphicsStatus === 'ready' ? <ScreenOverlays
        phase={phase}
        hud={hud}
        bestScore={bestScore}
        touchMode={touchHandle !== null}
        levels={MAPS.map((map, index) => ({ index, name: map.theme.name, unlocked: index < unlockedLevel }))}
        onStart={handleStart}
        onResume={togglePause}
        onPlayAgain={handleStart}
      /> : null}
      {graphicsStatus === 'ready' && (phase === 'attract' || phase === 'paused' || phase === 'gameOver') ? (
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
          {phase !== 'paused' ? (
            <a
              href="/"
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 backdrop-blur-sm hover:bg-white/20"
            >
              ← All Games
            </a>
          ) : null}
          <FullscreenIconButton
            className="rounded-lg bg-white/10 text-white/80 backdrop-blur-sm hover:bg-white/20"
            iconClassName="size-4"
          />
        </div>
      ) : null}
      {graphicsStatus !== 'ready' ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950 p-6">
          <div className="max-w-sm text-center" role={graphicsStatus === 'failed' ? 'alert' : 'status'}>
            <h1 className="mb-3 text-2xl font-bold">{graphicsStatus === 'failed' ? 'Graphics could not start' : 'Starting graphics…'}</h1>
            {graphicsStatus === 'failed' ? <>
              <p className="mb-6 text-slate-300">Your round is on hold. Try starting the graphics again to continue.</p>
              <button ref={retryRef} type="button" className="rounded-lg bg-cyan-600 px-5 py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" onClick={() => {
                retryingRef.current = true
                handleGraphicsStatus('starting')
                setGraphicsAttempt((attempt) => attempt + 1)
              }}>Retry graphics</button>
            </> : null}
            <a href="/" className="mt-6 block rounded py-2 underline">← All Games</a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
