/**
 * A small all-synthesized sound-effect core: one lazily created AudioContext,
 * a master gain, and two voices (a pitched tone and a filtered noise burst).
 * Games supply named recipes built from those voices, so no audio assets are
 * needed and each game keeps its own palette.
 */
export interface NoiseOptions {
  filter?: BiquadFilterType
  delay?: number
  /** Glide the filter to this frequency over the burst. */
  sweepTo?: number
  /** Seconds to reach full level; 0 starts at full level, like a knock. */
  attack?: number
  q?: number
}

export interface SynthVoice {
  /** The live context and master input, for sounds the two voices don't cover (hums, wobbles). */
  context: AudioContext
  output: AudioNode
  /** A tone gliding from `from` to `to` Hz over `duration` seconds, starting after `delay`. */
  tone(from: number, to: number, duration: number, type: OscillatorType, gain: number, delay?: number): void
  /** A filtered white-noise burst: thuds, scrapes and whooshes. */
  noise(duration: number, gain: number, frequency: number, options?: NoiseOptions): void
}

/** A recipe may scale itself by an optional 0..1 intensity. */
export type SynthRecipe = (voice: SynthVoice, intensity?: number) => void

/** An intensity clamped to 0.05..1, defaulting to full. */
export function clampIntensity(intensity = 1): number {
  return Math.max(0.05, Math.min(1, intensity))
}

export interface SynthSfx<Name extends string> {
  /** Create or resume the AudioContext. Call from a user gesture. */
  unlock(): void
  play(name: Name, intensity?: number): void
  /** The running voice for continuous sounds, or null without Web Audio. Call after unlock. */
  live(): SynthVoice | null
  setMuted(muted: boolean): void
  dispose(): void
}

export interface SynthOptions<Name extends string> {
  muted?: boolean
  /** Master level while unmuted. */
  volume?: number
  /** Tone attack in seconds. */
  attack?: number
  /** Rapid-fire sounds skip repeats inside this window, so event bursts can't stack into noise. */
  minIntervalMs?: Partial<Record<Name, number>>
}

export function createSynthSfx<Name extends string>(recipes: Record<Name, SynthRecipe>, { muted: initialMuted = false, volume = 0.35, attack = 0.012, minIntervalMs = {} }: SynthOptions<Name> = {}): SynthSfx<Name> {
  let voice: SynthVoice | null = null
  const lastPlayed = new Map<Name, number>()
  let noiseBuffer: AudioBuffer | null = null
  let muted = initialMuted

  // A hidden tab stops the clock, so queued sounds and hums don't run on unseen.
  const onVisibility = (): void => {
    if (!voice) return
    if (document.hidden) void voice.context.suspend()
    else void voice.context.resume()
  }
  const build = (context: AudioContext, master: GainNode): SynthVoice => ({
    context,
    output: master,
    tone(from, to, duration, type, gain, delay = 0) {
      const start = context.currentTime + delay
      const oscillator = context.createOscillator()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(Math.max(1, from), start)
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
      const envelope = context.createGain()
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(gain, start + attack)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(envelope).connect(master)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    },
    noise(duration, gain, frequency, { filter = 'lowpass', delay = 0, sweepTo, attack: rise = 0, q } = {}) {
      const start = context.currentTime + delay
      if (!noiseBuffer) {
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
        const data = noiseBuffer.getChannelData(0)
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
      }
      const source = context.createBufferSource()
      source.buffer = noiseBuffer
      source.loop = true
      const shaping = context.createBiquadFilter()
      shaping.type = filter
      shaping.frequency.setValueAtTime(frequency, start)
      if (sweepTo) shaping.frequency.exponentialRampToValueAtTime(sweepTo, start + duration)
      shaping.Q.value = q ?? (filter === 'bandpass' ? 1.2 : 0.7)
      const envelope = context.createGain()
      if (rise > 0) {
        envelope.gain.setValueAtTime(0.0001, start)
        envelope.gain.exponentialRampToValueAtTime(gain, start + rise)
      } else envelope.gain.setValueAtTime(gain, start)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      source.connect(shaping).connect(envelope).connect(master)
      source.start(start)
      source.stop(start + duration + 0.02)
    },
  })
  const ensure = (): SynthVoice | null => {
    if (typeof window === 'undefined') return null
    if (!voice) {
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return null
      const context = new Context()
      const master = context.createGain()
      master.gain.value = muted ? 0 : volume
      master.connect(context.destination)
      voice = build(context, master)
      document.addEventListener('visibilitychange', onVisibility)
    }
    if (voice.context.state === 'suspended' && !document.hidden) void voice.context.resume()
    return voice
  }

  return {
    unlock() { ensure() },
    play(name, intensity) {
      const interval = minIntervalMs[name]
      if (interval !== undefined) {
        const now = performance.now()
        if (now - (lastPlayed.get(name) ?? -Infinity) < interval) return
        lastPlayed.set(name, now)
      }
      if (muted) return
      const live = ensure()
      if (live) recipes[name](live, intensity)
    },
    live: ensure,
    setMuted(next) {
      muted = next
      if (voice) (voice.output as GainNode).gain.setTargetAtTime(muted ? 0 : volume, voice.context.currentTime, 0.03)
    },
    dispose() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      void voice?.context.close()
      voice = null
      noiseBuffer = null
    },
  }
}
