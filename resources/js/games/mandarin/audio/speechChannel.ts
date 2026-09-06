/**
 * The single managed speech channel. Exactly one thing speaks at a time:
 * a new play cancels the previous one, stale completion callbacks are ignored
 * via a generation token, and rejected `play()` promises (autoplay policy)
 * surface as `blocked` so the UI can offer a fresh user-gesture Play control.
 */
import type { PlaybackOutcome } from '../domain/assessment'
import type { SpeechSynthesisLike } from './deviceVoice'

export type PlaybackRequest =
  /** A real asset URL from a `ready` resolution. */
  | { kind: 'ready'; url: string; volume: number }
  /** Labelled device-voice preview; `rate` < 1 for the slow variant. */
  | { kind: 'device_voice'; text: string; voice: SpeechSynthesisVoice; rate: number; volume: number }
  /** No sound at all. Resolves after a short, text-length-based pause. */
  | { kind: 'simulated'; text: string }

export interface SpeechChannel {
  play(request: PlaybackRequest): Promise<PlaybackOutcome>
  stop(): void
  isPlaying(): boolean
  subscribe(listener: (playing: boolean) => void): () => void
  dispose(): void
}

export interface SpeechChannelDeps {
  createAudioElement?: () => HTMLAudioElement
  speechSynthesis?: SpeechSynthesisLike | null
  createUtterance?: (text: string) => SpeechSynthesisUtterance
  /** Simulated playback duration; tests shorten it. */
  simulatedDurationMs?: (text: string) => number
}

const DEVICE_VOICE_WATCHDOG_MS = 20_000

export function defaultSimulatedDuration(text: string): number {
  return Math.min(2500, 350 + text.length * 110)
}

export function createSpeechChannel(deps: SpeechChannelDeps = {}): SpeechChannel {
  let generation = 0
  let playing = false
  let cancelCurrent: (() => void) | null = null
  const listeners = new Set<(playing: boolean) => void>()

  const setPlaying = (next: boolean): void => {
    if (playing === next) return
    playing = next
    for (const listener of listeners) listener(next)
  }

  const finish = (token: number, resolve: (outcome: PlaybackOutcome) => void, outcome: PlaybackOutcome): void => {
    if (token !== generation) return // stale callback from a superseded playback
    cancelCurrent = null
    setPlaying(false)
    resolve(outcome)
  }

  const stop = (): void => {
    const cancel = cancelCurrent
    cancelCurrent = null
    if (cancel) cancel()
    setPlaying(false)
  }

  const play = (request: PlaybackRequest): Promise<PlaybackOutcome> => {
    stop()
    generation += 1
    const token = generation
    setPlaying(true)
    return new Promise<PlaybackOutcome>((resolve) => {
      if (request.kind === 'simulated') {
        const duration = (deps.simulatedDurationMs ?? defaultSimulatedDuration)(request.text)
        const timer = setTimeout(() => finish(token, resolve, 'simulated'), duration)
        cancelCurrent = () => {
          clearTimeout(timer)
          finish(token, resolve, 'interrupted')
        }
        return
      }

      if (request.kind === 'ready') {
        const create = deps.createAudioElement ?? (() => new Audio())
        let audio: HTMLAudioElement
        try {
          audio = create()
        } catch {
          finish(token, resolve, 'failed')
          return
        }
        audio.preload = 'auto'
        audio.volume = Math.min(1, Math.max(0, request.volume))
        const onEnded = (): void => finish(token, resolve, 'completed')
        const onError = (): void => finish(token, resolve, 'failed')
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)
        cancelCurrent = () => {
          audio.removeEventListener('ended', onEnded)
          audio.removeEventListener('error', onError)
          try {
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
          } catch {
            // ignore teardown errors
          }
          finish(token, resolve, 'interrupted')
        }
        audio.src = request.url
        let playPromise: Promise<void> | undefined
        try {
          playPromise = audio.play()
        } catch (error) {
          finish(token, resolve, isNotAllowed(error) ? 'blocked' : 'failed')
          return
        }
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.catch((error: unknown) => {
            if (token !== generation) return
            cancelCurrent = null
            finish(token, resolve, isNotAllowed(error) ? 'blocked' : 'failed')
          })
        }
        return
      }

      const synth = deps.speechSynthesis ?? null
      if (!synth) {
        finish(token, resolve, 'unavailable')
        return
      }
      const createUtterance = deps.createUtterance ?? ((text: string) => new SpeechSynthesisUtterance(text))
      let utterance: SpeechSynthesisUtterance
      try {
        utterance = createUtterance(request.text)
      } catch {
        finish(token, resolve, 'failed')
        return
      }
      utterance.voice = request.voice
      utterance.lang = request.voice.lang
      utterance.rate = request.rate
      utterance.volume = Math.min(1, Math.max(0, request.volume))
      const watchdog = setTimeout(() => {
        try {
          synth.cancel()
        } catch {
          // ignore
        }
        finish(token, resolve, 'failed')
      }, DEVICE_VOICE_WATCHDOG_MS)
      utterance.onend = () => {
        clearTimeout(watchdog)
        finish(token, resolve, 'completed')
      }
      utterance.onerror = (event) => {
        clearTimeout(watchdog)
        const reason = (event as SpeechSynthesisErrorEvent).error
        finish(token, resolve, reason === 'interrupted' || reason === 'canceled' ? 'interrupted' : 'failed')
      }
      cancelCurrent = () => {
        clearTimeout(watchdog)
        utterance.onend = null
        utterance.onerror = null
        try {
          synth.cancel()
        } catch {
          // ignore
        }
        finish(token, resolve, 'interrupted')
      }
      try {
        // Some engines queue behind a stuck utterance unless cancelled first.
        synth.cancel()
        synth.speak(utterance)
      } catch {
        clearTimeout(watchdog)
        finish(token, resolve, 'failed')
      }
    })
  }

  return {
    play,
    stop,
    isPlaying: () => playing,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      stop()
      listeners.clear()
    },
  }
}

function isNotAllowed(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'NotAllowedError'
}
