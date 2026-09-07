/**
 * Resolves audio sources through the gateway, polls bounded pending states,
 * and plays through the single managed speech channel. Components never see
 * the gateway or the channel; they subscribe to `SourceStatus` and call
 * `play`. Codex swaps the gateway; this file should not need to change.
 */
import type { AudioResolution, AudioSourceRef, MandarinGateway } from '../contracts/mandarin'
import type { PlaybackOutcome } from '../domain/assessment'
import { type CourseIndex, sourceKey } from '../domain/course'
import type { Course } from '../domain/courseSchema'
import { findMandarinVoice, type SpeechSynthesisLike, watchVoices } from './deviceVoice'
import type { SfxPlayer, SfxRecipeId } from './sfxRecipes'
import type { SpeechChannel } from './speechChannel'

export type EffectiveDelivery = 'ready' | 'device_voice' | 'simulated' | null

export interface SourceStatus {
  key: string
  ref: AudioSourceRef
  /** Null until the first resolution request completes. */
  resolution: AudioResolution | null
  phase: 'idle' | 'resolving' | 'polling' | 'settled'
  pollCount: number
  /** What `play` will actually do for this source right now. */
  effectiveDelivery: EffectiveDelivery
  /** Transport-level failure (offline, aborted), separate from a contract `failed` state. */
  transportError: string | null
}

export interface AudioManagerSettings {
  speechVolume: number
  sfxVolume: number
  deviceVoicePreview: boolean
}

export interface AudioManager {
  /** Idempotently request resolution for sources that are not yet settled. */
  ensure(refs: readonly AudioSourceRef[]): void
  /** Explicit, bounded retry for failed / timed-out sources. */
  retry(ref: AudioSourceRef): void
  getStatus(ref: AudioSourceRef): SourceStatus
  /** Monotonic counter bumped on every status or playback change (for useSyncExternalStore). */
  getVersion(): number
  subscribe(listener: () => void): () => void
  /** Plays a playable source; returns `unavailable` when it is not playable yet. */
  play(ref: AudioSourceRef): Promise<PlaybackOutcome>
  stop(): void
  isSpeaking(): boolean
  /** The source currently being spoken, or null. Cleared on stop and on failure. */
  speakingSource(): AudioSourceRef | null
  playSfx(sfxId: string): void
  /** Call from a user gesture to unlock Web Audio before the first cue. */
  unlock(): void
  updateSettings(settings: Partial<AudioManagerSettings>): void
  deviceVoiceStatus(): { available: boolean; name: string | null }
  dispose(): void
}

export interface AudioManagerDeps {
  gateway: MandarinGateway<Course>
  course: CourseIndex
  channel: SpeechChannel
  sfx: SfxPlayer
  speechSynthesis: SpeechSynthesisLike | null
  settings: AudioManagerSettings
  /** Maximum polls per pending request before the client gives up (bounded wait). */
  maxPolls?: number
  minPollDelayMs?: number
  /** Upper bound on the server's retryAfterMs (tests shorten the wait). */
  maxPollDelayMs?: number
  /** Explicitly disable device voices regardless of what the browser reports (preview scenario). */
  deviceVoicesDisabled?: boolean
}

const DEFAULT_MAX_POLLS = 6
const DEFAULT_MIN_POLL_MS = 300
const SLOW_RATE = 0.7

export function createAudioManager(deps: AudioManagerDeps): AudioManager {
  const statuses = new Map<string, SourceStatus>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const listeners = new Set<() => void>()
  const controller = new AbortController()
  const maxPolls = deps.maxPolls ?? DEFAULT_MAX_POLLS
  const minPollDelay = deps.minPollDelayMs ?? DEFAULT_MIN_POLL_MS
  const maxPollDelay = deps.maxPollDelayMs ?? Number.POSITIVE_INFINITY
  let settings: AudioManagerSettings = { ...deps.settings }
  let disposed = false
  let version = 0
  let voice: SpeechSynthesisVoice | null = deps.deviceVoicesDisabled ? null : findMandarinVoice(deps.speechSynthesis)
  // What `play` last handed to the channel, so callers can follow the audio
  // rather than guess from an animation beat.
  let speaking: AudioSourceRef | null = null
  // Identifies the playback that owns `speaking`. Two taps on one button hand
  // `play` the very same `ref` object, so identity cannot tell the interrupted
  // first playback from the second one that superseded it — and the first one's
  // late `finish` would clear the line the second is still speaking.
  let speakingToken = 0
  const stopWatchingVoices = deps.deviceVoicesDisabled
    ? () => {}
    : watchVoices(deps.speechSynthesis, () => {
      voice = findMandarinVoice(deps.speechSynthesis)
      recomputeDeliveries()
      notify()
    })

  const notify = (): void => {
    version += 1
    for (const listener of listeners) listener()
  }
  const unsubscribeChannel = deps.channel.subscribe(() => notify())

  const deliveryFor = (resolution: AudioResolution | null): EffectiveDelivery => {
    if (!resolution) return null
    if (resolution.state === 'ready') return 'ready'
    if (resolution.state === 'preview') {
      return settings.deviceVoicePreview && voice ? 'device_voice' : 'simulated'
    }
    return null
  }

  const recomputeDeliveries = (): void => {
    for (const status of statuses.values()) {
      status.effectiveDelivery = deliveryFor(status.resolution)
    }
  }

  const statusFor = (ref: AudioSourceRef): SourceStatus => {
    const key = sourceKey(ref)
    let status = statuses.get(key)
    if (!status) {
      status = { key, ref, resolution: null, phase: 'idle', pollCount: 0, effectiveDelivery: null, transportError: null }
      statuses.set(key, status)
    }
    return status
  }

  const settle = (status: SourceStatus, resolution: AudioResolution): void => {
    status.resolution = resolution
    status.transportError = null
    status.effectiveDelivery = deliveryFor(resolution)
    if (resolution.state === 'queued' || resolution.state === 'generating') {
      status.phase = 'polling'
      schedulePoll(status, resolution.requestId, resolution.retryAfterMs)
    } else {
      status.phase = 'settled'
    }
    notify()
  }

  const timedOut = (status: SourceStatus): void => {
    status.phase = 'settled'
    status.resolution = {
      state: 'failed',
      source: status.ref,
      code: 'provider_unavailable',
      retryable: true,
      retryAfterMs: 2000,
      message: 'Still preparing after several checks. You can try again in a moment.',
    }
    status.effectiveDelivery = null
    notify()
  }

  const schedulePoll = (status: SourceStatus, requestId: string, retryAfterMs: number): void => {
    if (disposed) return
    clearTimer(status.key)
    if (status.pollCount >= maxPolls) {
      timedOut(status)
      return
    }
    const timer = setTimeout(() => {
      timers.delete(status.key)
      if (disposed) return
      status.pollCount += 1
      notify()
      deps.gateway.pollAudio(requestId, controller.signal).then(
        (resolution) => {
          if (disposed || status.phase !== 'polling') return
          settle(status, resolution)
        },
        (error: unknown) => {
          if (disposed || controller.signal.aborted) return
          transportFailure(status, error)
        },
      )
    }, Math.min(maxPollDelay, Math.max(minPollDelay, retryAfterMs)))
    timers.set(status.key, timer)
  }

  const transportFailure = (status: SourceStatus, error: unknown): void => {
    status.phase = 'settled'
    status.transportError = error instanceof Error ? error.message : 'Network request failed'
    status.resolution = {
      state: 'failed',
      source: status.ref,
      code: 'provider_unavailable',
      retryable: true,
      retryAfterMs: 1500,
      message: 'Could not reach the audio service. Check your connection and try again.',
    }
    status.effectiveDelivery = null
    notify()
  }

  const clearTimer = (key: string): void => {
    const timer = timers.get(key)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(key)
    }
  }

  const resolveBatch = (refs: readonly AudioSourceRef[]): void => {
    if (refs.length === 0 || disposed) return
    const pending = refs.map(statusFor)
    for (const status of pending) {
      status.phase = 'resolving'
      status.pollCount = 0
      status.transportError = null
    }
    notify()
    deps.gateway.resolveAudio({ ...deps.course.identity, sources: refs.map((ref) => ({ ...ref })) }, controller.signal).then(
      (response) => {
        if (disposed) return
        const byKey = new Map(response.results.map((resolution) => [sourceKey(resolution.source), resolution]))
        for (const status of pending) {
          const resolution = byKey.get(status.key)
          if (resolution) settle(status, resolution)
          else transportFailure(status, new Error('No resolution returned for source'))
        }
      },
      (error: unknown) => {
        if (disposed || controller.signal.aborted) return
        for (const status of pending) transportFailure(status, error)
      },
    )
  }

  const speechTextFor = (ref: AudioSourceRef): string | null => {
    if (ref.sourceKind === 'utterance') return deps.course.utteranceById.get(ref.sourceId)?.speechText ?? null
    if (ref.sourceKind === 'target') return deps.course.targetById.get(ref.sourceId)?.speechText ?? null
    if (ref.sourceKind === 'support') return deps.course.supportById.get(ref.sourceId)?.zh ?? null
    return null
  }

  return {
    ensure(refs) {
      const needed: AudioSourceRef[] = []
      for (const ref of refs) {
        const status = statusFor(ref)
        if (status.phase === 'idle') needed.push(ref)
      }
      for (let index = 0; index < needed.length; index += 16) {
        resolveBatch(needed.slice(index, index + 16))
      }
    },
    retry(ref) {
      const status = statusFor(ref)
      if (status.phase === 'resolving' || status.phase === 'polling') return
      clearTimer(status.key)
      status.phase = 'idle'
      status.resolution = null
      status.effectiveDelivery = null
      resolveBatch([ref])
    },
    getStatus: statusFor,
    getVersion: () => version,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async play(ref) {
      const status = statusFor(ref)
      if (status.phase === 'idle') resolveBatch([ref])
      const resolution = status.resolution
      if (!resolution || (resolution.state !== 'ready' && resolution.state !== 'preview')) {
        return 'unavailable'
      }
      const text = resolution.state === 'ready' ? null : speechTextFor(ref)
      if (resolution.state === 'preview' && text === null) return 'unavailable'
      // A new play supersedes the previous one, so the source flips before the
      // await: a rapid second tap must not leave the first line on screen.
      speaking = ref
      const token = (speakingToken += 1)
      notify()
      const finish = (outcome: PlaybackOutcome): PlaybackOutcome => {
        if (speakingToken === token) {
          speaking = null
          notify()
        }
        return outcome
      }
      if (resolution.state === 'ready') {
        return deps.channel.play({ kind: 'ready', url: resolution.url, volume: settings.speechVolume }).then(finish, (error: unknown) => {
          finish('failed')
          throw error
        })
      }
      const play = status.effectiveDelivery === 'device_voice' && voice
        ? deps.channel.play({ kind: 'device_voice', text: text!, voice, rate: ref.variant === 'slow' ? SLOW_RATE : 1, volume: settings.speechVolume })
        : deps.channel.play({ kind: 'simulated', text: text! })
      return play.then(finish, (error: unknown) => {
        finish('failed')
        throw error
      })
    },
    stop() {
      speaking = null
      speakingToken += 1
      deps.channel.stop()
      notify()
    },
    isSpeaking() {
      return deps.channel.isPlaying()
    },
    speakingSource() {
      return deps.channel.isPlaying() ? speaking : null
    },
    playSfx(sfxId) {
      // Cues never mask speech.
      if (deps.channel.isPlaying()) return
      const recipe = deps.course.course.sfx.find((sfx) => sfx.id === sfxId)?.recipe as SfxRecipeId | undefined
      if (!recipe) return
      deps.sfx.play(recipe, settings.sfxVolume)
    },
    unlock() {
      deps.sfx.unlock()
    },
    updateSettings(next) {
      settings = { ...settings, ...next }
      recomputeDeliveries()
      notify()
    },
    deviceVoiceStatus() {
      return { available: voice !== null, name: voice?.name ?? null }
    },
    dispose() {
      disposed = true
      controller.abort()
      for (const key of [...timers.keys()]) clearTimer(key)
      stopWatchingVoices()
      unsubscribeChannel()
      deps.channel.dispose()
      deps.sfx.dispose()
      listeners.clear()
    },
  }
}
