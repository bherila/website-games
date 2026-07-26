import type { GameEvent } from '../gameTypes'

export type SfxName =
  | 'volley'
  | 'pop'
  | 'gateGood'
  | 'gateBad'
  | 'gateUpgrade'
  | 'clash'
  | 'bossPulse'
  | 'win'
  | 'lose'

const MIN_INTERVAL_MS: Partial<Record<SfxName, number>> = {
  volley: 90,
  pop: 150,
  gateUpgrade: 150,
}

export interface SfxEngine {
  /** Create/resume the AudioContext — must be called from a user gesture. */
  unlock(): void
  playSfx(name: SfxName, intensity?: number): void
  setMuted(muted: boolean): void
  dispose(): void
}

/**
 * All-synthesized neon SFX — short oscillator/noise one-shots, no audio
 * assets. Rapid-fire names (volley, pop, gateUpgrade) are rate-limited so a
 * 60-per-second event stream cannot stack into noise.
 */
export function createSfxEngine(initialMuted: boolean): SfxEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = initialMuted
  const lastPlayed = new Map<SfxName, number>()

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
      master.gain.value = muted ? 0 : 1
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    return ctx
  }

  const noiseBuffer = (context: AudioContext, seconds: number): AudioBuffer => {
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    return buffer
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
    osc.frequency.setValueAtTime(freqStart, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

    osc.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  const thump = (duration: number, peakGain: number, filterFreq: number): void => {
    if (!ctx || !master) {
      return
    }
    const t0 = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer(ctx, duration)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = filterFreq

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(peakGain, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    source.start(t0)
  }

  return {
    unlock(): void {
      ensureContext()
    },

    playSfx(name: SfxName, intensity = 1): void {
      const minInterval = MIN_INTERVAL_MS[name]
      if (minInterval !== undefined) {
        const now = performance.now()
        const last = lastPlayed.get(name) ?? Number.NEGATIVE_INFINITY
        if (now - last < minInterval) {
          return
        }
        lastPlayed.set(name, now)
      }
      if (!ensureContext() || muted) {
        return
      }
      const level = Math.max(0.05, Math.min(1, intensity))

      switch (name) {
        case 'volley':
          // Pew: short bright zap.
          tone(1400, 700, 0.05, 'square', 0.045 * level)
          break
        case 'pop':
          // Enemy unit bursting.
          tone(520, 180, 0.08, 'triangle', 0.09 * level)
          thump(0.05, 0.05 * level, 1800)
          break
        case 'gateGood':
          // Ascending power-up chime.
          tone(600, 1200, 0.1, 'sine', 0.14)
          tone(900, 1800, 0.12, 'sine', 0.1, 0.06)
          break
        case 'gateBad':
          // Sour descending buzzer.
          tone(420, 140, 0.16, 'sawtooth', 0.15)
          tone(420, 110, 0.2, 'sawtooth', 0.12, 0.12)
          break
        case 'gateUpgrade':
          // Tick of a value notching up.
          tone(980, 1560, 0.05, 'square', 0.05)
          break
        case 'clash':
          // Crowds colliding: crunchy noise thump with a low hit.
          thump(0.22, 0.22 * level, 900)
          tone(160, 60, 0.24, 'sawtooth', 0.14 * level)
          break
        case 'bossPulse':
          // Menacing low zap from the boss.
          tone(220, 70, 0.18, 'sawtooth', 0.13)
          thump(0.1, 0.08, 500)
          break
        case 'win':
          tone(523, 523, 0.13, 'square', 0.15)
          tone(659, 659, 0.13, 'square', 0.15, 0.13)
          tone(784, 784, 0.13, 'square', 0.15, 0.26)
          tone(1047, 1047, 0.5, 'square', 0.16, 0.39)
          tone(784, 784, 0.5, 'triangle', 0.1, 0.39)
          break
        case 'lose':
          tone(392, 370, 0.25, 'sawtooth', 0.14)
          tone(370, 311, 0.25, 'sawtooth', 0.14, 0.25)
          tone(311, 208, 0.6, 'sawtooth', 0.16, 0.5)
          break
      }
    },

    setMuted(nextMuted: boolean): void {
      muted = nextMuted
      if (ctx && master) {
        master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03)
      }
    },

    dispose(): void {
      void ctx?.close()
      ctx = null
      master = null
    },
  }
}

/** Maps a frame's drained simulation events onto sfx calls. */
export function playEventSfx(events: readonly GameEvent[], playSfx: (name: SfxName, intensity?: number) => void): void {
  for (const event of events) {
    switch (event.type) {
      case 'volley':
        playSfx('volley')
        break
      case 'kills':
        playSfx('pop', Math.min(1, 0.4 + event.count * 0.05))
        break
      case 'gateUpgraded':
        playSfx('gateUpgrade')
        break
      case 'gateApplied':
        if (event.delta === 0) {
          playSfx('gateUpgrade')
        } else {
          playSfx(event.delta > 0 ? 'gateGood' : 'gateBad')
        }
        break
      case 'clash':
        playSfx('clash', Math.min(1, 0.5 + event.lostSoldiers * 0.02))
        break
      case 'bossPulse':
        playSfx('bossPulse')
        break
      default:
        break
    }
  }
}
