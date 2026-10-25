import { createSynthSfx, type SynthRecipe, type SynthSfx } from '../../_shared/audio/synthSfx'

/**
 * Procedural, all-synthesized SFX for Chick's Challenge on the shared synth
 * core (no audio assets required). Every sound is addressed
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

export type SfxEngine = SynthSfx<SfxName>

/** Every voice is short (≤ 300ms) except `win`. */
export const SFX_RECIPES: Record<SfxName, SynthRecipe> = {
  step: ({ tone }) => tone(220, 190, 0.045, 'square', 0.05),
  bump: ({ noise, tone }) => {
    noise(0.09, 0.14, 260)
    tone(110, 80, 0.08, 'square', 0.06)
  },
  'pickup-chip': ({ tone }) => {
    tone(720, 1180, 0.09, 'sine', 0.14)
    tone(1180, 1600, 0.09, 'sine', 0.09, 0.07)
  },
  'pickup-key': ({ tone }) => {
    tone(500, 820, 0.1, 'triangle', 0.14)
    tone(820, 1240, 0.12, 'triangle', 0.1, 0.09)
  },
  'pickup-boot': ({ tone }) => tone(360, 620, 0.12, 'sawtooth', 0.1),
  'door-open': ({ tone }) => {
    tone(300, 300, 0.08, 'square', 0.12)
    tone(500, 500, 0.1, 'square', 0.12, 0.08)
  },
  'socket-open': ({ tone }) => {
    tone(220, 220, 0.1, 'sawtooth', 0.13)
    tone(440, 440, 0.16, 'sawtooth', 0.13, 0.1)
  },
  'block-push': ({ noise, tone }) => {
    noise(0.12, 0.12, 400)
    tone(140, 120, 0.1, 'square', 0.06)
  },
  splash: ({ noise, tone }) => {
    noise(0.22, 0.16, 900, { filter: 'bandpass' })
    tone(500, 160, 0.18, 'sine', 0.05)
  },
  teleport: ({ tone }) => {
    tone(300, 1400, 0.22, 'sine', 0.12)
    tone(1400, 300, 0.22, 'sine', 0.08, 0.05)
  },
  'button-press': ({ tone }) => tone(500, 420, 0.06, 'square', 0.1),
  toggle: ({ tone }) => {
    tone(340, 340, 0.07, 'triangle', 0.12)
    tone(240, 240, 0.09, 'triangle', 0.1, 0.07)
  },
  'tank-reverse': ({ tone }) => {
    tone(180, 140, 0.1, 'square', 0.12)
    tone(140, 100, 0.14, 'square', 0.1, 0.1)
  },
  clone: ({ tone }) => {
    tone(700, 1000, 0.05, 'sine', 0.12)
    tone(1000, 500, 0.09, 'sine', 0.09, 0.05)
  },
  thief: ({ tone }) => {
    tone(500, 220, 0.22, 'sawtooth', 0.12)
    tone(400, 160, 0.22, 'triangle', 0.08, 0.04)
  },
  'monster-drowned': ({ noise, tone }) => {
    noise(0.24, 0.15, 700, { filter: 'bandpass' })
    tone(300, 90, 0.24, 'sine', 0.07)
  },
  'death-drowned': ({ noise, tone }) => {
    noise(0.28, 0.18, 500, { filter: 'bandpass' })
    tone(320, 90, 0.28, 'sine', 0.1)
  },
  'death-burned': ({ noise, tone }) => {
    noise(0.24, 0.16, 2200)
    tone(500, 90, 0.26, 'sawtooth', 0.13)
  },
  'death-monster': ({ tone }) => {
    tone(220, 70, 0.28, 'sawtooth', 0.14)
    tone(110, 45, 0.3, 'sawtooth', 0.08, 0.04)
  },
  win: ({ tone }) => {
    tone(523, 523, 0.11, 'square', 0.14)
    tone(659, 659, 0.11, 'square', 0.14, 0.11)
    tone(784, 784, 0.11, 'square', 0.14, 0.22)
    tone(1047, 1047, 0.4, 'square', 0.15, 0.33)
  },
  stuck: ({ noise, tone }) => {
    noise(0.1, 0.12, 220)
    tone(160, 130, 0.14, 'square', 0.1, 0.08)
  },
}

/** Quiet by default: the master level is 0.35 when unmuted. */
export function createSfxEngine(initialMuted: boolean): SfxEngine {
  return createSynthSfx(SFX_RECIPES, { muted: initialMuted, volume: 0.35, attack: 0.012 })
}
