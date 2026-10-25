import { createMuteStorage } from '../../_shared/audio/muteStorage'

const mute = createMuteStorage('bwh.marble-sort.audio-muted.v1', 'flag')

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let muted = mute.load()

/**
 * Lazily created shared context. Returns null where WebAudio is unavailable
 * (SSR, jsdom tests) so every caller can no-op safely.
 */
export function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext
  }

  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextConstructor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext
  if (!AudioContextConstructor) {
    return null
  }

  audioContext = new AudioContextConstructor()

  return audioContext
}

export function getMasterGain(): GainNode | null {
  const context = getAudioContext()
  if (!context) {
    return null
  }

  if (!masterGain) {
    masterGain = context.createGain()
    masterGain.gain.value = muted ? 0 : 1
    masterGain.connect(context.destination)
  }

  return masterGain
}

/** Browsers keep the context suspended until a user gesture; call this from a
 * pointer handler to unlock playback. */
export function ensureAudioRunning(): void {
  const context = getAudioContext()
  if (context && context.state === 'suspended') {
    void context.resume()
  }
}

export function isAudioMuted(): boolean {
  return muted
}

export function setAudioMuted(nextMuted: boolean): void {
  muted = nextMuted
  const gain = getMasterGain()
  const context = getAudioContext()
  if (gain && context) {
    gain.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.03)
  }

  mute.save(muted)

  if (!muted) {
    ensureAudioRunning()
  }
}
