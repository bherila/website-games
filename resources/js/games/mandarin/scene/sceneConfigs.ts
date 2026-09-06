/**
 * Five diorama compositions as data. One renderer (`dioramaRenderer.ts`)
 * interprets the prop vocabulary below; there is no per-scene renderer.
 * Nothing in a config may reveal a listening answer: characters are neutral
 * silhouettes, and the friend in scene 5 is only added on the `complete` beat
 * after the learner has finished the scene.
 */
import type { SceneSetting } from '../domain/courseSchema'

export const PALETTE = {
  ivory: 0xf5efe3,
  jadeLight: 0x8fb39d,
  jade: 0x5d8a70,
  jadeDark: 0x476f59,
  slate: 0x5b6f8a,
  slateDark: 0x3f5169,
  amber: 0xd9a441,
  wood: 0x7f6b58,
  woodDark: 0x5c4d40,
  stone: 0xa6aaae,
  stoneDark: 0x8a8f95,
  plaster: 0xebe1cb,
  plasterWarm: 0xe4d7bd,
  path: 0xe0d6c0,
  paving: 0xd8cdb6,
  ground: 0x9fb694,
  groundWarm: 0xa9b6a5,
  water: 0x7f9bb5,
  mist: 0xc9d3da,
  ink: 0x2f3a44,
  skin: 0xe9bd97,
  friendCoat: 0xc9a06a,
} as const

export type Vec2 = readonly [x: number, z: number]

export type PropSpec =
  | { kind: 'hills' }
  | { kind: 'path'; from: Vec2; to: Vec2; width: number; color?: number }
  | { kind: 'paving'; x: number; z: number; w: number; d: number }
  | { kind: 'building'; x: number; z: number; w: number; d: number; h: number; wall: number; roof: number; rotation?: number }
  | { kind: 'gate'; x: number; z: number }
  | { kind: 'wall'; x: number; z: number; length: number; rotation: number; height?: number }
  | { kind: 'bridge'; x: number; z: number }
  | { kind: 'water'; x: number; z: number; w: number; d: number }
  | { kind: 'tree'; x: number; z: number; scale?: number }
  | { kind: 'bush'; x: number; z: number; scale?: number }
  | { kind: 'lantern'; x: number; z: number }
  | { kind: 'bench'; x: number; z: number; rotation?: number }
  | { kind: 'shelter'; x: number; z: number }

export type CharacterRole = 'guide' | 'traveler' | 'friend'
export type DioramaBeat = 'idle' | 'advance' | 'complete'

export interface CharacterSpec {
  role: CharacterRole
  idle: Vec2
  advance: Vec2
  /** Only exists once the scene is complete (never a clue during questions). */
  appearsOnComplete?: boolean
}

export interface DioramaConfig {
  setting: SceneSetting
  sky: number
  fog: number
  ground: number
  sunColor: number
  sunIntensity: number
  ambient: number
  sun: readonly [number, number, number]
  camera: { position: readonly [number, number, number]; target: readonly [number, number, number] }
  props: readonly PropSpec[]
  characters: readonly CharacterSpec[]
}

export const CHARACTER_COLORS: Record<CharacterRole, { coat: number; hair: number }> = {
  guide: { coat: PALETTE.jade, hair: PALETTE.ink },
  traveler: { coat: PALETTE.slate, hair: 0x3a2f2a },
  friend: { coat: PALETTE.friendCoat, hair: 0x26211f },
}

const commonLight = {
  sky: 0xe9eef1,
  fog: 0xe3e9ec,
  sunColor: 0xfff3e0,
  sunIntensity: 1.6,
  ambient: 0.9,
  sun: [5, 9, 6] as const,
}

export const DIORAMA_CONFIGS: Record<SceneSetting, DioramaConfig> = {
  gate: {
    ...commonLight,
    setting: 'gate',
    ground: PALETTE.ground,
    camera: { position: [0.4, 6.4, 10.6], target: [0, 0.7, -0.4] },
    props: [
      { kind: 'hills' },
      { kind: 'path', from: [0, 6.5], to: [0, -6.5], width: 2.4 },
      { kind: 'gate', x: 0, z: -2.2 },
      { kind: 'wall', x: -3.6, z: -2.2, length: 4.2, rotation: 0 },
      { kind: 'wall', x: 3.6, z: -2.2, length: 4.2, rotation: 0 },
      { kind: 'tree', x: -5.2, z: -0.2, scale: 1.1 },
      { kind: 'tree', x: 5.4, z: -0.9 },
      { kind: 'tree', x: -4.2, z: -4.6, scale: 0.8 },
      { kind: 'bush', x: -2.4, z: 0.6 },
      { kind: 'bush', x: 2.6, z: 1.2 },
      { kind: 'bush', x: 4.4, z: 2.6, scale: 0.8 },
      { kind: 'lantern', x: -1.5, z: -1.6 },
      { kind: 'lantern', x: 1.5, z: -1.6 },
    ],
    characters: [
      { role: 'guide', idle: [-0.9, -0.5], advance: [-0.7, -0.3] },
      { role: 'traveler', idle: [1.3, 2.4], advance: [0.9, 0.3] },
    ],
  },
  street: {
    ...commonLight,
    setting: 'street',
    ground: PALETTE.groundWarm,
    camera: { position: [0.6, 6.2, 10.4], target: [0, 0.8, -0.6] },
    props: [
      { kind: 'path', from: [0, 6.5], to: [0, -6.5], width: 2.6, color: PALETTE.paving },
      { kind: 'building', x: -3.6, z: -3.2, w: 3.2, d: 3.2, h: 2.3, wall: PALETTE.plaster, roof: PALETTE.slateDark },
      { kind: 'building', x: -3.8, z: 0.9, w: 2.8, d: 2.6, h: 1.8, wall: PALETTE.plasterWarm, roof: PALETTE.slate },
      { kind: 'building', x: 3.7, z: -2.6, w: 3.4, d: 3.4, h: 2.5, wall: PALETTE.plasterWarm, roof: PALETTE.slate },
      { kind: 'building', x: 3.8, z: 1.6, w: 2.6, d: 2.4, h: 1.7, wall: PALETTE.plaster, roof: PALETTE.slateDark },
      { kind: 'building', x: -0.4, z: -6.2, w: 4.2, d: 2.6, h: 2.1, wall: PALETTE.plaster, roof: PALETTE.slate },
      { kind: 'lantern', x: -1.7, z: -1.2 },
      { kind: 'lantern', x: 1.7, z: 0.4 },
      { kind: 'bush', x: -1.9, z: 2.8 },
      { kind: 'bush', x: 2.0, z: 3.4, scale: 0.8 },
      { kind: 'tree', x: 5.6, z: 4.2, scale: 0.9 },
      { kind: 'tree', x: -5.8, z: 4.0, scale: 0.85 },
    ],
    characters: [
      { role: 'guide', idle: [-1.0, 0.1], advance: [-0.8, -0.2] },
      { role: 'traveler', idle: [1.2, 2.2], advance: [0.7, 0.4] },
    ],
  },
  bridge: {
    ...commonLight,
    setting: 'bridge',
    ground: PALETTE.ground,
    camera: { position: [1.2, 6.0, 10.8], target: [0, 0.6, -0.2] },
    props: [
      { kind: 'hills' },
      { kind: 'water', x: 0, z: 0, w: 16, d: 3.4 },
      { kind: 'path', from: [0, 6.5], to: [0, 1.9], width: 2.2 },
      { kind: 'path', from: [0, -1.9], to: [0, -6.5], width: 2.2 },
      { kind: 'bridge', x: 0, z: 0 },
      { kind: 'tree', x: -4.6, z: -3.4, scale: 1.1 },
      { kind: 'tree', x: 4.8, z: -3.8 },
      { kind: 'tree', x: -5.4, z: 3.6, scale: 0.9 },
      { kind: 'bush', x: 2.8, z: 3.2 },
      { kind: 'bush', x: -2.6, z: -3.0, scale: 0.8 },
      { kind: 'bush', x: 3.4, z: -2.6, scale: 0.7 },
      { kind: 'lantern', x: -1.6, z: 2.4 },
    ],
    characters: [
      { role: 'guide', idle: [-0.8, -2.8], advance: [-0.6, -2.4] },
      { role: 'traveler', idle: [0.7, 3.0], advance: [0.3, 0.3] },
    ],
  },
  roadside: {
    ...commonLight,
    setting: 'roadside',
    ground: PALETTE.ground,
    camera: { position: [-0.8, 6.0, 10.6], target: [0.4, 0.8, -0.4] },
    props: [
      { kind: 'hills' },
      { kind: 'path', from: [-8, 1.6], to: [8, 1.6], width: 2.2 },
      { kind: 'shelter', x: 1.6, z: -1.2 },
      { kind: 'bench', x: 1.6, z: -1.6 },
      { kind: 'tree', x: -4.6, z: -1.6, scale: 1.2 },
      { kind: 'tree', x: 5.4, z: -2.4 },
      { kind: 'tree', x: -5.6, z: 4.0, scale: 0.8 },
      { kind: 'bush', x: -2.4, z: -0.6 },
      { kind: 'bush', x: 4.2, z: 0.0, scale: 0.8 },
      { kind: 'bush', x: 3.2, z: 3.6, scale: 0.7 },
      { kind: 'lantern', x: -0.6, z: -0.2 },
    ],
    characters: [
      { role: 'guide', idle: [1.3, -0.4], advance: [1.1, -0.2] },
      { role: 'traveler', idle: [-1.6, 1.8], advance: [0.0, 0.5] },
    ],
  },
  reunion: {
    ...commonLight,
    sky: 0xf1e6d4,
    fog: 0xeadfcc,
    sunColor: 0xffe2b0,
    sunIntensity: 1.8,
    sun: [-4, 7, 6],
    setting: 'reunion',
    ground: PALETTE.groundWarm,
    camera: { position: [0, 6.3, 10.6], target: [0, 0.8, -0.6] },
    props: [
      { kind: 'paving', x: 0, z: -0.4, w: 7.4, d: 6.4 },
      { kind: 'path', from: [0, 6.5], to: [0, 2.6], width: 2.4, color: PALETTE.paving },
      { kind: 'building', x: -4.4, z: -1.8, w: 3.0, d: 3.6, h: 2.2, wall: PALETTE.plaster, roof: PALETTE.slateDark },
      { kind: 'building', x: 4.4, z: -1.8, w: 3.0, d: 3.6, h: 2.2, wall: PALETTE.plasterWarm, roof: PALETTE.slate },
      { kind: 'wall', x: 0, z: -4.0, length: 7.6, rotation: 0, height: 0.9 },
      { kind: 'bush', x: -2.6, z: -3.2, scale: 0.8 },
      { kind: 'bush', x: 2.6, z: -3.2, scale: 0.8 },
      { kind: 'tree', x: -2.2, z: -5.4, scale: 0.9 },
      { kind: 'tree', x: 2.4, z: -5.6 },
      { kind: 'lantern', x: -1.8, z: 2.4 },
      { kind: 'lantern', x: 1.8, z: 2.4 },
      { kind: 'bench', x: -3.0, z: 1.2, rotation: Math.PI / 2 },
    ],
    characters: [
      { role: 'guide', idle: [-1.3, 0.5], advance: [-1.1, 0.2] },
      { role: 'traveler', idle: [1.0, 1.6], advance: [0.8, 0.3] },
      { role: 'friend', idle: [0, -3.2], advance: [0, -0.8], appearsOnComplete: true },
    ],
  },
}

export function dioramaConfig(setting: SceneSetting): DioramaConfig {
  return DIORAMA_CONFIGS[setting]
}
