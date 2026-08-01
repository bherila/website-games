import { Bell, X } from 'lucide-react'
import type { ReactElement } from 'react'

import type { GameClock } from '../gameTypes'
import { clockTimeLabel } from './clockLabel'
import { type ToastItem, toastTypeStyles } from './Toasts'

export const TOAST_HISTORY_LIMIT = 50

export interface ToastHistoryItem {
  clock: GameClock
  sequence: number
  toast: ToastItem
}

export function appendToastHistory(
  history: ToastHistoryItem[],
  toasts: ToastItem[],
  clock: GameClock,
): ToastHistoryItem[] {
  const nextSequence = (history[0]?.sequence ?? 0) + toasts.length
  const incoming = [...toasts].reverse().map((toast, index) => ({
    clock: { ...clock },
    sequence: nextSequence - index,
    toast,
  }))
  return [...incoming, ...history].slice(0, TOAST_HISTORY_LIMIT)
}

function clockLabel(clock: GameClock): string {
  return `Day ${clock.day} · ${clockTimeLabel(clock.minute)}`
}

interface ToastHistoryButtonProps {
  count: number
  open: boolean
  onToggle: () => void
}

export function ToastHistoryButton({ count, open, onToggle }: ToastHistoryButtonProps): ReactElement {
  return (
    <button
      type="button"
      aria-label="Toggle recent events"
      aria-expanded={open}
      title="Recent events (R)"
      onClick={onToggle}
      className={`relative inline-flex size-9 items-center justify-center rounded-md shadow ${
        open ? 'bg-sky-400 text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <Bell aria-hidden="true" className="size-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
          {Math.min(count, TOAST_HISTORY_LIMIT)}
        </span>
      )}
    </button>
  )
}

interface ToastHistoryDrawerProps {
  history: ToastHistoryItem[]
  onClose: () => void
}

export function ToastHistoryDrawer({ history, onClose }: ToastHistoryDrawerProps): ReactElement {
  return (
    <aside
      aria-label="Recent events"
      className="fixed bottom-4 right-4 top-16 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-sm"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="text-sm font-bold">Recent events</h2>
        <button
          type="button"
          aria-label="Close recent events"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-white/50">No recent events</p>
        ) : (
          history.map(({ toast, clock, sequence }) => (
            <div key={sequence} className={`border-b px-3 py-2 text-sm ${toastTypeStyles[toast.type]}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 font-bold">{toast.title}</div>
                <time className="shrink-0 text-[10px] opacity-60">{clockLabel(clock)}</time>
              </div>
              {toast.body && <div className="text-[12px] opacity-80">{toast.body}</div>}
              {toast.details && toast.details.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] opacity-80" aria-label="Event details">
                  {toast.details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              )}
              {toast.unlocked && toast.unlocked.length > 0 && (
                <div className="mt-1 text-[11px] opacity-80">Unlocked: {toast.unlocked.join(', ')}</div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
