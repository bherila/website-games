# Structure Unit Prompts

## `unit.lobby.tile`

Prepend `_style-preamble.md`.

Create one seamless lobby floor-cell tile for Tower Throwback.
Exact source frame: `64 x 192` px, representing the existing `16 x 48` logical frame at 4x density.
Subject: bright atrium lobby language with tall repeating glass, polished warm floor, and warm brass/wood accents.
State: neutral usable lobby base tile, no people and no unique decor; runtime people and decor overlays render separately.
Composition: seamless left/right edges, clear bottom floor line, side-view interior, strong silhouette that repeats cleanly across a wide lobby run.
Constraints: original artwork only; no legible signage; no people; no baked night lighting; glass must support transparency/runtime sky color.

## `unit.lobby.decor.tree` / `unit.lobby.decor.bench` / `unit.lobby.decor.frontDesk` / `unit.lobby.decor.plant`

Prepend `_style-preamble.md`.

Create sparse lobby decor overlays for Tower Throwback.
Exact source frames: tree `144 x 192` px; bench `192 x 96` px; front desk `192 x 96` px; plant `64 x 96` px.
Subject: cheerful indoor tree/planter, simple bench modules, a reception/front desk counter, and small potted plants that can be placed over the repeating lobby tile.
Composition: transparent background, readable silhouettes at close zoom, no edge-to-edge wall or floor fill.
Constraints: original artwork only; no people; no legible signage; avoid tiny clutter; preserve each decor sprite's native aspect.
## `unit.observationDeck.sample`

Use case: stylized-concept
Asset type: Tower Throwback Observation Deck unit sprite source for a 24-tile-wide, two-storey atlas frame
Primary request: create an original Niagara Falls panoramic glass viewing lounge and open-air terrace; the left 75 percent is visibly supported and the right 25 percent projects as a dramatic lightweight cantilever with no support below its tip.
Style/medium: clean-lined dimensional neo-90s cutaway illustration; restrained straight-on perspective, subtle bevels and side planes, polished gradients, material highlights, soft contact shadows, crisp readable silhouette, original homage only.
Composition/framing: extremely wide horizontal complete silhouette, two-storey height, right-side cantilever unmistakable at small size.
Color palette: misty teal glass, pale limestone, cool slate, moss green planters, restrained brass/gold accents.
Chroma key: perfectly flat solid `#ff00ff`; do not use the key color in the structure.
Constraints: lock the approved 24 x 2 architecture and six-tile cantilever; no cliff, waterfall, background tower, sky, landscape, people, readable text, UI, logos, watermark, external cast shadow, or support column beneath the cantilever. Avoid pixelation, dithering, voxel/block texture, flat unshaded rectangles, and photorealism.
