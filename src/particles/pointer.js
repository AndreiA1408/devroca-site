/* ---------------------------------------------------------------
   Pointer → a smoothed disturbance for the particle field.

   The shaders never see raw pointer events. They see a position and a
   strength that ease toward the pointer, so the field is disturbed the
   way a magnetic field would be: it lags, it settles, and it relaxes
   back when the cursor leaves instead of snapping.

   Mouse/pen: the disturbance follows the cursor anywhere over the
   hero, including over the text (the canvas itself never takes
   events — see the pointer-events note in index.html).

   A mouse always wins, so a touchscreen laptop used with a mouse gets
   the full interaction.

   Touch: nothing depends on a pointer. The field drifts through a slow
   invisible disturbance of its own, and a tap sends a single soft
   ripple out from where it landed. Touch-drag is left entirely to the
   browser, so scrolling is never intercepted.
--------------------------------------------------------------- */
const FOLLOW = 5.5;   // per second — how fast the disturbance catches up
const SETTLE = 2.2;   // per second — how fast its strength rises/falls
const TAP_DECAY = 1.1; // seconds for a tap ripple to die away

export function createPointer({ coarse }) {
  const raw = { x: 0, y: 0, inside: false, moved: 0, tapAt: -1e9 };
  const out = { x: 0, y: 0, strength: 0, energy: 0, active: false };
  const result = { ndcX: 0, ndcY: 0, strength: 0, active: false }; // reused every frame
  let started = false;

  const onMove = e => {
    if (e.pointerType === 'touch') return;
    if (started) raw.moved += Math.hypot(e.clientX - raw.x, e.clientY - raw.y);
    raw.x = e.clientX; raw.y = e.clientY; raw.inside = true; started = true;
  };
  const onLeave = () => { raw.inside = false; };
  const onDown = e => {
    if (e.pointerType !== 'touch') return;
    raw.x = e.clientX; raw.y = e.clientY; raw.tapAt = performance.now();
    out.x = raw.x; out.y = raw.y;
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);

  /* rect: the canvas's client rect this frame. homeX/homeY: where the
     stone is, in client px, for the idle drift. Returns canvas NDC. */
  function update(dt, time, rect, homeX, homeY) {
    const tapAge = (performance.now() - raw.tapAt) / 1000;
    const tap = tapAge < TAP_DECAY * 3 ? Math.exp(-tapAge / TAP_DECAY) : 0;
    const over = raw.inside && raw.y >= rect.top && raw.y <= rect.bottom;

    let tx, ty, target;
    if (over) {
      tx = raw.x; ty = raw.y; target = 1;
    } else if (tap > 0.02) {
      tx = raw.x; ty = raw.y; target = tap;
    } else if (coarse) {
      // Idle drift for touch screens: a slow, wandering disturbance
      // near the stone, faint enough to read as the field's own life.
      const r = Math.min(rect.width, rect.height) * 0.22;
      tx = homeX + Math.sin(time * 0.23) * r + Math.sin(time * 0.071) * r * 0.5;
      ty = homeY + Math.cos(time * 0.17) * r * 0.7;
      target = 0.35;
    } else {
      tx = out.x; ty = out.y; target = 0;
    }

    const k = 1 - Math.exp(-dt * FOLLOW);
    out.x += (tx - out.x) * k;
    out.y += (ty - out.y) * k;
    out.strength += (target - out.strength) * (1 - Math.exp(-dt * SETTLE));

    // Movement adds energy: a fast sweep stirs the field a little more
    // than a resting cursor, then it calms down again.
    out.energy = Math.min(1, out.energy * Math.exp(-dt * 1.6) + raw.moved * 0.0016);
    raw.moved = 0;
    out.active = over;

    result.ndcX = ((out.x - rect.left) / rect.width) * 2 - 1;
    result.ndcY = -(((out.y - rect.top) / rect.height) * 2 - 1);
    result.strength = out.strength * (0.8 + out.energy * 0.45);
    result.active = out.active;
    return result;
  }

  return { update };
}
