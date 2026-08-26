import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import { FullscreenIconButton } from '../_shared/FullscreenButton'
import { createSfxEngine, type SfxEngine } from './audio/sfx'
import { createEngineState } from './engine/engine'
import { createRng } from './engine/rng'
import { loadProgress, loadSavedProgress, loadSettings, saveProgress, saveSettings } from './gameProgress'
import type { EngineEvent, EngineState, GamePhase, HudSnapshot } from './gameTypes'
import { MAX_LOSSES_PER_MAP, MAX_SPEED } from './gameTypes'
import { buildHudSnapshot,HoverScene } from './HoverScene'
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

  const schedule = useCallback((fn: () => void, ms: number): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(fn, ms)
  }, [])

  const beginRound = useCallback(
    (roundIndex: number, score: number, lossesOnMap: number): void => {
      const visual = readHoverVisualTestOptions()
      const seed =
        visual.enabled && visual.seed !== null ? (visual.seed + roundIndex) >>> 0 : (Date.now() ^ (roundIndex * 0x9e3779b9)) >>> 0
      engineRef.current = createEngineState({ roundIndex, rng: createRng(seed), score, lossesOnMap })
      setHud(buildHudSnapshot(engineRef.current))
      setPhase('mapIntro')
      schedule(() => setPhase('playing'), MAP_INTRO_MS)
    },
    [schedule],
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
      engine.playSfx('start')
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
            audio.playSfx('flagBlue')
            break
          case 'flagRed':
            audio.playSfx('flagRed')
            break
          case 'pod':
            if (event.actor === 'player') {
              audio.playSfx(event.podKind === 'slowDown' ? 'podBad' : 'pod')
            }
            break
          case 'jump':
            if (event.actor === 'player') {
              audio.playSfx('jump')
            }
            break
          case 'land':
            if (event.actor === 'player') {
              audio.playSfx('land')
            }
            break
          case 'trapped':
            audio.playSfx('trapped', event.actor === 'player' ? 1 : 0.6)
            break
          case 'arrow':
            if (event.actor === 'player') {
              audio.playSfx('arrow')
            }
            break
          case 'bounce':
            if (event.actor === 'player') {
              audio.playSfx('bounce', event.intensity ?? 0.5)
            }
            break
          case 'craftBump':
            audio.playSfx('craftBump', event.intensity ?? 0.5)
            break
          case 'win':
            audio.playSfx('win')
            break
          case 'lose':
            audio.playSfx('lose')
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
        schedule(() => beginRound(state.roundIndex + 1, state.score, 0), MAP_COMPLETE_MS)
      } else if (events.some((event) => event.kind === 'lose')) {
        state.lossesOnMap += 1
        persistProgress(state, false)
        setHud(buildHudSnapshot(state))
        if (state.lossesOnMap >= MAX_LOSSES_PER_MAP) {
          setPhase('gameOver')
        } else {
          setPhase('mapLost')
          schedule(() => beginRound(state.roundIndex, state.score, state.lossesOnMap), MAP_LOST_MS)
        }
      }
    },
    [beginRound, persistProgress, schedule, sfx],
  )

  const handleHudSnapshot = useCallback(
    (snapshot: HudSnapshot): void => {
      setHud(snapshot)
      sfxRef.current?.setEngineIntensity(snapshot.speed / (MAX_SPEED * 1.5))
    },
    [],
  )

  const togglePause = useCallback((): void => {
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
    const keyboard = inputRef.current?.read() ?? neutralInput()
    const touch = touchHandle?.source.read() ?? neutralInput()
    return mergeInputs(keyboard, touch)
  }, [touchHandle])

  useEffect(() => {
    const keyboard = createKeyboardInput({ onPause: togglePause })
    keyboard.attach()
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
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      sfxRef.current?.dispose()
      sfxRef.current = null
    }
  }, [togglePause])

  useEffect(() => {
    if (phase === 'playing') {
      sfxRef.current?.startEngineHum()
    } else {
      sfxRef.current?.stopEngineHum()
      touchHandle?.reset()
    }
  }, [phase, touchHandle])

  const showHud = hud !== null && phase !== 'attract' && phase !== 'gameOver'

  return (
    <div className="fixed inset-0 touch-none overflow-hidden bg-slate-950 text-white">
      <HoverScene
        engineRef={engineRef}
        running={phase === 'playing'}
        idle={phase === 'paused'}
        readInput={readInput}
        onEvents={handleEvents}
        onHudSnapshot={handleHudSnapshot}
        minimapCanvasRef={minimapCanvasRef}
      />
      {showHud ? (
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
      {touchHandle && phase === 'playing' ? (
        <TouchControls handle={touchHandle} onPause={togglePause} jumpEnabled={hud?.hasJumpPower ?? false} />
      ) : null}
      <ScreenOverlays
        phase={phase}
        hud={hud}
        bestScore={bestScore}
        touchMode={touchHandle !== null}
        levels={MAPS.map((map, index) => ({ index, name: map.theme.name, unlocked: index < unlockedLevel }))}
        onStart={handleStart}
        onResume={togglePause}
        onPlayAgain={handleStart}
      />
      {phase === 'attract' || phase === 'paused' || phase === 'gameOver' ? (
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
    </div>
  )
}
