import type { ReactElement } from 'react'

import type { GamePhase, HudSnapshot } from '../gameTypes'
import { MAX_LOSSES_PER_MAP } from '../gameTypes'

interface HoverLevelOption {
  index: number
  name: string
  unlocked: boolean
}

interface ScreenOverlaysProps {
  phase: GamePhase
  hud: HudSnapshot | null
  bestScore: number
  touchMode: boolean
  levels: ReadonlyArray<HoverLevelOption>
  onStart: (levelIndex: number) => void
  onResume: () => void
  onPlayAgain: (levelIndex: number) => void
}

function Panel({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-white/15 bg-slate-900/90 px-8 py-7 text-center text-white shadow-2xl">
        {children}
      </div>
    </div>
  )
}

const TOUCH_CONTROLS_HINT = (
  <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-left text-sm text-white/75">
    <span className="rounded bg-white/10 px-2 py-0.5 text-center text-xs">🕹️</span>
    <span>left stick — drive &amp; strafe</span>
    <span className="rounded bg-white/10 px-2 py-0.5 text-center text-xs">drag</span>
    <span>anywhere else — rotate &amp; glance</span>
    <span className="rounded bg-white/10 px-2 py-0.5 text-center text-xs">JUMP</span>
    <span>hop low walls (needs a spring powerup)</span>
    <span className="rounded bg-white/10 px-2 py-0.5 text-center text-xs">⏸</span>
    <span>pause</span>
  </div>
)

function LevelSelect({
  levels,
  onSelect,
}: {
  levels: ReadonlyArray<HoverLevelOption>
  onSelect: (levelIndex: number) => void
}): ReactElement | null {
  if (levels.length === 0) {
    return null
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="text-xs font-bold tracking-[0.3em] text-white/50">LEVEL SELECT</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {levels.map((level) => (
          <button
            key={level.index}
            type="button"
            data-testid={`level-select-${level.index}`}
            disabled={!level.unlocked}
            title={level.unlocked ? level.name : 'Locked'}
            onClick={() => onSelect(level.index)}
            className={`flex w-16 flex-col items-center rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-white ${
              level.unlocked ? 'hover:bg-white/15' : 'cursor-not-allowed opacity-40'
            }`}
          >
            <span className="text-sm font-bold">{level.index + 1}</span>
            <span className="mt-0.5 truncate text-[10px] leading-tight text-white/70">
              {level.unlocked ? level.name : '🔒'}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/40">Starting at a later level gives no score advantage.</p>
    </div>
  )
}

const CONTROLS_HINT = (
  <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-left text-sm text-white/75">
    <kbd className="rounded bg-white/10 px-2 py-0.5 text-center font-mono text-xs">W/S + A/D</kbd>
    <span>drive forward/back and strafe left/right</span>
    <kbd className="rounded bg-white/10 px-2 py-0.5 text-center font-mono text-xs">← ↑ ↓ →</kbd>
    <span>rotate left/right and glance slightly up/down</span>
    <kbd className="rounded bg-white/10 px-2 py-0.5 text-center font-mono text-xs">Space</kbd>
    <span>jump low walls (needs a spring powerup)</span>
    <kbd className="rounded bg-white/10 px-2 py-0.5 text-center font-mono text-xs">Esc</kbd>
    <span>pause</span>
  </div>
)

/** Full-screen state banners: start, map intro, pause, tallies, game over. */
export function ScreenOverlays({
  phase,
  hud,
  bestScore,
  touchMode,
  levels,
  onStart,
  onResume,
  onPlayAgain,
}: ScreenOverlaysProps): ReactElement | null {
  if (phase === 'attract') {
    return (
      <Panel>
        <h1 className="text-5xl font-black tracking-[0.3em] text-sky-300">HOVER</h1>
        <p className="mt-2 text-sm text-white/70">
          Grab every <span className="font-bold text-blue-400">blue flag</span> before the drone takes the{' '}
          <span className="font-bold text-red-400">red ones</span>.
        </p>
        {bestScore > 0 ? <p className="mt-2 text-xs text-white/50">Best score: {bestScore.toLocaleString()}</p> : null}
        {touchMode ? TOUCH_CONTROLS_HINT : CONTROLS_HINT}
        <button
          type="button"
          onClick={() => onStart(0)}
          className="mt-6 w-full rounded-xl bg-sky-500 py-3 text-lg font-bold text-white shadow-lg hover:bg-sky-400"
        >
          Start Engine
        </button>
        {touchMode ? null : <p className="mt-3 text-[11px] text-white/40">Best played on desktop with a keyboard.</p>}
        <LevelSelect levels={levels} onSelect={onStart} />
      </Panel>
    )
  }

  if (phase === 'mapIntro' && hud) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="rounded-2xl bg-slate-950/75 px-10 py-6 text-center text-white shadow-2xl backdrop-blur-sm">
          <div className="text-xs font-bold tracking-[0.35em] text-white/50">CYCLE {hud.cycle}</div>
          <div className="mt-1 text-3xl font-black tracking-wide text-sky-200">{hud.mapName}</div>
          <div className="mt-2 text-sm text-white/70">
            Collect {hud.blueTotal} blue flags — beat the drone!
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'paused') {
    return (
      <Panel>
        <h2 className="text-2xl font-black tracking-widest text-white">PAUSED</h2>
        <button
          type="button"
          onClick={onResume}
          className="mt-5 w-full rounded-xl bg-sky-500 py-2.5 font-bold text-white hover:bg-sky-400"
        >
          Resume
        </button>
        <p className="mt-2 text-xs text-white/50">or press Esc</p>
      </Panel>
    )
  }

  if (phase === 'mapComplete' && hud) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="rounded-2xl bg-emerald-950/80 px-10 py-6 text-center text-white shadow-2xl backdrop-blur-sm">
          <div className="text-3xl font-black text-emerald-300">MAP CLEAR!</div>
          <div className="mt-2 text-sm text-white/80">
            +{hud.mapScore.toLocaleString()} points · total {hud.score.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-white/50">Next arena incoming…</div>
        </div>
      </div>
    )
  }

  if (phase === 'mapLost' && hud) {
    const attemptsLeft = MAX_LOSSES_PER_MAP - hud.lossesOnMap
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="rounded-2xl bg-red-950/80 px-10 py-6 text-center text-white shadow-2xl backdrop-blur-sm">
          <div className="text-3xl font-black text-red-300">THE DRONE BEAT YOU!</div>
          <div className="mt-2 text-sm text-white/80">
            {attemptsLeft > 0 ? `Same map, new flags — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.` : 'No tries left…'}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'gameOver' && hud) {
    return (
      <Panel>
        <h2 className="text-3xl font-black tracking-widest text-red-300">GAME OVER</h2>
        <p className="mt-3 text-lg font-bold text-white">Final score: {hud.score.toLocaleString()}</p>
        <p className="mt-1 text-sm text-white/60">Best: {Math.max(bestScore, hud.score).toLocaleString()}</p>
        <button
          type="button"
          onClick={() => onPlayAgain(0)}
          className="mt-6 w-full rounded-xl bg-sky-500 py-3 text-lg font-bold text-white shadow-lg hover:bg-sky-400"
        >
          Play Again
        </button>
        <LevelSelect levels={levels} onSelect={onPlayAgain} />
      </Panel>
    )
  }

  return null
}
