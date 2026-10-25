/**
 * A small all-synthesized sound-effect core: one lazily created AudioContext,
 * a master gain, and two voices (a pitched tone and a filtered noise burst).
 * Games supply named recipes built from those voices, so no audio assets are
 * needed and each game keeps its own palette.
 */
export interface SynthVoice {
  /** A tone gliding from `from` to `to` Hz over `duration` seconds, starting after `delay`. */
  tone(from: number, to: number, duration: number, type: OscillatorType, gain: number, delay?: number): void
  /** A filtered white-noise burst: thuds, scrapes and whooshes. */
  noise(duration: number, gain: number, frequency: number, filter?: BiquadFilterType, delay?: number, sweepTo?: number): void
}

export interface SynthSfx<Name extends string> {
  /** Create or resume the AudioContext. Call from a user gesture. */
  unlock(): void
  play(name: Name): void
  setMuted(muted: boolean): void
  dispose(): void
}

export function createSynthSfx<Name extends string>(recipes: Record<Name, (voice: SynthVoice) => void>, { muted: initialMuted = false, volume = 0.35 } = {}): SynthSfx<Name> {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuffer: AudioBuffer | null = null
  let muted = initialMuted

  // A hidden tab stops the clock so queued sounds don't burst out on return.
  const onVisibility = (): void => {
    if (!context) return
    if (document.hidden) void context.suspend()
    else void context.resume()
  }
  const ensure = (): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!context) {
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return null
      context = new Context()
      master = context.createGain()
      master.gain.value = muted ? 0 : volume
      master.connect(context.destination)
      document.addEventListener('visibilitychange', onVisibility)
    }
    if (context.state === 'suspended' && !document.hidden) void context.resume()
    return context
  }

  const voice: SynthVoice = {
    tone(from, to, duration, type, gain, delay = 0) {
      if (!context || !master) return
      const start = context.currentTime + delay
      const oscillator = context.createOscillator()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(Math.max(1, from), start)
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
      const envelope = context.createGain()
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.connect(envelope).connect(master)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    },
    noise(duration, gain, frequency, filterType = 'lowpass', delay = 0, sweepTo) {
      if (!context || !master) return
      const start = context.currentTime + delay
      if (!noiseBuffer) {
        noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
        const data = noiseBuffer.getChannelData(0)
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
      }
      const source = context.createBufferSource()
      source.buffer = noiseBuffer
      const filter = context.createBiquadFilter()
      filter.type = filterType
      filter.frequency.setValueAtTime(frequency, start)
      if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + duration)
      filter.Q.value = filterType === 'bandpass' ? 1.4 : 0.7
      const envelope = context.createGain()
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.03, duration / 3))
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      source.connect(filter).connect(envelope).connect(master)
      source.start(start)
      source.stop(start + duration + 0.02)
    },
  }

  return {
    unlock() { ensure() },
    play(name) {
      if (muted || !ensure()) return
      recipes[name](voice)
    },
    setMuted(next) {
      muted = next
      if (context && master) master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.03)
    },
    dispose() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      void context?.close()
      context = null
      master = null
      noiseBuffer = null
    },
  }
}
