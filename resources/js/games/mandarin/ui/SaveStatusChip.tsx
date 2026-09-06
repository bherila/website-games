import type { ReactElement } from 'react'

import type { SaveState } from '../contracts/mandarin'
import { Chip } from './primitives'
import { useRuntime } from './RuntimeContext'

export function saveStateLabel(state: SaveState, mock: boolean): { label: string; tone: 'neutral' | 'jade' | 'amber' | 'slate' | 'rose' } {
  const tag = mock ? ' (mock)' : ''
  switch (state) {
    case 'local_preview': return { label: 'Local preview · this browser only', tone: 'amber' }
    case 'guest_local': return { label: `Guest · kept in this browser${tag}`, tone: 'neutral' }
    case 'saving': return { label: mock ? 'Saving… (mock account)' : 'Saving…', tone: 'slate' }
    case 'saved': return { label: mock ? 'Saved to mock account · nothing sent' : 'Saved to your account', tone: 'jade' }
    case 'offline': return { label: 'Offline · progress kept locally', tone: 'amber' }
    case 'sign_in_required': return { label: `Sign-in required · saves not accepted${tag}`, tone: 'rose' }
    case 'conflict': return { label: `Conflict · another device is ahead${tag}`, tone: 'rose' }
  }
}

export function SaveStatusChip({ state }: { state: SaveState }): ReactElement {
  const { scenario } = useRuntime()
  const { label, tone } = saveStateLabel(state, scenario !== null)
  return <Chip tone={tone} className="max-w-full truncate" data-testid="save-status">{label}</Chip>
}
