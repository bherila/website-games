/**
 * Displays the current tower's challenge code so it can be shared.
 *
 * The code is derived from the seed and lobby height already held in state —
 * it is a view of existing data, not new state, so there is nothing to persist.
 * Copy falls back to selecting the text when the clipboard API is unavailable
 * (insecure origin, denied permission), which is the common case on LAN dev
 * hosts and would otherwise look like a dead button.
 */
import { type ReactElement, useCallback, useRef, useState } from 'react'

import { formatChallengeCode } from '../challengeCode'

interface ChallengeCodeCardProps {
  code: string
}

type CopyState = 'idle' | 'copied' | 'failed'

export function ChallengeCodeCard({ code }: ChallengeCodeCardProps): ReactElement {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const codeRef = useRef<HTMLInputElement | null>(null)
  const formatted = formatChallengeCode(code)

  const copy = useCallback(() => {
    const field = codeRef.current
    field?.select()
    void (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.clipboard) {
          throw new Error('clipboard unavailable')
        }
        await navigator.clipboard.writeText(formatted)
        setCopyState('copied')
      } catch {
        // The text is already selected, so the player can still copy manually.
        setCopyState('failed')
      }
    })()
  }, [formatted])

  return (
    <div className="rounded-lg bg-white/5 p-3" data-testid="challenge-code-card">
      <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">CHALLENGE CODE</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={codeRef}
          readOnly
          data-testid="challenge-code-value"
          aria-label="Challenge code for this tower"
          value={formatted}
          className="min-w-0 flex-1 rounded bg-slate-950/70 px-2 py-1.5 font-mono text-[13px] tracking-widest text-white/85"
        />
        <button
          type="button"
          data-testid="challenge-code-copy"
          onClick={copy}
          className="rounded bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/85 hover:bg-white/20"
        >
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Select & copy' : 'Copy'}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-white/45">
        Share this to let someone start an identical tower — same seed, same lobby. It does not include your progress.
      </p>
    </div>
  )
}
