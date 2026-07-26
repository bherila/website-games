/**
 * Input abstraction: the engine only ever sees an InputState, so alternate
 * sources (touch joystick, gamepad, drone AI) can be added without engine
 * changes — they just produce the same shape.
 */
export interface InputState {
  /** -1..1 — forward/reverse thrust (W/S). */
  thrust: number
  /** -1..1 — positive strafes left (A/D). */
  strafe: number
  /** -1..1 — positive rotates the view/craft left (Left/Right arrows). */
  turn: number
  /** -1..1 — positive looks up slightly (Up/Down arrows). */
  lookPitch: number
  /** True while the jump control is held; the engine edge-detects. */
  jumpHeld: boolean
}

export interface InputSource {
  read(): InputState
  attach(): void
  detach(): void
}

export function neutralInput(): InputState {
  return { thrust: 0, strafe: 0, turn: 0, lookPitch: 0, jumpHeld: false }
}

interface KeyboardInputOptions {
  /** Fired on Escape keydown (pause is a UI concern, not an engine input). */
  onPause?: () => void
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

const FORWARD_KEYS = ['KeyW']
const REVERSE_KEYS = ['KeyS']
const STRAFE_LEFT_KEYS = ['KeyA']
const STRAFE_RIGHT_KEYS = ['KeyD']
const TURN_LEFT_KEYS = ['ArrowLeft']
const TURN_RIGHT_KEYS = ['ArrowRight']
const LOOK_UP_KEYS = ['ArrowUp']
const LOOK_DOWN_KEYS = ['ArrowDown']
const JUMP_KEYS = ['Space']
const GAME_KEYS = new Set([
  ...FORWARD_KEYS,
  ...REVERSE_KEYS,
  ...STRAFE_LEFT_KEYS,
  ...STRAFE_RIGHT_KEYS,
  ...TURN_LEFT_KEYS,
  ...TURN_RIGHT_KEYS,
  ...LOOK_UP_KEYS,
  ...LOOK_DOWN_KEYS,
  ...JUMP_KEYS,
])

export function createKeyboardInput(options: KeyboardInputOptions = {}): InputSource {
  const target = options.target ?? (typeof window === 'undefined' ? null : window)
  const held = new Set<string>()

  const anyHeld = (codes: readonly string[]): boolean => codes.some((code) => held.has(code))

  const handleKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent
    if (key.code === 'Escape') {
      options.onPause?.()
      return
    }
    if (GAME_KEYS.has(key.code)) {
      key.preventDefault()
      held.add(key.code)
    }
  }

  const handleKeyUp = (event: Event): void => {
    const key = event as KeyboardEvent
    held.delete(key.code)
  }

  const handleBlur = (): void => {
    held.clear()
  }

  return {
    read(): InputState {
      const forward = anyHeld(FORWARD_KEYS) ? 1 : 0
      const reverse = anyHeld(REVERSE_KEYS) ? 1 : 0
      const strafeLeft = anyHeld(STRAFE_LEFT_KEYS) ? 1 : 0
      const strafeRight = anyHeld(STRAFE_RIGHT_KEYS) ? 1 : 0
      const turnLeft = anyHeld(TURN_LEFT_KEYS) ? 1 : 0
      const turnRight = anyHeld(TURN_RIGHT_KEYS) ? 1 : 0
      const lookUp = anyHeld(LOOK_UP_KEYS) ? 1 : 0
      const lookDown = anyHeld(LOOK_DOWN_KEYS) ? 1 : 0
      return {
        thrust: forward - reverse,
        strafe: strafeLeft - strafeRight,
        turn: turnLeft - turnRight,
        lookPitch: lookUp - lookDown,
        jumpHeld: anyHeld(JUMP_KEYS),
      }
    },
    attach(): void {
      target?.addEventListener('keydown', handleKeyDown)
      target?.addEventListener('keyup', handleKeyUp)
      target?.addEventListener('blur', handleBlur)
    },
    detach(): void {
      target?.removeEventListener('keydown', handleKeyDown)
      target?.removeEventListener('keyup', handleKeyUp)
      target?.removeEventListener('blur', handleBlur)
      held.clear()
    },
  }
}
