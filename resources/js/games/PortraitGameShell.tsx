import { type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PortraitGameShellProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  /**
   * Opt-in, default `false` — the default keeps the hard 4:3 portrait width
   * lock in every orientation.
   *
   * When `true` the shell drops the 4:3 lock in landscape, where letterboxing
   * a portrait column wastes most of a landscape phone. Portrait framing is
   * unchanged. Both modes size with dynamic viewport units so mobile browser
   * chrome can't push the playfield off-screen.
   */
  allowLandscape?: boolean
}

const PORTRAIT_VIEWPORT_MAX_WIDTH = 'min(100vw, calc(100dvh * 3 / 4))'

export function PortraitGameShell({
  children,
  className,
  contentClassName,
  allowLandscape = false,
}: PortraitGameShellProps): ReactElement {
  return (
    <div className={cn('flex h-dvh w-full justify-center overflow-hidden', className)}>
      <div
        className={cn(
          'flex h-full min-w-0 flex-col',
          allowLandscape && 'max-w-[min(100vw,calc(100dvh*3/4))] landscape:max-w-none',
          contentClassName,
        )}
        data-testid="portrait-game-viewport"
        style={allowLandscape ? { width: '100%' } : { maxWidth: PORTRAIT_VIEWPORT_MAX_WIDTH, width: '100%' }}
      >
        {children}
      </div>
    </div>
  )
}
