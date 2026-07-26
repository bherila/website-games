# Tower Throwback Art Plan

The complete pack uses deterministic SVG masters plus reviewed image-generated raster sources, generated atlas metadata, and a WebP runtime atlas. Every manifest frame is packed; there are no placeholder raster slots.

## Render Grid

- Logical sprite density remains compatible with the original `16 x 48` px floor-cell grid, but the style-gate atlas is exported at `4x` density (`SPRITE_PPU = 64`) for close zoom.
- One logical floor-cell maps to a `64 x 192` px atlas frame (`TILE_W = 1`, `FLOOR_H = 3`).
- Scene sprites ship as WebP atlas frames with 8 px padding. Source art is committed under `assets/source/`: generated SVG for the main pack and prompt-recorded WebP sources for Niagara's prestige art and panorama.
- HUD icons ship as SVG.
- Runtime fallback remains the existing colored quads. The style-gate atlas is an overlay only when the atlas and frame are present.
- The runtime uses linear filtering and mipmaps for the style-gate atlas, while tiny dynamic sprites switch to summary LOD at zoomed-out views.
- Window glass is partially transparent and backed by runtime sky/night/warm-window colors.

## Unit Checklist

Variant key:

- `single`: one frame.
- `vacant/occupied`: occupiable unit pair.
- `vacant/occupied/dirty`: hotel room triplet.
- `defer`: not generated in this branch.

| Kind | Category | Catalog cells | Pixel size | Variants | Current status |
| --- | --- | ---: | ---: | --- | --- |
| slab | structure | 1 x 1 | 16 x 48 | single | revised: seamless `unit.slab.tile` |
| lobby | structure | 1 x 1 repeat | 64 x 192 tile + decor overlays | seamless tile plus sparse tree/bench/front-desk/plant overlays; lobby height spans runtime `lobbyHeight` | revised: `unit.lobby.tile`, `unit.lobby.decor.tree`, `unit.lobby.decor.bench`, `unit.lobby.decor.frontDesk`, `unit.lobby.decor.plant` |
| skylobby | structure | 1 x 1 | 16 x 48 | single | revised: seamless `unit.skylobby.tile` |
| skybridge | structure | 1 x 1 | 16 x 48 | single | revised: seamless `unit.skybridge.tile` |
| stairs | transit | 2 x 1 | 32 x 48 | single | revised: `unit.stairs.sample` |
| escalator | transit | 4 x 1 | 64 x 48 | single | revised: `unit.escalator.sample` |
| officeS | office | 6 x 1 | 384 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.officeS.variant{A,B,C}.{vacant,occupied}` |
| officeM | office | 9 x 1 | 576 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.officeM.variant{A,B,C}.{vacant,occupied}` |
| officeL | office | 12 x 1 | 768 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.officeL.variant{A,B,C}.{vacant,occupied}` |
| aptStudio | residential | 4 x 1 | 256 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.aptStudio.variant{A,B,C}.{vacant,occupied}` |
| apt1br | residential | 6 x 1 | 384 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.apt1br.variant{A,B,C}.{vacant,occupied}` |
| apt2br | residential | 8 x 1 | 512 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.apt2br.variant{A,B,C}.{vacant,occupied}` |
| aptPenthouse | residential | 16 x 1 | 1024 x 192 | vacant/occupied x3 deterministic variants | revised: `unit.aptPenthouse.variant{A,B,C}.{vacant,occupied}` |
| restroom | services | 4 x 1 | 256 x 192 | vacant/occupied | complete: `unit.restroom.vacant`, `unit.restroom.occupied` |
| shop | commerce | 8 x 1 | 128 x 48 | vacant/occupied | revised: `unit.shop.vacant`, `unit.shop.occupied` |
| fastfood | commerce | 12 x 1 | 768 x 192 | vacant/occupied | revised: `unit.fastfood.vacant`, `unit.fastfood.occupied` |
| foodCourt | commerce | 16 x 1 | 256 x 48 | vacant/occupied | revised: `unit.foodCourt.vacant`, `unit.foodCourt.occupied` |
| restaurant | commerce | 10 x 1 | 160 x 48 | vacant/occupied | revised: `unit.restaurant.vacant`, `unit.restaurant.occupied` |
| fancyRestaurant | commerce | 12 x 1 | 192 x 48 | vacant/occupied | revised: `unit.fancyRestaurant.vacant`, `unit.fancyRestaurant.occupied` |
| movieTheater | commerce | 20 x 2 | 320 x 96 | vacant/occupied | revised: `unit.movieTheater.vacant`, `unit.movieTheater.occupied` |
| fitness | commerce | 12 x 1 | 192 x 48 | vacant/occupied | revised: `unit.fitness.vacant`, `unit.fitness.occupied` |
| pool | commerce | 20 x 2 | 320 x 96 | vacant/occupied | revised: `unit.pool.vacant`, `unit.pool.occupied` |
| spa | commerce | 12 x 1 | 192 x 48 | vacant/occupied | revised: `unit.spa.vacant`, `unit.spa.occupied` |
| conferenceCenter | commerce | 24 x 2 | 384 x 96 | vacant/occupied | revised: `unit.conferenceCenter.vacant`, `unit.conferenceCenter.occupied` |
| eventSpace | commerce | 30 x 2 | 480 x 96 | vacant/occupied | revised: `unit.eventSpace.vacant`, `unit.eventSpace.occupied` |
| hotelReception | hotel | 10 x 1 | 160 x 48 | single | revised: `unit.hotelReception.sample` |
| hotel1p | hotel | 4 x 1 | 256 x 192 | vacant/occupied/dirty | revised: brighter/windowed `unit.hotel1p.vacant`, `unit.hotel1p.occupied`, `unit.hotel1p.dirty` |
| hotel2p | hotel | 6 x 1 | 96 x 48 | vacant/occupied/dirty | revised: `unit.hotel2p.vacant`, `unit.hotel2p.occupied`, `unit.hotel2p.dirty` |
| hotelSuite | hotel | 10 x 1 | 160 x 48 | vacant/occupied/dirty | revised: `unit.hotelSuite.vacant`, `unit.hotelSuite.occupied`, `unit.hotelSuite.dirty` |
| housekeeping | services | 8 x 1 | 128 x 48 | single | revised: `unit.housekeeping.sample` |
| trashRoom | services | 6 x 1 | 96 x 48 | single | revised: `unit.trashRoom.sample` |
| recyclingCenter | services | 20 x 1 | 320 x 48 | single | revised: `unit.recyclingCenter.sample` |
| parkingRamp | services | 6 x 1 | 96 x 48 | single | revised: `unit.parkingRamp.sample` |
| parkingSpace | services | 2 x 1 | 32 x 48 | single | revised: `unit.parkingSpace.sample` |
| subway | transit | 30 x 1 | 480 x 48 | single | revised: `unit.subway.sample` |
| securityOffice | services | 10 x 1 | 160 x 48 | single | revised: `unit.securityOffice.sample` |
| medicalClinic | services | 12 x 1 | 192 x 48 | single | revised: `unit.medicalClinic.sample` |
| cathedral | special | 30 x 2 | 480 x 96 | single | revised: `unit.cathedral.sample` |
| observationDeck | special | 24 x 2 | 384 x 96 | single | complete: image-generated `unit.observationDeck.sample` with a 6-tile right cantilever |

## Elevator Checklist

Per shaft kind, floor-cell segment size is `width * 16 x 48` px. Car art is drawn for the runtime car body (`width - 0.4` by `0.8 * FLOOR_H`) and atlas-normalized to the shaft segment width for simple composition.

| Kind | Width | Segment px | Required frames | Milestone 1 |
| --- | ---: | ---: | --- | --- |
| standard | 2 | 128 x 192 | interior, caps, empty/single/double/crowded/full cars, doors, enabled/disabled stop plates, summary LOD | complete |
| express | 3 | 128 x 192 source, scaled to width | same as standard with express accent | complete |
| service | 2 | 128 x 192 | same as standard with service accent | complete |
| glass | 2 | 128 x 192 | translucent interior, caps, cars, doors, stop plates, summary LOD | complete |

Future #1504 hook: top/bottom cap frames should remain separate from the shaft body so vertical resize handles can use the cap frame bounds directly.

## People Checklist

- Runtime person quad is `0.6 x 1.2` world units, approximately `40 x 76` px in the high-resolution style-gate atlas.
- Preserve red irritated and gold VIP status signals in later tint/badge work. This revision covers all runtime income tiers by frame selection; VIP uses a gold accent.
- Detail and summary frames exist for zoom-aware LOD.

| Tier | Variants | Milestone 1 |
| --- | --- | --- |
| low | 2 | complete: base and variant B, each with detail/summary LOD |
| med | 2 | complete: base and variant B, each with detail/summary LOD |
| high | 2 | complete: base and variant B, each with detail/summary LOD |
| vip | 2 | complete: base and variant B, each with detail/summary LOD |
| staff/housekeeper | 1+ | complete: distinct detail/summary role frames selected by journey purpose |

## Ambience Checklist

| Asset | Pixel size | Milestone 1 |
| --- | ---: | --- |
| cloud small/medium/large | variable, target 48-96 px wide | complete: three deterministic variants |
| ground/horizon strip | 512 x 192 repeat tile | complete: packed and repeated behind the tower |
| night star dots | 512 x 256 repeat tile | complete: packed, tiled, and clock-faded at runtime |
| Niagara cliff/gorge panorama | 384 x 256 runtime frame (1536 x 1024 WebP source) | complete: smooth illustrated `ambience.niagaraGorge.backdrop`; quieter left construction cutaway and distinct right bank around the map-authored falls void |
| Niagara waterfall + base mist | bounded procedural layers | complete: geometry derives from the exact horizontal build exclusion; deterministic simulation-time animation; reduced motion freezes phase without hiding the falls |

## HUD Icon Checklist

HUD icons are native SVG with a 24 x 24 viewBox, small-size illustrative vector language, and category-coded badge backgrounds. Milestone 1 adds only two sample icons.

| Icon | Milestone 1 |
| --- | --- |
| `lobby` build-palette icon | done |
| `standard` shaft build-palette icon | done |
| all remaining `ItemKind`, `ShaftKind`, toolbar, overlay, star, incident icons | ready: native SVG set in `assets/icons/`, typed catalog in `hud/hudIcons.ts`; no raster pass needed |

## Atlas Layout

The style-gate atlas packs frames into `assets/sprites/style-gate.webp` with a committed `style-gate.json` manifest. The atlas helper writes rows by frame height with 8 px transparent padding around every high-resolution frame:

1. Unit interiors: repeatable structure tiles, transit samples, all office/residential/commerce/hotel/service/special unit kinds, with occupancy and dirty variants where the engine uses them.
2. Elevator frames for all shaft kinds: interior, caps, five car occupancy states, doors, and enabled/disabled stop plates.
3. Summary LOD elevator cars/doors, detail/summary people for all tiers and staff roles, three clouds, horizon, stars, Niagara gorge, and Observation Deck.
4. Atlas height and runtime manifest are derived directly from the packed frame result; every manifest frame owns atlas pixels.

The manifest frame names are intentionally namespaced (`unit.*`, `elevator.standard.*`, `person.*`, `ambience.*`) so #1501 Group C/#1504 can add category-complete manifests without renaming these samples.

## Milestones

- Milestone 0: this plan plus prompt preamble. Complete.
- Milestone 1: style-gate sample frames, prompt files, atlas, minimal loader/render fallback wiring, starter visual smoke. Complete in #1521.
- Milestone 1 revision: cheerful clean SVG-source atlas, tiled/decorated lobby, additional starter/midgame unit coverage, runtime glass backing, all-shaft elevator coverage, all-tier people coverage, and zoom-aware small-object LOD. Complete in #1524.
- Milestone 2 unit batch: remaining unit interiors in the deterministic SVG-source format, plus runtime selection and manifest-sync tests. Complete in #1530.
- Milestone 3 HUD icons: full native SVG icon set, typed build-tool catalog, and vector completeness tests. Complete in #1535.
- Milestone 3 people batch: staff/housekeeper prompt files and fallback-safe manifest slots. Complete in #1536.
- Milestone 3 ambience batch: ground/horizon and night-star prompt files and fallback-safe manifest slots. Complete.
- Milestone 4 unit/lobby art variety: deterministic office/residential variants selected from `unit.id`, plus front-desk and plant lobby overlays. Complete in #1545.
- Milestone 5 completion: all placeholders packed, five-state cars and stop plates wired, people/cloud variety added, and starter/midgame/endgame day/night visual coverage added. Complete.
- Niagara art pass: independent falls palette, smooth WebP gorge source, exact approved Observation Deck WebP, animated waterfall, deterministic mist, map-authored left/right banks, and build-mode construction guide. Complete.
