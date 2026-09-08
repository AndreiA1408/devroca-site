# Build

The site is static HTML/CSS — open any `.html` file directly, or serve the
folder. The only build step is the hero gemstone.

## Gemstone

Source lives in `src/gem3d.js` and is bundled with esbuild into
`gem3d.bundle.js`, which `index.html` loads as a plain script.

```
npm install     # once
npm run build   # after any edit to src/gem3d.js
```

`gem3d.bundle.js` is generated. Never edit it by hand — it will be
overwritten on the next build.

## Notes for future edits

- **Rest pose.** The stone's own axis is +Y (table up, culet down). The mesh
  is turned a fixed quarter-turn about X so the table faces the camera; all
  the animated tilt lives on the parent `pivot` group, which rotates about
  *world* axes. Keeping the sway on the pivot is what stops the rosette from
  rolling out of upright. If you need to change how it sits, change
  `TILT_X` / `TILT_Y` / `SWAY_X` / `SWAY_Y`, not `FACE_ON`.
- **Girdle band.** `BAND_HALF` sets the half-height of the wall between the
  crown and pavilion rings. The mesh is closed regardless, but a very small
  value makes the band alias away at grazing angles.
- **Highlights.** Per-facet reflections come from the PMREM environment built
  in `buildEnvironment()`, not from the direct lights. The direct lights are
  low-intensity shaping only. If facets look flat, adjust the env panels;
  raising light intensities instead is what causes facets to clip to white.
- **Exposure.** `toneMappingExposure` is deliberately held at 1.0 and the
  bloom threshold is high (0.92). Both guard against blown-out facets.

## Canvas transparency (do not revert to an opaque background)

The hero canvas is transparent and the page's own background shows through.
There is deliberately no `scene.background`.

An opaque `scene.background` cannot be made to match the page: everything
drawn through the composer is tone mapped by `OutputPass`, so a background set
to `#14130F` leaves the canvas as `rgb(9,6,3)` against a page painted
`rgb(20,19,15)` — a visible dark rectangle.

Transparency requires one fix. `UnrealBloomPass` composites with
`AdditiveBlending`, whose alpha factors are `SrcAlpha`/`One`, so it adds the
bloom's alpha into the scene's and empty pixels drift toward opaque — the
canvas renders as a dark box. `makeBloomAlphaSafe()` replaces that blend:
RGB is added exactly as before (`src.rgb * src.a`, so bloom brightness and the
no-blown-facets guarantee are unchanged), while alpha grows only by the glow's
luminance.

## Canvas compositing (premultiplied — do not switch back)

The canvas hands the page **premultiplied** pixels. `premultipliedAlpha` is
left at its default (`true`) and the final `PremultiplyShader` pass does the
`rgb * a` multiply itself, in float, after `OutputPass` has tone mapped and
sRGB-encoded.

This used to be `premultipliedAlpha: false`, which asks the *browser* to
un-premultiply instead. That attribute is optional, is not feature-detectable,
and is not implemented consistently between engines — and it mattered a great
deal here, because additive bloom leaves the composer buffer full of
"super-luminous" pixels. Measured on the old build: RGB exceeded alpha on 25.8%
of the canvas by up to 127/255, and ~10.5k pixels carried color at alpha 0.
How much of that color survived was entirely up to the browser's rounding and
color management of the divide, so Safari and Chrome did not agree — which is
what produced a visible box around the canvas in Safari, and a flatter, less
vibrant glint there.

Doing the multiply ourselves makes the pixel handed to the compositor
unambiguous. Two invariants now hold at every aspect ratio (verified 0.88,
1.21 and 4.5): `RGB <= A` for every pixel, and an untouched pixel is exactly
`(0,0,0,0)`, so the canvas cannot tint the page it sits on. The composited
result is unchanged from what Chrome rendered before.

If you ever add a pass, it must go **before** `PremultiplyShader` — that one
has to stay last, and it has to run after `OutputPass`, which encodes RGB but
leaves alpha alone.

The glow sprite is sized to the camera frustum in `resize()` so its gradient
reaches zero inside the canvas; a halo still bright at the boundary would be
cut off square and read as a faint rectangle.
