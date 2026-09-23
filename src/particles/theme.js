import * as THREE from 'three';

/* ---------------------------------------------------------------
   Palettes, per page theme.

   Dark: the stone is light — deep amber through gold to a warm cream
   glint, the same golds as the logo mark and the --gold-* tokens.
   Light: the stone is ink. Nothing composited over bone can be
   brighter than bone, so on paper the same brightness model drives
   *darkness* instead: the glints are the deepest bronze, and the
   quiet facets fade toward the page.

   Colours are sRGB and handed to the shader as-is: the particle
   materials do no colour-space conversion, so these are exactly the
   values that land on screen.
--------------------------------------------------------------- */
const hex = h => new THREE.Vector3(
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255
);

export const PALETTES = {
  dark: {
    ink: 0,
    gem: { deep: hex('#5A3A0E'), body: hex('#C98A2B'), lit: hex('#F5C243'), glint: hex('#FFF1C9'), alpha: 0.72 },
    field: { dim: hex('#7A6440'), bright: hex('#F2E3BC'), alpha: 0.5 },
    glow: { color: hex('#F5B940'), strength: 0.16 }
  },
  light: {
    ink: 1,
    gem: { deep: hex('#C9A56A'), body: hex('#A06716'), lit: hex('#6B420C'), glint: hex('#241603'), alpha: 0.64 },
    field: { dim: hex('#B89A66'), bright: hex('#6B420C'), alpha: 0.34 },
    glow: { color: hex('#8A5A12'), strength: 0.1 }
  }
};

export function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/* Additive light on the dark page, premultiplied "over" on the light
   one — see particleFragment for why each keeps RGB <= A. */
export function applyBlending(material, theme) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  const dst = theme === 'light' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor;
  material.blendDst = dst;
  material.blendDstAlpha = dst;
  material.needsUpdate = true;
}
