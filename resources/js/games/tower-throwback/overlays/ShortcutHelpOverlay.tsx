import type { ReactElement } from 'react'

import { TOWER_SHORTCUT_BINDINGS } from '../useTowerKeyboardShortcuts'

interface ShortcutHelpOverlayProps {
  onClose: () => void
}

/**
 * Static keyboard cheat-sheet generated from the shared TOWER_SHORTCUT_BINDINGS
 * table so it can never drift from the keys the hook actually dispatches. As a
 * blocking surface it PAUSES the sim while open (TowerGame passes `paused` to
 * TowerScene); Esc and the `?` key both close it (handled by
 * useTowerKeyboardShortcuts), plus the close button here.
 */
export function ShortcutHelpOverlay({ onClose }: ShortcutHelpOverlayProps): ReactElement {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4"
      data-testid="shortcut-help"
      onClick={onClose}
    >
      <div
        className="w-[24rem] max-w-full rounded-2xl border border-white/15 bg-slate-900/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-bold tracking-widest text-white/80">KEYBOARD SHORTCUTS</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/20"
          >
            Esc
          </button>
        </div>
        <dl className="space-y-1.5">
          {TOWER_SHORTCUT_BINDINGS.map((binding) => (
            <div key={binding.keys} className="flex items-start gap-3" data-testid="shortcut-row">
              <dt className="w-24 shrink-0">
                <kbd className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-semibold text-white/90">
                  {binding.keys}
                </kbd>
              </dt>
              <dd className="min-w-0 text-[12px]">
                <span className="font-semibold text-white/90">{binding.label}</span>
                <span className="block text-white/55">{binding.description}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
