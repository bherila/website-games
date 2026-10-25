import { createMuteStorage } from '../_shared/audio/muteStorage'
import { createSynthSfx, type SynthSfx, type SynthVoice } from '../_shared/audio/synthSfx'

export type PlateSound = 'unscrew' | 'tray' | 'spare' | 'tray-complete' | 'blocked' | 'fall' | 'land' | 'overflow' | 'win' | 'undo'

/** Toy-workshop sounds: a ratchet and pop for each screw, chimes for trays, wooden knocks for parts. */
export const PLATE_SOUNDS: Record<PlateSound, (voice: SynthVoice) => void> = {
  // Three quick ratchet ticks climbing, then the screw pops free.
  unscrew: ({ tone }) => {
    for (const [index, pitch] of [1500, 1700, 1950].entries()) tone(pitch, pitch * 0.9, 0.025, 'square', 0.035, index * 0.05)
    tone(520, 1240, 0.09, 'sine', 0.14, 0.16)
  },
  // A bright clink as the head seats in its tray hole.
  tray: ({ tone }) => {
    tone(1760, 1700, 0.16, 'triangle', 0.12)
    tone(2640, 2600, 0.1, 'sine', 0.05, 0.01)
  },
  // A softer, lower tap for a spare slot.
  spare: ({ tone }) => tone(880, 820, 0.12, 'triangle', 0.1),
  'tray-complete': ({ tone }) => {
    for (const [index, pitch] of [1047, 1319, 1568].entries()) tone(pitch, pitch, 0.18, 'triangle', 0.11, index * 0.07)
  },
  // A muffled wooden "bonk": the screw won't budge.
  blocked: ({ tone, noise }) => {
    tone(260, 170, 0.12, 'sine', 0.16)
    noise(0.06, 0.05, 900, 'lowpass')
  },
  // A short creak and swish as a part lets go.
  fall: ({ tone, noise }) => {
    tone(330, 250, 0.14, 'sawtooth', 0.025)
    noise(0.32, 0.07, 1800, 'bandpass', 0.04, 500)
  },
  // A soft wooden thud on the deck or lawn.
  land: ({ tone, noise }) => {
    tone(150, 70, 0.18, 'sine', 0.22)
    noise(0.12, 0.09, 420, 'lowpass')
  },
  overflow: ({ tone }) => {
    tone(523, 494, 0.16, 'triangle', 0.12)
    tone(392, 330, 0.28, 'triangle', 0.12, 0.17)
  },
  win: ({ tone }) => {
    for (const [index, pitch] of [784, 988, 1175, 1568].entries()) tone(pitch, pitch, 0.22, 'triangle', 0.11, index * 0.09)
    tone(2093, 2093, 0.4, 'sine', 0.06, 0.38)
  },
  undo: ({ tone }) => tone(1100, 620, 0.1, 'sine', 0.08),
}

export const plateMute = createMuteStorage('bwh.plate-escape.muted.v1')

export function createPlateSfx(muted: boolean): SynthSfx<PlateSound> {
  return createSynthSfx(PLATE_SOUNDS, { muted })
}
