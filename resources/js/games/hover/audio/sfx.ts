import { clampIntensity, createSynthSfx, type SynthRecipe, type SynthSfx, type SynthVoice } from '../../_shared/audio/synthSfx'

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

export interface SfxEngine extends SynthSfx<SfxName> {
  /** 0..1 player speed → engine hum pitch and volume. */
  setEngineIntensity(value: number): void
  startEngineHum(): void
  stopEngineHum(): void
}

/**
 * A damped pitch-wobble "boing" — the original game's springy signature.
 * The frequency oscillates around a glide from startFreq to endFreq with
 * decaying amplitude, like a struck spring settling.
 */
function springTone({ context, output }: SynthVoice, startFreq: number, endFreq: number, wobbles: number, duration: number, peakGain: number, type: OscillatorType = 'triangle'): void {
  const t0 = context.currentTime
  const osc = context.createOscillator()
  osc.type = type
  const steps = wobbles * 2
  osc.frequency.setValueAtTime(Math.max(30, startFreq), t0)
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps
    const base = startFreq + (endFreq - startFreq) * progress
    const amp = 0.45 * (1 - progress)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, base * (1 + (i % 2 === 0 ? -amp : amp))), t0 + duration * progress)
  }
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(output)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

/** All-synthesized retro SFX: short oscillator/noise one-shots plus springy boings. */
export const SFX_RECIPES: Record<SfxName, SynthRecipe> = {
  // Engine spin-up: a rising rev with a power-on blip on top.
  start: ({ tone }) => {
    tone(70, 240, 0.5, 'sawtooth', 0.16)
    tone(140, 480, 0.5, 'sawtooth', 0.08)
    tone(880, 1320, 0.1, 'sine', 0.1, 0.42)
  },
  // Bright ascending chime run — the "you scored" sparkle.
  flagBlue: ({ tone }) => {
    tone(523, 523, 0.07, 'square', 0.13)
    tone(659, 659, 0.07, 'square', 0.13, 0.06)
    tone(784, 784, 0.07, 'square', 0.13, 0.12)
    tone(1047, 1047, 0.22, 'square', 0.15, 0.18)
    tone(2093, 2093, 0.22, 'sine', 0.07, 0.18)
  },
  // Drone stole a flag: insistent two-tone klaxon so it cuts through.
  flagRed: ({ tone }) => {
    tone(466, 466, 0.11, 'sawtooth', 0.16)
    tone(349, 349, 0.11, 'sawtooth', 0.16, 0.11)
    tone(466, 466, 0.11, 'sawtooth', 0.14, 0.22)
    tone(349, 349, 0.18, 'sawtooth', 0.14, 0.33)
  },
  // Digital power-up blip.
  pod: ({ tone }) => {
    tone(600, 1500, 0.12, 'sine', 0.14)
    tone(1200, 2400, 0.1, 'sine', 0.08, 0.08)
  },
  // Sour descending buzzer.
  podBad: ({ tone }) => {
    tone(420, 140, 0.16, 'sawtooth', 0.15)
    tone(420, 110, 0.22, 'sawtooth', 0.13, 0.14)
  },
  // Spring launch: rising boing plus air whoosh.
  jump: (voice) => {
    springTone(voice, 180, 520, 3, 0.28, 0.16)
    voice.noise(0.2, 0.05, 2200)
  },
  land: (voice) => {
    voice.noise(0.12, 0.12, 500)
    springTone(voice, 220, 130, 2, 0.16, 0.06)
  },
  // The signature springy wall boing, pitch scaled by impact.
  bounce: (voice, intensity) => {
    const level = clampIntensity(intensity)
    springTone(voice, 240 + 180 * level, 90, 4, 0.3, 0.2 * level)
    voice.noise(0.06, 0.1 * level, 1200)
  },
  // Metallic clank of two hulls meeting.
  craftBump: (voice, intensity) => {
    const level = clampIntensity(intensity)
    voice.tone(180, 150, 0.08, 'square', 0.16 * level)
    voice.tone(171, 140, 0.1, 'square', 0.12 * level)
    springTone(voice, 320, 110, 3, 0.22, 0.12 * level)
    voice.noise(0.12, 0.18 * level, 700)
  },
  // Gooey sticky grab: a low springy squelch plus a soft muffled thud.
  trapped: (voice, intensity) => {
    const level = clampIntensity(intensity)
    springTone(voice, 160, 55, 5, 0.5, 0.2 * level, 'sawtooth')
    voice.noise(0.18, 0.14 * level, 300)
  },
  // Directional arrow-pad boost: a quick rising whoosh.
  arrow: ({ tone, noise }) => {
    tone(220, 990, 0.16, 'sine', 0.12)
    tone(440, 1980, 0.14, 'sine', 0.07, 0.03)
    noise(0.14, 0.07, 3200)
  },
  win: ({ tone }) => {
    tone(523, 523, 0.13, 'square', 0.15)
    tone(659, 659, 0.13, 'square', 0.15, 0.13)
    tone(784, 784, 0.13, 'square', 0.15, 0.26)
    tone(1047, 1047, 0.5, 'square', 0.16, 0.39)
    tone(659, 659, 0.5, 'triangle', 0.1, 0.39)
    tone(784, 784, 0.5, 'triangle', 0.1, 0.39)
  },
  lose: ({ tone }) => {
    tone(392, 370, 0.25, 'sawtooth', 0.14)
    tone(370, 311, 0.25, 'sawtooth', 0.14, 0.25)
    tone(311, 208, 0.6, 'sawtooth', 0.16, 0.5)
    tone(104, 92, 0.6, 'sawtooth', 0.08, 0.5)
  },
}

/** The shared synth core plus a dual-saw engine hum through a lowpass. */
export function createSfxEngine(initialMuted: boolean): SfxEngine {
  const synth = createSynthSfx(SFX_RECIPES, { muted: initialMuted, volume: 1, attack: 0.015 })
  let hum: { a: OscillatorNode, b: OscillatorNode, filter: BiquadFilterNode, gain: GainNode, context: AudioContext } | null = null
  let humTargetGain = 0
  let humRunning = false
  return {
    ...synth,
    setEngineIntensity(value) {
      if (!hum) return
      const clamped = Math.max(0, Math.min(1, value))
      const t = hum.context.currentTime
      hum.a.frequency.setTargetAtTime(55 + clamped * 85, t, 0.08)
      hum.b.frequency.setTargetAtTime(57 + clamped * 90, t, 0.08)
      hum.filter.frequency.setTargetAtTime(220 + clamped * 500, t, 0.1)
      humTargetGain = 0.05 + clamped * 0.075
      if (humRunning) hum.gain.gain.setTargetAtTime(humTargetGain, t, 0.1)
    },
    startEngineHum() {
      const voice = synth.live()
      if (!voice) return
      if (!hum || hum.context !== voice.context) {
        const { context, output } = voice
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 300
        const gain = context.createGain()
        gain.gain.value = 0
        const a = context.createOscillator()
        a.type = 'sawtooth'
        a.frequency.value = 60
        const b = context.createOscillator()
        b.type = 'sawtooth'
        b.frequency.value = 62.5
        a.connect(filter)
        b.connect(filter)
        filter.connect(gain).connect(output)
        a.start()
        b.start()
        hum = { a, b, filter, gain, context }
      }
      humRunning = true
      hum.gain.gain.setTargetAtTime(Math.max(0.05, humTargetGain), hum.context.currentTime, 0.15)
    },
    stopEngineHum() {
      humRunning = false
      hum?.gain.gain.setTargetAtTime(0.0001, hum.context.currentTime, 0.12)
    },
    dispose() {
      hum?.a.stop()
      hum?.b.stop()
      hum = null
      synth.dispose()
    },
  }
}
