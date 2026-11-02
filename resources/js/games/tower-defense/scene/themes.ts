import type { ThemeId } from '../gameTypes'

export interface Theme {
  sky: number
  rim: number
  groundA: number
  groundB: number
  pad: number
  rock: number
  rockTop: number
  water: number
  waterGlow: number
  sunlight: number
  ambient: number
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: { sky: 0x7cc4e8, rim: 0x3f6b35, groundA: 0x7fb95a, groundB: 0x75af52, pad: 0xc2b280, rock: 0x7b7f86, rockTop: 0x9aa0a8, water: 0x2f8fd0, waterGlow: 0x0a2a44, sunlight: 0xfff4d6, ambient: 0xbfdcff },
  dunes: { sky: 0xe7c893, rim: 0xa77b45, groundA: 0xe0bd7b, groundB: 0xd8b372, pad: 0xc99f5d, rock: 0x9c6b42, rockTop: 0xb9855a, water: 0x2aa6a8, waterGlow: 0x06322f, sunlight: 0xffe8c0, ambient: 0xf1dcc0 },
  tundra: { sky: 0xa8d3ea, rim: 0x6f8ea6, groundA: 0xe6f0f5, groundB: 0xdbe7ee, pad: 0xb9cad6, rock: 0x7f93a6, rockTop: 0xb8cad8, water: 0x5cb8e6, waterGlow: 0x0d3b57, sunlight: 0xf2f8ff, ambient: 0xcfe4f5 },
  ember: { sky: 0x3b1f22, rim: 0x2a1718, groundA: 0x5f4a44, groundB: 0x57433e, pad: 0x7a5b4d, rock: 0x322a2b, rockTop: 0x4b3f3f, water: 0xf26b1d, waterGlow: 0x8a2c05, sunlight: 0xffcfa8, ambient: 0xa5736a },
  dusk: { sky: 0x2b2547, rim: 0x1c1833, groundA: 0x5a5a86, groundB: 0x52527d, pad: 0x75709a, rock: 0x3a3656, rockTop: 0x56517b, water: 0x7a5cf0, waterGlow: 0x2a1a6e, sunlight: 0xdcd2ff, ambient: 0x8f88c9 },
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
