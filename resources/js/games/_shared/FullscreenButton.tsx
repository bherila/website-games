import { Maximize, Minimize } from 'lucide-react'
import { type ReactElement } from 'react'

import { cn } from '@/lib/utils'

import { BottomControlButton } from './GameControlPrimitives'
import { useFullscreen } from './useFullscreen'

/**
 * Fullscreen toggle for games that use the shared `GameBottomToolbar`.
 * Renders nothing where fullscreen is unavailable (iPhone Safari, installed
 * PWA), so consumers can include it unconditionally.
 */
export function FullscreenBottomControlButton(): ReactElement | null {
  const { active, available, toggle } = useFullscreen()
  if (!available) return null
  return (
    <span data-testid="fullscreen-toggle">
      <BottomControlButton
        active={active}
        disabled={false}
        icon={active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
        onClick={toggle}
      />
    </span>
  )
}

interface FullscreenIconButtonProps {
  className?: string
  iconClassName?: string
}

/**
 * Bare fullscreen toggle for games with bespoke HUDs; hosts style it via
 * `className`. Guarantees a 44px hit target and the repo focus ring, and
 * renders nothing where fullscreen is unavailable.
 */
export function FullscreenIconButton({ className, iconClassName }: FullscreenIconButtonProps): ReactElement | null {
  const { active, available, toggle } = useFullscreen()
  if (!available) return null
  const Icon = active ? Minimize : Maximize
  return (
    <button
      aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
      aria-pressed={active}
      className={cn(
        'flex min-h-11 min-w-11 items-center justify-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      data-testid="fullscreen-toggle"
      type="button"
      onClick={toggle}
    >
      <Icon aria-hidden="true" className={cn('size-5', iconClassName)} />
    </button>
  )
}
