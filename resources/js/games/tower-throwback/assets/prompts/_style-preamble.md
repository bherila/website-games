# Shared Style Preamble

Use case: stylized-concept
Asset type: Tower Throwback game sprite sample
Primary request: create original clean-lined neo-90s art for a side-view tower management game; homage only, never copy or trace SimTower/Yoot Tower or any copyrighted art.
Style/medium: dimensional clean-line cutaway illustration with readable construction-grid silhouettes, restrained perspective, subtle bevels, visible side planes, polished gradients, material cues, contemporary highlights, and soft contact shadows.
Render grid: logical floor-cell compatibility remains `16 x 48` px, but the style-gate atlas is exported at 4x density for close zoom. Keep silhouettes simple enough to survive downscale while close views retain dimensional detail.
Perspective: straight-on side section, shallow interior depth, furniture arranged horizontally, clear silhouettes, no cluttered micro-props.
Palette: bright daytime base, warm creams, pale blue glass, leafy greens, warm wood/floor tones, teal/coral/gold accents, softer navy-brown outlines.
Lighting: daylight-forward source art only. Do not bake night themes because runtime applies sky color, night dim, and warm occupied-window tint.
Windows/glass: preserve big/tall office windows; use more natural-light windows in apartments/hotel rooms. Window regions should support transparency/runtime glass color rather than opaque dark-blue paint.
LOD: people and elevator cars/doors need detail and summary variants; the summary variants should be stronger silhouettes with fewer interior lines.
Transparency workflow: place sprites on a perfectly flat solid #00ff00 chroma-key background when raster output requires cutout; background must be one uniform color with no shadows, gradients, texture, floor plane, reflection, watermark, or text.
Avoid: pixelation, low-resolution sprite aesthetics, dithering, voxel/block texture, flat unshaded rectangles, photorealism, logos, trademarks, legible text inside scene art, extra UI labels, grim/noir palettes, busy crosshatching, dark glass baked into daytime art, copied game art.
