import type { ReactElement } from 'react'

import type { GameSpeed } from '../gameTypes'

interface SpeedControlsProps {
  speed: GameSpeed
  fastMode: boolean
  fastModeActive: boolean
  onSetSpeed: (speed: GameSpeed) => void
  onSetFastMode: (enabled: boolean) => void
}

const OPTIONS: Array<{ value: GameSpeed; label: string; shortcut: string }> = [
  { value: 0, label: '⏸', shortcut: 'Space' },
  { value: 1, label: '1×', shortcut: '1' },
  { value: 8, label: '8×', shortcut: '8' },
  { value: 16, label: '16×', shortcut: '6' },
]

export function SpeedControls({ speed, fastMode, fastModeActive, onSetSpeed, onSetFastMode }: SpeedControlsProps): ReactElement {
  return (
    <div className="flex items-stretch gap-1.5">
      <div className="flex overflow-hidden rounded-lg bg-slate-950/70 shadow-lg backdrop-blur-sm" role="group" aria-label="Game speed">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            data-testid={`speed-${option.value}`}
            aria-pressed={speed === option.value}
            aria-label={`${option.label} speed, shortcut ${option.shortcut}`}
            title={`Shortcut: ${option.shortcut}`}
            onClick={() => onSetSpeed(option.value)}
            className={`px-3 py-1.5 text-sm font-bold transition-colors ${
              speed === option.value ? 'bg-emerald-500/80 text-slate-950' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="fast-mode-toggle"
        role="switch"
        aria-checked={fastMode}
        aria-label="Fast mode"
        title="Fast mode: runs up to 48× when the tower is quiet (mid-day / overnight)."
        onClick={() => onSetFastMode(!fastMode)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold shadow-lg backdrop-blur-sm transition-colors ${
          fastMode
            ? fastModeActive
              ? 'bg-amber-400/90 text-slate-950'
              : 'bg-amber-500/40 text-amber-100'
            : 'bg-slate-950/70 text-white/70 hover:bg-white/10'
        }`}
      >
        <span aria-hidden="true">{fastMode ? '⏩' : '⏵'}</span>
        Fast
      </button>
    </div>
  )
}
