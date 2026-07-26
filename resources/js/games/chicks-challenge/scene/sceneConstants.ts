/**
 * Palette, sizes, z-layers, and tween constants shared across the Chick's Challenge
 * scene modules. Step/slide tween durations are the canonical values from
 * `../gameTypes` (the engine/scene contract) — re-exported here so scene
 * code has a single import site for every timing constant.
 */
import { SLIDE_TWEEN_MS, STEP_TWEEN_MS } from '../gameTypes'

export { SLIDE_TWEEN_MS, STEP_TWEEN_MS }

/** World units per tile (see cameraRig.ts / boardBuilder.ts for the mapping). */
export const TILE_WORLD_SIZE = 1

/** Procedural canvas texture edge length in pixels, before compression. */
export const TILE_TEXTURE_SIZE = 128
export const ENTITY_TEXTURE_SIZE = 128

// Z-layers: the board looks straight down a flat XY plane, so layering is
// done with small z offsets rather than draw order.
export const Z_TILE = 0
export const Z_ENTITY = 0.01
export const Z_EFFECT = 0.02

// The camera sits at (0, 0, CAMERA_Z) with no rotation and never moves along
// x/y — panning/fitting is done purely by resizing its left/right/top/bottom
// frustum (see cameraRig.ts / ChicksScene.tsx), so world x/y == camera-space
// x/y and CameraView.centerX/centerY map straight onto the frustum.
export const CAMERA_Z = 10
export const CAMERA_NEAR = 1
export const CAMERA_FAR = 20
/** Exponential-decay convergence rate (per second) for the follow camera. */
export const CAMERA_FOLLOW_SMOOTHING_PER_SEC = 8

// Effect durations (ms) — short and self-cleaning per docs/games/chicks-challenge.md.
export const TELEPORT_FLASH_MS = 220
export const DEATH_FLASH_MS = 380
export const POP_EFFECT_MS = 260
export const SPARKLE_EFFECT_MS = 340
export const SPLASH_EFFECT_MS = 420
export const PUFF_EFFECT_MS = 420
export const CONFETTI_EFFECT_MS = 1000

/** Instant repositioning (teleport/clone) still gets a minimal tween tick so easing math never divides by zero. */
export const INSTANT_TWEEN_MS = 1

/**
 * Colorblind-safe-ish palette: every tile also gets a distinct silhouette in
 * tileTextures.ts, so no two tiles rely on hue alone to read apart.
 */
export const PALETTE = {
  wallBase: 0x334155,
  wallBevelLight: 0x64748b,
  wallBevelShadow: 0x1e293b,

  floorBase: 0xe7ecf3,
  floorFleck: 0xcbd5e1,

  exitCore: 0xf5f3ff,
  exitRing: 0x8b5cf6,

  socketRecess: 0x1e293b,
  socketPin: 0xd4af37,

  chipBody: 0x0ea5e9,
  chipPin: 0xd4af37,

  keyRed: 0xdc2626,
  keyGreen: 0x16a34a,
  keyBlue: 0x2563eb,
  keyYellow: 0xd4a017,

  doorRed: 0xb91c1c,
  doorGreen: 0x15803d,
  doorBlue: 0x1d4ed8,
  doorYellow: 0xa16207,
  doorKeyhole: 0x1e293b,

  waterBase: 0x1d4ed8,
  waterRipple: 0x93c5fd,

  fireBase: 0xea580c,
  fireCore: 0xfacc15,

  dirtBase: 0x92400e,
  dirtFleck: 0x78350f,

  flippers: 0x0d9488,
  fireBoots: 0xdc2626,
  skates: 0x38bdf8,
  suctionBoots: 0xea580c,

  iceBase: 0xdff3fb,
  iceHighlight: 0xffffff,
  iceWallEdge: 0x7dd3fc,

  forceBase: 0x0f766e,
  forceChevron: 0xa7f3d0,

  hintGlyph: 0x1e293b,

  popupBase: 0xe7ecf3,
  popupDash: 0x94a3b8,

  toggleClosed: 0x6d28d9,
  toggleOpen: 0xe9d5ff,

  buttonGreen: 0x22c55e,
  buttonBlue: 0x3b82f6,
  buttonRed: 0xef4444,

  cloneStripeA: 0xfacc15,
  cloneStripeB: 0x1e293b,

  teleportCore: 0x312e81,
  teleportSwirl: 0xc4b5fd,

  thiefBody: 0x27272a,
  thiefEyes: 0xef4444,

  playerBody: 0xfacc15,
  playerVisor: 0x1e293b,
  playerCheek: 0xfb7185,

  monsterBug: 0x65a30d,
  monsterBall: 0xf97316,
  monsterFireball: 0xdc2626,
  monsterTank: 0x475569,

  block: 0x92400e,
} as const
