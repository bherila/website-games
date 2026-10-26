import type { ChicksLevelDef } from './levelTypes'

/**
 * Phase 9 — Encore (41–45): compact boards (≤ 13 wide, so a phone shows them whole) that
 * combine mechanics the earlier phases taught one at a time: blocks sliding on ice into
 * water, a belt delivering a block onto a button, a block posted through a teleport, skate
 * pockets off ice lanes, and a capstone joining the first two.
 */
export const PHASE9_LEVELS: readonly ChicksLevelDef[] = [
  {
    id: 41,
    title: 'Ice Bridge',
    grid: [
      '#########',
      '#@?...c.#',
      '#.X.X...#',
      '#.......#',
      '###5#5###',
      '#c#5#5#.#',
      '#.#5#5#.#',
      '#.#5#5#c#',
      '#.#5#5#.#',
      '#..~.~..#',
      '####S####',
      '####E####',
      '#########',
    ],
    par: 40,
    hint: 'Blocks slide on ice too. Pushed one wrong? The undo button takes the move back.',
  },
  {
    id: 42,
    title: 'Belt Feeder',
    grid: [
      '###########',
      '#..c#@....#',
      '#...#..X..#',
      '#...[.##2##',
      '#c..#.##2##',
      '#...#.##(##',
      '#...#]c####',
      '##S########',
      '##E########',
      '###########',
    ],
    par: 36,
  },
  {
    id: 43,
    title: 'Parcel Post',
    grid: [
      '#############',
      '#@....#....c#',
      '#.X...#..+..#',
      '#...+.#.....#',
      '#.....#~~~~~#',
      '#..c..#.....#',
      '#######.c...#',
      '#######S#####',
      '#######E#####',
      '#############',
    ],
    par: 24,
  },
  {
    id: 44,
    title: 'Pocket Rink',
    grid: [
      '#############',
      '###c###c#####',
      '#.555555559.#',
      '#.#######.5.#',
      '#@k.....#c5.#',
      '#####.###.5.#',
      '#c....S...1.#',
      '######E######',
      '#############',
    ],
    par: 42,
  },
  {
    id: 45,
    title: 'Assembly Line',
    grid: [
      '#############',
      '#@..#c......#',
      '#.X.#####.#.#',
      '#...55555~#X#',
      '#.X.#####.#.#',
      '#...55555~#2#',
      '#c..#####.#2#',
      '#...#..c..#(#',
      '#####[#######',
      '#####S#######',
      '#####E#######',
      '#############',
    ],
    par: 48,
  },
]
