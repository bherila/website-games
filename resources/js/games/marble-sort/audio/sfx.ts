import { getAudioContext, getMasterGain, isAudioMuted } from './audioEngine'

/**
 * All effects are synthesized on the fly with WebAudio — no audio assets.
 * Every recipe no-ops when WebAudio is unavailable or the game is muted.
 */

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
  filterQ?: number
  delay?: number
}

function playNoise({
  duration = 0.08,
  gain = 0.12,
  filterType = 'bandpass',
  filterFrequency = 1800,
  filterQ = 1,
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
  filter.frequency.value = filterFrequency
  filter.Q.value = filterQ

  const envelope = context.createGain()
  envelope.gain.setValueAtTime(gain, start)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(master)
  source.start(start)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    envelope.disconnect()
  }
}

/** A box bursting open: a soft thump plus a downward pluck. */
export function playBoxPop(): void {
  playTone({ frequency: 320, endFrequency: 150, type: 'triangle', duration: 0.14, gain: 0.28 })
  playNoise({ duration: 0.09, gain: 0.14, filterType: 'lowpass', filterFrequency: 1200 })
}

let lastClackAt = 0

/** Marble landing on the belt. Throttled: nine marbles arrive in a burst and
 * per-marble clacks would smear into noise. */
export function playMarbleClack(): void {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now()
  if (now - lastClackAt < 50) {
    return
  }
  lastClackAt = now
  playNoise({
    duration: 0.035,
    gain: 0.1,
    filterType: 'bandpass',
    filterFrequency: 1500 + Math.random() * 900,
    filterQ: 4,
  })
}

const SLOT_DING_NOTES = [659.26, 783.99, 987.77]

/** Slot fill ding; rises with each slot of the block (0, 1, 2). */
export function playSlotDing(slotIndex: number): void {
  const note = SLOT_DING_NOTES[Math.max(0, Math.min(SLOT_DING_NOTES.length - 1, slotIndex))] ?? SLOT_DING_NOTES[0] ?? 659.26
  playTone({ frequency: note, type: 'sine', duration: 0.3, gain: 0.2 })
  playTone({ frequency: note * 2, type: 'sine', duration: 0.18, gain: 0.05 })
}

/** A block completing: ascending arpeggio with sparkle. */
export function playBlockComplete(): void {
  const notes = [523.25, 659.26, 783.99, 1046.5]
  notes.forEach((note, index) => {
    playTone({ frequency: note, type: 'triangle', duration: 0.24, gain: 0.18, delay: index * 0.055 })
  })
  playNoise({ duration: 0.28, gain: 0.05, filterType: 'highpass', filterFrequency: 6000, delay: 0.1 })
}

/** Level-complete fanfare. */
export function playLevelWin(): void {
  const melody = [523.25, 659.26, 783.99, 1046.5, 1318.5]
  melody.forEach((note, index) => {
    playTone({ frequency: note, type: 'triangle', duration: 0.32, gain: 0.2, delay: index * 0.09 })
  })
  const chord = [523.25, 659.26, 783.99]
  for (const note of chord) {
    playTone({ frequency: note, type: 'sine', duration: 0.9, gain: 0.08, attack: 0.05, delay: 0.45 })
  }
  playNoise({ duration: 0.5, gain: 0.06, filterType: 'highpass', filterFrequency: 5000, delay: 0.4 })
}

/** Belt-full game over: descending womp. */
export function playGameOver(): void {
  playTone({ frequency: 220, endFrequency: 98, type: 'sawtooth', duration: 0.55, gain: 0.14 })
  playTone({ frequency: 165, endFrequency: 73, type: 'sawtooth', duration: 0.65, gain: 0.1, delay: 0.08 })
}

/** Power-up activation: rising sweep with shimmer. */
export function playPowerUp(): void {
  playTone({ frequency: 260, endFrequency: 1040, type: 'sine', duration: 0.32, gain: 0.16 })
  playNoise({ duration: 0.25, gain: 0.05, filterType: 'highpass', filterFrequency: 4500, delay: 0.08 })
}
