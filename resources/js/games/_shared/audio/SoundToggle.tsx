import { Volume2, VolumeX } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { BottomControlButton } from '../GameControlPrimitives'

interface SoundToggleProps {
  muted: boolean
  onMutedChange: (muted: boolean) => void
  className?: string
  /** Replaces the speaker icon, for games with their own glyphs or a shortcut hint. */
  children?: ReactNode
  iconClassName?: string
  title?: string
}

/** The label names what a press does, the same way in every game. */
export function soundToggleLabel(muted: boolean): string {
  return muted ? 'Unmute sound' : 'Mute sound'
}

/** A standalone mute button for game headers and HUDs. */
export function SoundToggle({ muted, onMutedChange, className, children, iconClassName = 'size-[18px]', title }: SoundToggleProps): ReactElement {
  return (
    <button type="button" aria-label={soundToggleLabel(muted)} title={title} onClick={() => onMutedChange(!muted)}
      className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', className)}>
      {children ?? (muted ? <VolumeX aria-hidden="true" className={iconClassName} /> : <Volume2 aria-hidden="true" className={iconClassName} />)}
    </button>
  )
}

/** The mute control for games built on the shared bottom toolbar; muted reads as pressed. */
export function SoundBottomControlButton({ muted, onMutedChange }: Pick<SoundToggleProps, 'muted' | 'onMutedChange'>): ReactElement {
  return <BottomControlButton active={muted} disabled={false} icon={muted ? <VolumeX /> : <Volume2 />} label={soundToggleLabel(muted)} variant="ghost" onClick={() => onMutedChange(!muted)} />
}
