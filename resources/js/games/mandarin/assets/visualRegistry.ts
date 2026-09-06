/**
 * Central visual registry keyed by the exact slot IDs in
 * `resources/data/mandarin/visual-assets.v1.json`.
 *
 * Every slot is bound to a real, committed SVG fallback under
 * `public/images/games/mandarin/fallback/`. Generated WebP bindings follow
 * the manifest's status; every screen
 * reads the registry through `SlotImage`, never a path.
 */
import manifest from '../../../../data/mandarin/visual-assets.v1.json'
import type { VisualAsset } from '../contracts/mandarin'

export type VisualSlotId =
  | 'scene-gate-poster'
  | 'scene-street-poster'
  | 'scene-bridge-poster'
  | 'scene-roadside-poster'
  | 'scene-reunion-poster'
  | 'portrait-guide'
  | 'portrait-traveler'
  | 'portrait-friend'
  | 'material-paper'

export interface VisualSlot extends VisualAsset {
  id: VisualSlotId
  /** `fallback` = authored SVG placeholder; `generated` = Codex's final image. */
  status: 'fallback' | 'generated'
  aspectRatio: string
  /** Which part of the image must survive cropping. */
  anchor: 'center' | 'bottom' | 'face'
  /** Where the slot is used; mirrors docs/games/mandarin-asset-slots.md. */
  usage: string
  /** The manifest's intended output path for the generated image. */
  generatedPath: string
}

const FALLBACK_DIR = '/images/games/mandarin/fallback'

interface ManifestAsset {
  id: string
  kind: 'scene_poster' | 'portrait' | 'texture'
  dimensions: { width: number; height: number }
  alpha: boolean
  outputPath: string
  status: 'not_generated' | 'generated'
}

const manifestById = new Map((manifest.assets as ManifestAsset[]).map((asset) => [asset.id, asset]))

function slot(id: VisualSlotId, alt: string, anchor: VisualSlot['anchor'], usage: string): VisualSlot {
  const asset = manifestById.get(id)
  if (!asset) throw new Error(`visual-assets.v1.json has no slot ${id}`)
  const fallbackSrc = `${FALLBACK_DIR}/${id}.svg`
  const generatedPath = asset.outputPath.replace(/^public/, '')
  const generated = asset.status === 'generated'
  return {
    id,
    kind: asset.kind,
    src: generated ? generatedPath : fallbackSrc,
    fallbackSrc,
    status: generated ? 'generated' : 'fallback',
    width: asset.dimensions.width,
    height: asset.dimensions.height,
    hasAlpha: asset.alpha,
    aspectRatio: `${asset.dimensions.width} / ${asset.dimensions.height}`,
    anchor,
    alt,
    usage,
    generatedPath,
  }
}

export const VISUAL_REGISTRY: Record<VisualSlotId, VisualSlot> = {
  'scene-gate-poster': slot('scene-gate-poster', 'A modest timber village gate with misty hills behind it.', 'center', 'Scene 1 journey card, 2D fallback behind the lesson card, story-beat backdrop.'),
  'scene-street-poster': slot('scene-street-poster', 'A quiet stone-paved village street with timber buildings.', 'center', 'Scene 2 journey card, 2D fallback, story-beat backdrop.'),
  'scene-bridge-poster': slot('scene-bridge-poster', 'A small arched stone bridge over a calm river.', 'center', 'Scene 3 journey card, 2D fallback, story-beat backdrop.'),
  'scene-roadside-poster': slot('scene-roadside-poster', 'A simple roadside shelter with a bench and foliage.', 'center', 'Scene 4 journey card, 2D fallback, story-beat backdrop.'),
  'scene-reunion-poster': slot('scene-reunion-poster', 'A small open courtyard in late-afternoon light.', 'center', 'Scene 5 journey card, 2D fallback, story-beat backdrop.'),
  'portrait-guide': slot('portrait-guide', 'The Guide, an adult villager in a muted jade jacket.', 'face', 'Dialogue overlay avatar for guide lines in teaching, scene replay and feedback.'),
  'portrait-traveler': slot('portrait-traveler', 'Xiaolin, an adult traveler in slate-blue clothing.', 'face', 'Dialogue overlay avatar for traveler lines.'),
  'portrait-friend': slot('portrait-friend', 'The Friend, an adult in warm neutral travel clothing.', 'face', 'Dialogue overlay avatar for the reunion beat (scene 5).'),
  'material-paper': slot('material-paper', '', 'center', 'Optional very subtle background behind DOM cards; disabled by default.'),
}

export const VISUAL_SLOT_IDS = Object.keys(VISUAL_REGISTRY) as VisualSlotId[]

export function isVisualSlotId(id: string): id is VisualSlotId {
  return id in VISUAL_REGISTRY
}

export function visualSlot(id: string): VisualSlot {
  if (!isVisualSlotId(id)) throw new Error(`Unknown visual slot ${id}`)
  return VISUAL_REGISTRY[id]
}

export function manifestSlotIds(): string[] {
  return (manifest.assets as ManifestAsset[]).map((asset) => asset.id)
}
