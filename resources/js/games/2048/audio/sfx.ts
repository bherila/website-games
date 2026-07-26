/**
 * Procedural SFX — short synthesized one-shots, no audio assets, mirroring
 * `math-horde/audio/sfx.ts`. Sounds are keyed by name so recorded samples could
 * replace the synthesis later without touching callers.
 */
export type SfxName = 'slide' | 'merge' | 'blocked' | 'win' | 'gameOver' | 'undo'

const MIN_INTERVAL_MS: Partial<Record<SfxName, number>> = {
  slide: 60,
  merge: 40,
  blocked: 200,
}

export interface SfxEngine {
  /** Creates/resumes the AudioContext — must run inside a user gesture. */
  unlock(): void
  playSfx(name: SfxName, intensity?: number): void
  setMuted(muted: boolean): void
  dispose(): void
}

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
      const Ctor = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
    const start = ctx.currentTime + delaySec
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freqStart, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    osc.connect(gain)
    gain.connect(master)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  return {
    unlock(): void {
      ensureContext()
    },

    playSfx(name: SfxName, intensity = 1): void {
      const minInterval = MIN_INTERVAL_MS[name]
      if (minInterval !== undefined) {
        const now = Date.now()
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
        case 'slide':
          tone(320, 220, 0.05, 'triangle', 0.05)
          break
        case 'merge':
          // Higher merges ring brighter, so a big combine sounds like one.
          tone(420 + 260 * level, 900 + 300 * level, 0.09, 'sine', 0.1)
          break
        case 'blocked':
          tone(180, 140, 0.07, 'sawtooth', 0.05)
          break
        case 'undo':
          tone(700, 380, 0.09, 'triangle', 0.07)
          break
        case 'win':
          tone(523, 523, 0.12, 'square', 0.12)
          tone(659, 659, 0.12, 'square', 0.12, 0.12)
          tone(784, 784, 0.12, 'square', 0.12, 0.24)
          tone(1047, 1047, 0.45, 'square', 0.13, 0.36)
          break
        case 'gameOver':
          tone(392, 330, 0.22, 'sawtooth', 0.11)
          tone(294, 196, 0.45, 'sawtooth', 0.12, 0.2)
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
