import { ENEMIES } from './catalog'
import type { EnemyKind, LevelDef, WaveDef, WaveGroup } from './gameTypes'

const OPEN_ROW = '.............'

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1, title: 'Meadow Pass', theme: 'meadow', waves: 8, startGold: 100, hpScale: 0.8, countScale: 0.85,
    picksAfter: [3, 6], elementOrder: ['nature', 'fire', 'water'],
    map: [
      '......S......', OPEN_ROW, OPEN_ROW, OPEN_ROW, '..##.....#...', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '.......##....', OPEN_ROW,
      OPEN_ROW, '.#...........', OPEN_ROW, OPEN_ROW, OPEN_ROW, '.........##..', OPEN_ROW, OPEN_ROW, OPEN_ROW, '......E......',
    ],
  },
  {
    id: 2, title: 'Twin Creeks', theme: 'meadow', waves: 10, startGold: 110, hpScale: 0.95, countScale: 0.9,
    picksAfter: [0, 4, 8], elementOrder: ['fire', 'earth', 'nature', 'water'],
    map: [
      '..S..........', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '~~~~~~~,,~~~~', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW,
      OPEN_ROW, OPEN_ROW, OPEN_ROW, '~~~,,~~~~~~~~', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '..........E..',
    ],
  },
  {
    id: 3, title: 'Stone Garden', theme: 'dunes', waves: 12, startGold: 120, hpScale: 1, countScale: 0.95,
    picksAfter: [0, 4, 8], elementOrder: ['earth', 'light', 'fire', 'dark'],
    map: [
      '......S......', OPEN_ROW, '..#.......#..', OPEN_ROW, '.....#.#.....', OPEN_ROW, '.#.........#.', OPEN_ROW, '....#...#....', OPEN_ROW, '.##..#.#..##.',
      OPEN_ROW, '....#...#....', OPEN_ROW, '.#.........#.', OPEN_ROW, '.....#.#.....', OPEN_ROW, '..#.......#..', OPEN_ROW, '......E......',
    ],
  },
  {
    id: 4, title: 'Two Gates', theme: 'dunes', waves: 14, startGold: 140, hpScale: 0.8, countScale: 0.85,
    picksAfter: [0, 4, 8, 12], elementOrder: ['light', 'dark', 'water', 'earth'],
    map: [
      '..S.......S..', OPEN_ROW, OPEN_ROW, OPEN_ROW, '.....###.....', '.....###.....', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '##.........##',
      OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '.....~~~.....', '.....~~~.....', OPEN_ROW, OPEN_ROW, OPEN_ROW, '......E......',
    ],
  },
  {
    id: 5, title: 'Frozen Switchback', theme: 'tundra', waves: 15, startGold: 150, hpScale: 0.95, countScale: 1,
    picksAfter: [0, 4, 8, 12], elementOrder: ['water', 'fire', 'dark', 'nature'],
    map: [
      'S............', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '#########,,..', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '..,,#########',
      OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '#########,,..', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, 'E............',
    ],
  },
  {
    id: 6, title: 'Glacier Lake', theme: 'tundra', waves: 16, startGold: 160, hpScale: 0.85, countScale: 0.85,
    picksAfter: [0, 4, 8, 12], elementOrder: ['dark', 'nature', 'light', 'water'],
    map: [
      '......S......', OPEN_ROW, OPEN_ROW, OPEN_ROW, '....~~~~~....', '...~~~~~~~...', '...~~~~~~~...', '...~~~~~~~...', '....~~~~~....', OPEN_ROW, OPEN_ROW,
      OPEN_ROW, '...##...##...', OPEN_ROW, OPEN_ROW, OPEN_ROW, '.##.......##.', OPEN_ROW, OPEN_ROW, OPEN_ROW, '......E......',
    ],
  },
  {
    id: 7, title: 'Cinder Crossing', theme: 'ember', waves: 18, startGold: 170, hpScale: 0.9, countScale: 0.9,
    picksAfter: [0, 4, 8, 12, 16], elementOrder: ['fire', 'light', 'earth', 'dark', 'water'],
    map: [
      'S...........S', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, '..~~~~~~~~~..', '..~.......~..', '..~.......~..', '..~.......~..', '..~...E...~..',
      '..~.......~..', '..~.......~..', '..~.......~..', '..~~~~,~~~~..', OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW, OPEN_ROW,
    ],
  },
  {
    id: 8, title: 'The Last Keep', theme: 'dusk', waves: 20, startGold: 190, hpScale: 1.05, countScale: 1,
    picksAfter: [0, 4, 8, 12, 16], elementOrder: ['dark', 'earth', 'water', 'light', 'nature', 'fire'],
    map: [
      'S.....S.....S', OPEN_ROW, OPEN_ROW, '..#..#.#..#..', OPEN_ROW, OPEN_ROW, OPEN_ROW, '.#.........#.', OPEN_ROW, OPEN_ROW, '...#.....#...',
      OPEN_ROW, OPEN_ROW, '.#.........#.', OPEN_ROW, OPEN_ROW, '...~~~.~~~...', OPEN_ROW, OPEN_ROW, OPEN_ROW, '......E......',
    ],
  },
]

export const TOTAL_LEVELS = LEVELS.length

export function levelById(id: number): LevelDef | null {
  return LEVELS.find((level) => level.id === id) ?? null
}

interface Pattern {
  groups: readonly { kind: EnemyKind; share: number }[]
}

// The early waves introduce one enemy at a time; later waves cycle the mixed patterns.
const INTRO_PATTERNS: readonly Pattern[] = [
  { groups: [{ kind: 'grunt', share: 1 }] },
  { groups: [{ kind: 'grunt', share: 1.2 }] },
  { groups: [{ kind: 'swift', share: 1.3 }] },
  { groups: [{ kind: 'grunt', share: 0.7 }, { kind: 'swarm', share: 1 }] },
]
const CYCLE_PATTERNS: readonly Pattern[] = [
  { groups: [{ kind: 'brute', share: 0.45 }, { kind: 'grunt', share: 0.6 }] },
  { groups: [{ kind: 'flyer', share: 0.75 }, { kind: 'swift', share: 0.5 }] },
  { groups: [{ kind: 'sapper', share: 0.6 }, { kind: 'grunt', share: 0.7 }] },
  { groups: [{ kind: 'swarm', share: 1.6 }, { kind: 'brute', share: 0.3 }] },
]

/** Health climbs steadily then bends upward, so late waves need upgrades, not just more towers. */
export function waveHpMultiplier(level: LevelDef, wave: number): number {
  const step = wave - 1

  return level.hpScale * (1 + (0.2 * step) + (0.02 * step * step))
}

export function waveCoinMultiplier(wave: number): number {
  return 1 + (0.09 * (wave - 1))
}

/** The whole campaign is data: every level's waves come from this one deterministic rule. */
export function buildWaves(level: LevelDef): WaveDef[] {
  const waves: WaveDef[] = []
  for (let number = 1; number <= level.waves; number += 1) {
    const baseCount = (5.5 + (number * 0.55)) * level.countScale
    const boss = number % 5 === 0
    const groups: WaveGroup[] = []
    if (boss) {
      const bosses = number >= 15 ? 2 : 1
      groups.push({ kind: 'boss', count: bosses, interval: ENEMIES.boss.interval, delay: 0 })
      groups.push({ kind: number % 2 === 0 ? 'swift' : 'grunt', count: Math.round(baseCount * 0.5), interval: 0.9, delay: 2 })
    } else {
      const index = number - 1 - Math.floor(number / 5)
      const pattern = INTRO_PATTERNS[index] ?? CYCLE_PATTERNS[(index - INTRO_PATTERNS.length) % CYCLE_PATTERNS.length] ?? INTRO_PATTERNS[0]
      let delay = 0
      for (const group of pattern?.groups ?? []) {
        const count = Math.max(1, Math.round(baseCount * group.share))
        groups.push({ kind: group.kind, count, interval: ENEMIES[group.kind].interval, delay })
        delay += (count * ENEMIES[group.kind].interval * 0.55) + 0.5
      }
    }
    waves.push({
      number,
      element: number <= 2 ? null : level.elementOrder[(number - 3) % level.elementOrder.length] ?? null,
      groups,
      hpMultiplier: waveHpMultiplier(level, number),
      coinMultiplier: waveCoinMultiplier(number),
      boss,
    })
  }

  return waves
}
