import { type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface RunOverlayProps {
  children: ReactNode
  label: string
  testId: string
}

/** Dimmed modal layer shared by the win, game-over, and confirm overlays. */
export function RunOverlay({ children, label, testId }: RunOverlayProps): ReactElement {
  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm"
      data-testid={testId}
      role="dialog"
    >
      <div className="w-full max-w-xs rounded-3xl border border-white/70 bg-white/95 p-6 text-center shadow-2xl dark:border-white/10 dark:bg-slate-900/95">
        {children}
      </div>
    </div>
  )
}

interface OverlayButtonProps {
  label: string
  onClick: () => void
  primary?: boolean
  testId?: string
}

export function OverlayButton({ label, onClick, primary = false, testId }: OverlayButtonProps): ReactElement {
  return (
    <button
      className={cn(
        'min-h-11 flex-1 rounded-full px-4 py-2.5 text-sm font-black shadow-md transition active:scale-95',
        primary
          ? 'bg-amber-400 text-amber-950 hover:bg-amber-300'
          : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15',
      )}
      data-testid={testId}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
