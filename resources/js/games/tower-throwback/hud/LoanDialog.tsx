import currency from 'currency.js'
import { type ReactElement, useRef, useState } from 'react'

import { maximumLoanOffer } from '../engine/economy'
import { TUNING } from '../gameTypes'
import { useDialogFocus } from '../overlays/dialogFocus'

interface LoanDialogProps {
  prompt: { shortfall: number; suggested: number }
  /** Loans already outstanding → this offer reads as a refinance. */
  hasLoans: boolean
  onAccept: (amount: number) => void
  onDecline: () => void
}

function money(value: number): string {
  return currency(value, { precision: 0 }).format()
}

/** Modal shown while pendingLoanPrompt is set; the sim never overdrafts. */
export function LoanDialog({ prompt, hasLoans, onAccept, onDecline }: LoanDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const declineButtonRef = useRef<HTMLButtonElement | null>(null)
  const { onDialogKeyDown } = useDialogFocus({
    dialogRef,
    initialFocusRef: declineButtonRef,
    onEscape: onDecline,
  })
  const increment = TUNING.economy.loanIncrement
  const [extraIncrements, setExtraIncrements] = useState(0)
  const maximum = maximumLoanOffer(prompt)
  const maximumExtraIncrements = Math.floor((maximum - prompt.suggested) / increment)
  const amount = prompt.suggested + Math.min(extraIncrements, maximumExtraIncrements) * increment

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-offer-title"
        onKeyDown={onDialogKeyDown}
        className="w-80 rounded-xl bg-slate-900 p-4 text-sm shadow-2xl"
      >
        <h3 id="loan-offer-title" className="font-bold">{hasLoans ? 'Refinance offer' : 'Loan offer'}</h3>
        <p className="mt-1 text-white/70">
          You're <span className="font-bold text-red-300" data-testid="shortfall">{money(prompt.shortfall)}</span> short. The
          bank offers interest-free credit, repaid at 5% of the balance per day.
        </p>

        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            data-testid="amount-down"
            aria-label="Decrease loan amount"
            disabled={extraIncrements === 0}
            onClick={() => setExtraIncrements((current) => Math.max(0, current - 1))}
            className="rounded bg-white/10 px-3 py-1 font-bold hover:bg-white/20 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-28 text-center text-lg font-bold tabular-nums" data-testid="amount">
            {money(amount)}
          </span>
          <button
            type="button"
            data-testid="amount-up"
            aria-label="Increase loan amount"
            disabled={extraIncrements >= maximumExtraIncrements}
            onClick={() => setExtraIncrements((current) => Math.min(maximumExtraIncrements, current + 1))}
            className="rounded bg-white/10 px-3 py-1 font-bold hover:bg-white/20 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="mt-1 text-center text-xs text-white/60">Maximum offer: {money(maximum)}</p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            data-testid="accept-loan"
            onClick={() => onAccept(amount)}
            className="flex-1 rounded bg-emerald-500/80 px-3 py-1.5 font-bold text-slate-950 hover:bg-emerald-400"
          >
            Accept
          </button>
          <button
            ref={declineButtonRef}
            type="button"
            data-testid="decline-loan"
            onClick={onDecline}
            className="flex-1 rounded bg-white/10 px-3 py-1.5 font-bold text-white/80 hover:bg-white/20"
          >
            Decline
          </button>
        </div>
      </section>
    </div>
  )
}
