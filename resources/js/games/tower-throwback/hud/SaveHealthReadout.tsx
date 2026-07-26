/**
 * "Saving… / Saved / Save failed" plus the last successful write time.
 *
 * A failed save is the one state the player must never have to guess at, so it
 * is the only variant that is visually loud and stays on screen rather than
 * settling back to a neutral readout.
 */
import type { ReactElement } from 'react'

import { describeLastSaved, type SaveHealth } from '../saveHealth'

interface SaveHealthReadoutProps {
  health: SaveHealth
  /** Injected so the relative time is deterministic under test. */
  now: number
}

export function SaveHealthReadout({ health, now }: SaveHealthReadoutProps): ReactElement | null {
  if (health.status === 'idle' && health.lastSavedAt === null) {
    return null
  }

  const failed = health.status === 'failed'
  const label =
    health.status === 'saving'
      ? 'Saving…'
      : failed
        ? 'Save failed'
        : health.status === 'pending'
          ? 'Unsaved changes'
          : 'Saved'

  return (
    <div
      data-testid="save-health"
      data-status={health.status}
      role={failed ? 'alert' : 'status'}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold shadow backdrop-blur-sm ${
        failed ? 'bg-red-500/25 text-red-100' : 'bg-slate-950/70 text-white/70'
      }`}
    >
      <span aria-hidden="true">{failed ? '⚠' : health.status === 'saving' ? '⋯' : '✓'}</span>
      <span>{label}</span>
      {failed && health.error ? (
        <span className="text-red-100/80" data-testid="save-health-error">
          · {health.error}
        </span>
      ) : (
        <span className="text-white/40" data-testid="save-health-time">
          · {describeLastSaved(health.lastSavedAt, now)}
        </span>
      )}
    </div>
  )
}
