# Tower 2 generated surfaces

Original floor finishes generated with the built-in image generator. Only the optimized atlas ships; source PNGs remain outside the repository.

`floor-finishes.webp`: 1088×544, 48572 bytes. Seven 256×256 finishes and one white neutral cell occupy a 4×2 atlas, each with eight pixels of wrapped-edge padding. Runtime UVs select a cell and repeat its finish every two site tiles (6m); the existing vertex colours supply the use hue and baked sun shading. The neutral cell keeps walls and furniture unchanged.

| Cell | Finish |
| --- | --- |
| 0 | studio |
| 1 | office |
| 2 | shop |
| 3 | cafe |
| 4 | plate |
| 5 | corridor |
| 6 | core |
| 7 | White (untextured faces) |

## Generation prompts

### studio

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: warm wood planks, broad pale timber boards, a few restrained wood-grain curves and fine joined seams. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its room color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

### office

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: carpet tiles in a staggered square grid, very subtle woven marks and alternating pale grey squares. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its room color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

### shop

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: polished off-white terrazzo with sparse chunky light-grey and cream stone chips. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its room color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

### cafe

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: a clean large-scale checker tile floor, alternating warm white and pale grey squares with fine grout. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its room color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

### plate

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: pale poured concrete screed with a few soft irregular aggregate flecks, no cracks and no large joints. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its surface color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

### corridor

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: pale resilient rubber corridor flooring with evenly spaced broad subtle ribs and a restrained fine speckle. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its surface color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

### core

> Use case: stylized-concept. Asset type: one seamless tileable top-down floor texture for a vibrant neo-90s isometric building game, eventually downsampled to 256x256 pixels. Subject: light cast concrete utility-core flooring, quiet small mineral patches, tiny pores and almost invisible broad trowel marks. Flat graphic painted material, broad simple shapes, gentle texture, no photorealism. Composition: exactly square, edge-to-edge material; opposite edges must join seamlessly when tiled, with no border or perspective. Restrained very bright neutral off-white/cream/light-grey palette (mostly values 210–250); the game multiplies this image by its surface color, so avoid dark or saturated patches. Diffuse uniform illumination: no shadows, highlights, gradients or directional lighting. No objects, room, furniture, text, symbols, logos, brands or watermark. Opaque material only.

## Storefront and lobby sign atlas

`storefront-signs.webp`: 784×416, 31928 bytes. Seven original sign faces occupy a 2×4 atlas (384×96 per face, four pixels of clamped padding); the last cell is unused. Empty source-canvas padding was cropped before downsampling. Only this optimized atlas ships.

| Cell | Fictional sign | Use |
| --- | --- | --- |
| 0 | VEXLU | shop |
| 1 | PONVU | shop |
| 2 | NYBZO | shop |
| 3 | REMMU | cafe |
| 4 | DOVVI | cafe |
| 5 | MOSSWINK | cafe |
| 6 | 42 | lobby |

### Sign-generation prompts

#### VEXLU

> Use case: stylized-concept. Asset type: ONE original storefront sign face texture for a vibrant flat-shaded neo-90s miniature building game. Exact invented inscription: "VEXLU", all capitals, spelled exactly. Design: cream lettering on a deep plum panel, one small original emblem of three stacked diamonds. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, simple emblem at the left, high contrast, readable when small. Entire image is the sign face with no outer padding; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.

#### PONVU

> Use case: stylized-concept. Asset type: ONE original storefront sign face texture for a vibrant flat-shaded neo-90s miniature building game. Exact invented inscription: "PONVU", all capitals, spelled exactly. Design: dark navy lettering on a warm cream panel, one small angular folded-box emblem with magenta accent. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, simple emblem at the left, high contrast, readable when small. Entire image is the sign face with no outer padding; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.

#### NYBZO

> Use case: stylized-concept. Asset type: ONE original storefront sign face texture for a vibrant flat-shaded neo-90s miniature building game. Exact invented inscription: "NYBZO", all capitals, spelled exactly. Design: cream lettering on a dark navy panel, one small original offset four-point geometric spark emblem in mint. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, simple emblem at the left, high contrast, readable when small. Entire image is the sign face with no outer padding; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.

#### REMMU

> Use case: stylized-concept. Asset type: ONE original storefront sign face texture for a vibrant flat-shaded neo-90s miniature building game. Exact invented inscription: "REMMU", all capitals, spelled exactly. Design: cream lettering on a dark espresso-brown panel, one small angular cup emblem with a vivid orange accent. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, simple emblem at the left, high contrast, readable when small. Entire image is the sign face with no outer padding; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.

#### DOVVI

> Use case: stylized-concept. Asset type: ONE original storefront sign face texture for a vibrant flat-shaded neo-90s miniature building game. Exact inscription: "DOVVI", spelled exactly. Design: dark espresso lettering on a warm cream panel, one small original angular coffee-bean emblem with orange accent. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, high contrast, readable when small. Entire image is the sign face with no outer padding or white surround; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.

#### MOSSWINK

> Use case: stylized-concept. Asset type: ONE original storefront sign face texture for a vibrant flat-shaded neo-90s miniature building game. Exact inscription: "MOSSWINK", spelled exactly. Design: cream lettering on a deep muted forest-green panel, one small original asymmetrical cup-and-leaf emblem with orange accent. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, high contrast, readable when small. Entire image is the sign face with no outer padding or white surround; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.

#### 42

> Use case: stylized-concept. Asset type: ONE original building address panel texture for a vibrant flat-shaded neo-90s miniature building game. Exact inscription: "42", spelled exactly. Design: two extremely large cream block numerals on a navy panel with a thin golden-yellow edge line, no emblem. Very wide rectangular composition about 4:1, fully front-facing and flat, bold broad block type taking most of the face, high contrast, readable when small. Entire image is the sign face with no outer padding or white surround; restrained thin contrasting edge line. Graphic painted finish, no perspective, bevels, lights or shadows. No extra words, real businesses, familiar logos, scenery, hardware or watermark. Opaque flat artwork, no transparency.
