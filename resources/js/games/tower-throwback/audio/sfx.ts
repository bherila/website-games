import { getAudioContext, getMasterGain, isAudioMuted } from './audioEngine'

/**
 * Procedural WebAudio SFX for Tower Throwback — no samples.
 *
 * Every pitched recipe draws from a single C-major pentatonic set
 * (C D E G A across octaves) so overlapping one-shots — a cash tick landing on
 * an elevator ding landing on a star fanfare — stay consonant instead of
 * clashing. The serious cues sit low on the tonic C so they read as grounded
 * rather than tense. Percussive cues (placeThunk, demolishCrunch, doorHiss)
 * are noise-based and pitch-neutral.
 *
 * Note reference (Hz):
 *   C3 130.81  D3 146.83  E3 164.81  G3 196.00  A3 220.00
 *   C4 261.63  D4 293.66  E4 329.63  G4 392.00  A4 440.00
 *   C5 523.25  D5 587.33  E5 659.26  G5 783.99  A5 880.00
 *   C6 1046.5  D6 1174.7  E6 1318.5  G6 1568.0  A6 1760.0
 */

const NOTE = {
  C2: 65.41, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.26, G5: 783.99, A5: 880.0,
  C6: 1046.5, E6: 1318.5, G6: 1568.0, A6: 1760.0,
} as const

// ── Low-level synthesis helpers ─────────────────────────────────────────────

interface ToneOptions {
  frequency: number
  endFrequency?: number
  type?: OscillatorType
  duration?: number
  gain?: number
  attack?: number
  delay?: number
}

function playTone({
  frequency,
  endFrequency,
  type = 'sine',
  duration = 0.25,
  gain = 0.2,
  attack = 0.005,
  delay = 0,
}: ToneOptions): void {
  const context = getAudioContext()
  const master = getMasterGain()
  if (!context || !master || isAudioMuted()) {
    return
  }

  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
  }

  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(gain, start + attack)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  oscillator.connect(envelope)
  envelope.connect(master)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
  oscillator.onended = () => {
    oscillator.disconnect()
    envelope.disconnect()
  }
}

interface NoiseOptions {
  duration?: number
  gain?: number
  filterType?: BiquadFilterType
  filterFrequency?: number
  filterEndFrequency?: number
  filterQ?: number
  attack?: number
  delay?: number
}

function playNoise({
  duration = 0.08,
  gain = 0.12,
  filterType = 'bandpass',
  filterFrequency = 1800,
  filterEndFrequency,
  filterQ = 1,
  attack = 0,
  delay = 0,
}: NoiseOptions): void {
  const context = getAudioContext()
  const master = getMasterGain()
  if (!context || !master || isAudioMuted()) {
    return
  }

  const start = context.currentTime + delay
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = filterType
  filter.frequency.setValueAtTime(filterFrequency, start)
  if (filterEndFrequency !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterEndFrequency), start + duration)
  }
  filter.Q.value = filterQ

  const envelope = context.createGain()
  if (attack > 0) {
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.linearRampToValueAtTime(gain, start + attack)
  } else {
    envelope.gain.setValueAtTime(gain, start)
  }
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(master)
  source.start(start)
  source.stop(start + duration + 0.02)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    envelope.disconnect()
  }
}

// ── One-shot recipes ────────────────────────────────────────────────────────

/** Placing a unit/floor: a soft low thud plus a settling sine drop. */
export function placeThunk(): void {
  playNoise({ duration: 0.12, gain: 0.16, filterType: 'lowpass', filterFrequency: 420 })
  playTone({ frequency: 190, endFrequency: 90, type: 'sine', duration: 0.16, gain: 0.24 })
}

/** Demolition: a gritty noise burst sweeping downward in pitch. */
export function demolishCrunch(): void {
  playNoise({ duration: 0.28, gain: 0.2, filterType: 'lowpass', filterFrequency: 1600, filterEndFrequency: 180, filterQ: 2 })
  playTone({ frequency: 150, endFrequency: 55, type: 'sawtooth', duration: 0.26, gain: 0.12 })
}

/** Bomb detonation: low air blast plus a short distorted body. */
export function explosionBoom(): void {
  playNoise({ duration: 0.65, gain: 0.28, filterType: 'lowpass', filterFrequency: 1200, filterEndFrequency: 80, filterQ: 1.4 })
  playTone({ frequency: NOTE.C2, endFrequency: 35, type: 'sawtooth', duration: 0.48, gain: 0.2 })
  playTone({ frequency: NOTE.C3, endFrequency: NOTE.C2, type: 'square', duration: 0.24, gain: 0.08, delay: 0.03 })
}

/** Invalid placement: soft mechanical buzz, intentionally short and quiet. */
export function placementRejectedBuzz(): void {
  playTone({ frequency: NOTE.D3, endFrequency: NOTE.C3, type: 'square', duration: 0.09, gain: 0.06 })
  playTone({ frequency: NOTE.C3, endFrequency: NOTE.C2, type: 'square', duration: 0.12, gain: 0.05, delay: 0.08 })
}

/** Elevator arrival: a short bright bell on the pentatonic 5th. */
export function elevatorDing(): void {
  playTone({ frequency: NOTE.G5, type: 'triangle', duration: 0.22, gain: 0.16 })
  playTone({ frequency: NOTE.G6, type: 'sine', duration: 0.14, gain: 0.05 })
}

/** Elevator doors: a subtle filtered-noise swell. */
export function doorHiss(): void {
  playNoise({ duration: 0.22, gain: 0.05, filterType: 'bandpass', filterFrequency: 3200, filterQ: 0.7, attack: 0.09 })
}

/** Cash received: a short, gentle high blip (kept quiet — it fires often). */
export function cashTick(): void {
  playTone({ frequency: NOTE.E6, type: 'sine', duration: 0.06, gain: 0.08 })
}

/** Star gained: a rising, triumphant pentatonic arpeggio. */
export function starFanfare(): void {
  const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6]
  notes.forEach((note, index) => {
    playTone({ frequency: note, type: 'triangle', duration: 0.3, gain: 0.18, delay: index * 0.08 })
  })
  playNoise({ duration: 0.3, gain: 0.04, filterType: 'highpass', filterFrequency: 6000, delay: 0.16 })
}

/** VIP arrival/move-in: a distinct two-note gold motif with a shimmer tail. */
export function vipFanfare(): void {
  playTone({ frequency: NOTE.G5, type: 'sine', duration: 0.26, gain: 0.16 })
  playTone({ frequency: NOTE.C6, type: 'sine', duration: 0.4, gain: 0.18, delay: 0.14 })
  // Octave shimmer sparkle over the second note.
  playTone({ frequency: NOTE.A6, type: 'triangle', duration: 0.5, gain: 0.05, attack: 0.04, delay: 0.16 })
  playNoise({ duration: 0.4, gain: 0.03, filterType: 'highpass', filterFrequency: 7000, delay: 0.16 })
}

/** Tower achieved: a deep landmark-completion bell with a long, ringing decay. */
export function towerBell(): void {
  const context = getAudioContext()
  const master = getMasterGain()
  if (!context || !master || isAudioMuted()) {
    return
  }
  // Additive bell: a low tonic fundamental plus consonant partials, each with
  // its own long exponential decay, summed to one struck-bell timbre.
  const fundamental = NOTE.C2
  const partials: { ratio: number; gain: number; duration: number }[] = [
    { ratio: 1, gain: 0.22, duration: 4.2 },
    { ratio: 2, gain: 0.14, duration: 3.4 },
    { ratio: 3, gain: 0.08, duration: 2.6 },
    { ratio: 4, gain: 0.05, duration: 2.0 },
    { ratio: 5.4, gain: 0.03, duration: 1.6 },
  ]
  for (const partial of partials) {
    playTone({
      frequency: fundamental * partial.ratio,
      type: 'sine',
      duration: partial.duration,
      gain: partial.gain,
      attack: 0.004,
    })
  }
}

/** Soft low double-blip for warnings (star lost, incidents, vacancies). */
export function warningBlip(): void {
  playTone({ frequency: NOTE.A3, type: 'triangle', duration: 0.12, gain: 0.14 })
  playTone({ frequency: NOTE.G3, type: 'triangle', duration: 0.14, gain: 0.14, delay: 0.14 })
}

/** Neutral two-tone chime for loan events. */
export function loanChime(): void {
  playTone({ frequency: NOTE.G4, type: 'sine', duration: 0.2, gain: 0.15 })
  playTone({ frequency: NOTE.C5, type: 'sine', duration: 0.28, gain: 0.15, delay: 0.12 })
}

// ── Continuous beds ─────────────────────────────────────────────────────────

interface CrowdMurmurNodes {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
  gain: GainNode
  lfo: OscillatorNode
  lfoGain: GainNode
}

let crowdMurmur: CrowdMurmurNodes | null = null
let crowdRunning = false
let crowdIntensity = 0

function crowdGainFor(intensity: number): number {
  return 0.16 * Math.max(0, Math.min(1, intensity))
}

/** Start the ambient crowd bed: looping filtered noise with a slow LFO
 * breathing the filter, so density reads as murmur rather than static. */
export function startCrowdMurmur(): void {
  const context = getAudioContext()
  const master = getMasterGain()
  if (!context || !master) {
    return
  }
  crowdRunning = true
  if (crowdMurmur) {
    crowdMurmur.gain.gain.setTargetAtTime(crowdGainFor(crowdIntensity), context.currentTime, 0.4)
    return
  }

  const frameCount = Math.max(1, Math.floor(context.sampleRate * 2))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true

  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 620
  filter.Q.value = 0.6

  const lfo = context.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.18
  const lfoGain = context.createGain()
  lfoGain.gain.value = 180
  lfo.connect(lfoGain)
  lfoGain.connect(filter.frequency)

  const gain = context.createGain()
  gain.gain.value = 0

  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start()
  lfo.start()

  crowdMurmur = { source, filter, gain, lfo, lfoGain }
  gain.gain.setTargetAtTime(crowdGainFor(crowdIntensity), context.currentTime, 0.4)
}

export function stopCrowdMurmur(): void {
  crowdRunning = false
  const context = getAudioContext()
  if (context && crowdMurmur) {
    crowdMurmur.gain.gain.setTargetAtTime(0, context.currentTime, 0.5)
  }
}

/** 0..1 crowd density → murmur loudness (smoothly ramped). */
export function setCrowdMurmurIntensity(intensity: number): void {
  crowdIntensity = Math.max(0, Math.min(1, intensity))
  const context = getAudioContext()
  if (context && crowdMurmur && crowdRunning) {
    crowdMurmur.gain.gain.setTargetAtTime(crowdGainFor(crowdIntensity), context.currentTime, 0.6)
  }
}

let cricketTimer: ReturnType<typeof setTimeout> | null = null
let cricketsGain: GainNode | null = null

const CRICKET_NOTES = [NOTE.A6, NOTE.C6, NOTE.G6, NOTE.E6]

function scheduleCricket(): void {
  const context = getAudioContext()
  const master = getMasterGain()
  const bed = cricketsGain
  // Sparse, randomised chirps — audio ambience, so non-deterministic Math.random
  // is fine here (no simulation state depends on it).
  if (context && master && bed && !isAudioMuted()) {
    const note = CRICKET_NOTES[Math.floor(Math.random() * CRICKET_NOTES.length)] ?? NOTE.A6
    const start = context.currentTime
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = note * (0.98 + Math.random() * 0.04)
    const env = context.createGain()
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(0.06, start + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.05)
    osc.connect(env)
    env.connect(bed)
    osc.start(start)
    osc.stop(start + 0.08)
    osc.onended = () => {
      osc.disconnect()
      env.disconnect()
    }
  }
  const nextDelay = 350 + Math.random() * 1400
  cricketTimer = setTimeout(scheduleCricket, nextDelay)
}

/** Start sparse nighttime crickets (fades the bed in). */
export function startNightCrickets(): void {
  const context = getAudioContext()
  const master = getMasterGain()
  if (!context || !master) {
    return
  }
  if (!cricketsGain) {
    cricketsGain = context.createGain()
    cricketsGain.gain.value = 0
    cricketsGain.connect(master)
  }
  cricketsGain.gain.setTargetAtTime(1, context.currentTime, 1.2)
  if (cricketTimer === null) {
    scheduleCricket()
  }
}

export function stopNightCrickets(): void {
  const context = getAudioContext()
  if (context && cricketsGain) {
    cricketsGain.gain.setTargetAtTime(0, context.currentTime, 1.2)
  }
  if (cricketTimer !== null) {
    clearTimeout(cricketTimer)
    cricketTimer = null
  }
}
