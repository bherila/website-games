import type { ThemeId } from '../gameTypes'

export interface Theme {
  sky: number
  rim: number
  groundA: number
  groundB: number
  /** Blotches and strokes painted over the ground. */
  groundDark: number
  groundLight: number
  pad: number
  /** The dirt walkers wear along their route. */
  path: number
  padDark: number
  /** The strip of land along a shoreline. */
  shore: number
  rock: number
  rockTop: number
  water: number
  waterDeep: number
  waterGlow: number
  foam: number
  sunlight: number
  ambient: number
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: { sky: 0x7cc4e8, rim: 0x6c9f33, groundA: 0x93c93f, groundB: 0x84bd38, groundDark: 0x5e9a2c, groundLight: 0xb4dc58, pad: 0xdcbd8e, padDark: 0xa98c63, path: 0xdeb877, shore: 0xe9cc8c, rock: 0x98918a, rockTop: 0xbdb6ad, water: 0x33cfd0, waterDeep: 0x169cae, waterGlow: 0x0a2a44, foam: 0xdffcf7, sunlight: 0xffefc4, ambient: 0xdcecff },
  dunes: { sky: 0xe7c893, rim: 0xc09a5b, groundA: 0xeccb86, groundB: 0xe3bf79, groundDark: 0xc79f5f, groundLight: 0xf6e0a9, pad: 0xc99a6c, padDark: 0x96704b, path: 0xc69a5b, shore: 0xf6e7b8, rock: 0xab7a50, rockTop: 0xcc9866, water: 0x35c8c4, waterDeep: 0x14909a, waterGlow: 0x06322f, foam: 0xe6fffa, sunlight: 0xffe6bb, ambient: 0xfbeed8 },
  tundra: { sky: 0xa8d3ea, rim: 0x9db8cc, groundA: 0xecf4f9, groundB: 0xe0ecf4, groundDark: 0xbcd0df, groundLight: 0xffffff, pad: 0xb6c8d6, padDark: 0x8399ab, path: 0xc3d3e0, shore: 0xd5e7f2, rock: 0x8497a9, rockTop: 0xf0f6fa, water: 0x6fd0f2, waterDeep: 0x2e8ec6, waterGlow: 0x0d3b57, foam: 0xffffff, sunlight: 0xf6faff, ambient: 0xdceaf7 },
  ember: { sky: 0x3b1f22, rim: 0x3f2b29, groundA: 0x6d5a52, groundB: 0x63514a, groundDark: 0x46362f, groundLight: 0x8c7364, pad: 0x8c7464, padDark: 0x5a4739, path: 0x8a6f5f, shore: 0x33211c, rock: 0x4a3f3e, rockTop: 0x6b5a56, water: 0xff9a2e, waterDeep: 0xf0480f, waterGlow: 0x8a2c05, foam: 0xffd27a, sunlight: 0xffd8b8, ambient: 0xcfa596 },
  dusk: { sky: 0x2b2547, rim: 0x34305c, groundA: 0x7c7cb6, groundB: 0x7171ab, groundDark: 0x53528c, groundLight: 0x9d9dd2, pad: 0x9b90c4, padDark: 0x6a6194, path: 0xa5a0d2, shore: 0x6a66a6, rock: 0x524c7c, rockTop: 0x7d74ab, water: 0x9880ff, waterDeep: 0x5b3fd8, waterGlow: 0x2a1a6e, foam: 0xe4dcff, sunlight: 0xece4ff, ambient: 0xb6afe8 },
}
export const ELEMENT_TINT: Record<string, number> = {
  fire: 0xff8a3c,
  water: 0x5cc4ff,
  nature: 0x57d36d,
  earth: 0xc49a5a,
  light: 0xffe066,
  dark: 0xa87bff,
  neutral: 0xf1e9dc,
}

export const TOWER_SHOT_COLOR: Record<string, number> = {
  arrow: 0xfff1c9,
  ember: 0xff7a1f,
  frost: 0x8fdcff,
  thorn: 0x7be36b,
  boulder: 0x8d7a64,
  sun: 0xfff18a,
  hex: 0xc48bff,
}
