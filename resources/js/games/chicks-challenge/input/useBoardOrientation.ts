/**
 * Measures the board's available box and applies the pure rotation rule from
 * `orientation.ts`. The measurement side lives here (ResizeObserver on the board
 * area plus `visualViewport` so mobile browser chrome / on-screen keyboards are
 * accounted for, plus `screen.orientation.angle` for which way a turned board
 * should turn); every decision stays in the pure module.
 */
import { type RefCallback, useEffect, useRef, useState } from 'react'

import {
  type BoardOrientationPreference,
  type BoardQuarterTurns,
  type Box,
  chooseQuarterTurns,
  clampBoxToVisualViewport,
  rotatedTurnsForDeviceAngle,
} from './orientation'

/**
 * `screen.orientation.angle`, or `null` wherever it cannot be read: the API is
 * absent in older browsers and in jsdom, and a hostile/partial implementation
 * could throw or report a non-number. Callers treat `null` as "unknown" and fall
 * back to the clockwise default, so this never blocks a rotation.
 */
function readDeviceOrientationAngle(): number | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const angle = (window.screen as Screen | undefined)?.orientation?.angle

    return typeof angle === 'number' ? angle : null
  } catch {
    return null
  }
}

/** The `ScreenOrientation` object when the browser has one, for its `change` event. */
function screenOrientation(): ScreenOrientation | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return (window.screen as Screen | undefined)?.orientation ?? null
  } catch {
    return null
  }
}

interface UseBoardOrientationArgs {
  /**
   * Identity of the level in play, or `null` on the level-select screen. The
   * hysteresis anchor is keyed on this (not on the board's dimensions), so two
   * consecutive levels that happen to be the same size are each decided fresh.
   */
  levelId: number | null
  /** Board width in tiles; 0 when no level is loaded. */
  cols: number
  /** Board height in tiles; 0 when no level is loaded. */
  rows: number
  preference: BoardOrientationPreference
}

interface UseBoardOrientationResult {
  /**
   * Attach to the element that bounds the playfield — the box that gets measured.
   * A callback ref (not a RefObject) so measurement starts when the playfield
   * mounts, which happens after this hook's first render: the board only exists
   * while a level is in play.
   */
  areaRef: RefCallback<HTMLDivElement>
  quarterTurns: BoardQuarterTurns
  /** Size for the rotated board container: the measured box, axes swapped when rotated. `null` until measured. */
  box: Box | null
}

function sameBox(a: Box | null, b: Box): boolean {
  return a !== null && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5
}

export function useBoardOrientation({
  levelId,
  cols,
  rows,
  preference,
}: UseBoardOrientationArgs): UseBoardOrientationResult {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [area, setArea] = useState<Box | null>(null)
  const [deviceAngle, setDeviceAngle] = useState<number | null>(readDeviceOrientationAngle)
  const [quarterTurns, setQuarterTurns] = useState<BoardQuarterTurns>(0)
  const lastLevelKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!element || typeof window === 'undefined') {
      return undefined
    }

    const measure = (): void => {
      const rect = element.getBoundingClientRect()
      const next = clampBoxToVisualViewport({ width: rect.width, height: rect.height }, window.visualViewport)
      setArea((previous) => (sameBox(previous, next) ? previous : next))
      setDeviceAngle(readDeviceOrientationAngle())
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const visual = window.visualViewport
    visual?.addEventListener('resize', measure)
    visual?.addEventListener('scroll', measure)
    // The screen-orientation change can land without any box change at all (a
    // rotation-locked viewport keeps its size), so it needs its own listener.
    const orientation = screenOrientation()
    orientation?.addEventListener('change', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      visual?.removeEventListener('resize', measure)
      visual?.removeEventListener('scroll', measure)
      orientation?.removeEventListener('change', measure)
    }
  }, [element])

  // Keyed on the level, not just its shape: two consecutive levels can share
  // dimensions, and inheriting the first one's rotation as the second one's
  // sticky anchor would open it rotated where a fresh decision picks upright.
  const levelKey = levelId === null || cols <= 0 || rows <= 0 ? null : `${levelId}:${cols}x${rows}`
  const rotatedTurns = rotatedTurnsForDeviceAngle(deviceAngle)

  useEffect(() => {
    // Leaving a level (level select) drops the anchor, so returning to a level —
    // or starting a same-sized one — is decided fresh.
    if (levelKey === null) {
      lastLevelKeyRef.current = null

      return
    }
    if (!area) {
      return
    }

    // Hysteresis is per level: a new board is decided from upright rather than
    // inheriting the previous level's rotation as its sticky anchor.
    const isNewLevel = lastLevelKeyRef.current !== levelKey
    lastLevelKeyRef.current = levelKey

    setQuarterTurns((current) =>
      chooseQuarterTurns({
        viewport: area,
        board: { cols, rows },
        current: isNewLevel ? 0 : current,
        preference,
        rotatedTurns,
      }),
    )
  }, [area, levelKey, cols, rows, preference, rotatedTurns])

  const box: Box | null = area === null ? null : quarterTurns === 0 ? area : { width: area.height, height: area.width }

  return { areaRef: setElement, quarterTurns, box }
}
