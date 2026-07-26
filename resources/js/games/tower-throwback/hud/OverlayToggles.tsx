import type { ReactElement } from 'react'

import type { DiagnosticPaletteMode } from '../presentationPrefs'
import { cssRamp } from '../scene/diagnosticPalette'

export type OverlayChoice = 'noise' | 'congestion' | 'eval' | null

interface OverlayTogglesProps {
  overlay: OverlayChoice
  onSetOverlay: (overlay: OverlayChoice) => void
  paletteMode?: DiagnosticPaletteMode
}

const OPTIONS: Array<{ value: OverlayChoice; label: string }> = [
  { value: null, label: 'None' },
  { value: 'noise', label: 'Noise' },
  { value: 'congestion', label: 'Congestion' },
  { value: 'eval', label: 'Eval' },
]

/**
 * Legend copy only. The gradient itself is derived from `DIAGNOSTIC_RAMPS` at
 * render time — hard-coding it here is what let the legend drift from the mesh
 * colours before. `reversed` marks the legends whose GOOD end is the high end.
 */
const LEGENDS: Record<Exclude<OverlayChoice, null>, { label: string; low: string; high: string; reversed: boolean }> = {
  noise: { label: 'Noise exposure', low: 'Quiet 0', high: 'Loud 30+', reversed: false },
  congestion: { label: 'Elevator wait', low: 'No wait 0m', high: '20m+', reversed: false },
  eval: { label: 'Desirability', low: 'Vacant / 0', high: 'Strong 100', reversed: true },
}

export function OverlayToggles({ overlay, onSetOverlay, paletteMode = 'classic' }: OverlayTogglesProps): ReactElement {
  const legend = overlay === null ? null : LEGENDS[overlay]

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className="flex overflow-hidden rounded-lg bg-slate-950/70 text-[12px] shadow-lg backdrop-blur-sm"
        role="group"
        aria-label="Heatmap overlay, shortcut O cycles choices"
        title="Shortcut: O"
      >
        <span className="flex items-center bg-white/5 px-2 text-[10px] font-bold text-white/45">O</span>
        {OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            data-testid={`overlay-${option.value ?? 'none'}`}
            aria-pressed={overlay === option.value}
            onClick={() => onSetOverlay(option.value)}
            className={`px-3 py-1.5 font-bold transition-colors ${
              overlay === option.value ? 'bg-sky-500/80 text-slate-950' : 'text-white/70 hover:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {legend && (
        <div
          className="w-52 rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5 text-white shadow-lg backdrop-blur-sm"
          data-testid={`overlay-legend-${overlay}`}
        >
          <div className="pb-1 text-[10px] font-bold uppercase text-white/70">{legend.label}</div>
          <div
            className="h-1.5 w-full rounded-sm"
            data-testid="overlay-legend-ramp"
            style={{ background: cssRamp(paletteMode, legend.reversed) }}
          />
          <div className="mt-0.5 flex justify-between text-[9px] font-semibold text-white/55">
            <span>{legend.low}</span>
            <span>{legend.high}</span>
          </div>
        </div>
      )}
    </div>
  )
}
