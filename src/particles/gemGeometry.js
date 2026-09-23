/* ---------------------------------------------------------------
   The stone, as a particle cloud.

   A brilliant-style cut is described as ordinary triangles (table,
   crown, girdle, pavilion, culet), and particles are then *sampled*
   from it — nothing here is ever rendered as a mesh. Every particle
   carries the flat normal of the facet it came from, which is what
   lets the shader light whole facets together as the stone turns:
   the cut stays legible even though no surface exists.

   Four populations share one buffer, told apart by `aKind`:
     0  surface  — area-weighted over the facets
     1  edge     — along the facet boundaries; these draw the cut
     2  core     — sparse, dim, inside the stone
     3  halo     — a loose shell around it, the field it releases into

   The buffer is shuffled so that any prefix of it is a fair sample of
   the whole stone. The quality controller relies on that: lowering the
   draw range thins the stone evenly rather than deleting a region.
--------------------------------------------------------------- */

const N = 8;                 // eight-fold symmetry
const R_GIRDLE = 1;
const Y_GIRDLE = 0.035;      // half-height of the girdle band
const R_TABLE = 0.56;
const Y_TABLE = 0.36;
const R_PAVILION = 0.5;      // pavilion break ring
const Y_PAVILION = -0.5;
const Y_CULET = -1.02;
// Re-centres the stone's bounding box on the origin, so it floats and
// turns about its visual middle rather than about the girdle.
const Y_SHIFT = (Y_TABLE + Y_CULET) / -2;
const INSIDE = [0, -0.25, 0]; // any interior point; the cut is convex

// Share of the particle budget per population.
const MIX = { surface: 0.62, edge: 0.24, core: 0.07, halo: 0.07 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function ring(count, radius, y) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts.push([Math.cos(t) * radius, y, Math.sin(t) * radius]);
  }
  return pts;
}

/* Table and pavilion rings have N vertices; the girdle has 2N, with
   G[2i] sitting directly outside T[i] and P[i]. */
function buildFacets() {
  const T = ring(N, R_TABLE, Y_TABLE);
  const G = ring(2 * N, R_GIRDLE, Y_GIRDLE);
  const L = ring(2 * N, R_GIRDLE, -Y_GIRDLE);
  const P = ring(N, R_PAVILION, Y_PAVILION);
  const tableMid = [0, Y_TABLE, 0];
  const culet = [0, Y_CULET, 0];
  const t = i => T[(i + N) % N];
  const g = j => G[(j + 2 * N) % (2 * N)];
  const l = j => L[(j + 2 * N) % (2 * N)];
  const p = i => P[(i + N) % N];

  const tris = [];
  const tri = (a, b, c) => tris.push([a, b, c]);
  for (let i = 0; i < N; i++) {
    tri(tableMid, t(i), t(i + 1));                 // table
    tri(t(i), t(i + 1), g(2 * i + 1));             // star
    tri(t(i), g(2 * i - 1), g(2 * i));             // upper girdle
    tri(t(i), g(2 * i), g(2 * i + 1));
    tri(l(2 * i - 1), l(2 * i), p(i));             // lower girdle
    tri(l(2 * i), l(2 * i + 1), p(i));
    tri(l(2 * i + 1), p(i + 1), p(i));
    tri(p(i), p(i + 1), culet);                    // pavilion main
  }
  for (let j = 0; j < 2 * N; j++) {                // girdle band
    tri(g(j), g(j + 1), l(j + 1));
    tri(g(j), l(j + 1), l(j));
  }

  return tris.map(([a, b, c]) => {
    let n = norm(cross(sub(b, a), sub(c, a)));
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, sub(centroid, INSIDE)) < 0) n = [-n[0], -n[1], -n[2]];
    const area = Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;
    return { a, b, c, n, area };
  });
}

/* Unique facet boundaries. Edges shared by two coplanar triangles (the
   table's spokes, the girdle quads' diagonals) are construction lines,
   not edges of the cut, and are dropped. */
function buildEdges(facets) {
  const key = v => v.map(x => x.toFixed(4)).join(',');
  const map = new Map();
  facets.forEach(f => {
    [[f.a, f.b], [f.b, f.c], [f.c, f.a]].forEach(([u, v]) => {
      const k = [key(u), key(v)].sort().join('|');
      if (!map.has(k)) map.set(k, { u, v, normals: [] });
      map.get(k).normals.push(f.n);
    });
  });
  const edges = [];
  map.forEach(e => {
    if (e.normals.length === 2 && dot(e.normals[0], e.normals[1]) > 0.999) return;
    const n = norm(e.normals.reduce((s, x) => [s[0] + x[0], s[1] + x[1], s[2] + x[2]], [0, 0, 0]));
    edges.push({ u: e.u, v: e.v, n, len: Math.hypot(...sub(e.v, e.u)) });
  });
  return edges;
}

// Small seeded PRNG, so the stone is the same stone on every load.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPicker(items, weight, rand) {
  const cum = [];
  let total = 0;
  items.forEach(it => { total += weight(it); cum.push(total); });
  return () => {
    const x = rand() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < x) lo = mid + 1; else hi = mid; }
    return items[lo];
  };
}

function pointOnFacet(f, rand) {
  const r1 = Math.sqrt(rand()), r2 = rand();
  const wa = 1 - r1, wb = r1 * (1 - r2), wc = r1 * r2;
  return [0, 1, 2].map(k => f.a[k] * wa + f.b[k] * wb + f.c[k] * wc);
}

export function buildGemParticles(count) {
  const rand = mulberry32(0xDE7C0A);
  const facets = buildFacets();
  const edges = buildEdges(facets);
  const pickFacet = weightedPicker(facets, f => f.area, rand);
  const pickEdge = weightedPicker(edges, e => e.len, rand);

  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const kind = new Float32Array(count);

  const nEdge = Math.round(count * MIX.edge);
  const nCore = Math.round(count * MIX.core);
  const nHalo = Math.round(count * MIX.halo);
  const nSurface = count - nEdge - nCore - nHalo;

  // Fill in shuffled slot order (see the header note on draw ranges).
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }

  let cursor = 0;
  const put = (p, n, k) => {
    const i = order[cursor++];
    position.set([p[0], p[1] + Y_SHIFT, p[2]], i * 3);
    normal.set(n, i * 3);
    seed.set([rand(), rand(), rand(), rand()], i * 4);
    kind[i] = k;
  };

  for (let i = 0; i < nSurface; i++) {
    const f = pickFacet();
    put(pointOnFacet(f, rand), f.n, 0);
  }
  for (let i = 0; i < nEdge; i++) {
    const e = pickEdge();
    const s = rand();
    const j = () => (rand() - 0.5) * 0.008; // a hair of jitter keeps lines from aliasing
    put([
      e.u[0] + (e.v[0] - e.u[0]) * s + j(),
      e.u[1] + (e.v[1] - e.u[1]) * s + j(),
      e.u[2] + (e.v[2] - e.u[2]) * s + j()
    ], e.n, 1);
  }
  for (let i = 0; i < nCore; i++) {
    const s = pointOnFacet(pickFacet(), rand);
    const r = Math.cbrt(rand()) * 0.88;
    const p = [0, 1, 2].map(k => INSIDE[k] + (s[k] - INSIDE[k]) * r);
    put(p, norm(sub(p, INSIDE)), 2);
  }
  for (let i = 0; i < nHalo; i++) {
    // Uniform direction, radius biased toward the stone so the shell
    // thins out into the ambient field instead of ending at a boundary.
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const dir = [s * Math.cos(a), u, s * Math.sin(a)];
    const r = 1.18 + Math.pow(rand(), 1.8) * 1.25;
    put([dir[0] * r, dir[1] * r * 0.72 - Y_SHIFT, dir[2] * r], dir, 3);
  }

  return { position, normal, seed, kind, count };
}
