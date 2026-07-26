import { safeLocalStorage } from '../../_shared/progressParsers'

const AUDIO_MUTED_STORAGE_KEY = 'bwh.tower-throwback.audio-muted.v1'
const AUDIO_LEVEL_STORAGE_KEY = 'bwh.tower-throwback.audio-level.v1'

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let muted = loadMuted()
let level = loadLevel()

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(1, Math.max(0, value))
}

/** Effective master gain: the stored level while unmuted, silence while muted. */
function targetGain(): number {
  return muted ? 0 : level
}

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
    masterGain.gain.value = targetGain()
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

/** Persisted master level in [0,1]; independent of the mute flag. */
export function getAudioLevel(): number {
  return level
}

function applyGain(): void {
  const gain = getMasterGain()
  const context = getAudioContext()
  if (gain && context) {
    gain.gain.setTargetAtTime(targetGain(), context.currentTime, 0.03)
  }
}

export function setAudioMuted(nextMuted: boolean): void {
  muted = nextMuted
  applyGain()

  try {
    safeLocalStorage()?.setItem(AUDIO_MUTED_STORAGE_KEY, muted ? '1' : '0')
  } catch {
    // Blocked/full storage — the preference just doesn't persist.
  }

  if (!muted) {
    ensureAudioRunning()
  }
}

/**
 * Set the master volume level, clamped to [0,1]. Unmuting restores this level
 * (mute never overwrites it), so the slider position survives a mute/unmute.
 */
export function setAudioLevel(nextLevel: number): void {
  level = clampLevel(nextLevel)
  applyGain()

  try {
    safeLocalStorage()?.setItem(AUDIO_LEVEL_STORAGE_KEY, String(level))
  } catch {
    // Blocked/full storage — the preference just doesn't persist.
  }

  if (!muted && level > 0) {
    ensureAudioRunning()
  }
}

/** Module-scope read — must never throw (blocked storage → default unmuted). */
function loadMuted(): boolean {
  try {
    return safeLocalStorage()?.getItem(AUDIO_MUTED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Module-scope read — must never throw (blocked/absent storage → full volume). */
function loadLevel(): number {
  try {
    const raw = safeLocalStorage()?.getItem(AUDIO_LEVEL_STORAGE_KEY)
    return raw === null || raw === undefined ? 1 : clampLevel(Number.parseFloat(raw))
  } catch {
    return 1
  }
}
