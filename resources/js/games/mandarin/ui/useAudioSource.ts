import { useCallback, useEffect, useSyncExternalStore } from 'react'

import type { SourceStatus } from '../audio/audioManager'
import type { AudioSourceRef } from '../contracts/mandarin'
import type { PlaybackOutcome } from '../domain/assessment'
import { sourceKey } from '../domain/course'
import { useRuntime } from './RuntimeContext'

function useAudioVersion(): number {
  const { audio } = useRuntime()
  const subscribe = useCallback((listener: () => void) => audio.subscribe(listener), [audio])
  return useSyncExternalStore(subscribe, () => audio.getVersion(), () => 0)
}

/** Subscribes to one source's resolution state and requests it on mount. */
export function useSourceStatus(ref: AudioSourceRef | null): SourceStatus | null {
  const { audio } = useRuntime()
  const key = ref ? sourceKey(ref) : null
  useEffect(() => {
    if (ref) audio.ensure([ref])
    // The key identifies the ref; a new object with the same key is the same source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, key])
  useAudioVersion()
  return ref ? audio.getStatus(ref) : null
}

export function useSpeaking(): boolean {
  const { audio } = useRuntime()
  useAudioVersion()
  return audio.isSpeaking()
}

/** The source being spoken right now, so a view can follow the audio itself. */
export function useSpeakingSource(): AudioSourceRef | null {
  const { audio } = useRuntime()
  useAudioVersion()
  return audio.speakingSource()
}

export function usePlay(): (ref: AudioSourceRef) => Promise<PlaybackOutcome> {
  const { audio } = useRuntime()
  return useCallback((ref: AudioSourceRef) => audio.play(ref), [audio])
}
