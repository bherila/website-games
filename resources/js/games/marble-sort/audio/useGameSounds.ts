import { useEffect, useRef } from 'react'

import { type GameState } from '../gameEngine'
import {
  playBlockComplete,
  playBoxPop,
  playGameOver,
  playLevelWin,
  playMarbleClack,
  playPowerUp,
  playSlotDing,
} from './sfx'

/**
 * Watches consecutive game states and fires the matching sound effects.
 * Deliberately diff-based rather than wired into individual handlers so every
 * path into the engine (clicks, power-ups, belt ticks) sounds consistent.
 */
export function useGameSounds(state: GameState | null): void {
  const previousRef = useRef<GameState | null>(null)

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = state
    if (!state || !previous) {
      return
    }

    // Restart / level change: resync silently.
    if (state.level !== previous.level || state.moves < previous.moves) {
      return
    }

    if (state.fallingMarbles.length > previous.fallingMarbles.length) {
      playBoxPop()
    }

    const previousFallingIds = new Set(previous.fallingMarbles.map((marble) => marble.id))
    if (state.conveyor.some((marble) => previousFallingIds.has(marble.id))) {
      playMarbleClack()
    }

    const previousStacks = new Map(previous.sortingStacks.map((stack) => [stack.id, stack]))
    for (const stack of state.sortingStacks) {
      const before = previousStacks.get(stack.id)
      if (!before) {
        continue
      }
      const beforeTop = before.blocks[0]
      const afterTop = stack.blocks[0]
      if (beforeTop && afterTop && beforeTop.id === afterTop.id && afterTop.slotsFilled > beforeTop.slotsFilled) {
        playSlotDing(afterTop.slotsFilled - 1)
      } else if (beforeTop && (!afterTop || beforeTop.id !== afterTop.id)) {
        playBlockComplete()
      }
    }

    if (state.completedLevel && !previous.completedLevel) {
      playLevelWin()
    }

    if (state.gameOver && !previous.gameOver) {
      playGameOver()
    }

    if (state.conveyorCapacity > previous.conveyorCapacity && state.baseConveyorCapacity === previous.baseConveyorCapacity) {
      playPowerUp()
    }
  }, [state])
}
