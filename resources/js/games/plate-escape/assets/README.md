# Harbor decal textures

Two transparent, optimized WebP face textures, imported through Vite. Each is below 60 KB.

- `pip-name.webp`: cream PIP lettering on worn navy timber; level 11 stern, low outer corner (user-approved placement clear of the opened bait flap).
- `harbor-light-plaque.webp`: one large LIGHT inscription on weathered brass; level 12 front stone base.

The textured planes sit at plate-local z=0.145, belong to their panel's decoration group, disable raycasting and release their textures through the existing scene disposal path. Level IDs scope the artwork so later harbor objects do not inherit it by reusing a panel name.

## Prompt set

The initial cutouts were refined to short, large inscriptions for phone legibility. Transparent output was requested throughout. Originals remain outside the repository; only the optimized final textures ship.

### Boat

Initial prompt:

> Use case: stylized-concept. Asset type: transparent game decal texture for a small wooden fishing dinghy in a charming painted toy diorama. Create exactly ONE flat front-facing rectangular painted wooden name board, isolated on genuinely transparent background, no scene, no perspective, no extra objects. Exact lettering: "TIDELARK" in bold cream hand-painted traditional boat lettering, exceptionally legible when downscaled. Short name centered, generous letter weight. Warm dark navy painted timber board, gently rounded worn corners, subtle wood texture and chipped cream edging. Wide landscape composition approximately 4:1, board fills image with minimal transparent padding. Restrained illustrated material detail, diffuse light baked very subtly, no external shadow, no watermarks, no real brands, no screw heads or nail heads.

Final edit prompt:

> Edit this image into a smaller fishing dinghy's name board. Keep the weathered navy painted timber, bold cream traditional hand-painted lettering, worn cream edging and genuinely transparent cutout background. Replace ALL existing text with exactly "PIP" (P I P), three very large bold letters on ONE line filling most of the board. Change the board proportions to a squat rectangle approximately 1.6:1, not a long strip. Flat front-facing 2D game texture, no perspective, no extra objects or shadows, no screw or nail heads. This decal must remain readable when shown only 20 pixels wide in a toy boat game. Restrained painted surface detail, high letter contrast, transparent outside the board.

### Lantern

Initial prompt:

> Use case: stylized-concept. Asset type: transparent game decal texture for a weathered brass plaque on a miniature lighthouse lantern's stone base, in a charming painted toy diorama. Create exactly ONE flat front-facing brass plaque, isolated on genuinely transparent background, no scene, no perspective, no extra objects. Wide rectangular plaque approximately 2:1 with clipped rounded corners and a subtly raised border. Exact text "HARBOR LIGHT" on two centered lines, very bold dark navy engraved capital letters, readable when downscaled. A tiny simple engraved rising-sun mark above the text only if it fits. Warm aged golden brass, restrained verdigris at edges, hand-painted stylized finish, subtle material texture, no external shadow, no screws, no rivets, no real brands, no watermark. Minimal transparent padding.

Final edit prompt:

> Edit this weathered brass lighthouse plaque. Preserve the warm brass, aged verdigris near the clipped rounded corners, raised border, genuinely transparent cutout background, flat frontal view and painterly toy-diorama style. Replace the two lines HARBOR LIGHT and the sun icon with exactly one very large bold engraved word "LIGHT", dark navy, on ONE line filling most of the plaque. The word must be easy to read when the plaque is 30 pixels wide on a phone. Make the plaque slightly taller, approximately 1.8:1 proportions. No extra text, no screws, no rivets, no external shadows or other objects.

