import { clampIntensity, createSynthSfx, type SynthRecipe, type SynthSfx } from '../../_shared/audio/synthSfx'
import type { GameEvent } from '../gameTypes'

export type SfxName =
  | 'volley'
  | 'pop'
  | 'gateGood'
  | 'gateBad'
  | 'gateUpgrade'
  | 'clash'
  | 'bossPulse'
  | 'win'
  | 'lose'

export type SfxEngine = SynthSfx<SfxName>

/** All-synthesized neon SFX — short oscillator/noise one-shots, no audio assets. */
export const SFX_RECIPES: Record<SfxName, SynthRecipe> = {
  // Pew: short bright zap.
  volley: ({ tone }, intensity) => tone(1400, 700, 0.05, 'square', 0.045 * clampIntensity(intensity)),
  // Enemy unit bursting.
  pop: ({ tone, noise }, intensity) => {
    const level = clampIntensity(intensity)
    tone(520, 180, 0.08, 'triangle', 0.09 * level)
    noise(0.05, 0.05 * level, 1800)
  },
  // Ascending power-up chime.
  gateGood: ({ tone }) => {
    tone(600, 1200, 0.1, 'sine', 0.14)
    tone(900, 1800, 0.12, 'sine', 0.1, 0.06)
  },
  // Sour descending buzzer.
  gateBad: ({ tone }) => {
    tone(420, 140, 0.16, 'sawtooth', 0.15)
    tone(420, 110, 0.2, 'sawtooth', 0.12, 0.12)
  },
  // Tick of a value notching up.
  gateUpgrade: ({ tone }) => tone(980, 1560, 0.05, 'square', 0.05),
  // Crowds colliding: crunchy noise thump with a low hit.
  clash: ({ tone, noise }, intensity) => {
    const level = clampIntensity(intensity)
    noise(0.22, 0.22 * level, 900)
    tone(160, 60, 0.24, 'sawtooth', 0.14 * level)
  },
  // Menacing low zap from the boss.
  bossPulse: ({ tone, noise }) => {
    tone(220, 70, 0.18, 'sawtooth', 0.13)
    noise(0.1, 0.08, 500)
  },
  win: ({ tone }) => {
    tone(523, 523, 0.13, 'square', 0.15)
    tone(659, 659, 0.13, 'square', 0.15, 0.13)
    tone(784, 784, 0.13, 'square', 0.15, 0.26)
    tone(1047, 1047, 0.5, 'square', 0.16, 0.39)
    tone(784, 784, 0.5, 'triangle', 0.1, 0.39)
  },
  lose: ({ tone }) => {
    tone(392, 370, 0.25, 'sawtooth', 0.14)
    tone(370, 311, 0.25, 'sawtooth', 0.14, 0.25)
    tone(311, 208, 0.6, 'sawtooth', 0.16, 0.5)
  },
}

/** Rapid-fire names are rate-limited so a 60-per-second event stream cannot stack into noise. */
export function createSfxEngine(initialMuted: boolean): SfxEngine {
  return createSynthSfx(SFX_RECIPES, { muted: initialMuted, volume: 1, attack: 0.015, minIntervalMs: { volley: 90, pop: 150, gateUpgrade: 150 } })
}
/** Maps a frame's drained simulation events onto sfx calls. */
export function playEventSfx(events: readonly GameEvent[], playSfx: (name: SfxName, intensity?: number) => void): void {
  for (const event of events) {
    switch (event.type) {
      case 'volley':
        playSfx('volley')
        break
      case 'kills':
        playSfx('pop', Math.min(1, 0.4 + event.count * 0.05))
        break
      case 'gateUpgraded':
        playSfx('gateUpgrade')
        break
      case 'gateApplied':
        if (event.delta === 0) {
          playSfx('gateUpgrade')
        } else {
          playSfx(event.delta > 0 ? 'gateGood' : 'gateBad')
        }
        break
      case 'clash':
        playSfx('clash', Math.min(1, 0.5 + event.lostSoldiers * 0.02))
        break
      case 'bossPulse':
        playSfx('bossPulse')
        break
      default:
        break
    }
  }
}
