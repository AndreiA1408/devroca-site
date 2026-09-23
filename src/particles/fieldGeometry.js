/* ---------------------------------------------------------------
   The ambient field — the faint dust the whole hero sits in.

   x and y are stored normalised to [-1, 1] and z in world units. The
   vertex shader widens x/y by the frustum at each particle's depth, so
   the field always fills the viewport exactly, at any aspect ratio,
   without being rebuilt on resize.

   Depth is weighted toward the back: most of the field is distant
   dust, and only a few particles come close enough to the camera to
   read as soft, out-of-focus foreground.
--------------------------------------------------------------- */
export const FIELD_Z_FAR = -12;
export const FIELD_Z_NEAR = 7.2; // camera sits at CAM_DIST (see hero.js)

export function buildFieldParticles(count) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    position[i * 3] = Math.random() * 2 - 1;
    position[i * 3 + 1] = Math.random() * 2 - 1;
    position[i * 3 + 2] = FIELD_Z_FAR + (FIELD_Z_NEAR - FIELD_Z_FAR) * Math.pow(Math.random(), 1.7);
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
  }
  return { position, seed, count };
}
