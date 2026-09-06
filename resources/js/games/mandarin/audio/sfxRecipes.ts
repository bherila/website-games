/**
 * The four procedural cues from the course's `sfx` list, described as data so
 * Codex can render identical WAV files server-side. Every recipe is short,
 * low-amplitude and never plays over speech (the manager defers/skips cues
 * while the speech channel is busy).
 *
 * Timing is relative to the cue start in milliseconds. Gains are linear
 * peak amplitudes before the SFX volume control. Envelopes: linear attack,
 * exponential decay to -80 dB at `durationMs`.
 */

export type SfxRecipeId = 'soft-wood-tap-v1' | 'two-note-soft-chime-v1' | 'soft-neutral-pluck-v1' | 'three-note-resolve-v1'

export type SfxStep =
  | { kind: 'tone'; wave: OscillatorType; frequencyHz: number; endFrequencyHz?: number; startMs: number; durationMs: number; gain: number; attackMs: number }
  | { kind: 'noise'; filter: 'bandpass' | 'lowpass'; frequencyHz: number; q: number; startMs: number; durationMs: number; gain: number; attackMs: number; seed: number }

export interface SfxRecipe {
  id: SfxRecipeId
  description: string
  totalMs: number
  steps: readonly SfxStep[]
}

export const SFX_RECIPES: Record<SfxRecipeId, SfxRecipe> = {
  'soft-wood-tap-v1': {
    id: 'soft-wood-tap-v1',
    description: 'Quiet tactile tap: a 40 ms band-passed noise click over a short falling sine thump.',
    totalMs: 90,
    steps: [
      { kind: 'noise', filter: 'bandpass', frequencyHz: 1800, q: 2.5, startMs: 0, durationMs: 40, gain: 0.18, attackMs: 1, seed: 7 },
      { kind: 'tone', wave: 'sine', frequencyHz: 180, endFrequencyHz: 110, startMs: 0, durationMs: 70, gain: 0.16, attackMs: 2 },
    ],
  },
  'two-note-soft-chime-v1': {
    id: 'two-note-soft-chime-v1',
    description: 'Positive feedback: E5 then G5 sines, soft attack, quick decay. Plays only after speech has stopped.',
    totalMs: 330,
    steps: [
      { kind: 'tone', wave: 'sine', frequencyHz: 659.26, startMs: 0, durationMs: 160, gain: 0.14, attackMs: 6 },
      { kind: 'tone', wave: 'sine', frequencyHz: 783.99, startMs: 130, durationMs: 200, gain: 0.14, attackMs: 6 },
    ],
  },
  'soft-neutral-pluck-v1': {
    id: 'soft-neutral-pluck-v1',
    description: 'Neutral help/incorrect cue: one muted A4 triangle pluck. No buzzer, no descending “wrong” interval.',
    totalMs: 190,
    steps: [
      { kind: 'tone', wave: 'triangle', frequencyHz: 440, startMs: 0, durationMs: 180, gain: 0.12, attackMs: 3 },
    ],
  },
  'three-note-resolve-v1': {
    id: 'three-note-resolve-v1',
    description: 'Scene complete: C5, E5, G5 sines 180 ms apart, the last held slightly longer.',
    totalMs: 760,
    steps: [
      { kind: 'tone', wave: 'sine', frequencyHz: 523.25, startMs: 0, durationMs: 240, gain: 0.13, attackMs: 8 },
      { kind: 'tone', wave: 'sine', frequencyHz: 659.26, startMs: 180, durationMs: 240, gain: 0.13, attackMs: 8 },
      { kind: 'tone', wave: 'sine', frequencyHz: 783.99, startMs: 360, durationMs: 380, gain: 0.13, attackMs: 8 },
    ],
  },
}

/** Deterministic noise so a server render matches the browser preview. */
function seededNoise(length: number, seed: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(new ArrayBuffer(length * 4))
  let state = seed >>> 0 || 1
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    out[index] = ((state >>> 0) / 4294967296) * 2 - 1
  }
  return out
}

/** Schedules a recipe on a Web Audio graph. `destination` carries the SFX volume. */
export function scheduleRecipe(context: BaseAudioContext, destination: AudioNode, recipe: SfxRecipe, startAt: number): void {
  for (const step of recipe.steps) {
    const start = startAt + step.startMs / 1000
    const end = start + step.durationMs / 1000
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(step.gain, start + step.attackMs / 1000)
    envelope.gain.exponentialRampToValueAtTime(0.0001, end)
    envelope.connect(destination)

    if (step.kind === 'tone') {
      const oscillator = context.createOscillator()
      oscillator.type = step.wave
      oscillator.frequency.setValueAtTime(step.frequencyHz, start)
      if (step.endFrequencyHz !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, step.endFrequencyHz), end)
      }
      oscillator.connect(envelope)
      oscillator.start(start)
      oscillator.stop(end + 0.02)
      oscillator.onended = () => {
        oscillator.disconnect()
        envelope.disconnect()
      }
    } else {
      const frames = Math.max(1, Math.ceil((step.durationMs / 1000) * context.sampleRate))
      const buffer = context.createBuffer(1, frames, context.sampleRate)
      buffer.copyToChannel(seededNoise(frames, step.seed), 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      const filter = context.createBiquadFilter()
      filter.type = step.filter
      filter.frequency.value = step.frequencyHz
      filter.Q.value = step.q
      source.connect(filter)
      filter.connect(envelope)
      source.start(start)
      source.stop(end + 0.02)
      source.onended = () => {
        source.disconnect()
        filter.disconnect()
        envelope.disconnect()
      }
    }
  }
}

export interface SfxPlayer {
  play(recipeId: SfxRecipeId, volume: number): void
  /** Resume a suspended context from a user gesture. */
  unlock(): void
  /** True when Web Audio exists in this environment. */
  available(): boolean
  dispose(): void
}

type WebAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }

export function createWebAudioSfxPlayer(): SfxPlayer {
  let context: AudioContext | null = null
  let gain: GainNode | null = null

  const ensure = (): { context: AudioContext; gain: GainNode } | null => {
    if (context && gain) return { context, gain }
    if (typeof window === 'undefined') return null
    const Constructor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext
    if (!Constructor) return null
    try {
      context = new Constructor()
      gain = context.createGain()
      gain.connect(context.destination)
      return { context, gain }
    } catch {
      return null
    }
  }

  return {
    play(recipeId, volume) {
      const graph = ensure()
      if (!graph || volume <= 0) return
      const recipe = SFX_RECIPES[recipeId]
      if (!recipe) return
      graph.gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), graph.context.currentTime)
      if (graph.context.state === 'suspended') void graph.context.resume()
      scheduleRecipe(graph.context, graph.gain, recipe, graph.context.currentTime + 0.01)
    },
    unlock() {
      const graph = ensure()
      if (graph && graph.context.state === 'suspended') void graph.context.resume()
    },
    available() {
      if (typeof window === 'undefined') return false
      return !!(window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext)
    },
    dispose() {
      if (context) void context.close().catch(() => {})
      context = null
      gain = null
    },
  }
}

export const NULL_SFX_PLAYER: SfxPlayer = { play: () => {}, unlock: () => {}, available: () => false, dispose: () => {} }
