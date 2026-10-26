/**
 * Toolbar controls sit directly on the sky. A translucent white fill there put
 * white labels on a pale blue background (about 1.5:1 contrast); a dark fill
 * keeps them well above WCAG AA's 4.5:1 in every sky phase, matching the dark
 * HUD panels (speed, overlays) beside them.
 */
export const HUD_TOOLBAR_BUTTON = 'bg-slate-950/75 text-white backdrop-blur-sm hover:bg-slate-800/90'

/** The emphasized Save & Exit action keeps its green identity at the same contrast. */
export const HUD_TOOLBAR_SAVE_BUTTON = 'bg-emerald-800/90 text-white backdrop-blur-sm hover:bg-emerald-700/95'
