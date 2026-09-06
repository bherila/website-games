# Mandarin Quest — visual asset slots

Every image the UI shows goes through one registry keyed by the exact IDs in
`resources/data/mandarin/visual-assets.v1.json`. Codex replaces artwork by
writing files and flipping two fields; no component changes are needed.

## Where the slots live

| Piece | Path |
|---|---|
| Manifest (requested assets, prompts, dimensions) | `resources/data/mandarin/visual-assets.v1.json` |
| Registry (binds ID → `src` / `fallbackSrc` / status) | `resources/js/games/mandarin/assets/visualRegistry.ts` |
| Component that renders a slot | `resources/js/games/mandarin/assets/SlotImage.tsx` |
| Authored fallbacks (original SVG, no text) | `public/images/games/mandarin/fallback/<id>.svg` |
| Generated outputs (Codex writes these) | `public/images/games/mandarin/<id>.webp` |

`SlotImage` renders `<img data-visual-slot="<id>" data-visual-status="fallback|generated">`
and swaps to `fallbackSrc` on load error, so a missing or corrupt generated file never
breaks a screen.

## Slots

All nine IDs below exist in the registry and have a working fallback. Dimensions and
alpha come from the manifest. "Anchor" is how the UI crops when the box is narrower than
the image.

| ID | Kind | Size | Alpha | Anchor | Where it is used |
|---|---|---|---|---|---|
| `scene-gate-poster` | scene_poster | 1536×1024 | no | center | Scene 1 journey card; 2D fallback and initial paint behind the diorama |
| `scene-street-poster` | scene_poster | 1536×1024 | no | center | Scene 2 journey card; 2D fallback |
| `scene-bridge-poster` | scene_poster | 1536×1024 | no | center | Scene 3 journey card; 2D fallback |
| `scene-roadside-poster` | scene_poster | 1536×1024 | no | center | Scene 4 journey card; 2D fallback |
| `scene-reunion-poster` | scene_poster | 1536×1024 | no | center | Scene 5 journey card; 2D fallback |
| `portrait-guide` | portrait | 1024×1024 | yes | face | Dialogue avatar for Guide lines in teaching |
| `portrait-traveler` | portrait | 1024×1024 | yes | face | Dialogue avatar for Xiaolin lines |
| `portrait-friend` | portrait | 1024×1024 | yes | face | Dialogue avatar for the Friend (scene 5 only) |
| `material-paper` | texture | 1024×1024 | no | center | Optional card background; not wired in by default |

Course data references these IDs directly: each scene's `artSlotId` and each role's
`portraitSlotId`. A Jest test (`__tests__/visualRegistry.test.ts`) fails if the registry
and manifest ever disagree, and `tests/Feature/MandarinGamePageTest.php` fails if a
fallback SVG is missing or contains a `<text>` element.

## Posters are fallbacks, not the scene

Three.js owns the geometry. Posters are shown:

- before the renderer chunk loads (first paint never waits on WebGL),
- when WebGL is unavailable, the renderer throws, or the context is lost,
- when the learner chooses "Use 2D scenery" in Settings,
- as journey-card art on Home.

The diorama camera is a gentle elevated three-quarter view with a quiet lower-centre
area, matching the manifest's poster brief, so a generated poster and the live diorama
read as the same place.

## How Codex swaps in generated art

1. Generate to the manifest's `outputPath` (`public/images/games/mandarin/<id>.webp`) at
   the listed size; portraits keep alpha.
2. In `visualRegistry.ts`, change the `slot()` helper (or the individual entry) so
   `src` points at the generated path and `status` is `'generated'`. Leave `fallbackSrc`
   pointing at the SVG.
3. Update the manifest entry's `status` and write the implementation manifest the
   shared contract asks for (actual paths, dimensions, alpha, provenance, hashes).
4. Re-run `pnpm run test` and the Mandarin Playwright suite; screenshots in
   `test-results/mandarin/` show every slot in context.

Do not rename IDs, and do not bake text, UI, or answer clues into any image.

## Fallback style

The SVGs use the same palette as the diorama (`PALETTE` in
`resources/js/games/mandarin/scene/sceneConfigs.ts`): warm ivory, muted jade, slate blue,
a small amber accent. They are original, contain no lettering, and avoid resembling other
copyrighted works.
