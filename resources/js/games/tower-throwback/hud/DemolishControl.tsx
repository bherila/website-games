/**
 * Confirm-gated demolition control for the inspector.
 *
 * Demolition is irreversible and refunds only a fraction of the build cost, so
 * the first click arms an inline `DestructiveActionConfirmation` rather than
 * enqueueing the command. Cancelling returns focus to the trigger so keyboard
 * users are not stranded at the top of the panel.
 */
import { type ReactElement, useCallback, useRef, useState } from 'react'

import { DestructiveActionConfirmation } from '../overlays/DestructiveActionConfirmation'

interface DemolishControlProps {
  /** Human-readable name of the thing being demolished, e.g. "Office (medium)". */
  name: string
  /** Pre-formatted refund, e.g. "$1,200". */
  refund: string
  /** Where it sits, e.g. "Floor 12" — disambiguates identical units. */
  location: string
  onDemolish: () => void
}

export function DemolishControl({ name, refund, location, onDemolish }: DemolishControlProps): ReactElement {
  const [armed, setArmed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const cancel = useCallback(() => {
    setArmed(false)
    // Focus must return synchronously after the trigger remounts; a microtask
    // is enough because React commits the state change before it resolves.
    void Promise.resolve().then(() => triggerRef.current?.focus())
  }, [])

  const confirm = useCallback(() => {
    setArmed(false)
    onDemolish()
  }, [onDemolish])

  if (armed) {
    return (
      <DestructiveActionConfirmation
        title={`Demolish ${name}?`}
        description={`${location} · this cannot be undone. You get back ${refund} of the build cost.`}
        confirmLabel={`Demolish · refund ${refund}`}
        onCancel={cancel}
        onConfirm={confirm}
      />
    )
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      data-testid="demolish"
      onClick={() => setArmed(true)}
      aria-label={`Demolish ${name} on ${location}, refund ${refund}`}
      className="w-full rounded bg-red-500/25 px-2 py-1 text-[12px] font-bold text-red-200 hover:bg-red-500/40"
    >
      Demolish · refund {refund}
    </button>
  )
}
