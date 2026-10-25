import { Volume2, VolumeX } from 'lucide-react'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

/** One labelled mute control for every game: the label names the action, aria-pressed the state. */
export function SoundToggle({ muted, onMutedChange, className }: { muted: boolean, onMutedChange: (muted: boolean) => void, className?: string }): ReactElement {
  return (
    <button type="button" aria-label="Mute sound" aria-pressed={muted} title={muted ? 'Sound off' : 'Sound on'} onClick={() => onMutedChange(!muted)}
      className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full', className)}>
      {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
    </button>
  )
}
