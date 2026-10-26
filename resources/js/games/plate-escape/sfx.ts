import { createMuteStorage } from '../_shared/audio/muteStorage'
import { createSynthSfx, type SynthRecipe, type SynthSfx } from '../_shared/audio/synthSfx'
import type { ScrewColor } from './level'

export type PlateSound = `unscrew-${ScrewColor}` | 'tray' | 'spare' | 'tray-complete' | 'blocked' | 'fall' | 'swing' | 'slide' | 'land' | 'splash' | 'overflow' | 'win' | 'undo' | 'dial'

/**
 * Toy-workshop sounds: each drive turns out with its own rhythm and pop, chimes
 * for trays, wooden knocks for parts.
 */
export const PLATE_SOUNDS: Record<PlateSound, SynthRecipe> = {
  // Slot: a flat blade scrapes round twice, slow and low, then a dull pop.
  'unscrew-coral': ({ tone, noise }) => {
    for (const delay of [0, 0.08]) noise(0.06, 0.06, 1100, { filter: 'bandpass', delay, sweepTo: 700, q: 2.5 })
    tone(360, 880, 0.1, 'triangle', 0.14, 0.17)
  },
  // Cross: three quick ratchet ticks climbing, then the screw pops free.
  'unscrew-mint': ({ tone }) => {
    for (const [index, pitch] of [1500, 1700, 1950].entries()) tone(pitch, pitch * 0.9, 0.025, 'square', 0.035, index * 0.05)
    tone(520, 1240, 0.09, 'sine', 0.14, 0.16)
  },
  // Square: four even, chunky clicks, then a woody knock.
  'unscrew-blue': ({ tone }) => {
    for (let index = 0; index < 4; index++) tone(1050, 1000, 0.02, 'square', 0.04, index * 0.035)
    tone(300, 680, 0.1, 'triangle', 0.15, 0.17)
  },
  // Star: a bright spinning tinkle falling away, then a high pop.
  'unscrew-amber': ({ tone }) => {
    for (const [index, pitch] of [2600, 2300, 2050].entries()) tone(pitch, pitch * 0.97, 0.05, 'sine', 0.05, index * 0.04)
    tone(700, 1700, 0.08, 'sine', 0.12, 0.15)
  },
  // Hex: an Allen key spins smoothly through six soft clicks, then a clear, glassy pop.
  'unscrew-pearl': ({ tone }) => {
    for (let index = 0; index < 6; index++) tone(1300, 1240, 0.015, 'triangle', 0.035, index * 0.025)
    tone(600, 1500, 0.09, 'sine', 0.13, 0.17)
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
    noise(0.06, 0.05, 900, { attack: 0.02 })
  },
  // A short creak and swish as a part lets go.
  fall: ({ tone, noise }) => {
    tone(330, 250, 0.14, 'sawtooth', 0.025)
    noise(0.32, 0.07, 1800, { filter: 'bandpass', delay: 0.04, sweepTo: 500, attack: 0.03, q: 1.4 })
  },
  // A rising hinge creak as a door or hatch swings open.
  swing: ({ tone, noise }) => {
    tone(420, 760, 0.3, 'sawtooth', 0.02)
    tone(840, 1150, 0.22, 'triangle', 0.025, 0.06)
    noise(0.18, 0.03, 2400, { filter: 'bandpass', delay: 0.05, sweepTo: 3200, attack: 0.04, q: 3 })
  },
  // A shutter rattles down its rail and knocks against the stop.
  slide: ({ tone, noise }) => {
    noise(0.28, 0.05, 1500, { filter: 'bandpass', sweepTo: 700, attack: 0.02, q: 2 })
    tone(240, 150, 0.12, 'triangle', 0.16, 0.3)
  },
  // A part drops into the harbor: a plop, then a fizz of spray.
  splash: ({ tone, noise }) => {
    tone(520, 180, 0.14, 'sine', 0.16)
    noise(0.4, 0.08, 2600, { filter: 'bandpass', delay: 0.03, sweepTo: 900, attack: 0.02, q: 0.8 })
  },
  // A soft wooden thud on the deck or lawn.
  land: ({ tone, noise }) => {
    tone(150, 70, 0.18, 'sine', 0.22)
    noise(0.12, 0.09, 420, { attack: 0.03 })
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
  // A dial clicks round into its next stop: two dry detent ticks and a low seat.
  dial: ({ tone, noise }) => {
    for (const [index, pitch] of [2300, 2050].entries()) tone(pitch, pitch * 0.8, 0.018, 'square', 0.03, index * 0.06)
    noise(0.04, 0.04, 3000, { filter: 'bandpass', delay: 0.12, q: 2 })
    tone(380, 300, 0.06, 'triangle', 0.08, 0.12)
  },
}

export const plateMute = createMuteStorage('bwh.plate-escape.muted.v1')

export function createPlateSfx(muted: boolean): SynthSfx<PlateSound> {
  return createSynthSfx(PLATE_SOUNDS, { muted, attack: 0.008 })
}
