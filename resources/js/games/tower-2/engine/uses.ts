/** The prototype's four starting uses. Sizes are fixed modules that snap to the plan grid. */
export type UseKind = 'studio' | 'office' | 'shop' | 'cafe'

export interface UseDef {
  kind: UseKind
  label: string
  /** Footprint before rotation, in tiles (1 tile = 3 m). */
  width: number
  depth: number
  /** One bold, saturated hue per use (neo-90s, more vibrant than Tower Throwback). */
  color: number
  /** What the room's rating weighs, shown in the inspect panel. */
  wants: string
}

export const USES: Readonly<Record<UseKind, UseDef>> = {
  studio: { kind: 'studio', label: 'Studio', width: 3, depth: 4, color: 0x2bb5ff, wants: 'Daylight and quiet' },
  office: { kind: 'office', label: 'Startup office', width: 4, depth: 5, color: 0x8b5cf6, wants: 'Daylight and a short walk to a core' },
  shop: { kind: 'shop', label: 'Shop', width: 3, depth: 3, color: 0xff3d8b, wants: 'Ground floor and footfall' },
  cafe: { kind: 'cafe', label: 'Café', width: 4, depth: 4, color: 0xff9f1c, wants: 'Footfall and daylight' },
}

export const USE_KINDS = Object.keys(USES) as UseKind[]

/** A core bundles elevators, a stair and a riser on a fixed 2×2 footprint in the prototype. */
export const CORE_SIZE = 2
