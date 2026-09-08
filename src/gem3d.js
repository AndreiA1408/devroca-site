import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/* ---------------------------------------------------------------
   Geometry — hexagonal rosette cut, matching the 2D logo mark.

   The stone is built around its own +Y axis: table on top, culet at
   the bottom. The rest pose (see TILT_* below) then lays that axis
   toward the camera so the rosette reads face-on like the logo.

   ORIENT rotates every ring so the girdle hexagon sits pointy-top
   on screen and the table hexagon sits pointy-side, which is the
   30-degree alternation the SVG mark uses.
--------------------------------------------------------------- */
const ORIENT    = Math.PI / 6;
const BAND_HALF = 0.09;   // half-height of the girdle band
const R_GIRDLE  = 1;
const R_TABLE   = 0.46;
const Y_TABLE   = 0.34;
const R_CULET   = 0.16;
const Y_CULET   = -0.46;

function buildGemGeometry() {
  const pos = [];
  const tri = (a, b, c) => { pos.push(...a, ...b, ...c); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };

  const ring = (radius, y, phase = 0) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2 + phase;
      pts.push([Math.cos(t) * radius, y, Math.sin(t) * radius]);
    }
    return pts;
  };

  const girdleTop = ring(R_GIRDLE,  BAND_HALF, ORIENT);
  const girdleBot = ring(R_GIRDLE, -BAND_HALF, ORIENT);
  const tableRing = ring(R_TABLE,  Y_TABLE, ORIENT + Math.PI / 6);
  const culetRing = ring(R_CULET,  Y_CULET, ORIENT + Math.PI / 6);
  const tableMid  = [0, Y_TABLE, 0];
  const culetTip  = [0, Y_CULET, 0];

  // Girdle band — a closed wall between the two girdle rings, so crown
  // and pavilion are never topologically separated at any angle.
  for (let i = 0; i < 6; i++) {
    quad(girdleTop[i], girdleTop[(i + 1) % 6], girdleBot[(i + 1) % 6], girdleBot[i]);
  }
  // Crown facets — girdle up to the table ring.
  for (let i = 0; i < 6; i++) {
    const a = girdleTop[i], b = girdleTop[(i + 1) % 6];
    const c = tableRing[i], d = tableRing[(i - 1 + 6) % 6];
    tri(a, c, b); tri(a, d, c);
  }
  // Table.
  for (let i = 0; i < 6; i++) tri(tableMid, tableRing[(i + 1) % 6], tableRing[i]);
  // Pavilion facets — girdle down to the culet ring.
  for (let i = 0; i < 6; i++) {
    const a = girdleBot[i], b = girdleBot[(i + 1) % 6];
    const c = culetRing[i], d = culetRing[(i - 1 + 6) % 6];
    tri(b, c, a); tri(a, c, d);
  }
  // Culet.
  for (let i = 0; i < 6; i++) tri(culetTip, culetRing[i], culetRing[(i + 1) % 6]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ---------------------------------------------------------------
   Environment — a small studio rig rendered once into a PMREM cube.
   This is what makes each flat facet mirror a *different* part of the
   surroundings, so highlights arrive and leave facet by facet instead
   of smearing across the stone as one broad diffuse blob.
   Cost is one prefilter at startup; nothing per frame.
--------------------------------------------------------------- */
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const panel = (color, intensity, w, h, pos, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })
    );
    m.position.set(...pos);
    m.lookAt(...(look || [0, 0, 0]));
    env.add(m);
    return m;
  };

  // Enclosing shell. Warm and dim rather than black: a facet pointed at
  // "nothing" must still return some gold, otherwise most of the stone
  // reads as flat black and the cut stops being legible.
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0x4a3d29, side: THREE.BackSide })
  ));

  // Key softbox, warm and bright but deliberately short of clipping.
  panel('#FFF0CE', 3.4, 9, 7, [5, 6, 5]);
  // Warm gold fill, low and behind — rim light on the pavilion facets.
  panel('#F2B944', 2.0, 10, 8, [-6, -1.5, -5]);
  // Cool bounce, keeps the shadow side from going dead.
  panel('#BFD6FF', 1.1, 8, 8, [-5, 2.5, 4]);
  // Narrow strips: small, high-contrast sources read as crisp glints
  // that individual facets snap on and off as the stone turns.
  panel('#FFFFFF', 4.0, 1.0, 6, [3.5, 1, 6]);
  panel('#FFE9B0', 3.0, 0.9, 5, [-3, 4.5, -2]);
  panel('#FFD9A0', 2.6, 0.9, 5, [2, -4, 4]);
  // Soft floor bounce.
  panel('#6B5630', 1.4, 14, 14, [0, -7, 0], [0, 1, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return target.texture;
}

function buildGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0,    'rgba(245,194,67,0.22)');
  g.addColorStop(0.35, 'rgba(245,194,67,0.09)');
  g.addColorStop(0.6,  'rgba(245,194,67,0.02)');
  g.addColorStop(0.85, 'rgba(245,194,67,0)');
  g.addColorStop(1,    'rgba(245,194,67,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false
  }));
  sprite.scale.set(4, 4, 1);
  sprite.position.z = -1.4;
  return sprite;
}


/* ---------------------------------------------------------------
   UnrealBloomPass blends its result with AdditiveBlending, whose alpha
   factors are SrcAlpha/One. Over a transparent background that adds the
   bloom's own alpha into the scene's, so empty pixels creep toward opaque
   and the canvas renders as a dark rectangle over the page.

   Fix the blend rather than the background: add bloom to RGB additively,
   and let alpha grow only by the glow's actual luminance, so the halo
   composites over the page and empty space stays at alpha 0.

   This still leaves RGB above alpha wherever bloom lands, which is fine
   — PremultiplyShader below resolves that into a defined pixel before
   the browser ever sees it. What matters here is only that alpha stays a
   truthful coverage value; if bloom were allowed to drive alpha toward 1
   the premultiply would hand the page an opaque box instead of a halo.
--------------------------------------------------------------- */
function makeBloomAlphaSafe(bloom) {
  const m = bloom.blendMaterial;
  m.fragmentShader = `
    uniform float opacity;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      // Reproduce AdditiveBlending's RGB contribution exactly (src * srcAlpha),
      // so bloom brightness is unchanged and facets cannot clip to white.
      vec3 bloomRGB = opacity * texel.rgb * texel.a;
      float a = clamp( dot( bloomRGB, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0, 1.0 );
      gl_FragColor = vec4( bloomRGB, a );
    }`;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneFactor;
  m.needsUpdate = true;
}

/* ---------------------------------------------------------------
   Final compositing contract.

   The canvas hands the page PREMULTIPLIED pixels, so the browser only
   has to evaluate `src.rgb + page * (1 - src.a)`. Skia and Core
   Animation both store premultiplied natively, so that path involves
   no conversion for either engine to disagree about.

   The previous `premultipliedAlpha: false` asked the browser to
   un-premultiply on our behalf. That attribute is optional, is not
   feature-detectable, and is not implemented consistently across
   engines — and it matters enormously here, because the composer's
   buffer is full of "super-luminous" pixels: additive bloom pushes RGB
   far above alpha (measured at up to +127/255 across a quarter of the
   canvas, plus ~10k pixels carrying color at alpha 0). How much of
   that color survives depends entirely on how a given browser rounds
   and color-manages the divide, which is exactly the sort of thing
   Safari and Chrome do differently.

   So do the multiply here, in float, where the answer is defined. Two
   things follow: RGB <= A always holds, and an untouched pixel is
   exactly (0,0,0,0), so the canvas cannot tint the page it sits on in
   any engine. The composited result matches what Chrome already shows.
--------------------------------------------------------------- */
const PremultiplyShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      float a = clamp( c.a, 0.0, 1.0 );
      gl_FragColor = vec4( c.rgb * a, a );
    }`
};

/* ---------------------------------------------------------------
   Rest pose.

   The stone's own axis is +Y, so laying the table toward the camera
   is exactly a quarter turn about X. The pivot then adds the small
   flattering offsets. Because the pivot tips about world axes, the
   rosette never rolls out of upright — it only nods and turns.
--------------------------------------------------------------- */
const FACE_ON  = Math.PI / 2;   // table square to the camera
const TILT_X   = 0.055;          // slight nod, reveals a little crown
const TILT_Y   = 0.075;          // slight turn, reveals a little girdle
const LOGO_ROLL = -9 * Math.PI / 180; // same lean as the SVG mark
const SWAY_X   = 0.055;
const SWAY_Y   = 0.115;

function init(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true
    // premultipliedAlpha is left at its default (true). See PremultiplyShader:
    // the canvas hands the page premultiplied pixels, which is the only
    // compositing path both engines implement without a conversion of their own.
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Held at 1.0: ACES plus the env map already carry the highlights, and
  // pushing exposure is what used to clip facets to flat white at grazing
  // angles. Do not raise this without re-checking the girdle at full sway.
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  // No scene.background: the canvas is transparent and the page's own
  // background shows through. An opaque background here cannot be made to
  // match, because everything drawn into the composer is tone mapped by
  // OutputPass while the CSS behind the canvas is not.
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  const glow = buildGlow();
  scene.add(glow);

  const envMap = buildEnvironment(renderer);
  scene.environment = envMap;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const geo = buildGemGeometry();
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#E8A93D'),
    // Metallic + low roughness is what turns each facet into a small
    // mirror of the env rig. Roughness is kept off zero so the glints
    // have a soft edge rather than aliasing into sparkle noise.
    metalness: 0.78,
    roughness: 0.19,
    envMapIntensity: 1.25,
    clearcoat: 0.55,
    clearcoatRoughness: 0.14,
    specularIntensity: 0.85,
    flatShading: true
  });
  const gem = new THREE.Mesh(geo, mat);
  gem.rotation.x = FACE_ON;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 1),
    new THREE.LineBasicMaterial({ color: '#3A2408', transparent: true, opacity: 0.45 })
  );
  gem.add(edges);

  const pivot = new THREE.Group();
  pivot.scale.setScalar(1.45);
  pivot.add(gem);
  scene.add(pivot);

  // Direct lights are now shaping/fill only — the env map does the
  // reflective work. Intensities are low so no facet can be driven to
  // white by a light and a reflection landing together.
  scene.add(new THREE.HemisphereLight('#3a2c14', '#12100b', 0.5));
  const key = new THREE.DirectionalLight('#FFECC0', 0.9);
  key.position.set(3, 5, 4);
  scene.add(key);
  const warm = new THREE.DirectionalLight('#FFD54B', 0.5);
  warm.position.set(-4, -1, -3);
  scene.add(warm);
  const cool = new THREE.DirectionalLight('#CFE3FF', 0.25);
  cool.position.set(-3, 1.5, 2);
  scene.add(cool);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Threshold sits high on purpose: bloom is a halo around the brightest
  // glints only. Lowering it is what makes whole facets bloom out flat.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 0.92);
  makeBloomAlphaSafe(bloom);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // Must be last: OutputPass tone maps and sRGB-encodes RGB but leaves alpha
  // alone, so the premultiply has to happen on the encoded values.
  composer.addPass(new ShaderPass(PremultiplyShader));

  // Frame the stone to whatever aspect the canvas actually has, so the
  // rosette is never cropped left/right on narrow or short stages.
  const FIT_RADIUS = 1.78;
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = FIT_RADIUS / Math.tan(Math.min(vHalf, hHalf));
    camera.position.set(0, 0.12, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    // Size the halo to the visible frustum at its own depth, so its gradient
    // reaches zero inside the canvas. A glow still bright at the boundary
    // would be cut off square and read as a faint rectangle.
    const d = dist + 1.4;
    const fit = Math.min(Math.tan(vHalf) * d, Math.tan(hHalf) * d);
    glow.scale.set(fit * 1.9, fit * 1.9, 1);
  }
  window.addEventListener('resize', resize);
  resize();

  let mx = 0, my = 0;
  const stage = canvas.closest('[data-gem-stage]') || canvas;
  stage.addEventListener('mousemove', e => {
    const r = stage.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    my = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  stage.addEventListener('mouseleave', () => { mx = 0; my = 0; });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function pose(t) {
    pivot.rotation.x = TILT_X + Math.sin(t * 0.34) * SWAY_X - my * 0.12;
    pivot.rotation.y = TILT_Y + Math.sin(t * 0.22) * SWAY_Y + mx * 0.2;
    pivot.rotation.z = LOGO_ROLL + Math.sin(t * 0.25) * 0.02;
    pivot.position.x = Math.sin(t * 0.55) * 0.06;
    pivot.position.y = Math.sin(t * 0.7) * 0.05 + Math.cos(t * 0.33) * 0.02;
  }

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    pose(reduce.matches ? 0 : clock.getElapsedTime());
    composer.render();
  }
  pose(0);
  frame();
}

document.querySelectorAll('canvas[data-gem]').forEach(init);
