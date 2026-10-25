import { clampIntensity, createSynthSfx, type SynthRecipe, type SynthSfx } from '../../_shared/audio/synthSfx'

/**
 * Procedural SFX — short synthesized one-shots on the shared synth core, no
 * audio assets. Sounds are keyed by name so recorded samples could replace
 * the synthesis later without touching callers.
 */
export type SfxName = 'slide' | 'merge' | 'blocked' | 'win' | 'gameOver' | 'undo'
export type SfxEngine = SynthSfx<SfxName>

export const SFX_RECIPES: Record<SfxName, SynthRecipe> = {
  slide: ({ tone }) => tone(320, 220, 0.05, 'triangle', 0.05),
  // Higher merges ring brighter, so a big combine sounds like one.
  merge: ({ tone }, intensity) => {
    const level = clampIntensity(intensity)
    tone(420 + 260 * level, 900 + 300 * level, 0.09, 'sine', 0.1)
  },
  blocked: ({ tone }) => tone(180, 140, 0.07, 'sawtooth', 0.05),
  undo: ({ tone }) => tone(700, 380, 0.09, 'triangle', 0.07),
  win: ({ tone }) => {
    tone(523, 523, 0.12, 'square', 0.12)
    tone(659, 659, 0.12, 'square', 0.12, 0.12)
    tone(784, 784, 0.12, 'square', 0.12, 0.24)
    tone(1047, 1047, 0.45, 'square', 0.13, 0.36)
  },
  gameOver: ({ tone }) => {
    tone(392, 330, 0.22, 'sawtooth', 0.11)
    tone(294, 196, 0.45, 'sawtooth', 0.12, 0.2)
  },
}

export function createSfxEngine(initialMuted: boolean): SfxEngine {
  return createSynthSfx(SFX_RECIPES, { muted: initialMuted, volume: 1, attack: 0.012, minIntervalMs: { slide: 60, merge: 40, blocked: 200 } })
}
