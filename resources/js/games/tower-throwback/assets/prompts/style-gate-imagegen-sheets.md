# Style-Gate Source Notes

The original Milestone 1 gate used local-only imagegen sheets. This revision replaces those sheets with a deterministic SVG-source atlas so the cheerful/clean direction can be reviewed and regenerated from committed files.

Committed source:

- `assets/source/style-gate-vivid.svg`

Committed runtime outputs:

- `assets/sprites/style-gate.webp`
- `assets/sprites/style-gate.json`

Regenerate with:

```bash
node resources/js/games/tower-throwback/assets/scripts/build-style-gate-atlas.mjs
```

## Current Art Direction

Use case: stylized-concept
Asset type: Tower Throwback deterministic style-gate source atlas
Primary request: create an original cheerful-clean 90s-inspired side-view tower management game cutaway; homage only, never copy or trace SimTower/Yoot Tower or any copyrighted sprite.
Style/medium: clean-lined dimensional neo-90s illustration, orthographic cutaway with restrained perspective, subtle bevels and side planes, bright daytime palette, soft dark outline, polished gradients, material cues, readable silhouettes, no cluttered micro-detail.
Required samples: seamless structure/lobby/skylobby/skybridge tiles, lobby tree/bench/front-desk/plant decor overlays, stairs and escalator, deterministic office/residential variant families with vacant/occupied variants, all commerce/hotel/service/special unit kinds with vacant/occupied/dirty variants where the engine uses them, all elevator interiors/caps/cars/doors, detail and summary people for every income tier, one cloud.
Glass/window rule: windows must support alpha/runtime glass color. Do not bake dark nighttime windows into the daytime source.
Zoom rule: rooms should look good at close zoom; people/elevators also need simplified summary variants for whole-tower zoom.
Avoid: pixelation, low-resolution sprite aesthetics, dithering, voxel/block texture, flat unshaded rectangles, photorealism, logos, trademarks, legible text, grim/noir palette, busy crosshatching, copied game art.
