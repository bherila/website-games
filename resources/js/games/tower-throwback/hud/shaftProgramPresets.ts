import { shaftDef } from '../engine/catalog'
import { defaultShaftProgram, type Shaft, type ShaftProgram } from '../gameTypes'

export type ShaftProgramPresetId = 'rush' | 'balanced' | 'offHoursLobby'

export interface ShaftProgramPreset {
  id: ShaftProgramPresetId
  label: string
  summary: string
}

export const SHAFT_PROGRAM_PRESETS: readonly ShaftProgramPreset[] = [
  {
    id: 'rush',
    label: 'Morning up / Evening down',
    summary: 'Weekday rush hours bias empty cars toward arrivals in the morning and exits in the evening.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    summary: 'All time slots answer calls evenly.',
  },
  {
    id: 'offHoursLobby',
    label: 'Off-hours to lobby',
    summary: 'Night service favors downward calls so idle traffic returns toward the lobby.',
  },
]

export function programForPreset(id: ShaftProgramPresetId): ShaftProgram {
  const program = defaultShaftProgram()
  switch (id) {
    case 'rush':
      program.weekday.morningRush = 'expressToTop'
      program.weekday.eveningRush = 'expressToBottom'
      return program
    case 'balanced':
      return program
    case 'offHoursLobby':
      program.weekday.night = 'expressToBottom'
      program.weekend.night = 'expressToBottom'
      return program
  }
}

export function sparseStopsWarning(shaft: Shaft): string | null {
  const span = Math.max(1, shaft.topFloor - shaft.bottomFloor + 1)
  const maxStops = shaftDef(shaft.kind).maxStops
  const recommended = maxStops === undefined ? Math.max(2, Math.ceil(span / 8)) : Math.min(maxStops, Math.max(2, Math.ceil(span / 8)))
  if (shaft.enabledStops.length >= recommended) {
    return null
  }
  return `Only ${shaft.enabledStops.length} stops are enabled across ${span} floors; riders may wait longer.`
}
