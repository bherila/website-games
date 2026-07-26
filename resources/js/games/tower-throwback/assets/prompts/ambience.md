# Ambience Prompts

## `ambience.cloud.sample`

Prepend `_style-preamble.md`.

Create one soft clean-lined illustrated cloud sample for Tower Throwback.
Exact final frame: `64 x 24` px.
Subject: simple layered daytime cloud, pale cream highlights, cool blue underside, smooth curves, and a readable silhouette.
Composition: transparent/cutout sprite with generous padding, no horizon or sky gradient.
Constraints: original artwork only; no text; no sun; no rain; no baked night variant.

## `ambience.groundHorizon.strip`

Prepend `_style-preamble.md`.

Create one horizontally repeatable ground and distant-horizon strip for Tower Throwback.
Exact target frame: `512 x 192` px, representing an 8-floor-cell-wide ambience tile at the high-resolution style-gate density.
Subject: cheerful daytime city-ground band with a soft distant skyline/treeline silhouette, warm sidewalk/earth base, and sparse low-detail park greenery.
Composition: seamless left/right loop; bottom edge can be opaque ground, upper edge should fade/cut out cleanly so runtime sky color remains visible.
Lighting: daylight source only; no baked night colors, no sunset gradient, no artificial sky fill.
Constraints: original artwork only; no text, logos, roads with readable markings, vehicles, or dense micro-detail.

## `ambience.nightStars.tile`

Prepend `_style-preamble.md`.

Create one sparse repeatable night-star dot overlay for Tower Throwback.
Exact target frame: `512 x 256` px, representing a wide sky tile for the high-resolution style-gate density.
Subject: small varied star dots and tiny plus-shaped glints, distributed sparsely enough that the tower remains visually calm when tiled.
Composition: transparent/cutout sprite with seamless left/right and top/bottom tiling; no moon, no clouds, no sky gradient.
Lighting: alpha/star marks only. Runtime sky and night dim supply the background color, so do not bake a dark rectangle.
Constraints: original artwork only; no constellations, symbols, text, or dense noisy speckle fields.

## `ambience.niagaraGorge.backdrop`

Use case: precise-object-edit
Asset type: Tower Throwback Niagara Falls cliff-and-gorge game backdrop source, exact 1536 x 1024
Input images: Image 1 is the locked smooth illustrated backdrop edit target.
Primary request: Change only the central-left cliff face beneath the lobby/clifftop into a quieter, slightly recessed cutaway-rock construction zone so underground tower rooms will read clearly over it. Preserve all approved composition, alignment, silhouette, and smooth rendering.
Targeted zone: from approximately 8% to 52% of source width, below the clifftop and above the foreground river. Reduce local texture contrast and foliage density there; use broader smooth slate/dolomite planes, softer gradients, fewer cracks, and a gently shadowed recessed shelf. At its right edge, transition organically into the deeper non-buildable gorge/falls area through a curved rock shoulder and mist-softened depth change. It should feel like natural geology, not a rectangular UI panel, grid, excavation box, or artificial border.
Locked invariants: keep the clifftop at exactly the same elevation (~39% of source height); keep the single waterfall crest, center, width, body, foam, and base mist exactly unchanged at ~62% of source width; keep the river, all outer cliff/tree silhouettes, exact crop, camera, 1536 x 1024 canvas, smooth clean-lined neo-90s illustrated style, palette, and daylight unchanged. Keep the center-left tower-readable.
Background requirement: everything above the existing clifftop/tree silhouette remains perfectly flat uniform chroma-compatible magenta matching Image 1; no new sky content and no magenta inside the subject.
Constraints: no tower, rooms, foundations, grid, dotted line, border, UI, people, buildings, observation deck, text, signs, logos, watermark, or extra waterfall.
Avoid: pixelation, low-resolution blocks, dithering, voxel texture, photorealism, geometric panel edges, hard rectangle, moved waterfall, changed crest, changed silhouette, opaque sky, checkerboard.
