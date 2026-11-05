import { type ReactElement, useRef, useState } from 'react'

import type { SandboxSlotId } from '../gameTypes'
import { DestructiveActionConfirmation } from './DestructiveActionConfirmation'

interface LocalSlotTakeoverProps {
  slotId: SandboxSlotId
  label: string
  onTakeOver: (slotId: SandboxSlotId) => void
}

/** Recover a closed tab's persistent owner marker, or deliberately stop a live tab. */
export function LocalSlotTakeover({ slotId, label, onTakeOver }: LocalSlotTakeoverProps): ReactElement {
  const [confirming, setConfirming] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  return (
    <div className="mt-2">
      <p className="text-[11px] text-amber-100/80">Another browser tab last opened this slot. If that tab is closed, take over to use it here.</p>
      {confirming && (
        <DestructiveActionConfirmation
          title={`Take over ${label} in this browser?`}
          description="The saved tower will stay intact. If the other tab is still open, it will stop autosaving this slot."
          confirmLabel="Take over slot"
          onConfirm={() => {
            setConfirming(false)
            onTakeOver(slotId)
          }}
          onCancel={() => {
            setConfirming(false)
            buttonRef.current?.focus()
          }}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        data-testid={`local-takeover-${slotId}`}
        onClick={() => setConfirming(true)}
        className="mt-1 min-h-11 rounded bg-amber-500/20 px-3 py-1.5 text-sm font-bold text-amber-100 hover:bg-amber-500/35"
      >
        Take over in this browser
      </button>
    </div>
  )
}
