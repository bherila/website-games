# Tower Throwback Style Gate

This document defines the shipped deterministic Tower Throwback art pack.

## Direction

- Original neo-1990s tower-sim homage. Do not copy, trace, or reproduce SimTower, Yoot Tower, or any other copyrighted art.
- Clean-lined dimensional daytime cutaway: readable construction-grid silhouettes, restrained perspective, bevels, visible side planes, highlights, material cues, and soft shadows.
- Modern polish comes from smooth curves where natural, polished gradients, atmospheric depth, contemporary lighting, and higher-fidelity texture. Natural scenery stays organic.
- Avoid pixelation, low-resolution sprite aesthetics, dithering, voxel/block texture, flat unshaded rectangles, and photorealism.
- Keep gameplay geometry, shafts, elevator cars, occupied rooms, people, and interaction feedback crisp against quieter scenery. Elevator cars should read as small dimensional objects, not flat rectangles.
- Preserve the current office sample's big/tall window rhythm, but reduce tiny visual noise so rooms read at whole-tower zoom.
- Apartments/hotel rooms should have more windows and natural light than the first style gate.
- Lobbies should feel alive and public: tall atrium glass, planters, indoor trees, benches, and warm flooring.
- Runtime sky/night dim and window tints remain code-driven; do not bake nighttime into the source art.

## Technical Decisions

- Source art uses deterministic SVG-like vector geometry plus reviewed image-generated WebP sources.
- Runtime atlas density is `SPRITE_PPU = 64` (`4x` the original style gate); logical frame sizes still map to the existing world units.
- People: `10 x 19` px inside the existing `0.6 x 1.2` world-unit person quad.
- Atlas padding: 8 px transparent padding per high-resolution frame for the style gate.
- Atlas format: WebP with alpha, linear filtering, and mipmaps so close zoom does not look like an over-enlarged thumbnail.
- Window glass regions intentionally use partial alpha. A runtime glass backing supplies the current sky/night/warm-window color through those alpha regions.
- Small dynamic sprites have detail and summary LOD variants. Whole-tower zoom uses simpler people/elevator silhouettes; close zoom uses the more expressive frames.
- HUD icons: native SVG, `24 x 24`, small-size illustrative vector language, and category-coded badge backgrounds. They are intentionally not in the atlas.

## Runtime Integration

- The Milestone 1 atlas is drawn as an optional overlay above existing colored quads.
- Unit samples get a runtime-colored glass backing behind the atlas so transparent windows can reflect daytime sky and nighttime lit rooms.
- People and elevator cars/doors switch to summary frames when more than 14 floors are visible. Cars use empty, single, double, crowded, and full body states based on passenger count and catalog capacity.
- Staff and housekeepers use role-specific frames selected from journey purpose. Other people use deterministic A/B variants selected from person id.
- Ground and cloud art is structure-bound presentation; night stars fade from the game clock and never feed the simulation.
- Missing or unloaded atlas frames leave the existing colored fallback visible and log a warning once.
- Visual-test readiness waits for the atlas load to settle, so `?visualTest=1&scenario=starter` screenshots do not race the texture.
- Future #1501 Group C/#1504 work should replace this style-gate overlay with a complete atlas/material pipeline and keep elevator cap frames separate for resize handles.
