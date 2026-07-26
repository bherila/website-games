export type SfxName =
  | 'start'
  | 'flagBlue'
  | 'flagRed'
  | 'pod'
  | 'podBad'
  | 'jump'
  | 'land'
  | 'bounce'
  | 'craftBump'
  | 'trapped'
  | 'arrow'
  | 'win'
  | 'lose'

export interface SfxEngine {
  /** Create/resume the AudioContext — must be called from a user gesture. */
  unlock(): void
  playSfx(name: SfxName, intensity?: number): void
  /** 0..1 player speed → engine hum pitch and volume. */
  setEngineIntensity(value: number): void
  startEngineHum(): void
  stopEngineHum(): void
  setMuted(muted: boolean): void
  dispose(): void
}

/**
 * All-synthesized retro SFX — dual-saw engine hum through a lowpass, plus
 * short oscillator/noise one-shots. No audio assets required.
 */
export function createSfxEngine(initialMuted: boolean): SfxEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = initialMuted
  let humOscA: OscillatorNode | null = null
  let humOscB: OscillatorNode | null = null
  let humFilter: BiquadFilterNode | null = null
  let humGain: GainNode | null = null
  let humTargetGain = 0
  let humRunning = false

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

  /**
   * A damped pitch-wobble "boing" — the original game's springy signature.
   * The frequency oscillates around a glide from startFreq to endFreq with
   * decaying amplitude, like a struck spring settling.
   */
  const springTone = (
    startFreq: number,
    endFreq: number,
    wobbles: number,
    duration: number,
    peakGain: number,
    type: OscillatorType = 'triangle',
    delaySec = 0,
  ): void => {
    if (!ctx || !master) {
      return
    }
    const t0 = ctx.currentTime + delaySec
    const osc = ctx.createOscillator()
    osc.type = type
    const steps = wobbles * 2
    osc.frequency.setValueAtTime(Math.max(30, startFreq), t0)
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps
      const base = startFreq + (endFreq - startFreq) * progress
      const amp = 0.45 * (1 - progress)
      const freq = Math.max(30, base * (1 + (i % 2 === 0 ? -amp : amp)))
      osc.frequency.exponentialRampToValueAtTime(freq, t0 + duration * progress)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.012)
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
      if (!ensureContext() || muted) {
        return
      }
      const level = Math.max(0.05, Math.min(1, intensity))

      switch (name) {
        case 'start':
          // Engine spin-up: a rising rev with a power-on blip on top.
          tone(70, 240, 0.5, 'sawtooth', 0.16)
          tone(140, 480, 0.5, 'sawtooth', 0.08)
          tone(880, 1320, 0.1, 'sine', 0.1, 0.42)
          break
        case 'flagBlue':
          // Bright ascending chime run — the "you scored" sparkle.
          tone(523, 523, 0.07, 'square', 0.13)
          tone(659, 659, 0.07, 'square', 0.13, 0.06)
          tone(784, 784, 0.07, 'square', 0.13, 0.12)
          tone(1047, 1047, 0.22, 'square', 0.15, 0.18)
          tone(2093, 2093, 0.22, 'sine', 0.07, 0.18)
          break
        case 'flagRed':
          // Drone stole a flag: insistent two-tone klaxon so it cuts through.
          tone(466, 466, 0.11, 'sawtooth', 0.16)
          tone(349, 349, 0.11, 'sawtooth', 0.16, 0.11)
          tone(466, 466, 0.11, 'sawtooth', 0.14, 0.22)
          tone(349, 349, 0.18, 'sawtooth', 0.14, 0.33)
          break
        case 'pod':
          // Digital power-up blip.
          tone(600, 1500, 0.12, 'sine', 0.14)
          tone(1200, 2400, 0.1, 'sine', 0.08, 0.08)
          break
        case 'podBad':
          // Sour descending buzzer.
          tone(420, 140, 0.16, 'sawtooth', 0.15)
          tone(420, 110, 0.22, 'sawtooth', 0.13, 0.14)
          break
        case 'jump':
          // Spring launch: rising boing plus air whoosh.
          springTone(180, 520, 3, 0.28, 0.16)
          thump(0.2, 0.05, 2200)
          break
        case 'land':
          thump(0.12, 0.12, 500)
          springTone(220, 130, 2, 0.16, 0.06)
          break
        case 'bounce':
          // The signature springy wall boing, pitch scaled by impact.
          springTone(240 + 180 * level, 90, 4, 0.3, 0.2 * level)
          thump(0.06, 0.1 * level, 1200)
          break
        case 'craftBump':
          // Metallic clank of two hulls meeting.
          tone(180, 150, 0.08, 'square', 0.16 * level)
          tone(171, 140, 0.1, 'square', 0.12 * level)
          springTone(320, 110, 3, 0.22, 0.12 * level)
          thump(0.12, 0.18 * level, 700)
          break
        case 'trapped':
          // Gooey sticky grab: a low springy squelch plus a soft muffled thud.
          springTone(160, 55, 5, 0.5, 0.2 * level, 'sawtooth')
          thump(0.18, 0.14 * level, 300)
          break
        case 'arrow':
          // Directional arrow-pad boost: a quick rising whoosh.
          tone(220, 990, 0.16, 'sine', 0.12)
          tone(440, 1980, 0.14, 'sine', 0.07, 0.03)
          thump(0.14, 0.07, 3200)
          break
        case 'win':
          tone(523, 523, 0.13, 'square', 0.15)
          tone(659, 659, 0.13, 'square', 0.15, 0.13)
          tone(784, 784, 0.13, 'square', 0.15, 0.26)
          tone(1047, 1047, 0.5, 'square', 0.16, 0.39)
          tone(659, 659, 0.5, 'triangle', 0.1, 0.39)
          tone(784, 784, 0.5, 'triangle', 0.1, 0.39)
          break
        case 'lose':
          tone(392, 370, 0.25, 'sawtooth', 0.14)
          tone(370, 311, 0.25, 'sawtooth', 0.14, 0.25)
          tone(311, 208, 0.6, 'sawtooth', 0.16, 0.5)
          tone(104, 92, 0.6, 'sawtooth', 0.08, 0.5)
          break
      }
    },

    setEngineIntensity(value: number): void {
      if (!ctx || !humFilter || !humOscA || !humOscB || !humGain) {
        return
      }
      const clamped = Math.max(0, Math.min(1, value))
      const t = ctx.currentTime
      humOscA.frequency.setTargetAtTime(55 + clamped * 85, t, 0.08)
      humOscB.frequency.setTargetAtTime(57 + clamped * 90, t, 0.08)
      humFilter.frequency.setTargetAtTime(220 + clamped * 500, t, 0.1)
      humTargetGain = 0.05 + clamped * 0.075
      if (humRunning) {
        humGain.gain.setTargetAtTime(humTargetGain, t, 0.1)
      }
    },

    startEngineHum(): void {
      const context = ensureContext()
      if (!context || !master) {
        return
      }
      if (!humOscA || !humOscB) {
        humFilter = context.createBiquadFilter()
        humFilter.type = 'lowpass'
        humFilter.frequency.value = 300

        humGain = context.createGain()
        humGain.gain.value = 0

        humOscA = context.createOscillator()
        humOscA.type = 'sawtooth'
        humOscA.frequency.value = 60
        humOscB = context.createOscillator()
        humOscB.type = 'sawtooth'
        humOscB.frequency.value = 62.5

        humOscA.connect(humFilter)
        humOscB.connect(humFilter)
        humFilter.connect(humGain)
        humGain.connect(master)
        humOscA.start()
        humOscB.start()
      }
      humRunning = true
      humGain?.gain.setTargetAtTime(Math.max(0.05, humTargetGain), context.currentTime, 0.15)
    },

    stopEngineHum(): void {
      humRunning = false
      if (ctx && humGain) {
        humGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12)
      }
    },

    setMuted(nextMuted: boolean): void {
      muted = nextMuted
      if (ctx && master) {
        master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.03)
      }
    },

    dispose(): void {
      humOscA?.stop()
      humOscB?.stop()
      void ctx?.close()
      ctx = null
      master = null
      humOscA = null
      humOscB = null
      humFilter = null
      humGain = null
    },
  }
}
