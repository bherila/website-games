# Plate Escape decal textures

Twenty transparent, optimized WebP face textures, imported through Vite. Each is below 60 KB.

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

## Railway, clockworks and fair (levels 16–30)

One generated cutout per level, with the same cream/navy painted finish. Only transparent padding was cropped before downsampling to at most 384 px and encoding as WebP; generated originals stay outside the repository. The placement table and clearance tests are in `harborDecals.ts` and `__tests__/houseGeometry.test.ts`.

| Level | Texture | Plate | WebP bytes |
| --- | --- | --- | ---: |
| 16 | `toy-engine-16.webp` | `side-right` | 21512 |
| 17 | `music-box-note.webp` | `front` | 29198 |
| 18 | `station-stop.webp` | `right` | 21256 |
| 19 | `signal-box-sign.webp` | `front` | 16946 |
| 20 | `locomotive-20.webp` | `engine-near` | 35012 |
| 21 | `cuckoo-bird.webp` | `front` | 44232 |
| 22 | `lift-up.webp` | `front` | 35760 |
| 23 | `gatehouse-crown.webp` | `right` | 24060 |
| 24 | `gramophone-78.webp` | `front` | 34582 |
| 25 | `robot-25.webp` | `chest` | 29660 |
| 26 | `carousel-whirl.webp` | `board-front` | 21452 |
| 27 | `basket-balloon.webp` | `basket-back` | 31642 |
| 28 | `theater-tickets.webp` | `header` | 20044 |
| 29 | `wheel-ride.webp` | `wheel` | 26794 |
| 30 | `float-fair.webp` | `garland` | 28586 |

### Level 16: toy-engine-16

Below the boiler side head; the smokebox dial is on a perpendicular face.

Initial prompt:

> Use case: stylized-concept. Asset: ONE small painted decal texture for a charming hand-painted miniature toy diorama puzzle, matching cream/navy/weathered-brass harbor signs. Subject: "16", bold cream numerals on a worn navy enamel number plate with a thin aged brass edge. Flat and perfectly front-facing, no perspective. Broad bold shapes/strokes; very high contrast and readable at only 20–30 pixels on a phone. Restrained worn paint chips, subtle illustrated material texture, never distressed enough to erase the lettering. The subject fills a squat landscape composition with minimal padding. Genuine transparent cutout outside the subject; transparent empty gaps in any emblem or painted lettering that has no backing board. Exactly the specified inscription or emblem, no extra words, no scene, no objects around it, no outside shadows, no screw/nail/rivet heads, no brands, no real railway/vessel names, no logos or watermark.

Final edit prompt:

> Edit only the cutout of this painted 16 number plate. Keep the plate, lettering, weathered navy face and brass frame exactly. Remove the entire brown/black gradient, vignette, glow and shadow outside the brass frame. EVERY pixel outside the actual brass plate silhouette must be fully transparent (alpha 0), not translucent. No halo, no background or scene. Flat front-facing decal; preserve large cream 16 and crisp edge.

### Level 17: music-box-note

Upper-right front, beyond the tune dial and pin, above the front head and below the lid sweep.

> Use case: stylized-concept. Asset: ONE small painted decal texture for a charming hand-painted miniature toy diorama puzzle, matching cream/navy/weathered-brass harbor signs. Subject: one broad cream musical eighth-note emblem with restrained navy edging, painted strokes only. Flat and perfectly front-facing, no perspective. Broad bold shapes/strokes; very high contrast and readable at only 20–30 pixels on a phone. Restrained worn paint chips, subtle illustrated material texture, never distressed enough to erase the lettering. The subject fills a compact nearly square composition with minimal padding. Genuine transparent cutout outside the subject; transparent empty gaps in any emblem or painted lettering that has no backing board. Exactly the specified inscription or emblem, no extra words, no scene, no objects around it, no outside shadows, no screw/nail/rivet heads, no brands, no real railway/vessel names, no logos or watermark.

### Level 18: station-stop

Upper side band above both side heads; clock windows face perpendicular.

> Use case: stylized-concept. Asset: ONE small painted decal texture for a charming hand-painted miniature toy diorama puzzle, matching cream/navy/weathered-brass harbor signs. Subject: "STOP", four bold dark navy block capitals on a weathered cream enamel station plate with dark navy edging. Flat and perfectly front-facing, no perspective. Broad bold shapes/strokes; very high contrast and readable at only 20–30 pixels on a phone. Restrained worn paint chips, subtle illustrated material texture, never distressed enough to erase the lettering. The subject fills a wide landscape composition with minimal padding. Genuine transparent cutout outside the subject; transparent empty gaps in any emblem or painted lettering that has no backing board. Exactly the specified inscription or emblem, no extra words, no scene, no objects around it, no outside shadows, no screw/nail/rivet heads, no brands, no real railway/vessel names, no logos or watermark.

### Level 19: signal-box-sign

Upper front above the full selector disc and diagonal brace, below the top ledge and beside the pin; shutter travels on the back.

> Use case: stylized-concept. ONE small painted decal texture for a charming hand-painted miniature toy diorama. Subject: "SIGNAL", very bold cream block capitals on a worn navy wooden sign. Very bold and legible at 20–30 px; flat front-facing 2D art, no perspective, subtle weathered cream/navy/brass paint matching old harbor plaques. Landscape composition, minimal padding. TRANSPARENT BACKGROUND: exact alpha zero everywhere outside the crisp subject outline, including corners; no background paint, gradient, vignette, halo or outside shadow. Preserve transparent gaps in painted lettering without a board. Exactly the specified lettering, no other text, objects, scenery, rivets, screw heads, brands, real rail/vessel names or watermark.

### Level 20: locomotive-20

Lower engine side below its head; smokebox dial and tender hatch are on other faces.

> Use case: stylized-concept. ONE small painted decal texture for a charming hand-painted miniature toy diorama. Subject: "20", bold cream maritime-style industrial stencil numerals with restrained navy edging; numerals only, no backing. Very bold and legible at 20–30 px; flat front-facing 2D art, no perspective, subtle weathered cream/navy/brass paint matching old harbor plaques. Landscape composition, minimal padding. TRANSPARENT BACKGROUND: exact alpha zero everywhere outside the crisp subject outline, including corners; no background paint, gradient, vignette, halo or outside shadow. Preserve transparent gaps in painted lettering without a board. Exactly the specified lettering, no other text, objects, scenery, rivets, screw heads, brands, real rail/vessel names or watermark.

### Level 21: cuckoo-bird

Right of clock face, between two heads; away from left pinecone travel and central door.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: one compact cream songbird silhouette facing right, perched on a short branch; broad simple shapes with subtle navy edging, painted strokes only. High-contrast broad strokes and bold type, readable at20–30px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; compactcomposition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 22: lift-up

Narrow right band between heads; to the right of the full gate sweep and opposite the weight.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "UP", two bold cream industrial block letters on a small worn navy enamel plate, brass edge. High-contrast broad strokes and bold type, readable at20–30px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; compactcomposition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 23: gatehouse-crown

Between right side heads; bridge and weight move on perpendicular front face.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: one simple three-point aged gold crown emblem with broad cream highlights and dark navy painted edging, no gems or filigree, no backing. High-contrast broad strokes and bold type, readable at20–30px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscapecomposition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 24: gramophone-78

Right of the entire collar/window ring, between the two front heads; sash is on back.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "78", two very bold dark navy numerals on a weathered brass maker plate, rounded clipped corners. High-contrast broad strokes and bold type, readable at20–30px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscapecomposition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 25: robot-25

Lower-left chest clear of both head rims and the visor's full path/landing; drive weight on back.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "25", two bold cream stencil numerals on a weathered navy maker plate with thin brass trim. High-contrast broad strokes and bold type, readable at20–30px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscapecomposition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 26: carousel-whirl

Left side of rounding board, away from its right screw; rack is on the drum's right face.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "WHIRL", five bold navy hand-painted fairground capitals on a cream name board with a restrained red and gold edge. High-contrast broad strokes and bold type, readable at 20–30 px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscape composition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate or board. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 27: basket-balloon

Rear basket between both head rims, clear of the rolled wicker edge; the sign, rack and skid stay on the opposite face. The larger portrait emblem is shown from the rear in the matching phone screenshots.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: one simple cream hot-air balloon emblem with broad navy edging and a tiny red band, basket and balloon only, transparent inside gaps, no backing. High-contrast broad strokes and bold type, readable at 20–30 px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; compact composition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate or board. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 28: theater-tickets

Central lintel between frame bolts, above the full collar and away from the stop pin and rack.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "TICKETS", bold cream fairground block capitals on a weathered navy ticket board with thin red/gold border. High-contrast broad strokes and bold type, readable at 20–30 px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscape composition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate or board. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 29: wheel-ride

Low centre of wheel, below the collar/window ring and away from rim screws, rack and both gondolas; verify the gap between decorative spokes.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "RIDE", bold navy fairground capitals on a small weathered cream enamel plate with red and gold edging. High-contrast broad strokes and bold type, readable at 20–30 px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscape composition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate or board. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.

### Level 30: float-fair

Between garland through-bolts, clear of clock windows, rear weight/hatch, and side rack.

> Use case: stylized-concept. Create ONE flat front-facing painted game decal for a charming miniature toy diorama. Subject: "FAIR", four bold cream fairground capitals with restrained navy edging and gold flourishes, painted letters only, no backing. High-contrast broad strokes and bold type, readable at 20–30 px, restrained aged cream/navy/gold paint matching weathered harbor signs. Minimal transparent padding; landscape composition. Genuine transparent alpha cutout outside the subject and inside emblem gaps; no backing unless the subject explicitly specifies a plate or board. Flat diffuse illustration, NO external lighting, gradient, vignette, glow or shadows outside subject. Exact inscription or emblem only, no extra text, real names, brands, scenery, screws, rivets or watermark.
