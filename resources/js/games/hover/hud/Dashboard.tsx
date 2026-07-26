import type { ReactElement } from 'react'

import type { SpeedEffect } from '../gameTypes'
import { MAX_SPEED } from '../gameTypes'

interface DashboardProps {
  speed: number
  speedEffect: SpeedEffect | null
  hasJumpPower: boolean
  muted: boolean
  onToggleMute: () => void
}

/**
 * Bottom-right cockpit dashboard: digital speed readout, active powerup
 * effects with countdowns, jump power status, and the mute toggle.
 */
export function Dashboard({ speed, speedEffect, hasJumpPower, muted, onToggleMute }: DashboardProps): ReactElement {
  const speedPct = Math.min(1, speed / (MAX_SPEED * 1.5))

  return (
    <div className="flex items-end gap-3 rounded-xl bg-slate-950/60 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-col items-center">
        <div className="text-2xl leading-none font-black tabular-nums text-emerald-300" data-testid="speed-value">
          {Math.round(speed * 3.6)}
        </div>
        <div className="text-[9px] font-bold tracking-widest text-white/50">SPEED</div>
        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${speedEffect?.kind === 'slow' ? 'bg-red-400' : speedEffect?.kind === 'boost' ? 'bg-fuchsia-400' : 'bg-emerald-400'}`}
            style={{ width: `${speedPct * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div aria-label={`Jump power: ${hasJumpPower ? 'ready' : 'not collected'}`}>
          <span
            data-testid="jump-power"
            data-active={hasJumpPower}
            className={`inline-block h-4 w-8 rounded-sm ${hasJumpPower ? 'bg-yellow-300' : 'bg-white/15'}`}
          />
        </div>
        <div className="text-[9px] font-bold tracking-widest text-white/50">JUMP</div>
      </div>

      <div className="min-w-24">
        {speedEffect ? (
          <div
            data-testid="speed-effect"
            className={`rounded-lg px-2 py-1 text-center text-[11px] font-bold ${speedEffect.kind === 'boost' ? 'bg-fuchsia-500/25 text-fuchsia-200' : 'bg-red-500/25 text-red-200'}`}
          >
            {speedEffect.kind === 'boost' ? 'SPEED UP' : 'SLOWED'} {Math.ceil(speedEffect.remainingSec)}s
          </div>
        ) : (
          <div className="text-center text-[11px] font-semibold text-white/35">no powerup</div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        className="pointer-events-auto rounded-lg bg-white/10 px-2 py-1 text-sm hover:bg-white/20"
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}
