import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useCallback, useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface DialogFocusOptions {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
  /** Omit for blockers, such as renderer failure, that require an explicit choice. */
  onEscape?: () => void
  /** Override returning to the element focused before the dialog opened. */
  onRestoreFocus?: () => void
}

interface DialogFocusResult {
  onDialogKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
  restoreFocus: () => void
}

/** Shared keyboard isolation, focus trap, initial focus, and focus restoration for blocking dialogs. */
export function useDialogFocus({
  dialogRef,
  initialFocusRef,
  onEscape,
  onRestoreFocus,
}: DialogFocusOptions): DialogFocusResult {
  const onEscapeRef = useRef(onEscape)
  const onRestoreFocusRef = useRef(onRestoreFocus)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const focusRestoredRef = useRef(false)

  useEffect(() => {
    onEscapeRef.current = onEscape
    onRestoreFocusRef.current = onRestoreFocus
  }, [onEscape, onRestoreFocus])

  const restoreFocus = useCallback((): void => {
    if (focusRestoredRef.current) {
      return
    }
    focusRestoredRef.current = true
    if (onRestoreFocusRef.current) {
      onRestoreFocusRef.current()
    } else {
      returnFocusRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    // Strict Mode replays setup/cleanup, so each setup re-arms restoration.
    focusRestoredRef.current = false
    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement
    }
    initialFocusRef.current?.focus()
    return restoreFocus
  }, [initialFocusRef, restoreFocus])

  const onDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>): void => {
    // No key originating inside a blocker should reach canvas/global gameplay handlers.
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.preventDefault()
      onEscapeRef.current?.()
      return
    }
    if (event.key !== 'Tab') {
      return
    }

    const dialog = dialogRef.current
    if (!dialog) {
      return
    }
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((element) => element.getAttribute('aria-hidden') !== 'true')
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }, [dialogRef])

  return { onDialogKeyDown, restoreFocus }
}
