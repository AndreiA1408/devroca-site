/* ---------------------------------------------------------------
   How much particle system a device gets.

   The tier is chosen once, from the viewport and the pointer: desktop
   gets the full stone, tablets about 60% of it, phones under half.
   Smaller stones get slightly larger particles ('grain') so a thinner
   budget still reads as a surface rather than as scattered points.
   Devices that report few cores or little memory drop a further step.

   After that a frame monitor watches the real frame time. If the page
   can't hold ~45fps it first lowers the pixel ratio, then thins the
   stone (the buffers are shuffled, so a shorter draw range is still an
   even sample — see gemGeometry.js). It only ever steps down.
--------------------------------------------------------------- */
const TIERS = {
  desktop: { gem: 24000, field: 4200, dpr: 1.75, grain: 1 },
  tablet:  { gem: 15000, field: 2600, dpr: 1.5,  grain: 1.12 },
  mobile:  { gem: 11000, field: 1400, dpr: 1.5,  grain: 1.3 }
};

export function pickQuality() {
  const w = window.innerWidth;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const name = w < 640 ? 'mobile' : (w < 1024 || coarse) ? 'tablet' : 'desktop';
  const t = { ...TIERS[name], name, coarse };
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8;
  if (cores <= 4 || memory <= 4) {
    t.gem = Math.round(t.gem * 0.65);
    t.field = Math.round(t.field * 0.65);
    t.dpr = Math.min(t.dpr, 1.25);
  }
  t.dpr = Math.min(window.devicePixelRatio || 1, t.dpr);
  return t;
}

const BUDGET = 1 / 45;
const WINDOW = 90; // frames per verdict

export function createFrameMonitor(steps) {
  let n = 0, sum = 0, step = 0;
  return {
    sample(dt) {
      if (step >= steps.length || dt <= 0 || dt > 0.25) return;
      sum += dt; n++;
      if (n < WINDOW) return;
      if (sum / n > BUDGET) steps[step++]();
      n = 0; sum = 0;
    },
    // Timing is meaningless across a pause (tab hidden, hero off screen).
    reset() { n = 0; sum = 0; }
  };
}
