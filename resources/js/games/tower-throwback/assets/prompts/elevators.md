# Elevator Prompts

## `elevator.{standard,express,service,glass}.style-gate`

Prepend `_style-preamble.md`.

Create elevator sprite samples for every Tower Throwback shaft kind.
Exact source frames: each shaft segment/cap/door frame is `128 x 192` px and scales to the runtime shaft width. Car body art must fit visually within the existing runtime car body (`width - 0.4`, `0.8 * FLOOR_H`) but be normalized into a `32 x 48` logical atlas frame for simple composition.
Required frames per shaft kind: shaft interior background, top machinery cap, bottom pit/buffer cap, car empty, car crowded, doors closed overlay, doors open overlay, plus summary LOD variants for cars/doors.
Subject: clean late-20th-century elevator shaft with steel guide rails, readable pulleys, grabbable top machinery, rubber buffers, cream cabin panels, and pale glass reflections.
State cues: express uses gold accents, service uses coral/utility accents, glass uses translucent blue-green glass; crowded car shows rider silhouettes only; door overlays contain the door geometry and composite over any car body.
LOD note: summary car/door frames should remove tiny internal detail and read as strong silhouettes at whole-tower zoom.
Constraints: original artwork only; no readable floor numbers because code renders labels; no people outside the car; no baked night lighting.
