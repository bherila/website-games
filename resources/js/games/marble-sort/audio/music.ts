import { getAudioContext, getMasterGain } from './audioEngine'

/**
 * Generative ambient loop: a slow I–vi–IV–V pad cycle with occasional
 * pentatonic plucks, scheduled just-in-time against the audio clock. Runs
 * through its own gain node under the master gain, so the global mute toggle
 * silences it too.
 */

const CHORD_DURATION = 4.8
const LOOKAHEAD_SECONDS = 0.6
const SCHEDULER_INTERVAL_MS = 250
const MUSIC_GAIN = 0.14

const CHORDS: number[][] = [
  [130.81, 261.63, 329.63, 392.0],
  [110.0, 220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63, 349.23],
  [196.0, 246.94, 293.66, 392.0],
]

const PLUCK_NOTES = [523.25, 587.33, 659.26, 783.99, 880.0, 1046.5]

let schedulerId: number | null = null
let musicGain: GainNode | null = null
let nextChordTime = 0
let nextPluckTime = 0
let chordIndex = 0

export function startMusic(): void {
  const context = getAudioContext()
  const master = getMasterGain()
  if (!context || !master || schedulerId !== null) {
    return
  }

  musicGain = context.createGain()
  musicGain.gain.value = 0
  musicGain.gain.setTargetAtTime(MUSIC_GAIN, context.currentTime, 1.2)
  musicGain.connect(master)

  chordIndex = 0
  nextChordTime = context.currentTime + 0.2
  nextPluckTime = context.currentTime + 2.0

  schedulerId = window.setInterval(() => {
    scheduleAhead(context)
  }, SCHEDULER_INTERVAL_MS)
  scheduleAhead(context)
}

export function stopMusic(): void {
  if (schedulerId !== null) {
    window.clearInterval(schedulerId)
    schedulerId = null
  }

  const context = getAudioContext()
  if (musicGain && context) {
    const gain = musicGain
    gain.gain.setTargetAtTime(0, context.currentTime, 0.3)
    window.setTimeout(() => gain.disconnect(), 1500)
  }
  musicGain = null
}

export function isMusicRunning(): boolean {
  return schedulerId !== null
}

function scheduleAhead(context: AudioContext): void {
  const until = context.currentTime + LOOKAHEAD_SECONDS

  while (nextChordTime < until) {
    const chord = CHORDS[chordIndex % CHORDS.length] ?? CHORDS[0] ?? []
    for (const frequency of chord) {
      schedulePadNote(context, frequency, nextChordTime, CHORD_DURATION + 1.2)
    }
    chordIndex += 1
    nextChordTime += CHORD_DURATION
  }

  while (nextPluckTime < until) {
    const chord = CHORDS[(chordIndex + CHORDS.length - 1) % CHORDS.length] ?? []
    const pluckPool = PLUCK_NOTES.filter((note) => (
      chord.some((chordNote) => isConsonant(note, chordNote))
    ))
    const pool = pluckPool.length > 0 ? pluckPool : PLUCK_NOTES
    const note = pool[Math.floor(Math.random() * pool.length)] ?? PLUCK_NOTES[0] ?? 523.25
    schedulePluck(context, note, nextPluckTime)
    nextPluckTime += 0.7 + Math.random() * 1.1
  }
}

function schedulePadNote(context: AudioContext, frequency: number, start: number, duration: number): void {
  if (!musicGain) {
    return
  }

  const oscillator = context.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency

  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(0.24, start + 1.4)
  envelope.gain.setValueAtTime(0.24, start + duration - 1.6)
  envelope.gain.linearRampToValueAtTime(0, start + duration)

  oscillator.connect(envelope)
  envelope.connect(musicGain)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.1)
  oscillator.onended = () => {
    oscillator.disconnect()
    envelope.disconnect()
  }
}

function schedulePluck(context: AudioContext, frequency: number, start: number): void {
  if (!musicGain) {
    return
  }

  const oscillator = context.createOscillator()
  oscillator.type = 'triangle'
  oscillator.frequency.value = frequency

  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(0.16, start + 0.015)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)

  oscillator.connect(envelope)
  envelope.connect(musicGain)
  oscillator.start(start)
  oscillator.stop(start + 0.7)
  oscillator.onended = () => {
    oscillator.disconnect()
    envelope.disconnect()
  }
}

/** Keeps plucks on chord tones or their octaves so the loop stays sweet. */
function isConsonant(note: number, chordNote: number): boolean {
  let ratio = note / chordNote
  while (ratio > 1.06) {
    ratio /= 2
  }

  return Math.abs(ratio - 1) < 0.03
}
