/**
 * Game clock — day/minute advancement, day-phase mapping, and program-slot
 * helpers. Phase boundaries follow the spec's "Time & simulation" table; days
 * are 1-based with days 6–7 of each 7-day week as the weekend.
 */

import type { DayPhase, DirectionPriority, EngineState, GameClock, ProgramSlot, ShaftProgram } from '../gameTypes'
import { PHASE_TO_PROGRAM_SLOT } from '../gameTypes'

export const MINUTES_PER_DAY = 1440

/** Minute of day the daily occupancy pass runs. */
export const OCCUPANCY_PASS_MINUTE = 8 * 60

/** Phase start minutes, ascending; a minute belongs to the last started phase. */
const PHASE_STARTS: ReadonlyArray<readonly [number, DayPhase]> = [
  [0, 'night'],
  [6 * 60, 'morningRush'],
  [9 * 60 + 30, 'day'],
  [11 * 60 + 30, 'lunch'],
  [13 * 60 + 30, 'afternoon'],
  [17 * 60, 'eveningRush'],
  [19 * 60, 'evening'],
  [22 * 60, 'night'],
]

export function phaseOf(minute: number): DayPhase {
  let phase: DayPhase = 'night'
  for (const [start, next] of PHASE_STARTS) {
    if (minute >= start) {
      phase = next
    }
  }
  return phase
}

export function isWeekend(day: number): boolean {
  return ((day - 1) % 7) + 1 >= 6
}

export function programSlotFor(clock: GameClock): ProgramSlot {
  return PHASE_TO_PROGRAM_SLOT[phaseOf(clock.minute)]
}

/** Active elevator direction priority for a shaft program at the given clock. */
export function directionPriorityFor(program: ShaftProgram, clock: GameClock): DirectionPriority {
  const slots = isWeekend(clock.day) ? program.weekend : program.weekday
  return slots[programSlotFor(clock)]
}

export interface ClockAdvance {
  crossedMidnight: boolean
  crossedHour08: boolean
}

/**
 * Advances the clock by whole or fractional game-minutes. Multi-day jumps are
 * handled defensively: the flags report whether AT LEAST one midnight / 08:00
 * boundary was crossed (the engine settles once per flag, not per day).
 */
export function advanceClock(state: EngineState, gameMinutes: number): ClockAdvance {
  if (gameMinutes <= 0) {
    return { crossedMidnight: false, crossedHour08: false }
  }
  const before = state.clock.minute
  const total = before + gameMinutes
  const daysAdvanced = Math.floor(total / MINUTES_PER_DAY)
  const after = total - daysAdvanced * MINUTES_PER_DAY

  let crossedHour08: boolean
  if (daysAdvanced === 0) {
    crossedHour08 = before < OCCUPANCY_PASS_MINUTE && after >= OCCUPANCY_PASS_MINUTE
  } else if (daysAdvanced === 1) {
    crossedHour08 = before < OCCUPANCY_PASS_MINUTE || after >= OCCUPANCY_PASS_MINUTE
  } else {
    crossedHour08 = true
  }

  state.clock.day += daysAdvanced
  state.clock.minute = after
  return { crossedMidnight: daysAdvanced > 0, crossedHour08 }
}
