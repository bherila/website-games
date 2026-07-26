# People Prompts

## `person.low.sample`, `person.med.sample`, `person.high.sample`

Prepend `_style-preamble.md`.

Create static income-tier visitor sprites for Tower Throwback.
Exact source frame: `40 x 76` px, representing the existing `10 x 19` logical frame at 4x density.
Subject: tiny full-body figure, cheerful readable head/torso/legs silhouette; low tier uses muted green/cream, medium tier uses blue/teal, high tier uses teal/gold.
State cues: calm, not irritated, not VIP.
LOD note: create a detail frame for close zoom and a summary frame with stronger silhouette/fewer interior marks for whole-tower zoom.
Constraints: original artwork only; no animation frames; minimal facial detail; no external shadow.

## `person.vip.sample`

Prepend `_style-preamble.md`.

Create one static VIP visitor sprite for Tower Throwback.
Exact source frame: `40 x 76` px, representing the existing `10 x 19` logical frame at 4x density.
Subject: tiny full-body figure, formal silhouette with gold status accent that remains visible at 1-tile scale.
State cues: VIP/gold signal must survive downscale; calm, not irritated.
LOD note: create a detail frame for close zoom and a summary frame with stronger gold silhouette for whole-tower zoom.
Constraints: original artwork only; no animation frames; minimal facial detail; no external shadow.

## `person.staff.sample`, `person.staff.summary`

Prepend `_style-preamble.md`.

Create static tower staff sprites for Tower Throwback.
Exact source frame: `40 x 76` px, representing the existing `10 x 19` logical frame at 4x density.
Subject: tiny full-body operations staff figure with readable upright silhouette, compact work uniform, small badge/radio/tool-belt color accents, and service-worker posture.
State cues: calm, helpful, not VIP, not irritated; staff must read differently from visitor income tiers without using text or logos.
LOD note: create a detail frame for close zoom and a summary frame with stronger torso/hat/badge silhouette and fewer interior marks for whole-tower zoom.
Constraints: original artwork only; no animation frames; minimal facial detail; no external shadow; no cart or large prop that exceeds the frame.

## `person.housekeeper.sample`, `person.housekeeper.summary`

Prepend `_style-preamble.md`.

Create static housekeeping staff sprites for Tower Throwback.
Exact source frame: `40 x 76` px, representing the existing `10 x 19` logical frame at 4x density.
Subject: tiny full-body housekeeper figure with readable uniform/apron silhouette, clean light-blue or mint service colors, and one small housekeeping cue such as a folded towel or compact hand tool.
State cues: calm, working, not VIP, not irritated; housekeeper must read differently from generic staff and visitor income tiers without text or logos.
LOD note: create a detail frame for close zoom and a summary frame with stronger apron/shoulder silhouette and fewer interior marks for whole-tower zoom.
Constraints: original artwork only; no animation frames; minimal facial detail; no external shadow; no full cart or large prop that exceeds the frame.
