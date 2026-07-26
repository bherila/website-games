import { type ReactElement, useRef, useState } from 'react'

import type { TouchInputHandle } from '../input/touchInput'

const STICK_BASE_PX = 128
const STICK_KNOB_PX = 56
const STICK_TRAVEL_PX = (STICK_BASE_PX - STICK_KNOB_PX) / 2
const DEADZONE = 0.12
const LOOK_DRAG_PX = 96

interface TouchControlsProps {
  handle: TouchInputHandle
  onPause: () => void
  /** Whether the craft currently has jump power. Purely visual — the engine ignores jumps without power. */
  jumpEnabled?: boolean
}

/**
 * On-screen controls for touch devices: a drive joystick on the left
 * (up/down = thrust, left/right = strafe), drag-look across the playfield,
 * a JUMP button on the right, and a pause button. They write into the
 * shared touch InputState — the engine sees exactly what the keyboard produces.
 */
export function TouchControls({ handle, onPause, jumpEnabled = true }: TouchControlsProps): ReactElement {
  const baseRef = useRef<HTMLDivElement | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const lookPointerRef = useRef<number | null>(null)
  const lookStartRef = useRef({ x: 0, y: 0 })
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 })
  const [jumpPressed, setJumpPressed] = useState(false)

  const updateStick = (clientX: number, clientY: number): void => {
    const base = baseRef.current
    if (!base) {
      return
    }
    const rect = base.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    let dx = clientX - centerX
    let dy = clientY - centerY
    const dist = Math.hypot(dx, dy)
    if (dist > STICK_TRAVEL_PX) {
      dx = (dx / dist) * STICK_TRAVEL_PX
      dy = (dy / dist) * STICK_TRAVEL_PX
    }
    setKnobOffset({ x: dx, y: dy })

    const strafeRaw = -dx / STICK_TRAVEL_PX
    const thrustRaw = -dy / STICK_TRAVEL_PX
    handle.setStick(applyDeadzone(strafeRaw), applyDeadzone(thrustRaw))
  }

  const releaseStick = (): void => {
    activePointerRef.current = null
    setKnobOffset({ x: 0, y: 0 })
    handle.setStick(0, 0)
  }

  const updateLook = (clientX: number, clientY: number): void => {
    const dx = clientX - lookStartRef.current.x
    const dy = clientY - lookStartRef.current.y
    handle.setLook(applyDeadzone(-dx / LOOK_DRAG_PX), applyDeadzone(-dy / LOOK_DRAG_PX))
  }

  const releaseLook = (): void => {
    lookPointerRef.current = null
    handle.setLook(0, 0)
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-10 touch-none select-none"
      data-testid="touch-look-surface"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget || lookPointerRef.current !== null) {
          return
        }
        lookPointerRef.current = event.pointerId
        lookStartRef.current = { x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
        handle.setLook(0, 0)
      }}
      onPointerMove={(event) => {
        if (lookPointerRef.current === event.pointerId) {
          updateLook(event.clientX, event.clientY)
        }
      }}
      onPointerUp={(event) => {
        if (lookPointerRef.current === event.pointerId) {
          releaseLook()
        }
      }}
      onPointerCancel={(event) => {
        if (lookPointerRef.current === event.pointerId) {
          releaseLook()
        }
      }}
    >
      <div
        ref={baseRef}
        data-testid="touch-stick"
        className="pointer-events-auto absolute bottom-24 left-6 touch-none rounded-full border-2 border-white/25 bg-slate-950/40 backdrop-blur-sm"
        style={{ width: STICK_BASE_PX, height: STICK_BASE_PX }}
        onPointerDown={(event) => {
          activePointerRef.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          updateStick(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (activePointerRef.current === event.pointerId) {
            updateStick(event.clientX, event.clientY)
          }
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
      >
        <div
          data-testid="touch-stick-knob"
          className="absolute rounded-full bg-white/70 shadow-lg"
          style={{
            width: STICK_KNOB_PX,
            height: STICK_KNOB_PX,
            left: (STICK_BASE_PX - STICK_KNOB_PX) / 2 + knobOffset.x,
            top: (STICK_BASE_PX - STICK_KNOB_PX) / 2 + knobOffset.y,
          }}
        />
      </div>

      <button
        type="button"
        data-testid="touch-jump"
        aria-label={jumpEnabled ? 'Jump' : 'Jump (no jump power collected)'}
        className={`pointer-events-auto absolute right-6 bottom-28 size-20 touch-none rounded-full border-2 text-sm font-black tracking-widest backdrop-blur-sm ${jumpPressed ? 'border-yellow-200 bg-yellow-400/60 text-slate-900' : 'border-white/25 bg-slate-950/40 text-white/80'} ${jumpEnabled ? '' : 'opacity-40 saturate-50'}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setJumpPressed(true)
          handle.setJumpHeld(true)
        }}
        onPointerUp={() => {
          setJumpPressed(false)
          handle.setJumpHeld(false)
        }}
        onPointerCancel={() => {
          setJumpPressed(false)
          handle.setJumpHeld(false)
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        JUMP
      </button>

      <button
        type="button"
        aria-label="Pause"
        className="pointer-events-auto absolute top-3 left-1/2 ml-[calc(min(17vw,280px)+16px)] rounded-lg bg-slate-950/50 px-3 py-1.5 text-sm text-white/70 backdrop-blur-sm"
        onClick={onPause}
      >
        ⏸
      </button>
    </div>
  )
}

function applyDeadzone(value: number): number {
  if (Math.abs(value) < DEADZONE) {
    return 0
  }
  return (value - Math.sign(value) * DEADZONE) / (1 - DEADZONE)
}
