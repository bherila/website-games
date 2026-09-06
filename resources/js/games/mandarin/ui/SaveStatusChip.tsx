import type { ReactElement } from 'react'

import type { SaveState } from '../contracts/mandarin'
import { Chip } from './primitives'

export function saveStateLabel(state: SaveState): { label: string; tone: 'neutral' | 'jade' | 'amber' | 'slate' | 'rose' } {
  switch (state) {
    case 'local_preview': return { label: 'Local preview · this browser only', tone: 'amber' }
    case 'guest_local': return { label: 'Guest · kept in this browser (mock)', tone: 'neutral' }
    case 'saving': return { label: 'Saving… (mock account)', tone: 'slate' }
    case 'saved': return { label: 'Saved to mock account · nothing sent', tone: 'jade' }
    case 'offline': return { label: 'Offline · progress kept locally', tone: 'amber' }
    case 'sign_in_required': return { label: 'Sign-in required · saves rejected (mock)', tone: 'rose' }
    case 'conflict': return { label: 'Conflict · another device is ahead (mock)', tone: 'rose' }
  }
}

export function SaveStatusChip({ state }: { state: SaveState }): ReactElement {
  const { label, tone } = saveStateLabel(state)
  return <Chip tone={tone} className="max-w-full truncate" data-testid="save-status">{label}</Chip>
}
