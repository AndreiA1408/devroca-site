/* ---------------------------------------------------------------
   Particle shaders.

   All per-particle motion happens here, on the GPU: the CPU uploads
   the buffers once and afterwards only writes a handful of uniforms
   per frame. Nothing in the frame loop touches a vertex.
--------------------------------------------------------------- */

/* 3D simplex noise — Ashima Arts / Stefan Gustavson (MIT).
   github.com/ashima/webgl-noise */
const NOISE = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/* Shared by both systems: the cursor is a ray from the camera, not a
   point on a plane, so particles at every depth along it are pushed
   sideways off it — a disturbance *through* the field, which is what
   makes it read as 3D rather than a 2D ripple painted on top. */
const POINTER = /* glsl */`
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform float uPointer;        // 0..1, already smoothed on the CPU
uniform float uPointerRadius;  // world units

// Returns the displacement; writes the local influence to 'infl'.
vec3 pointerPush(vec3 w, float phase, float amount, out float infl){
  vec3 v = w - uRayOrigin;
  vec3 perp = v - uRayDir * dot(v, uRayDir);
  float d = length(perp);
  infl = exp(-(d * d) / (uPointerRadius * uPointerRadius)) * uPointer;
  vec3 away = perp / max(d, 1e-4);
  // A slow travelling ring on top of the push: the field ripples
  // outward from the cursor instead of simply parting around it.
  float ripple = sin(d * 7.0 - uTime * 2.6 + phase);
  return away * infl * amount * (1.0 + 0.22 * ripple);
}
`;

// Soft edges where particles meet the canvas boundary, so nothing is
// ever sliced off by the edge of the hero.
const EDGE_FADE = /* glsl */`
float edgeFade(vec4 clip){
  vec2 ndc = clip.xy / clip.w;
  return smoothstep(-1.0, -0.72, ndc.y) * smoothstep(1.0, 0.86, ndc.y)
       * smoothstep(1.0, 0.94, abs(ndc.x));
}
`;

export const gemVertex = /* glsl */`
uniform float uTime;
uniform float uMotion;      // 1 = full motion, 0 = reduced motion
uniform float uDissolve;    // lifecycle fragmentation, 0..1
uniform float uRelease;     // strength of spontaneous small releases
uniform float uFormation;   // intro assembly, 0 -> 1
uniform float uIntroTime;   // seconds since the entrance began
uniform float uPop;         // the pop's flash, 0..1, only just after assembly
uniform float uScroll;      // hero scroll-out, 0..1
uniform float uSize;        // world units
uniform float uViewScale;   // px per world unit at depth 1
uniform float uPixelRatio;
uniform float uAlpha;
uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform vec3 uColDeep;
uniform vec3 uColBody;
uniform vec3 uColLit;
uniform vec3 uColGlint;

attribute vec3 aNormal;
attribute vec4 aSeed;
attribute float aKind;

varying vec3 vColor;
varying float vAlpha;

${NOISE}
${POINTER}
${EDGE_FADE}

void main(){
  float isEdge = step(0.5, aKind) * step(aKind, 1.5);
  float isCore = step(1.5, aKind) * step(aKind, 2.5);
  float isHalo = step(2.5, aKind);
  float isShell = 1.0 - isCore - isHalo;   // surface or edge
  float t = uTime;
  float m = uMotion;

  vec3 p = position;

  // Breathing: the surface swells and settles in slow, uneven patches,
  // so the silhouette is never quite the same twice.
  float breathe = snoise(position * 1.4 + vec3(0.0, t * 0.11, t * 0.05));
  p += aNormal * breathe * 0.022 * m * (1.0 - isHalo);

  // Surface flow: each particle slides a little along its facet.
  vec3 tang = normalize(cross(aNormal, vec3(0.31, 1.0, 0.17)));
  vec3 bitan = cross(aNormal, tang);
  float ph = aSeed.x * 6.2832;
  p += (tang * sin(t * (0.25 + aSeed.y * 0.5) + ph)
      + bitan * cos(t * (0.21 + aSeed.z * 0.45) + ph)) * 0.014 * m * isShell;

  // The halo orbits, each particle at its own rate.
  float ang = t * (0.035 + aSeed.y * 0.06) * m * isHalo;
  float ca = cos(ang), sa = sin(ang);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  p.y += sin(t * 0.3 + aSeed.z * 6.2832) * 0.06 * m * isHalo;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vec3 wN = normalize(mat3(modelMatrix) * aNormal);

  /* ---- Lifecycle ------------------------------------------------
     'key' decides *when* a particle leaves as uDissolve rises. It is
     mostly coherent noise over the stone, so fragments come away as
     connected patches rather than as uniform sparkle, with a little
     per-particle randomness to fray their edges. */
  float key = mix(snoise(position * 1.1 + 3.7) * 0.5 + 0.5, aSeed.x, 0.3);
  float frag = smoothstep(key, key + 0.14, uDissolve * 0.58);

  // Small groups that drift off and come back on their own, driven by
  // a slowly evolving noise field — occasional, never on a beat.
  float rel = snoise(position * 2.2 + vec3(t * 0.06, -t * 0.045, t * 0.035));
  rel = smoothstep(0.52, 0.86, rel) * uRelease;

  float scroll = smoothstep(key * 0.65, key * 0.65 + 0.35, uScroll);
  // Linear per particle, not smoothed: uFormation already accelerates, so
  // every particle is still at speed when it lands. The small stagger lets
  // the arrivals ripple across the stone in the last few frames.
  float intro = 1.0 - clamp((uFormation - aSeed.y * 0.2) / 0.8, 0.0, 1.0);
  float loose = max(max(frag, rel * 0.6), scroll);

  vec3 drift = vec3(0.0);
  if (loose > 0.001) {
    vec3 q = position * 0.7 + aSeed.z * 5.0 + t * 0.035;
    vec3 flow = vec3(snoise(q), snoise(q + 17.3), snoise(q - 23.1));
    vec3 dir = normalize(wN * 0.8 + flow + vec3(0.0, 0.2, 0.0));
    // Released particles keep wandering while they are out, so the
    // drift reads as a current, not as points parked in space.
    vec3 wander = vec3(sin(t * 0.21 + ph), sin(t * 0.17 + aSeed.y * 6.2832), cos(t * 0.19 + aSeed.z * 6.2832));
    drift += (dir * (0.35 + aSeed.w * 1.25) + wander * 0.22) * loose;
    drift += vec3(0.0, 0.9, -1.2) * scroll * (0.4 + aSeed.w);
  }
  world.xyz += drift * m;

  /* ---- Entrance -------------------------------------------------
     While 'intro' is up, each particle sits out in a loose ring around
     the stone (pushed out from the centre in the logo's plane, roughed
     up by fast noise) and the whole ring whirls about the stone's
     centre. As intro falls the push, the noise and the whirl all go to
     zero together, so the dust spirals in and lands on its facet.
     Scaled by the stone's own radius, so it fits every breakpoint. */
  if (intro > 0.001) {
    vec3 c = modelMatrix[3].xyz;
    float r = length(modelMatrix[0].xyz);
    vec3 rel0 = world.xyz - c;
    vec2 radial = normalize(rel0.xy + vec2(1e-4, 0.0));
    vec3 q = position * 0.9 + aSeed.z * 5.0;
    vec3 jit = vec3(snoise(q + uIntroTime * 1.6), snoise(q + 17.3 - uIntroTime * 1.4), snoise(q - 23.1 + uIntroTime * 1.2));
    vec3 sw = rel0 + vec3(radial * (0.28 + aSeed.w * 0.95), (aSeed.z - 0.5) * 0.5) * r + jit * 0.2 * r;
    float ang = (0.9 + aSeed.y * 1.6) * (uIntroTime * 3.2 + 0.6) * intro;
    float cw = cos(ang), sw2 = sin(ang);
    sw.xy = mat2(cw, -sw2, sw2, cw) * sw.xy;
    world.xyz = mix(world.xyz, c + sw, intro * m);
  }

  float infl;
  world.xyz += pointerPush(world.xyz, aSeed.x * 0.8, 0.19, infl) * m;

  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;

  /* ---- Light ----------------------------------------------------
     Facet normals plus a slight per-particle scatter: a facet lights
     as a whole when it swings into the key, but its glint rolls
     across it rather than switching on like a panel. */
  vec3 V = normalize(cameraPosition - world.xyz);
  vec3 n = normalize(wN + (aSeed.xyz - 0.5) * 0.16);
  float facing = dot(n, V);
  float front = smoothstep(-0.3, 0.45, facing);
  float diffuse = max(dot(n, uKeyDir), 0.0);
  float spec = pow(max(dot(n, normalize(uKeyDir + V)), 0.0), 30.0);
  float spec2 = pow(max(dot(n, normalize(uFillDir + V)), 0.0), 18.0);
  float rim = pow(1.0 - abs(facing), 3.0);

  float b = 0.13 + 0.34 * diffuse + 0.28 * rim + 1.1 * spec + 0.5 * spec2;
  b *= mix(0.3, 1.0, front);       // far side stays visible, but recessed
  b = b * (1.0 + 0.45 * isEdge) + 0.22 * isEdge * mix(0.45, 1.0, front);
  b = mix(b, 0.24 + 0.1 * sin(t * 0.7 + aSeed.z * 30.0), isCore);
  b = mix(b, 0.2 + 0.2 * aSeed.z, isHalo);
  // Swarming dust burns a little brighter than the formed surface; the
  // pop floods every facet at once.
  b += intro * 0.45 + uPop * 0.6;

  float glint = clamp((spec * 1.1 + spec2 * 0.35) * isShell + infl * 0.3, 0.0, 0.9);
  glint = max(glint, uPop * (0.3 + 0.3 * isShell));
  vec3 col = mix(uColDeep, uColBody, smoothstep(0.0, 0.42, b));
  col = mix(col, uColLit, smoothstep(0.36, 0.95, b));
  col = mix(col, uColGlint, glint);
  vColor = col;

  float twinkle = 0.78 + 0.22 * sin(t * (0.7 + aSeed.y * 2.3) + aSeed.z * 40.0);
  float a = uAlpha * clamp(b, 0.0, 1.5) * twinkle;
  a *= 1.0 - loose * 0.4;
  a *= 1.0 + intro * 0.3;
  a *= 1.0 + uPop * 0.6;
  a *= 1.0 - uScroll * 0.75;
  a *= 1.0 + infl * 0.5;

  float size = uSize * (0.55 + aSeed.w * 0.9);
  size *= mix(1.0, 1.12, isEdge) * mix(1.0, 0.85, isCore) * mix(1.0, 0.8, isHalo);
  size *= 1.0 + loose * 0.3 + infl * 0.35 + uPop * 0.2;
  size *= 1.0 - intro * 0.15; // dust is finer than the stone it becomes
  float px = size * uViewScale / -mv.z;
  // Sub-pixel points are drawn at one pixel, so trade the missing area
  // for alpha rather than let them read brighter than they should.
  a *= clamp(px * px, 0.08, 1.0);
  gl_PointSize = clamp(px, 1.0, 48.0) * uPixelRatio;

  vAlpha = a * edgeFade(gl_Position);
}
`;

export const fieldVertex = /* glsl */`
uniform float uTime;
uniform float uMotion;
uniform float uScroll;
uniform float uSize;
uniform float uViewScale;
uniform float uPixelRatio;
uniform float uAlpha;
uniform float uCamDist;
uniform float uTanHalf;
uniform float uAspect;
uniform vec3 uColDim;
uniform vec3 uColBright;

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;

${POINTER}
${EDGE_FADE}

void main(){
  vec3 p = position;
  float depth = uCamDist - p.z;
  p.x *= depth * uTanHalf * uAspect * 1.18;
  p.y *= depth * uTanHalf * 1.18;

  float t = uTime * uMotion;
  float ph = aSeed.y * 6.2832;
  p += vec3(
    sin(t * 0.05 * (0.5 + aSeed.x) + ph) * 0.4,
    cos(t * 0.04 * (0.5 + aSeed.z) + ph) * 0.3 + t * 0.012 * (aSeed.w - 0.3),
    sin(t * 0.03 + aSeed.w * 6.2832) * 0.3);
  // Slow upward rise wraps around, so over a long visit the field
  // keeps a faint current without ever running dry.
  float span = depth * uTanHalf * 2.36;
  p.y = mod(p.y + span * 0.5, span) - span * 0.5;
  p.y += uScroll * (0.3 + aSeed.w) * 1.1 * uMotion;

  float infl;
  p += pointerPush(p, aSeed.x * 6.0, 0.2, infl) * uMotion;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dz = -mv.z;

  // Depth cues: distant dust is small and dim; the few particles close
  // to the lens are large, soft and faint, like out-of-focus bokeh.
  float near = 1.0 - smoothstep(1.4, 4.5, dz);
  float far = smoothstep(8.0, 20.0, dz);

  float twinkle = 0.65 + 0.35 * sin(uTime * (0.4 + aSeed.x * 1.6) + aSeed.z * 50.0);
  float a = uAlpha * (0.3 + 0.7 * aSeed.z) * (1.0 - far * 0.55) * (1.0 - near * 0.8) * twinkle;
  a *= 1.0 + infl * 1.2;

  float size = uSize * (0.5 + aSeed.w) * (1.0 + near * 4.0);
  float px = size * uViewScale / dz;
  a *= clamp(px * px, 0.08, 1.0);
  gl_PointSize = clamp(px, 1.0, 40.0) * uPixelRatio;

  vColor = mix(uColDim, uColBright, aSeed.x * aSeed.x + infl * 0.4);
  vAlpha = a * edgeFade(gl_Position);
}
`;

/* Sparks thrown off by the pop. Each one leaves the stone's edge along
   its own direction (mostly in the logo's plane), decelerating hard, and
   fades out over half a second to a second. 'position' is the unit
   direction; the object is placed on the stone's centre and scaled to
   its radius every frame, so the burst matches the stone at any size.
   Drawn once per page load; the CPU hides the system when it is done. */
export const sparkVertex = /* glsl */`
uniform float uSince;       // seconds since the pop, < 0 before it
uniform float uSize;
uniform float uViewScale;
uniform float uPixelRatio;
uniform float uAlpha;
uniform vec3 uColHot;
uniform vec3 uColCool;

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;

${EDGE_FADE}

void main(){
  float since = max(uSince, 0.0);
  float life = 0.5 + aSeed.x * 0.55;
  float t = clamp(since / life, 0.0, 1.0);
  float travel = (1.0 - exp(-since * (3.5 + aSeed.y * 2.5))) * (0.5 + aSeed.z * 1.3);
  vec3 p = normalize(position) * (0.82 + travel);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float fade = (1.0 - t) * (1.0 - t);
  vColor = mix(uColHot, uColCool, smoothstep(0.0, 0.7, t));
  float size = uSize * (0.6 + aSeed.w * 0.9) * (1.0 - 0.45 * t);
  float px = size * uViewScale / -mv.z;
  float a = uAlpha * fade * step(0.0, uSince) * clamp(px * px, 0.08, 1.0);
  gl_PointSize = clamp(px, 1.0, 32.0) * uPixelRatio;
  vAlpha = a * edgeFade(gl_Position);
}
`;

/* One fragment shader for both systems.

   The canvas hands the page premultiplied pixels (see BUILD.md), so
   what this writes must already be a valid premultiplied colour:

   - Dark theme: blended additively (ONE, ONE). Coverage is written as
     the brightest channel, so accumulated RGB can never exceed
     accumulated alpha — the invariant that keeps Safari and Chrome
     compositing the canvas identically.
   - Light theme: ordinary premultiplied "over" (ONE, ONE_MINUS_SRC_ALPHA).
     Light cannot be added to a pale page, so there the particles are
     ink instead of light. */
export const particleFragment = /* glsl */`
uniform float uInk;   // 0 = light on dark, 1 = ink on light
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 7.0);
  float glow = (1.0 - d2) * (1.0 - d2);
  float a = (core * 0.82 + glow * 0.18) * vAlpha;
  vec3 rgb = vColor * a;
  float cover = mix(max(rgb.r, max(rgb.g, rgb.b)), a, uInk);
  gl_FragColor = vec4(rgb, min(cover, 1.0));
}
`;

/* The light the stone throws into the space around it: one soft,
   camera-facing disc behind the particles. Without it the stone reads
   as dust on black; with it, as something that is itself luminous.
   Same premultiplied contract as the particles. */
export const glowVertex = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  // Billboard: keep the quad square to the camera whatever the stone does.
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 scale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
  mv.xy += position.xy * scale.xy;
  gl_Position = projectionMatrix * mv;
}
`;

export const glowFragment = /* glsl */`
uniform vec3 uColor;
uniform float uStrength;
uniform float uInk;
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.4) * uStrength;
  vec3 rgb = uColor * a;
  gl_FragColor = vec4(rgb, mix(max(rgb.r, max(rgb.g, rgb.b)), a, uInk));
}
`;
