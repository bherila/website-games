import { useCallback, useState, useSyncExternalStore } from 'react'

import {
  exitAppFullscreen,
  isFullscreenActive,
  isFullscreenSupported,
  isStandaloneDisplayMode,
  requestAppFullscreen,
  subscribeFullscreenChange,
} from './fullscreen'

export interface FullscreenState {
  /** False on iPhone Safari (no Element Fullscreen API) and in installed PWAs (already chrome-less). */
  available: boolean
  active: boolean
  toggle: () => void
}

export function useFullscreen(): FullscreenState {
  const [available] = useState(() => isFullscreenSupported() && !isStandaloneDisplayMode())
  const active = useSyncExternalStore(
    subscribeFullscreenChange,
    isFullscreenActive,
    () => false,
  )
  const toggle = useCallback(() => {
    if (isFullscreenActive()) {
      void exitAppFullscreen()
    } else {
      void requestAppFullscreen()
    }
  }, [])
  return { available, active, toggle }
}
