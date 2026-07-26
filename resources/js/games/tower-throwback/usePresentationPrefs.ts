/**
 * React binding for the presentation-only preferences in `presentationPrefs.ts`
 * plus the live `prefers-reduced-motion` media query.
 *
 * `motionReduced` is the RESOLVED answer the scene should act on: an explicit
 * player override wins, otherwise the OS setting does — and the OS setting is
 * subscribed to, not sampled once, so toggling it mid-session takes effect
 * without a reload.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  type DiagnosticPaletteMode,
  loadPresentationPrefs,
  type MotionPreference,
  type PresentationPrefs,
  savePresentationPrefs,
} from './presentationPrefs'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export interface PresentationPrefsBinding extends PresentationPrefs {
  /** Resolved from the preference + the OS setting; what the scene obeys. */
  motionReduced: boolean
  setDiagnosticPalette: (mode: DiagnosticPaletteMode) => void
  setMotion: (motion: MotionPreference) => void
}

function matchReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches
  } catch {
    return false
  }
}

export function usePresentationPrefs(): PresentationPrefsBinding {
  const [prefs, setPrefs] = useState<PresentationPrefs>(loadPresentationPrefs)
  const [systemReduced, setSystemReduced] = useState<boolean>(matchReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    let query: MediaQueryList
    try {
      query = window.matchMedia(REDUCED_MOTION_QUERY)
    } catch {
      return
    }
    const onChange = (event: MediaQueryListEvent): void => setSystemReduced(event.matches)
    setSystemReduced(query.matches)
    // Safari < 14 only has the deprecated listener API; support both so the
    // preference is not silently ignored on older WebKit.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    }
    query.addListener(onChange)
    return () => query.removeListener(onChange)
  }, [])

  const update = useCallback((patch: Partial<PresentationPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      savePresentationPrefs(next)
      return next
    })
  }, [])

  const setDiagnosticPalette = useCallback(
    (diagnosticPalette: DiagnosticPaletteMode) => update({ diagnosticPalette }),
    [update],
  )
  const setMotion = useCallback((motion: MotionPreference) => update({ motion }), [update])

  const motionReduced = prefs.motion === 'system' ? systemReduced : prefs.motion === 'reduced'

  return useMemo(
    () => ({ ...prefs, motionReduced, setDiagnosticPalette, setMotion }),
    [motionReduced, prefs, setDiagnosticPalette, setMotion],
  )
}
