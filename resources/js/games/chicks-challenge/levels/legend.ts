import type { MonsterKind, TileKind } from '../engine/types'

/**
 * Single source of truth mapping level-grid characters to board content.
 * Entity entries (player/block/monster) imply a floor tile underneath.
 * See the tile legend table in docs/games/chicks-challenge.md.
 */
export type LegendEntry =
  | { readonly kind: 'tile'; readonly tile: TileKind }
  | { readonly kind: 'playerStart' }
  | { readonly kind: 'block' }
  | { readonly kind: 'monster'; readonly monster: MonsterKind }

function tile(tileKind: TileKind): LegendEntry {
  return { kind: 'tile', tile: tileKind }
}

export const LEGEND: Readonly<Record<string, LegendEntry>> = {
  '.': tile('floor'),
  '#': tile('wall'),
  '@': { kind: 'playerStart' },
  E: tile('exit'),
  c: tile('chip'),
  S: tile('socket'),
  r: tile('keyRed'),
  g: tile('keyGreen'),
  b: tile('keyBlue'),
  y: tile('keyYellow'),
  R: tile('doorRed'),
  G: tile('doorGreen'),
  B: tile('doorBlue'),
  Y: tile('doorYellow'),
  '~': tile('water'),
  '*': tile('fire'),
  '%': tile('dirt'),
  f: tile('flippers'),
  i: tile('fireBoots'),
  k: tile('skates'),
  u: tile('suctionBoots'),
  '5': tile('ice'),
  '7': tile('iceNW'),
  '9': tile('iceNE'),
  '1': tile('iceSW'),
  '3': tile('iceSE'),
  '8': tile('forceUp'),
  '2': tile('forceDown'),
  '4': tile('forceLeft'),
  '6': tile('forceRight'),
  '?': tile('hint'),
  ',': tile('popup'),
  '[': tile('toggleClosed'),
  ']': tile('toggleOpen'),
  '(': tile('buttonGreen'),
  '=': tile('buttonBlue'),
  ')': tile('buttonRed'),
  M: tile('cloneMachine'),
  '+': tile('teleport'),
  Z: tile('thief'),
  X: { kind: 'block' },
  A: { kind: 'monster', monster: 'bug' },
  O: { kind: 'monster', monster: 'ball' },
  F: { kind: 'monster', monster: 'fireball' },
  T: { kind: 'monster', monster: 'tank' },
}
