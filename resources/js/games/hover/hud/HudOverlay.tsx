import type { ReactElement, RefObject } from 'react'

import type { HudSnapshot } from '../gameTypes'
import { MIRROR_LAYOUT } from '../scene/mirror'
import { Dashboard } from './Dashboard'
import { FlagStatus } from './FlagStatus'
import { Minimap } from './Minimap'

interface HudOverlayProps {
  hud: HudSnapshot
  muted: boolean
  minimapCanvasRef: RefObject<HTMLCanvasElement | null>
  minimapSizePx: number
  /** Touch devices show on-screen controls instead of the keyboard hint. */
  hideControlsHint: boolean
  /** Touch layout: minimap moves bottom-center so the joystick owns the left corner. */
  centerMinimap: boolean
  onToggleMute: () => void
}

/**
 * The in-game HUD: rear-view mirror frame + score + flag status along the
 * top (mirror glass is rendered by the WebGL scissor pass underneath, framed
 * here using the shared MIRROR_LAYOUT constants), minimap + controls hint +
 * dashboard along the bottom.
 */
export function HudOverlay({ hud, muted, minimapCanvasRef, minimapSizePx, hideControlsHint, centerMinimap, onToggleMute }: HudOverlayProps): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-xl border-4 border-slate-800/90 shadow-2xl ring-1 ring-white/25"
        style={{
          top: `${MIRROR_LAYOUT.topFrac * 100}%`,
          width: `min(${MIRROR_LAYOUT.widthFrac * 100}%, ${MIRROR_LAYOUT.maxWidthPx}px)`,
          height: `${MIRROR_LAYOUT.heightFrac * 100}%`,
        }}
        aria-label="Rear-view mirror"
      />

      <div className="absolute top-3 left-4 rounded-xl bg-slate-950/60 px-4 py-2 backdrop-blur-sm">
        <div className="text-[10px] font-bold tracking-widest text-white/50">SCORE</div>
        <div className="text-2xl leading-tight font-black tabular-nums text-white" data-testid="score-value">
          {hud.score.toLocaleString()}
        </div>
        <div className="text-[11px] font-semibold tabular-nums text-amber-300/90">flags worth {hud.flagValue}</div>
      </div>

      <div className="absolute top-3 right-4">
        <FlagStatus
          blueCollected={hud.blueCollected}
          blueTotal={hud.blueTotal}
          redCollected={hud.redCollected}
          redTotal={hud.redTotal}
        />
      </div>

      <div className={centerMinimap ? 'absolute bottom-4 left-1/2 -translate-x-1/2' : 'absolute bottom-4 left-4'}>
        <Minimap canvasRef={minimapCanvasRef} widthPx={minimapSizePx} heightPx={minimapSizePx} />
      </div>

      {hideControlsHint ? null : (
        <div className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-lg bg-slate-950/50 px-3 py-1.5 text-[11px] font-semibold text-white/60 backdrop-blur-sm sm:block">
          <kbd className="font-mono">W/S</kbd> drive · <kbd className="font-mono">A/D</kbd> strafe ·{' '}
          <kbd className="font-mono">Arrows</kbd> look · <kbd className="font-mono">Space</kbd> jump ·{' '}
          <kbd className="font-mono">Esc</kbd> pause
        </div>
      )}

      <div className="absolute right-4 bottom-4">
        <Dashboard
          speed={hud.speed}
          speedEffect={hud.speedEffect}
          hasJumpPower={hud.hasJumpPower}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      </div>
    </div>
  )
}
