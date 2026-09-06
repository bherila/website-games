import type { ReactElement } from 'react'

import { PREVIEW_SCENARIOS, previewScenarioHref } from '../adapters/previewScenarios'
import { useRuntime } from './RuntimeContext'

export const PREVIEW_BANNER_TEXT = 'Preview build: progress is kept only in this browser, in a separate preview partition. Cloud persistence and provider audio are not connected yet.'

/** Always visible while the runtime is a preview. Says exactly what is and is not real. */
export function PreviewBanner({ compact = false }: { compact?: boolean }): ReactElement | null {
  const { scenario } = useRuntime()
  if (!scenario) return null
  return (
    <div
      role="status"
      data-testid="preview-banner"
      className="rounded-xl border border-[#ead7a4] bg-[#fbf3df] px-3 py-2 text-[13px] leading-snug text-[#5c4510]"
    >
      <p>
        <strong className="font-bold">Preview.</strong> {PREVIEW_BANNER_TEXT}
        {!compact && <> Personal alpha • synthetic voices planned.</>}
      </p>
      {!compact && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-semibold text-[#7a5a14]">
            Preview scenario: {scenario.label}
          </summary>
          <ul className="mt-1 grid gap-0.5 text-xs sm:grid-cols-2">
            {PREVIEW_SCENARIOS.map((item) => (
              <li key={item.id}>
                <a
                  className="underline decoration-dotted underline-offset-2 hover:text-[#2f3a44]"
                  href={previewScenarioHref(item.id)}
                  aria-current={item.id === scenario.id ? 'true' : undefined}
                  title={item.description}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
