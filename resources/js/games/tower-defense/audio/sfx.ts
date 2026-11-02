import { clampIntensity, createSynthSfx, type SynthRecipe, type SynthSfx } from '../../_shared/audio/synthSfx'
import type { GameEvent, TowerId } from '../gameTypes'

export type SfxName =
  | 'arrow'
  | 'ember'
  | 'frost'
  | 'thorn'
  | 'boulder'
  | 'sun'
  | 'hex'
  | 'death'
  | 'coin'
  | 'place'
  | 'built'
  | 'upgraded'
  | 'sold'
  | 'strike'
  | 'destroyed'
  | 'leak'
  | 'wave'
  | 'boss'
  | 'cleared'
  | 'pick'
  | 'deny'
  | 'win'
  | 'lose'

export type SfxEngine = SynthSfx<SfxName>

/** All synthesized, like the site's other arcade games: no audio assets to cache. */
export const SFX_RECIPES: Record<SfxName, SynthRecipe> = {
  arrow: ({ noise, tone }) => {
    noise(0.04, 0.04, 3200)
    tone(1100, 700, 0.04, 'triangle', 0.03)
  },
  ember: ({ tone, noise }) => {
    tone(240, 120, 0.12, 'sawtooth', 0.05)
    noise(0.1, 0.05, 1200)
  },
  frost: ({ tone }) => {
    tone(1800, 1300, 0.09, 'sine', 0.05)
    tone(2400, 1900, 0.07, 'sine', 0.03, 0.03)
  },
  thorn: ({ tone }) => tone(620, 860, 0.05, 'triangle', 0.04),
  boulder: ({ tone, noise }) => {
    tone(130, 60, 0.18, 'sine', 0.12)
    noise(0.1, 0.06, 500)
  },
  sun: ({ tone }) => {
    tone(1500, 2300, 0.08, 'sawtooth', 0.035)
    tone(760, 1150, 0.08, 'sine', 0.04)
  },
  hex: ({ tone }) => {
    tone(300, 150, 0.2, 'square', 0.04)
    tone(450, 225, 0.2, 'sine', 0.05)
  },
  death: ({ tone, noise }, intensity) => {
    const level = clampIntensity(intensity)
    tone(420, 150, 0.09, 'triangle', 0.07 * level)
    noise(0.05, 0.04 * level, 1500)
  },
  coin: ({ tone }) => {
    tone(1319, 1319, 0.05, 'square', 0.04)
    tone(1760, 1760, 0.1, 'square', 0.045, 0.05)
  },
  place: ({ tone }) => tone(520, 660, 0.05, 'triangle', 0.08),
  built: ({ tone, noise }) => {
    noise(0.05, 0.08, 1800)
    tone(220, 330, 0.09, 'square', 0.07)
  },
  upgraded: ({ tone }) => {
    tone(660, 660, 0.08, 'triangle', 0.1)
    tone(880, 880, 0.08, 'triangle', 0.1, 0.08)
    tone(1175, 1175, 0.16, 'triangle', 0.1, 0.16)
  },
  sold: ({ tone }) => {
    tone(990, 660, 0.09, 'triangle', 0.08)
    tone(1319, 880, 0.09, 'triangle', 0.05, 0.05)
  },
  strike: ({ noise, tone }) => {
    noise(0.05, 0.08, 700)
    tone(190, 110, 0.05, 'square', 0.04)
  },
  destroyed: ({ noise, tone }) => {
    noise(0.28, 0.2, 800)
    tone(170, 50, 0.3, 'sawtooth', 0.13)
  },
  leak: ({ tone }) => {
    tone(392, 196, 0.2, 'sawtooth', 0.12)
    tone(311, 155, 0.25, 'sawtooth', 0.09, 0.08)
  },
  wave: ({ tone }) => {
    tone(330, 330, 0.12, 'sawtooth', 0.09)
    tone(494, 494, 0.26, 'sawtooth', 0.1, 0.13)
  },
  boss: ({ tone, noise }) => {
    tone(110, 82, 0.45, 'sawtooth', 0.16)
    tone(165, 123, 0.45, 'square', 0.08)
    noise(0.3, 0.08, 400)
  },
  cleared: ({ tone }) => {
    tone(784, 784, 0.1, 'sine', 0.1)
    tone(1047, 1047, 0.2, 'sine', 0.11, 0.1)
  },
  pick: ({ tone }) => {
    tone(523, 1047, 0.18, 'sine', 0.12)
    tone(784, 1568, 0.2, 'sine', 0.08, 0.08)
  },
  deny: ({ tone }) => tone(180, 140, 0.11, 'square', 0.08),
  win: ({ tone }) => {
    tone(523, 523, 0.13, 'triangle', 0.15)
    tone(659, 659, 0.13, 'triangle', 0.15, 0.13)
    tone(784, 784, 0.13, 'triangle', 0.15, 0.26)
    tone(1047, 1047, 0.5, 'triangle', 0.16, 0.39)
  },
  lose: ({ tone }) => {
    tone(392, 370, 0.25, 'sawtooth', 0.13)
    tone(370, 311, 0.25, 'sawtooth', 0.13, 0.25)
    tone(311, 208, 0.55, 'sawtooth', 0.15, 0.5)
  },
}

export function createSfxEngine(initialMuted: boolean): SfxEngine {
  return createSynthSfx(SFX_RECIPES, {
    muted: initialMuted,
    volume: 1,
    attack: 0.012,
    // Dozens of towers firing at once must not stack into a wall of noise.
    minIntervalMs: { arrow: 110, ember: 160, frost: 180, thorn: 130, boulder: 220, sun: 160, hex: 240, death: 90, coin: 70, strike: 180, place: 40 },
  })
}

const FIRE_SOUND: Record<TowerId, SfxName | null> = { wall: null, arrow: 'arrow', ember: 'ember', frost: 'frost', thorn: 'thorn', boulder: 'boulder', sun: 'sun', hex: 'hex' }

export function playEventSfx(events: readonly GameEvent[], play: (name: SfxName, intensity?: number) => void): void {
  for (const event of events) {
    switch (event.type) {
      case 'fire': {
        const sound = FIRE_SOUND[event.tower]
        if (sound) {
          play(sound)
        }
        break
      }
      case 'death':
        play('death', event.kind === 'boss' ? 1 : 0.6)
        break
      case 'coin':
        play('coin')
        break
      case 'built':
        play('built')
        break
      case 'upgraded':
        play('upgraded')
        break
      case 'sold':
        play('sold')
        break
      case 'strike':
        play('strike')
        break
      case 'destroyed':
        play('destroyed')
        break
      case 'leak':
        play('leak')
        break
      case 'waveStart':
        play(event.boss ? 'boss' : 'wave')
        break
      case 'waveCleared':
        play('cleared')
        break
      default:
        break
    }
  }
}
