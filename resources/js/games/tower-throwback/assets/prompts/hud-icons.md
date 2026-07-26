# HUD Icon Prompts

HUD icons are implemented as native SVG rather than imagegen raster output. This file records the intended art language for the full icon set and the committed filenames that satisfy it.

Shared SVG rules for every icon:

- `24 x 24` viewBox.
- Small-size illustrative vector language: clear silhouettes, curves, rounded edges, and a few high-signal interior details.
- Dark outline, warm daytime palette, pale glass, leafy greens, teal/coral/gold accents.
- Category-coded badge backgrounds: residential green, commercial/office blue, dining amber, hotel lavender, service neutral, transit cyan, status gold, incident coral.
- No text, logos, trademarks, raster images, base64, scripts, gradients, masks, or external assets.

## `icon.lobby`

Create a 24 x 24 SVG build-palette icon for the Tower Throwback lobby.
Style: native SVG, limited palette, dark outline, tall lobby glass, warm floor, door, and clear planter silhouettes.
Constraints: no text, no external assets, no trademarks.

## `icon.standard-elevator`

Create a 24 x 24 SVG build-palette icon for the standard elevator.
Style: native SVG, limited palette, dark outline, elevator cab, split doors, guide rails, and call buttons readable at toolbar scale.
Constraints: no text, no external assets, no trademarks.

## Build-palette catalog icons

Committed files:

- `slab.svg`, `lobby.svg`, `skylobby.svg`, `skybridge.svg`
- `stairs.svg`, `escalator.svg`
- `officeS.svg`, `officeM.svg`, `officeL.svg`
- `aptStudio.svg`, `apt1br.svg`, `apt2br.svg`, `aptPenthouse.svg`
- `restroom.svg`
- `shop.svg`, `fastfood.svg`, `foodCourt.svg`, `restaurant.svg`, `fancyRestaurant.svg`, `movieTheater.svg`, `fitness.svg`, `pool.svg`, `spa.svg`, `conferenceCenter.svg`, `eventSpace.svg`
- `hotelReception.svg`, `hotel1p.svg`, `hotel2p.svg`, `hotelSuite.svg`, `housekeeping.svg`
- `trashRoom.svg`, `recyclingCenter.svg`, `parkingRamp.svg`, `parkingSpace.svg`, `subway.svg`, `securityOffice.svg`, `medicalClinic.svg`
- `cathedral.svg`, `observationDeck.svg`
- `standard-elevator.svg`, `express-elevator.svg`, `service-elevator.svg`, `glass-elevator.svg`

Design notes:

- Catalog icons should read as tiny props from the unit art rather than symbolic UI badges.
- Badge background color should help separate build categories before the silhouette is parsed.
- Units with windows should use pale glass and warm interior color. Service units should stay distinct through key silhouettes: carts, bins, cars, train, security monitors, and medical cross.
- Shaft icons keep a consistent elevator frame but vary accent colors: standard gold, express gold stripe, service coral, glass teal-blue glass.

## Toolbar, overlay, star, and incident icons

Committed files:

- Toolbar: `toolbar-build.svg`, `toolbar-run.svg`, `toolbar-financials.svg`, `toolbar-saves.svg`, `toolbar-sound-on.svg`, `toolbar-sound-off.svg`, `toolbar-pause.svg`, `toolbar-speed-1.svg`, `toolbar-speed-2.svg`, `toolbar-speed-4.svg`, `toolbar-speed-8.svg`, `toolbar-speed-16.svg`
- Overlay: `overlay-none.svg`, `overlay-noise.svg`, `overlay-congestion.svg`
- Star/VIP: `star.svg`, `star-progress.svg`, `tower-crown.svg`, `vip.svg`
- Incident: `incident-warning.svg`, `incident-bomb-threat.svg`, `incident-cockroach.svg`, `incident-repair.svg`, `incident-request.svg`, `incident-vacancy.svg`

Design notes:

- Toolbar icons should be literal controls at small size: build tool, run/play, ledger bars, save disk, sound, pause, and stepped speed bars.
- Overlay icons should show layered tiles and heat intensity without text labels.
- Star and VIP icons should preserve the gold status signal without relying on Unicode glyphs.
- Incident icons should remain readable as warning states without gore or frightening detail.
