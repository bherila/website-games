import type { InputSource, InputState } from './inputState'

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export interface TouchInputHandle {
  /** Same contract as the keyboard source — the engine can't tell them apart. */
  source: InputSource
  /** Called by the on-screen joystick with normalized [-1, 1] axes. */
  setStick(strafe: number, thrust: number): void
  setLook(turn: number, lookPitch: number): void
  setJumpHeld(held: boolean): void
  reset(): void
}

export function createTouchInput(): TouchInputHandle {
  const state: InputState = { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }

  return {
    source: {
      read(): InputState {
        return { ...state }
      },
      attach(): void {
        // The TouchControls component owns the DOM listeners.
      },
      detach(): void {
        state.thrust = 0
        state.strafe = 0
        state.turn = 0
        state.lookPitch = 0
        state.jumpHeld = false
      },
    },
    setStick(strafe: number, thrust: number): void {
      state.strafe = clampAxis(strafe)
      state.thrust = clampAxis(thrust)
    },
    setLook(turn: number, lookPitch: number): void {
      state.turn = clampAxis(turn)
      state.lookPitch = clampAxis(lookPitch)
    },
    setJumpHeld(held: boolean): void {
      state.jumpHeld = held
    },
    reset(): void {
      state.thrust = 0
      state.strafe = 0
      state.turn = 0
      state.lookPitch = 0
      state.jumpHeld = false
    },
  }
}

/** Combine keyboard + touch so either device drives the same InputState. */
export function mergeInputs(a: InputState, b: InputState): InputState {
  return {
    thrust: clampAxis(a.thrust + b.thrust),
    strafe: clampAxis(a.strafe + b.strafe),
    turn: clampAxis(a.turn + b.turn),
    lookPitch: clampAxis(a.lookPitch + b.lookPitch),
    jumpHeld: a.jumpHeld || b.jumpHeld,
  }
}

function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value))
}
