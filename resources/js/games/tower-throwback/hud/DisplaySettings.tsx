/**
 * Accessibility/display popover: colour-vision mode and motion preference.
 *
 * Both settings are presentation-only — they never touch engine state, the save
 * wire contract, or the rng stream. They live together because they answer the
 * same question ("can this player actually read/tolerate the default
 * presentation?") and neither warrants its own toolbar slot.
 */
import { type ReactElement, useEffect, useRef, useState } from 'react'

import type { DiagnosticPaletteMode, MotionPreference } from '../presentationPrefs'
import { cssRamp } from '../scene/diagnosticPalette'

interface DisplaySettingsProps {
  paletteMode: DiagnosticPaletteMode
  motion: MotionPreference
  /** Whether the resolved preference is currently reducing motion. */
  motionReduced: boolean
  onSetPaletteMode: (mode: DiagnosticPaletteMode) => void
  onSetMotion: (motion: MotionPreference) => void
}

const PALETTE_OPTIONS: Array<{ value: DiagnosticPaletteMode; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'colorSafe', label: 'Colour-safe' },
]

const MOTION_OPTIONS: Array<{ value: MotionPreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
]

export function DisplaySettings({
  paletteMode,
  motion,
  motionReduced,
  onSetPaletteMode,
  onSetMotion,
}: DisplaySettingsProps): ReactElement {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        data-testid="display-settings-toggle"
        aria-expanded={open}
        aria-label="Display and accessibility settings"
        title="Display and accessibility settings"
        onClick={() => setOpen((visible) => !visible)}
        className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-semibold shadow ${
          open ? 'bg-sky-500/80 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'
        }`}
      >
        <span aria-hidden="true">👁</span>
      </button>

      {open && (
        <div
          data-testid="display-settings-panel"
          role="group"
          aria-label="Display and accessibility settings"
          className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-white/10 bg-slate-950/95 p-3 text-white shadow-xl backdrop-blur-sm"
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Overlay colours</div>
          <div className="mt-1 flex overflow-hidden rounded-md bg-white/5 text-[12px]">
            {PALETTE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`palette-mode-${option.value}`}
                aria-pressed={paletteMode === option.value}
                onClick={() => onSetPaletteMode(option.value)}
                className={`flex-1 px-2 py-1 font-bold transition-colors ${
                  paletteMode === option.value ? 'bg-sky-500/80 text-slate-950' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div
            className="mt-1.5 h-1.5 w-full rounded-sm"
            data-testid="display-settings-ramp-preview"
            style={{ background: cssRamp(paletteMode) }}
          />
          <p className="mt-1 text-[10px] text-white/50">
            Colour-safe replaces the red/green diagnostic ramp with blue → orange.
          </p>

          <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-white/60">Motion</div>
          <div className="mt-1 flex overflow-hidden rounded-md bg-white/5 text-[12px]">
            {MOTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`motion-${option.value}`}
                aria-pressed={motion === option.value}
                onClick={() => onSetMotion(option.value)}
                className={`flex-1 px-2 py-1 font-bold transition-colors ${
                  motion === option.value ? 'bg-sky-500/80 text-slate-950' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-white/50" data-testid="motion-resolved">
            {motion === 'system'
              ? `Following your system setting (currently ${motionReduced ? 'reduced' : 'full'}).`
              : motionReduced
                ? 'Precipitation and glides are static.'
                : 'All presentation motion is on.'}
          </p>
        </div>
      )}
    </div>
  )
}
