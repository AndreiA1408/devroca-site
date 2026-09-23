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

   Before the first cycle comes the entrance, played once per load:

     swarm     0 - 0.3s   the stone's particles whirl as gold dust in a
                          loose ring around where the stone will be
     converge  0.3 - 1.1s they are pulled in, accelerating, so they
                          arrive fast and land together
     pop       1.1s -     the stone punches in: a scale overshoot that
                          springs back, a flash across the facets and a
                          flare of the glow, settled by ~1.6s

   The cycle's own clock only starts once the pop has landed.
--------------------------------------------------------------- */
const PHASES = [
  { name: 'formed',   dur: [7.5, 11], to: () => 0 },
  { name: 'loosen',   dur: [4, 5.5],  to: peak => peak * 0.4 },
  { name: 'fragment', dur: [3.5, 5],  to: peak => peak },
  { name: 'drift',    dur: [2.5, 4],  to: peak => peak },
  { name: 'reform',   dur: [5.5, 7.5], to: () => 0 }
];
const SWARM = 0.3;     // seconds of free whirl before the pull
const CONVERGE = 0.8;  // seconds from the pull to the stone being whole
const POP = 0.5;       // seconds the pop takes to settle
const OVERSHOOT = 0.07;

const clamp01 = x => Math.min(Math.max(x, 0), 1);
const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
// Accelerating all the way in: the particles are at full speed when they
// land, and the pop takes the impact.
const easeIn = x => Math.pow(clamp01(x), 2.2);
// A damped spring: up past 1, back a little under, home — and exactly home
// at t = 1, so there is no step when the pop hands over. Scaled so its
// peak is 1, which makes OVERSHOOT the real peak.
const springRaw = t => Math.sin(t * Math.PI * 1.5) * Math.exp(-t * 3.2) * (1 - t);
const springShape = t => springRaw(t) / 0.3461;
const between = ([a, b]) => a + Math.random() * (b - a);

export function createLifecycle() {
  let i = 0, elapsed = 0, from = 0, peak = 0.9, dur = between(PHASES[0].dur);
  let clock = 0; // seconds since the entrance began

  function enter(next) {
    i = next % PHASES.length;
    elapsed = 0;
    dur = between(PHASES[i].dur);
    if (i === 1) peak = 0.72 + Math.random() * 0.28;
  }

  let value = 0;
  function update(dt) {
    clock += dt;
    if (clock < SWARM + CONVERGE) return;
    elapsed += dt;
    const phase = PHASES[i];
    const target = phase.to(peak);
    value = from + (target - from) * ease(elapsed / dur);
    // While adrift, the break-up breathes a little rather than holding.
    if (phase.name === 'drift') value += Math.sin(elapsed * 1.3) * 0.04;
    if (elapsed >= dur) { from = target; enter(i + 1); }
  }

  const popT = () => (clock - SWARM - CONVERGE) / POP;
  return {
    update,
    get dissolve() { return value; },
    // 0 while swarming, 1 once the stone is whole.
    get formation() { return easeIn((clock - SWARM) / CONVERGE); },
    // Seconds since the entrance began; drives the swarm's whirl.
    get introTime() { return clock; },
    // The pop's flash: a sharp attack, then a decay over POP seconds.
    get pop() {
      const t = popT();
      if (t < 0 || t >= 1) return 0;
      return Math.min(t / 0.08, 1) * Math.pow(1 - t, 2);
    },
    // Scale multiplier: overshoots, springs back once, settles at 1.
    get popScale() {
      const t = popT();
      if (t < 0 || t >= 1) return 1;
      return 1 + OVERSHOOT * springShape(t);
    },
    // Seconds since the pop, or -1 before it; the sparks run off this.
    get sinceP() { return clock >= SWARM + CONVERGE ? clock - SWARM - CONVERGE : -1; },
    get phase() { return clock < SWARM + CONVERGE ? 'intro' : PHASES[i].name; },
    // Reduced motion: formed, still, and it stays that way.
    settle() { clock = SWARM + CONVERGE + POP; value = 0; from = 0; enter(0); }
  };
}
