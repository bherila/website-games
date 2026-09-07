/**
 * A small blocking confirm for choices the learner should not make by accident.
 * Used where an action silently changes what a recorded answer means, so the
 * cost is stated before it is paid rather than discovered in the chip after.
 */
import { type ReactElement, useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { GameButton, MUTED, SectionTitle } from './primitives'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  testId?: string
}

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, testId = 'confirm-dialog' }: ConfirmDialogProps): ReactElement {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2f3a44]/50 p-0 sm:items-center sm:p-4" onClick={onCancel} data-testid={testId}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        aria-describedby={`${testId}-body`}
        className="w-full max-w-md rounded-t-2xl bg-[#f5efe3] p-4 shadow-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <SectionTitle className="mb-1"><span id={`${testId}-title`}>{title}</span></SectionTitle>
        <p id={`${testId}-body`} className={cn('text-sm', MUTED)}>{body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <GameButton variant="primary" size="lg" onClick={onConfirm} data-testid={`${testId}-confirm`}>{confirmLabel}</GameButton>
          <GameButton ref={cancelRef} variant="secondary" size="lg" onClick={onCancel} data-testid={`${testId}-cancel`}>{cancelLabel}</GameButton>
        </div>
      </div>
    </div>
  )
}
