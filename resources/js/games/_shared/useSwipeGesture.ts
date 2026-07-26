import { type PointerEvent as ReactPointerEvent, type RefCallback, useCallback, useEffect, useRef } from 'react'

import { type SwipeDirection, swipeDirection } from './swipeInput'

/**
 * Shared press-drag-to-swipe plumbing for the grid games (2048, Chick's
 * Challenge). It turns a drag into a single directional swipe and hands back the
 * handlers to spread onto the board, plus a `boardRef` to attach to it.
 *
 * Touch and mouse/pen take deliberately different paths:
 *
 * - **Touch** is handled with *native, non-passive* `touchstart/move/end`
 *   listeners (attached via `boardRef`). Pointer Events are unreliable for touch
 *   on iOS Safari — `setPointerCapture` transfer is mis-honoured and a spurious
 *   `pointercancel`/`pointerleave` tears the gesture down before it crosses the
 *   threshold, so 2048/Chick's swipes did nothing on iPhone. Native touch dodges
 *   all of it, and `preventDefault()` on `touchmove` blocks scroll deterministically
 *   (React's delegated `onTouchMove` is passive, so its `preventDefault` is a no-op —
 *   the listeners must be native).
 * - **Mouse and pen** stay on Pointer Events, where capture and the stale-button
 *   guard behave correctly.
 *
 * The direction/threshold math stays in the DOM-free `swipeInput.ts`; this hook
 * only owns per-drag bookkeeping and the tap-vs-swipe split.
 */
interface GestureState {
  pointerId: number
  startX: number
  startY: number
  /**
   * Buttons held at pointer-down (mouse path only). A real mouse reports at
   * least one; we keep it to police a mouse whose button was released off the
   * element (see the mouse guard in `onPointerMove`).
   */
  startButtons: number
  /** `PointerEvent.pointerType` — 'mouse' | 'touch' | 'pen' | '' in jsdom. */
  pointerType: string
  fired: boolean
}

/** The minimum a tap handler needs — satisfied structurally by a React pointer event. */
export interface SwipePoint {
  clientX: number
  clientY: number
  currentTarget: HTMLElement
}

export interface SwipeGestureOptions {
  /** Minimum dominant-axis travel in px before a drag counts as a swipe. */
  threshold: number
  /** Fired once, when the drag first crosses the threshold. */
  onSwipe: (direction: SwipeDirection) => void
  /** Called on release for a gesture that never became a swipe (a tap). */
  onTap?: (point: SwipePoint) => void
  /** Called whenever a gesture ends (release or cancel), fired or not. */
  onGestureEnd?: () => void
  /** When false, a gesture never starts. Defaults true. */
  enabled?: boolean
}

export interface SwipeGestureHandlers {
  /** Attach to the board element; wires the native touch listeners. */
  boardRef: RefCallback<HTMLElement>
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void
}

/** Finds the tracked touch across both lists — `changedTouches` on end, `touches` mid-drag. */
function touchById(event: TouchEvent, identifier: number): Touch | null {
  for (const list of [event.changedTouches, event.touches]) {
    if (!list) {
      continue
    }
    for (let index = 0; index < list.length; index += 1) {
      const touch = list[index]
      if (touch && touch.identifier === identifier) {
        return touch
      }
    }
  }

  return null
}

export function useSwipeGesture(options: SwipeGestureOptions): SwipeGestureHandlers {
  const gestureRef = useRef<GestureState | null>(null)

  // Native touch listeners fire outside render, so they read the latest options
  // through a ref rather than closing over a stale render's copy.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const endGesture = (point: SwipePoint | null): void => {
    const gesture = gestureRef.current
    gestureRef.current = null

    optionsRef.current.onGestureEnd?.()

    if (point && gesture && !gesture.fired) {
      optionsRef.current.onTap?.(point)
    }
  }

  const boardRef = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) {
      return undefined
    }

    const handleTouchStart = (event: TouchEvent): void => {
      if (optionsRef.current.enabled === false || gestureRef.current !== null) {
        return
      }
      const touch = event.changedTouches?.[0] ?? event.touches?.[0]
      if (!touch) {
        return
      }
      gestureRef.current = {
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        startButtons: 0,
        pointerType: 'touch',
        fired: false,
      }
    }

    const handleTouchMove = (event: TouchEvent): void => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerType !== 'touch') {
        return
      }
      const touch = touchById(event, gesture.pointerId)
      if (!touch) {
        return
      }
      // Block the page scroll/rubber-band that would otherwise steal the drag.
      if (event.cancelable) {
        event.preventDefault()
      }
      if (gesture.fired) {
        return
      }
      const direction = swipeDirection(touch.clientX - gesture.startX, touch.clientY - gesture.startY, optionsRef.current.threshold)
      if (!direction) {
        return
      }
      gesture.fired = true
      optionsRef.current.onSwipe(direction)
    }

    const handleTouchEnd = (event: TouchEvent): void => {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerType !== 'touch') {
        return
      }
      const touch = touchById(event, gesture.pointerId)
      const point: SwipePoint | null = touch
        ? { clientX: touch.clientX, clientY: touch.clientY, currentTarget: element }
        : null
      endGesture(point)
    }

    const handleTouchCancel = (): void => {
      if (gestureRef.current?.pointerType === 'touch') {
        endGesture(null)
      }
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd)
    element.addEventListener('touchcancel', handleTouchCancel)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('touchcancel', handleTouchCancel)
      gestureRef.current = null
    }
    // Stable: the listeners read live state through `optionsRef` / `gestureRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    boardRef,

    onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
      // Touch is served by the native listeners above; ignore its Pointer Events
      // so a swipe is never processed twice.
      if (event.pointerType === 'touch') {
        return
      }
      if (optionsRef.current.enabled === false || event.isPrimary === false) {
        return
      }
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startButtons: event.buttons,
        pointerType: event.pointerType,
        fired: false,
      }
      // A mouse doesn't get implicit capture: without this the element stops
      // seeing the drag once the cursor leaves it. (Touch never reaches here.)
      const target = event.currentTarget
      if (typeof target.setPointerCapture === 'function') {
        try {
          target.setPointerCapture(event.pointerId)
        } catch {
          // Capture is an optimisation; the move/end guards stand in for it.
        }
      }
    },

    onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
      const gesture = gestureRef.current
      if (!gesture || gesture.pointerType === 'touch' || gesture.fired) {
        return
      }
      if (event.pointerId !== undefined && gesture.pointerId !== event.pointerId) {
        return
      }
      // A mouse that released its button off the element keeps streaming moves
      // at `buttons === 0`; drop that stale drag.
      if (gesture.pointerType === 'mouse' && gesture.startButtons > 0 && event.buttons === 0) {
        endGesture(null)

        return
      }
      const direction = swipeDirection(event.clientX - gesture.startX, event.clientY - gesture.startY, optionsRef.current.threshold)
      if (!direction) {
        return
      }
      gesture.fired = true
      optionsRef.current.onSwipe(direction)
    },

    onPointerUp(event: ReactPointerEvent<HTMLElement>): void {
      if (gestureRef.current?.pointerType === 'touch') {
        return
      }
      endGesture({ clientX: event.clientX, clientY: event.clientY, currentTarget: event.currentTarget })
    },

    onPointerCancel(event: ReactPointerEvent<HTMLElement>): void {
      if (gestureRef.current?.pointerType === 'touch') {
        return
      }
      endGesture(null)
    },

    onPointerLeave(event: ReactPointerEvent<HTMLElement>): void {
      if (gestureRef.current?.pointerType === 'touch') {
        return
      }
      endGesture(null)
    },
  }
}
