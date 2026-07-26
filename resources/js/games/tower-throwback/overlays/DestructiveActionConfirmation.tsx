import type { ReactElement } from 'react'

interface DestructiveActionConfirmationProps {
  confirmLabel: string
  description: string
  onCancel: () => void
  onConfirm: () => void
  title: string
}

/** Shared inline guard for save operations that replace or discard player state. */
export function DestructiveActionConfirmation({
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
}: DestructiveActionConfirmationProps): ReactElement {
  return (
    <div className="rounded-lg border border-red-400/50 bg-red-950/60 p-3" role="alertdialog" aria-label={title}>
      <div className="font-bold text-red-100">{title}</div>
      <p className="mt-1 text-[12px] text-red-100/75">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="confirm-destructive-action"
          onClick={onConfirm}
          className="rounded bg-red-500/85 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-400"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          data-testid="cancel-destructive-action"
          onClick={onCancel}
          className="rounded bg-white/10 px-3 py-1.5 text-sm font-bold text-white/75 hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
