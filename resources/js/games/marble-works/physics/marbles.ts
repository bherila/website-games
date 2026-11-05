/**
 * Marble kinds. Size changes what a marble fits through (a sieve's slot, a gap
 * between pegs); weight changes how hard it is flung (launchers and trampolines
 * push every marble with the same impulse, so heavy ones fly shorter), how it
 * shoves other marbles, and whether it shatters glass.
 */
export type MarbleKind = 'glass' | 'mini' | 'steel'

export interface MarbleKindDef {
  kind: MarbleKind
  label: string
  radius: number
  mass: number
  /** Steel breaks glass track and glass panes on contact. */
  breaksGlass: boolean
  /** Restitution against rubber bumpers (heavier marbles bounce less). */
  rubberRestitution: number
}

export const MARBLE_KINDS: Readonly<Record<MarbleKind, MarbleKindDef>> = {
  glass: { kind: 'glass', label: 'Glass marble', radius: 0.2, mass: 1, breaksGlass: false, rubberRestitution: 0.85 },
  mini: { kind: 'mini', label: 'Mini marble', radius: 0.12, mass: 0.4, breaksGlass: false, rubberRestitution: 0.9 },
  steel: { kind: 'steel', label: 'Steel ball', radius: 0.2, mass: 3, breaksGlass: true, rubberRestitution: 0.55 },
}

export const MARBLE_KIND_ORDER: readonly MarbleKind[] = ['glass', 'mini', 'steel']

/**
 * Speed a fixed-impulse kick gives a marble of `mass`, relative to a 1-unit marble.
 * The square root keeps the spread playable: steel ≈ 0.58×, mini ≈ 1.58×.
 */
export function impulseSpeedScale(mass: number): number {
  return 1 / Math.sqrt(mass)
}
