/**
 * Procedural, all-synthesized SFX for Chick's Challenge — same pattern as
 * `hover/audio/sfx.ts` (no audio assets required). Every sound is addressed
 * by a stable string name (`SfxName`) so real audio files can replace the
 * synthesis behind `playSfx` later without touching any call site.
 */
export type SfxName =
  | 'step'
  | 'bump'
  | 'pickup-chip'
  | 'pickup-key'
  | 'pickup-boot'
  | 'door-open'
  | 'socket-open'
  | 'block-push'
  | 'splash'
  | 'teleport'
  | 'button-press'
  | 'toggle'
  | 'tank-reverse'
  | 'clone'
  | 'thief'
  | 'monster-drowned'
  | 'death-drowned'
  | 'death-burned'
  | 'death-monster'
  | 'win'
  | 'stuck'

/** Every playable name — used by tests to assert the registry is complete. */
export const SFX_NAMES: readonly SfxName[] = [
  'step',
  'bump',
  'pickup-chip',
  'pickup-key',
  'pickup-boot',
  'door-open',
  'socket-open',
  'block-push',
  'splash',
  'teleport',
  'button-press',
  'toggle',
  'tank-reverse',
  'clone',
  'thief',
  'monster-drowned',
  'death-drowned',
  'death-burned',
  'death-monster',
  'win',
  'stuck',
]

export interface SfxEngine {
  /** Create/resume the AudioContext — call from a user gesture handler. */
  unlock(): void
  playSfx(name: SfxName): void
  setMuted(muted: boolean): void
  dispose(): void
}

/** Master volume when unmuted — quiet by default. */
const MASTER_GAIN = 0.35

/**
 * All-synthesized SFX engine. One shared `AudioContext`, created lazily on
 * first use (must be triggered by a user gesture per browser autoplay
 * policy). Every voice is short (≤ 300ms) except `win`. Gain envelopes avoid
 * clicks; a single shared noise buffer is reused across calls to keep each
 * `playSfx` invocation allocation-free beyond the WebAudio nodes it needs.
 */
export function createSfxEngine(initialMuted: boolean): SfxEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuffer: AudioBuffer | null = null
  let muted = initialMuted

  const ensureContext = (): AudioContext | null => {
    if (typeof window === 'undefined') {
      return null
    }
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) {
        return null
      }
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : MASTER_GAIN
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    return ctx
  }

  const getNoiseBuffer = (context: AudioContext): AudioBuffer => {
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1
      }
    }

    return noiseBuffer
  }

  const tone = (
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    peakGain: number,
    delaySec = 0,
  ): void => {
    if (!ctx || !master) {
      return
    }
    const t0 = ctx.currentTime + delaySec
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(1, freqStart), t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

    osc.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  /** Short filtered noise burst — thuds, splashes, scrapes. */
  const noiseBurst = (
    duration: number,
    peakGain: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'lowpass',
    delaySec = 0,
  ): void => {
    if (!ctx || !master) {
      return
    }
    const t0 = ctx.currentTime + delaySec
    const source = ctx.createBufferSource()
    source.buffer = getNoiseBuffer(ctx)

    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = filterFreq
    filter.Q.value = filterType === 'bandpass' ? 1.2 : 0.7

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(peakGain, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    source.start(t0)
    source.stop(t0 + duration + 0.02)
  }

  return {
    unlock(): void {
      ensureContext()
    },

    playSfx(name: SfxName): void {
      if (!ensureContext() || muted) {
        return
      }

      switch (name) {
        case 'step':
          tone(220, 190, 0.045, 'square', 0.05)
          break
        case 'bump':
          noiseBurst(0.09, 0.14, 260)
          tone(110, 80, 0.08, 'square', 0.06)
          break
        case 'pickup-chip':
          tone(720, 1180, 0.09, 'sine', 0.14)
          tone(1180, 1600, 0.09, 'sine', 0.09, 0.07)
          break
        case 'pickup-key':
          tone(500, 820, 0.1, 'triangle', 0.14)
          tone(820, 1240, 0.12, 'triangle', 0.1, 0.09)
          break
        case 'pickup-boot':
          tone(360, 620, 0.12, 'sawtooth', 0.1)
          break
        case 'door-open':
          tone(300, 300, 0.08, 'square', 0.12)
          tone(500, 500, 0.1, 'square', 0.12, 0.08)
          break
        case 'socket-open':
          tone(220, 220, 0.1, 'sawtooth', 0.13)
          tone(440, 440, 0.16, 'sawtooth', 0.13, 0.1)
          break
        case 'block-push':
          noiseBurst(0.12, 0.12, 400)
          tone(140, 120, 0.1, 'square', 0.06)
          break
        case 'splash':
          noiseBurst(0.22, 0.16, 900, 'bandpass')
          tone(500, 160, 0.18, 'sine', 0.05)
          break
        case 'teleport':
          tone(300, 1400, 0.22, 'sine', 0.12)
          tone(1400, 300, 0.22, 'sine', 0.08, 0.05)
          break
        case 'button-press':
          tone(500, 420, 0.06, 'square', 0.1)
          break
        case 'toggle':
          tone(340, 340, 0.07, 'triangle', 0.12)
          tone(240, 240, 0.09, 'triangle', 0.1, 0.07)
          break
        case 'tank-reverse':
          tone(180, 140, 0.1, 'square', 0.12)
          tone(140, 100, 0.14, 'square', 0.1, 0.1)
          break
        case 'clone':
          tone(700, 1000, 0.05, 'sine', 0.12)
          tone(1000, 500, 0.09, 'sine', 0.09, 0.05)
          break
        case 'thief':
          tone(500, 220, 0.22, 'sawtooth', 0.12)
          tone(400, 160, 0.22, 'triangle', 0.08, 0.04)
          break
        case 'monster-drowned':
          noiseBurst(0.24, 0.15, 700, 'bandpass')
          tone(300, 90, 0.24, 'sine', 0.07)
          break
        case 'death-drowned':
          noiseBurst(0.28, 0.18, 500, 'bandpass')
          tone(320, 90, 0.28, 'sine', 0.1)
          break
        case 'death-burned':
          noiseBurst(0.24, 0.16, 2200)
          tone(500, 90, 0.26, 'sawtooth', 0.13)
          break
        case 'death-monster':
          tone(220, 70, 0.28, 'sawtooth', 0.14)
          tone(110, 45, 0.3, 'sawtooth', 0.08, 0.04)
          break
        case 'win':
          tone(523, 523, 0.11, 'square', 0.14)
          tone(659, 659, 0.11, 'square', 0.14, 0.11)
          tone(784, 784, 0.11, 'square', 0.14, 0.22)
          tone(1047, 1047, 0.4, 'square', 0.15, 0.33)
          break
        case 'stuck':
          noiseBurst(0.1, 0.12, 220)
          tone(160, 130, 0.14, 'square', 0.1, 0.08)
          break
      }
    },

    setMuted(nextMuted: boolean): void {
      muted = nextMuted
      if (ctx && master) {
        master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime, 0.03)
      }
    },

    dispose(): void {
      void ctx?.close()
      ctx = null
      master = null
      noiseBuffer = null
    },
  }
}
