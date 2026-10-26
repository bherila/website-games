# Harbor decal textures

Five transparent, optimized WebP face textures, imported through Vite. Each is below 60 KB.

- `pip-name.webp`: cream PIP lettering on worn navy timber; level 11 stern, low outer corner (user-approved placement clear of the opened bait flap).
- `harbor-light-plaque.webp`: one large LIGHT inscription on weathered brass; level 12 front stone base.
- `sea-chest-anchor.webp`: cream rope-and-anchor paint; level 13 chest front.
- `crane-load-rating.webp`: bold 5 T plate; level 14 cab back.
- `lightship-07.webp`: painted cream 07; level 15 port hull.

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

### Sea Chest

`sea-chest-anchor.webp` paints a compact rope-and-anchor mark on the left front. The mark stays left of the hasp and lock plate throughout their motion and away from the end flap on the other end.

> Use case: stylized-concept. Asset: one transparent painted decal for the front of a small sea chest in a charming hand-painted wooden toy diorama. Make a bold cream-painted anchor inside a simple loop of cream rope, with restrained dark navy outlines and subtle chipped paint texture. Exactly one compact circular rope-and-anchor emblem, flat and front-facing, centered, no perspective. It must remain recognizable at 20–30 pixels wide: broad simple strokes, few rope twists, no fine ornament. Genuine transparent cutout, including empty spaces inside rope and anchor; NO backing board or solid background, no scene, no shadows beyond the painted strokes, no text, no brands, no nails, no screws, no watermark. Minimal transparent padding.

### Harbor Crane

`crane-load-rating.webp` marks the upper-right cab back. The counterweight is already below this band before its diagonal rail reaches the plaque's horizontal range. The texture is flat and front-facing; using the cab back keeps the inscription readable at normal viewing angles.

> Use case: stylized-concept. Asset: one transparent load-rating plaque texture for the cab roof of a miniature harbor crane in a charming hand-painted toy diorama, matching weathered cream and navy harbor signs. A squat wide rectangular aged cream enamel plate with dark navy edging, gently rounded corners, a few subtle weathered paint chips. Exact text: "5 T" on ONE line, very large bold dark navy block numerals and letter, high contrast and legible at 20–30 pixels wide. Flat front-facing 2D texture, approximately 1.8:1 proportions, minimal transparent padding, genuinely transparent outside the plaque. No perspective, no scene or external shadow, no additional words, no rivets, no screw heads, no brands or watermark.

### Lightship

`lightship-07.webp` paints the fictional number 07 on the port hull, forward of its screw. The mast shutter remains inside this side of the hull, and the stern flap stays at the other end.

> Use case: stylized-concept. Asset: one transparent painted hull lettering texture for a miniature red wooden lightship in a charming hand-painted toy diorama. Exact inscription: "07" in two very large bold cream maritime stencil numerals, with restrained thin dark navy painted edging and slight worn paint chips. The numerals alone, painted directly on a hull: genuine transparent background outside strokes AND inside the counters of 0 and 7, NO board, NO plaque, NO rectangular backing. Flat front-facing 2D decal, approximately 2:1 composition, minimal padding. Must read clearly at 20–30 pixels wide. No scene, no perspective, no external shadows, no extra lettering, no vessel names, no real brands, no hardware, no watermark.


