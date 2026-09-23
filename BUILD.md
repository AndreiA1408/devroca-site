# Build

The site is static HTML/CSS — open any `.html` file directly, or serve the
folder. The only build step is the hero gemstone.

## Gemstone

Source lives in `src/gem3d.js` + `src/particles/` and is bundled with esbuild into
`gem3d.bundle.js`, which `index.html` loads as a plain script.

```
npm install     # once
npm run build   # after any edit under src/
```

`gem3d.bundle.js` is generated. Never edit it by hand — it will be
overwritten on the next build.

## How the hero works

The gem is a particle system, not a mesh: the logo's hexagonal rosette cut is described
as triangles in `src/particles/gemGeometry.js`, particles are sampled from it
once at startup, and everything after that — breathing, drift, the
formation/dissolution cycle, cursor displacement, facet lighting — happens in
the vertex shaders (`src/particles/shaders.js`). Per frame the CPU writes only
a handful of uniforms. Module map is at the top of `src/gem3d.js`.

- **Layout is CSS's job.** The canvas is full-bleed behind the whole hero
  (`.hero-space` in `index.html`). The stone centres and sizes itself on the
  empty `[data-gem-stage]` box, so to move or resize the stone per breakpoint,
  change that box's CSS — not the script.
- **The canvas never takes events.** `pointer-events:none` + `aria-hidden`;
  the cursor is read from `window`. Keep it that way or the hero CTAs stop
  being clickable.
- **Particle budget** is per tier in `src/particles/quality.js` (desktop 24k,
  tablet 15k, phone 11k stone particles; ×0.65 on low-core / low-memory
  devices). A frame monitor steps down pixel ratio, then draw range, if the
  page can't hold ~45fps. Buffers are shuffled so any draw range is an even
  sample of the stone.
- **Pausing.** The loop stops while the hero is off screen or the tab is
  hidden (IntersectionObserver + visibilitychange).
- **Reduced motion.** Formed, still stone: no drift, dissolution, cursor
  displacement or camera movement; only a brightness shimmer, at 20fps.
- **Rest pose.** The stone lies face-on like the logo mark, with the mark's
  -9 degree lean, and turns in uneven swings of about 30 degrees rather than
  a full spin (a flat rosette edge-on stops reading as the logo). The swing
  lives in `pose()` in `src/particles/hero.js`; widening it past ~0.5 rad
  flattens the stone into a lozenge for long stretches.
- **Lifecycle timings** (formed → loosen → fragment → drift → reform) are in
  `src/particles/lifecycle.js`; how far the stone breaks up at a given value
  is `key`/`frag` in the gem vertex shader.

## Theme

`window.devrocaGem.setTheme()` / the `devroca:themechange` event (fired by
`main.js`) switch palettes in `src/particles/theme.js`. Dark: the particles
are light, blended additively. Light: nothing can be brighter than bone, so
the same brightness model drives *ink* instead — bronze particles blended as
premultiplied "over", glints darkest.

## Canvas compositing (premultiplied, transparent — keep it)

There is no `scene.background`; the page shows through the canvas. The canvas
hands the page premultiplied pixels (`premultipliedAlpha` default `true`), and
every shader writes a valid premultiplied colour itself:

- dark, additive (`ONE, ONE`): alpha is written as the brightest channel, so
  accumulated RGB can never exceed accumulated alpha;
- light, "over" (`ONE, ONE_MINUS_SRC_ALPHA`): RGB is colour × alpha.

So `RGB <= A` holds for every pixel and an untouched pixel is exactly
`(0,0,0,0)`. That invariant is what stops Safari and Chrome disagreeing about
the canvas (the old visible-box bug). Anything new drawn into this canvas must
follow the same contract.

## Languages (EN / RO / ES)

English is authored in the HTML; Romanian and Spanish live in
`assets/i18n/ro.js` and `assets/i18n/es.js` as `[English, translation]` pairs,
and `assets/i18n.js` swaps them in at load and builds the header switcher. The
choice is kept in `localStorage` (`lang`), and `?lang=ro` / `?lang=es` in a URL
selects and stores it too. No build step.

- **Editing English copy means updating its key.** The dictionaries are keyed
  by the English text (whitespace-collapsed `textContent`), so a changed
  sentence falls back to English until both files have the new key. Curly (’)
  and straight (') apostrophes are different keys.
- **A "string" is any element with its own letters in a direct text node**;
  its children belong to it, so a translation repeats the child markup
  (`<strong>`, `<em>`, links). Text written from JS goes through
  `devrocaI18n.t()` (see `main.js`).
- Form values posted to the inbox stay English (`value` attributes on the
  project-type options); only the visible labels are translated.
