import * as THREE from 'three';
import { buildGemParticles } from './gemGeometry.js';
import { buildFieldParticles } from './fieldGeometry.js';
import { gemVertex, fieldVertex, sparkVertex, particleFragment, glowVertex, glowFragment } from './shaders.js';
import { createPointer } from './pointer.js';
import { createLifecycle } from './lifecycle.js';
import { pickQuality, createFrameMonitor } from './quality.js';
import { PALETTES, applyBlending } from './theme.js';

/* ---------------------------------------------------------------
   The hero scene: a particle stone inside a particle field.

   Layout is owned by CSS, not by this file. The canvas covers the
   whole hero, full-bleed, and the stone is placed over whatever box
   carries [data-gem-stage] — its centre becomes the stone's centre and
   its size sets the stone's size. So the composition (stone right of
   the copy on desktop, above it on phones) is decided in index.html's
   stylesheet, and this only has to follow it.
--------------------------------------------------------------- */
const FOV = 32;
const CAM_DIST = 10;
const STONE_FILL = 0.43;      // stone radius as a share of the stage's short side
const POINTER_RADIUS = 0.62;  // in stone radii
const REDUCED_FPS = 20;       // reduced motion keeps only a gentle shimmer
const LOGO_ROLL = -9 * Math.PI / 180; // same lean as the SVG mark

export function createParticleHero(canvas, theme) {
  const stage = document.querySelector('[data-gem-stage]') || canvas;
  const hero = canvas.closest('section') || canvas.parentElement;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const quality = pickQuality();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: 'default'
      // premultipliedAlpha stays at its default (true): the fragment
      // shader writes premultiplied colour itself. See BUILD.md.
    });
  } catch (e) {
    canvas.hidden = true; // no WebGL: the hero simply shows its copy
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_DIST);

  /* Uniforms both systems read are the *same objects*, so one write
     per frame reaches both materials. */
  const shared = {
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uScroll: { value: 0 },
    uViewScale: { value: 1 },
    uPixelRatio: { value: 1 },
    uRayOrigin: { value: new THREE.Vector3() },
    uRayDir: { value: new THREE.Vector3(0, 0, -1) },
    uPointer: { value: 0 },
    uPointerRadius: { value: 1 },
    uInk: { value: 0 }
  };

  // ---- the stone
  const gemData = buildGemParticles(quality.gem);
  const gemGeo = new THREE.BufferGeometry();
  gemGeo.setAttribute('position', new THREE.BufferAttribute(gemData.position, 3));
  gemGeo.setAttribute('aNormal', new THREE.BufferAttribute(gemData.normal, 3));
  gemGeo.setAttribute('aSeed', new THREE.BufferAttribute(gemData.seed, 4));
  gemGeo.setAttribute('aKind', new THREE.BufferAttribute(gemData.kind, 1));
  const gemMat = new THREE.ShaderMaterial({
    vertexShader: gemVertex,
    fragmentShader: particleFragment,
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      ...shared,
      uDissolve: { value: 0 },
      uRelease: { value: 1 },
      uFormation: { value: 0 },
      uIntroTime: { value: 0 },
      uPop: { value: 0 },
      uSize: { value: 0.02 },
      uAlpha: { value: 1 },
      uKeyDir: { value: new THREE.Vector3(0.45, 0.8, 0.55).normalize() },
      uFillDir: { value: new THREE.Vector3(-0.75, 0.15, 0.5).normalize() },
      uColDeep: { value: new THREE.Vector3() },
      uColBody: { value: new THREE.Vector3() },
      uColLit: { value: new THREE.Vector3() },
      uColGlint: { value: new THREE.Vector3() }
    }
  });
  const gemPoints = new THREE.Points(gemGeo, gemMat);
  gemPoints.frustumCulled = false; // particles leave the stone's bounds on purpose

  /* Rest pose. The stone's own axis is +Y, so a quarter turn about X lays
     the table square to the camera and the rosette reads face-on, like the
     logo. All the motion lives on the parent group, which turns about
     *world* axes, so the rosette never rolls out of upright. */
  gemPoints.rotation.x = Math.PI / 2;
  const stone = new THREE.Group();
  stone.add(gemPoints);
  scene.add(stone);

  const glowMat = new THREE.ShaderMaterial({
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Vector3() }, uStrength: { value: 0 }, uInk: shared.uInk }
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), glowMat);
  glow.frustumCulled = false;
  glow.renderOrder = -0.5; // between the dust and the stone
  stone.add(glow);

  // ---- the field
  const fieldData = buildFieldParticles(quality.field);
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.BufferAttribute(fieldData.position, 3));
  fieldGeo.setAttribute('aSeed', new THREE.BufferAttribute(fieldData.seed, 4));
  const fieldMat = new THREE.ShaderMaterial({
    vertexShader: fieldVertex,
    fragmentShader: particleFragment,
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      ...shared,
      uSize: { value: 0.022 },
      uAlpha: { value: 1 },
      uCamDist: { value: CAM_DIST },
      uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
      uAspect: { value: 1 },
      uColDim: { value: new THREE.Vector3() },
      uColBright: { value: new THREE.Vector3() }
    }
  });
  const fieldPoints = new THREE.Points(fieldGeo, fieldMat);
  fieldPoints.frustumCulled = false;
  fieldPoints.renderOrder = -1; // dust first, stone over it
  scene.add(fieldPoints);

  // ---- the entrance's spark burst (none on phones / low-end)
  let sparks = null;
  if (quality.sparks > 0) {
    const n = quality.sparks;
    const dir = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // Mostly in the logo's plane, so the burst reads as a ring flung
      // off the rosette rather than a ball of points.
      const a = Math.random() * Math.PI * 2;
      dir[i * 3] = Math.cos(a);
      dir[i * 3 + 1] = Math.sin(a);
      dir[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const mat = new THREE.ShaderMaterial({
      vertexShader: sparkVertex,
      fragmentShader: particleFragment,
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uSince: { value: -1 },
        uSize: { value: 0.03 },
        uViewScale: shared.uViewScale,
        uPixelRatio: shared.uPixelRatio,
        uAlpha: { value: 1 },
        uInk: shared.uInk,
        uColHot: { value: new THREE.Vector3() },
        uColCool: { value: new THREE.Vector3() }
      }
    });
    sparks = new THREE.Points(geo, mat);
    sparks.frustumCulled = false;
    sparks.visible = false;
    scene.add(sparks);
  }
  const SPARK_END = 1.15; // seconds after the pop; the longest spark is gone by then
  function retireSparks() {
    scene.remove(sparks);
    sparks.geometry.dispose();
    sparks.material.dispose();
    sparks = null;
  }

  let palette = PALETTES.dark;
  function setTheme(name) {
    const p = palette = PALETTES[name] || PALETTES.dark;
    const g = gemMat.uniforms, f = fieldMat.uniforms;
    g.uColDeep.value.copy(p.gem.deep);
    g.uColBody.value.copy(p.gem.body);
    g.uColLit.value.copy(p.gem.lit);
    g.uColGlint.value.copy(p.gem.glint);
    g.uAlpha.value = p.gem.alpha;
    f.uColDim.value.copy(p.field.dim);
    f.uColBright.value.copy(p.field.bright);
    f.uAlpha.value = p.field.alpha;
    glowMat.uniforms.uColor.value.copy(p.glow.color);
    glowMat.uniforms.uStrength.value = p.glow.strength;
    shared.uInk.value = p.ink;
    applyBlending(glowMat, name);
    applyBlending(gemMat, name);
    applyBlending(fieldMat, name);
    if (sparks) {
      const s = sparks.material.uniforms;
      s.uColHot.value.copy(p.gem.glint);
      s.uColCool.value.copy(p.gem.lit);
      s.uAlpha.value = name === 'light' ? 0.75 : 0.95;
      applyBlending(sparks.material, name);
    }
    requestRender();
  }

  /* ---- layout ------------------------------------------------- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const home = { x: 0, y: 0, radius: 1, offsetX: 0, offsetY: 0 };
  let worldPerPx = 0.01;
  let heroHeight = 1;
  let pixelRatio = quality.dpr;

  let sized = '';
  function layout() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    // iOS fires resize continuously while its toolbar collapses on scroll.
    // setSize reallocates the drawing buffer even at the same size, so
    // only touch it when something actually changed.
    const key = w + 'x' + h + '@' + pixelRatio;
    if (key !== sized) {
      sized = key;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    worldPerPx = (2 * CAM_DIST * tanHalf) / h;
    const c = canvas.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const cx = s.left + s.width / 2 - c.left;
    const cy = s.top + s.height / 2 - c.top;
    home.x = (cx - w / 2) * worldPerPx;
    home.y = -(cy - h / 2) * worldPerPx;
    home.radius = Math.min(s.width, s.height) * STONE_FILL * worldPerPx;
    home.offsetX = cx; home.offsetY = cy;

    shared.uViewScale.value = h / (2 * tanHalf);
    shared.uPixelRatio.value = renderer.getPixelRatio();
    shared.uPointerRadius.value = home.radius * POINTER_RADIUS;
    gemMat.uniforms.uSize.value = home.radius * 0.024 * quality.grain;
    fieldMat.uniforms.uAspect.value = camera.aspect;
    if (sparks) sparks.material.uniforms.uSize.value = home.radius * 0.03 * quality.grain;
    heroHeight = hero.offsetHeight || h;
    requestRender();
  }

  /* ---- motion ------------------------------------------------- */
  const pointer = createPointer({ coarse: quality.coarse });
  const life = createLifecycle();
  const lean = { x: 0, y: 0 };
  const ndc = new THREE.Vector3();

  let reduced = reduceQuery.matches;
  function applyReduced() {
    reduced = reduceQuery.matches;
    shared.uMotion.value = reduced ? 0 : 1;
    gemMat.uniforms.uRelease.value = reduced ? 0 : 1;
    if (reduced) life.settle();
    requestRender();
  }

  // Irrational-ratio sines: the pose drifts through combinations that
  // don't recur on any timescale a visitor will notice.
  function pose(t, p, scrollY) {
    const r = home.radius * (1 + Math.sin(t * 0.5) * 0.012 + Math.sin(t * 0.23) * 0.008) * (1 - p * 0.28)
      * (reduced ? 1 : life.popScale);
    stone.scale.setScalar(r);
    stone.position.set(
      home.x + Math.sin(t * 0.19) * r * 0.035,
      home.y + (Math.sin(t * 0.42) * 0.04 + Math.sin(t * 0.17) * 0.03) * r - scrollY * 0.3 * worldPerPx,
      -p * 3.2
    );
    /* A flat rosette spun through a full turn would spend part of every
       cycle edge-on or showing its back. It turns in long, uneven swings
       instead (about 30 degrees either side at most) and always comes back to the
       face-on logo view. Euler order XYZ applies Z first, so the logo's
       -9 degree lean is set on the stone before it turns and nods. */
    stone.rotation.z = LOGO_ROLL + Math.sin(t * 0.09) * 0.035 + Math.sin(t * 0.031) * 0.025;
    stone.rotation.y = 0.06 + Math.sin(t * 0.13) * 0.3 + Math.sin(t * 0.051 + 0.7) * 0.18 + lean.x * 0.28;
    stone.rotation.x = 0.05 + Math.sin(t * 0.11) * 0.11 + Math.sin(t * 0.043) * 0.06 - lean.y * 0.16;
  }

  /* ---- loop --------------------------------------------------- */
  let raf = 0, last = 0, time = 0, lastDrawn = 0, running = false;
  let heroVisible = true, pageVisible = !document.hidden;

  const monitor = createFrameMonitor([
    () => { pixelRatio = Math.max(1, pixelRatio * 0.75); layout(); },
    () => {
      gemGeo.setDrawRange(0, Math.round(gemData.count * 0.65));
      fieldGeo.setDrawRange(0, Math.round(fieldData.count * 0.65));
    }
  ]);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    if (reduced && now - lastDrawn < 1000 / REDUCED_FPS) return;
    lastDrawn = now;
    draw(dt);
    if (!reduced) monitor.sample(dt);
  }

  function draw(dt) {
    time += dt;
    const t = reduced ? 0 : time;
    const scrollY = Math.max(window.scrollY, 0);
    const p = Math.min(scrollY / heroHeight, 1);

    const rect = canvas.getBoundingClientRect();
    const pt = pointer.update(dt, time, rect, rect.left + home.offsetX, rect.top + home.offsetY);
    // A translated page is held hidden until its text is in (see
    // assets/i18n.js); the entrance waits for it rather than playing unseen.
    if (!reduced && !root.classList.contains('i18n-pending')) life.update(dt);

    // The stone leans toward the cursor, and the camera drifts slightly
    // with it — enough parallax to feel the depth, not enough to notice.
    const k = 1 - Math.exp(-dt * 2.2);
    lean.x += ((pt.active ? pt.ndcX : 0) - lean.x) * k;
    lean.y += ((pt.active ? pt.ndcY : 0) - lean.y) * k;
    const drift = reduced ? 0 : 1;
    camera.position.set(
      (lean.x * 0.45 + Math.sin(t * 0.07) * 0.18) * drift,
      (lean.y * 0.3 + Math.cos(t * 0.05) * 0.12) * drift,
      CAM_DIST
    );
    camera.lookAt(camera.position.x * 0.35, camera.position.y * 0.35, 0);
    camera.updateMatrixWorld();

    pose(t, reduced ? 0 : p, scrollY);

    ndc.set(pt.ndcX, pt.ndcY, 0.5).unproject(camera);
    shared.uRayOrigin.value.copy(camera.position);
    shared.uRayDir.value.copy(ndc).sub(camera.position).normalize();
    shared.uPointer.value = reduced ? 0 : pt.strength;

    // The key light circles slowly, so glints travel from facet to facet
    // instead of parking on whichever facet happens to face it.
    gemMat.uniforms.uKeyDir.value.set(
      Math.sin(t * 0.09 + 0.8) * 0.75, 0.75 + Math.sin(t * 0.061) * 0.15, 0.6 + Math.cos(t * 0.09 + 0.8) * 0.3
    ).normalize();
    shared.uTime.value = time;
    shared.uScroll.value = reduced ? 0 : smoothstep(0.04, 1, p);
    gemMat.uniforms.uDissolve.value = life.dissolve;
    const pop = reduced ? 0 : life.pop;
    glow.material.uniforms.uStrength.value = palette.glow.strength
      * (1 - life.dissolve * 0.35) * (1 - shared.uScroll.value * 0.8) * (reduced ? 1 : life.formation)
      * (1 + pop * 1.5);
    gemMat.uniforms.uFormation.value = reduced ? 1 : life.formation;
    gemMat.uniforms.uIntroTime.value = life.introTime;
    gemMat.uniforms.uPop.value = pop;

    if (sparks) {
      const since = life.sinceP;
      if (reduced || since > SPARK_END) retireSparks();
      else {
        sparks.visible = since >= 0;
        sparks.material.uniforms.uSince.value = since;
        sparks.position.set(stone.position.x, stone.position.y, stone.position.z);
        sparks.scale.setScalar(stone.scale.x);
      }
    }

    renderer.render(scene, camera);
  }

  function start() {
    if (running || !heroVisible || !pageVisible) return;
    running = true;
    last = 0;
    monitor.reset();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  // While paused, anything that changes the picture (resize, theme)
  // still needs one frame drawn so the canvas is never stale.
  function requestRender() {
    if (!running) draw(0);
  }

  /* ---- wiring ------------------------------------------------- */
  new ResizeObserver(layout).observe(hero);
  new ResizeObserver(layout).observe(stage);
  window.addEventListener('resize', layout, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      heroVisible ? start() : stop();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
    pageVisible ? start() : stop();
  });
  reduceQuery.addEventListener('change', applyReduced);

  setTheme(theme);
  applyReduced();
  layout();
  start();

  return { setTheme, get phase() { return life.phase; } };
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
