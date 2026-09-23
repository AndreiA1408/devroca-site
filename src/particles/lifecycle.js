/* ---------------------------------------------------------------
   The stone's formation/dissolution cycle.

     formed    — whole and still (A, F)
     loosen    — the first patches lift away (B)
     fragment  — partly broken, a third or more of it adrift (C)
     drift     — pieces wander in the surrounding space (D)
     reform    — they find their way back (E)

   Output is a single 0..1 value, uDissolve; which particles leave at
   a given value is decided in the shader. Every pass re-rolls its
   timings and how far it breaks up, so no two cycles match and the
   loop never settles into a visible beat.

   Before the first cycle the stone assembles from scattered dust —
   'formation', 0 -> 1 — which is the reform phase played once, larger.
--------------------------------------------------------------- */
const PHASES = [
  { name: 'formed',   dur: [7.5, 11], to: () => 0 },
  { name: 'loosen',   dur: [4, 5.5],  to: peak => peak * 0.4 },
  { name: 'fragment', dur: [3.5, 5],  to: peak => peak },
  { name: 'drift',    dur: [2.5, 4],  to: peak => peak },
  { name: 'reform',   dur: [5.5, 7.5], to: () => 0 }
];
const INTRO = 3.6; // seconds

const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(x, 0), 1));
const easeOut = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const between = ([a, b]) => a + Math.random() * (b - a);

export function createLifecycle() {
  let i = 0, elapsed = 0, from = 0, peak = 0.9, dur = between(PHASES[0].dur);
  let intro = 0;

  function enter(next) {
    i = next % PHASES.length;
    elapsed = 0;
    dur = between(PHASES[i].dur);
    if (i === 1) peak = 0.72 + Math.random() * 0.28;
  }

  let value = 0;
  function update(dt) {
    intro = Math.min(intro + dt / INTRO, 1);
    if (intro < 1) return;
    elapsed += dt;
    const phase = PHASES[i];
    const target = phase.to(peak);
    value = from + (target - from) * ease(elapsed / dur);
    // While adrift, the break-up breathes a little rather than holding.
    if (phase.name === 'drift') value += Math.sin(elapsed * 1.3) * 0.04;
    if (elapsed >= dur) { from = target; enter(i + 1); }
  }

  return {
    update,
    get dissolve() { return value; },
    get formation() { return easeOut(intro); },
    get phase() { return intro < 1 ? 'intro' : PHASES[i].name; },
    // Reduced motion: formed, still, and it stays that way.
    settle() { intro = 1; value = 0; from = 0; enter(0); }
  };
}
