import { compileTerrainDesign } from './terrainDesign.js';

// One place where the heights of plazas (pads) and roads are made consistent, instead of a repair for every
// way the model's numbers can disagree. The model states intent (a plaza, a road, a terrace with its rise);
// the heights between them follow from the rules of the terrain, which are:
//   - a road point inside a plaza, or within half the road's width + 1.6 m of one (the road passes by it), has the plaza's height;
//     where a road runs through a plaza's zone, a point is added about 1.6 m from the plaza's edge (its 0.8 m flat margin and the 0.5 m of road the terrain needs beyond it);
//   - between two points a road climbs at most 1 in 3 of the length that lies outside plazas (and their 0.8 m flat edge);
//   - the levels of a terrace keep their rise: a terrace moves as a whole.
// It acts only when the terrain does not compile for such a reason. It changes as little as possible (each plaza,
// terrace or road point by at most MAX_SHIFT metres), never a height the request fixes (a plaza elevation, a road's
// height or width), and says why when the numbers cannot all be kept: the plazas that fix each other are named.
// The result is adopted only if the terrain compiles; every changed height is recorded before and after.
const MAX_SHIFT = 6, SLOPE = 1 / 3, FLAT_EDGE = 1.6;  // the terrain holds the ground flat 0.8 m around a plaza, and a road keeps 0.5 m of length beyond that
const HEIGHT_FAILURE = /交差する道・平場の標高が一致しません|坂の勾配を1\/3以下にできません|道が短すぎる/;

const distanceToRect = (q, p) => Math.hypot(Math.max(0, Math.abs(q.x - p.x) - p.width / 2), Math.max(0, Math.abs(q.z - p.z) - p.depth / 2));

export function harmonizeHeights(draft, brief = null) {
  const design = draft?.terrainDesign;
  if (design?.enabled !== true || !Array.isArray(design.pads) || !Array.isArray(design.paths) || !design.paths.length) return { draft, changes: [], conflicts: [] };
  const requirements = brief?.requirements || [];
  const padsFixed = requirements.some(r => r.kind === 'padElevation');
  const roadsFixed = requirements.some(r => r.role === 'path' && ['height', 'elevation', 'width'].includes(r.kind));
  // It acts when the terrain does not compile for a height reason, or when a bridge's two ends are at different heights.
  const bridgeEnds = bridgeEndHeights(draft);
  const bridgeMismatch = bridgeEnds.some(e => Math.abs(e.a - e.b) > 0.3);
  try { compileTerrainDesign(structuredClone(draft)); if (!bridgeMismatch) return { draft, changes: [], conflicts: [] }; }
  catch (error) { if (!HEIGHT_FAILURE.test(String(error?.message))) return { draft, changes: [], conflicts: [] }; }
  if (roadsFixed && padsFixed) return { draft, changes: [], conflicts: ['道の高さ・幅と平場の標高がどちらも指定されているため、高さを動かせません'] };

  const work = structuredClone(draft), pads = work.terrainDesign.pads, paths = work.terrainDesign.paths;
  if (!pads.every(p => [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite)) || !paths.every(p => Array.isArray(p.points) && p.points.every(q => [q.x, q.z, q.height].every(Number.isFinite)))) return { draft, changes: [], conflicts: [] };

  // ---- where a road runs through a plaza's zone, points are added at the edge of the zone (as the compile reads a road only at its points) ----
  const added = [], dropped = [];
  paths.forEach((path, k) => {
    const out = [path.points[0]];
    for (let j = 1; j < path.points.length; j++) {
      const a = path.points[j - 1], b = path.points[j], length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length / 0.25));
      const at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, height: a.height + (b.height - a.height) * t });
      let previous = pads.map(p => distanceToRect(a, p) <= FLAT_EDGE);
      const crossings = [];
      for (let s = 1; s <= steps; s++) {
        const flags = pads.map(p => distanceToRect(at(s / steps), p) <= FLAT_EDGE);
        if (flags.some((f, n) => f !== previous[n])) crossings.push(flags.some((f, n) => f && !previous[n]) ? s / steps : (s - 1) / steps);
        previous = flags;
      }
      for (const t of crossings) if (t > 0.02 && t < 0.98 && out.length < 15) { const q = at(t); out.push({ x: +q.x.toFixed(2), z: +q.z.toFixed(2), height: +q.height.toFixed(3), addedPoint: true }); added.push({ path: k, x: +q.x.toFixed(2), z: +q.z.toFixed(2) }); }
      out.push(b);
    }
    // An added point and a point of the model's that lie within 0.6 m of each other leave a road shorter than the terrain accepts:
    // the model's point (never an end of the road) gives way, since the added one carries the plaza's height.
    for (let j = out.length - 2; j >= 1; j--) {
      const q = out[j];
      const crowded = [out[j - 1], out[j + 1]].some(n => n.addedPoint !== q.addedPoint && Math.hypot(n.x - q.x, n.z - q.z) < 0.6);
      if (crowded && !q.addedPoint) { out.splice(j, 1); dropped.push({ path: k, x: q.x, z: q.z }); }
    }
    path.points = out;
  });

  // ---- variables: a terrace is one variable (its levels keep their rise); every other plaza and every road point is its own ----
  const vars = [];
  const makeVar = (value, fixed, label) => { const v = { value, start: value, fixed, label }; vars.push(v); return v; };
  const groups = new Map(), padVar = [], padOffset = [];
  pads.forEach((p, i) => {
    if (p.from === 'terrace' && Number.isFinite(p.terrace)) {
      if (!groups.has(p.terrace)) groups.set(p.terrace, { v: makeVar(p.height, padsFixed, `段丘${p.terrace + 1}`), base: p.height });
      const g = groups.get(p.terrace); padVar[i] = g.v; padOffset[i] = p.height - g.base;
    } else { padVar[i] = makeVar(p.height, padsFixed, `平場(${p.x}, ${p.z})`); padOffset[i] = 0; }
  });
  const points = [];  // { path, index, var, offset }
  const conflicts = [];
  paths.forEach((path, k) => {
    const reach = (Number.isFinite(path.width) ? path.width / 2 : 2) + 1.6;
    path.points.forEach((q, j) => {
      // A road that carries on towards a plaza (a neighbouring point lies in the plaza's direction) only has to meet the plaza's
      // height at the plaza's flat margin; one that passes beside it, turns or ends near it meets it all along the stretch within reach.
      const directions = [path.points[j - 1], path.points[j + 1]].filter(Boolean).map(n => { const l = Math.hypot(n.x - q.x, n.z - q.z) || 1; return [(n.x - q.x) / l, (n.z - q.z) / l]; });
      const near = pads.map((p, i) => ({ i, d: distanceToRect(q, p), p })).filter(c => {
        if (c.d > reach) return false;
        if (c.d <= FLAT_EDGE) return true;
        const nx = Math.max(c.p.x - c.p.width / 2, Math.min(c.p.x + c.p.width / 2, q.x)) - q.x, nz = Math.max(c.p.z - c.p.depth / 2, Math.min(c.p.z + c.p.depth / 2, q.z)) - q.z, l = Math.hypot(nx, nz) || 1;
        return !directions.some(([dx, dz]) => (dx * nx + dz * nz) / l >= 0.7);
      });
      if (near.length > 1 && near.some(c => Math.abs(padVar[c.i].value + padOffset[c.i] - (padVar[near[0].i].value + padOffset[near[0].i])) > 0.35 && padVar[c.i] !== padVar[near[0].i])) {
        // Two plazas at different heights within reach of one road point: they are tied to each other through the road.
        near.slice(1).forEach(c => { if (padVar[c.i] !== padVar[near[0].i]) conflicts.push(`道${k + 1}の点(${q.x}, ${q.z})が、高さの違う平場(${pads[near[0].i].x}, ${pads[near[0].i].z})と(${pads[c.i].x}, ${pads[c.i].z})の両方の影響範囲にあります`); });
      }
      if (near.length) points.push({ path: k, index: j, x: q.x, z: q.z, v: padVar[near[0].i], offset: padOffset[near[0].i], pinned: true });
      else points.push({ path: k, index: j, x: q.x, z: q.z, v: makeVar(q.height, roadsFixed, `道${k + 1}の点${j + 1}`), offset: 0, pinned: false });
    });
  });
  if (conflicts.length) return { draft, changes: [], conflicts: [...new Set(conflicts)] };
  const pointOf = (k, j) => points.find(p => p.path === k && p.index === j);

  // ---- constraints: |h_a - h_b| <= run / 3, run = the length of the segment outside plazas and their 0.8 m flat edge ----
  const constraints = [];
  paths.forEach((path, k) => {
    for (let j = 1; j < path.points.length; j++) {
      const a = path.points[j - 1], b = path.points[j], length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length / 0.25));
      let run = 0;
      for (let s = 0; s < steps; s++) {
        const q = { x: a.x + (b.x - a.x) * (s + 0.5) / steps, z: a.z + (b.z - a.z) * (s + 0.5) / steps };
        if (!pads.some(p => distanceToRect(q, p) <= FLAT_EDGE)) run += length / steps;
      }
      constraints.push({ a: pointOf(k, j - 1), b: pointOf(k, j), cap: Math.max(0, run * SLOPE - 0.03), run });
    }
  });

  // ---- a bridge is a flat deck: what meets its two ends must be at one height (within 0.3 m) ----
  for (const b of (work.objects || []).filter(o => o?.role === 'bridge' && Array.isArray(o.pos) && Array.isArray(o.size) && [...o.pos, ...o.size].every(Number.isFinite))) {
    const yaw = b.rot?.[1] || 0, alongX = b.size[0] >= b.size[2], half = Math.max(b.size[0], b.size[2]) / 2 - 0.3;
    const ends = [-1, 1].map(sign => { const lx = alongX ? sign * half : 0, lz = alongX ? 0 : sign * half; return { x: b.pos[0] + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: b.pos[2] - Math.sin(yaw) * lx + Math.cos(yaw) * lz }; });
    const found = ends.map(e => {
      const padIndex = pads.findIndex(p => distanceToRect(e, p) <= FLAT_EDGE);
      if (padIndex >= 0) return { p: { v: padVar[padIndex], offset: padOffset[padIndex] } };
      const nearest = points.map(pt => ({ pt, d: Math.hypot(pt.x - e.x, pt.z - e.z) })).filter(c => c.d <= 3).sort((u, v) => u.d - v.d)[0];
      return nearest ? { p: nearest.pt } : null;
    });
    if (found[0] && found[1] && found[0].p.v !== found[1].p.v) constraints.push({ a: found[0].p, b: found[1].p, cap: 0.27, run: 0, bridge: b.id });
  }

  // ---- relax: each violated constraint pulls its two ends together (a fixed end does not move) ----
  const value = p => p.v.value + p.offset;
  for (let pass = 0; pass < 400; pass++) {
    let worst = 0;
    for (const c of constraints) {
      const diff = value(c.a) - value(c.b), excess = Math.abs(diff) - c.cap;
      if (excess <= 1e-4) continue;
      worst = Math.max(worst, excess);
      if (c.a.v === c.b.v) continue;
      const movable = [c.a, c.b].filter(p => !p.v.fixed && Math.abs(p.v.value - p.v.start) < MAX_SHIFT);
      if (!movable.length) continue;
      const sign = Math.sign(diff);
      for (const p of movable) p.v.value += (p === c.a ? -sign : sign) * (excess / movable.length) * 1.02;
    }
    if (worst <= 1e-4) break;
  }
  const violated = constraints.filter(c => Math.abs(value(c.a) - value(c.b)) > c.cap + 1e-3);
  const overshift = vars.filter(v => Math.abs(v.value - v.start) > MAX_SHIFT + 1e-6);
  if (violated.length || overshift.length) {
    const why = [];
    for (const c of violated.slice(0, 3)) why.push(c.bridge ? `橋${c.bridge}の両端の高さが${Math.abs(value(c.a) - value(c.b)).toFixed(1)}m違い、橋(平らな床)でつなげません(指定された高さを動かせないため)` : `道${c.a.path + 1}の点${c.a.index + 1}→${c.b.index + 1}は、長さ${c.run.toFixed(1)}mで${Math.abs(value(c.a) - value(c.b)).toFixed(1)}mの高低差があり、勾配1/3以下で上れません(指定された高さを動かせないため)`);
    for (const v of overshift.slice(0, 2)) why.push(`${v.label}の高さを${MAX_SHIFT}m以上動かす必要があります`);
    return { draft, changes: [], conflicts: why };
  }

  // ---- write back ----
  const changes = [];
  pads.forEach((p, i) => {
    const h = +(padVar[i].value + padOffset[i]).toFixed(2);
    if (Math.abs(h - p.height) > 0.004) { changes.push({ kind: 'padHeightHarmonized', before: p.height, after: h, x: p.x, z: p.z, reason: `平場(${p.x}, ${p.z})の高さを${p.height}m→${h}mへ調整した（道の勾配1/3以下と、道が平場と同じ高さになる条件のため）` }); p.height = h; }
  });
  points.forEach(pt => {
    const q = paths[pt.path].points[pt.index], h = +value(pt).toFixed(2);
    if (Math.abs(h - q.height) > 0.004) { changes.push({ kind: 'roadPointHarmonized', pathIndex: pt.path, pointIndex: pt.index, before: q.height, after: h, x: q.x, z: q.z, reason: `道${pt.path + 1}の点(${q.x}, ${q.z})の高さを${q.height}m→${h}mへ調整した（経路・道幅は変更なし）` }); q.height = h; }
  });
  for (const a of added) changes.push({ kind: 'roadPointAdded', pathIndex: a.path, x: a.x, z: a.z, reason: `道${a.path + 1}が平場の影響範囲に入る位置(${a.x}, ${a.z})に点を追加した（経路の形は変更なし）` });
  for (const d of dropped) changes.push({ kind: 'roadPointDropped', pathIndex: d.path, x: d.x, z: d.z, reason: `道${d.path + 1}の点(${d.x}, ${d.z})は、平場の縁に追加した点と0.6m以内で、道が短くなりすぎるため取り除いた` });
  for (const path of paths) for (const q of path.points) delete q.addedPoint;
  if (!changes.length) return { draft, changes: [], conflicts: [] };
  try { compileTerrainDesign(structuredClone(work)); }
  catch (error) { return { draft, changes: [], conflicts: [`高さを調整しても地形を作れませんでした: ${String(error?.message).slice(0, 120)}`] }; }
  return { draft: work, changes, conflicts: [] };
}

// The heights of the ground at the two ends of each bridge, as the design states them (a plaza's height, or the nearest road point's).
function bridgeEndHeights(draft) {
  const design = draft.terrainDesign, out = [];
  for (const b of (draft.objects || []).filter(o => o?.role === 'bridge' && Array.isArray(o.pos) && Array.isArray(o.size) && [...o.pos, ...o.size].every(Number.isFinite))) {
    const yaw = b.rot?.[1] || 0, alongX = b.size[0] >= b.size[2], half = Math.max(b.size[0], b.size[2]) / 2 - 0.3;
    const heights = [-1, 1].map(sign => {
      const lx = alongX ? sign * half : 0, lz = alongX ? 0 : sign * half, e = { x: b.pos[0] + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: b.pos[2] - Math.sin(yaw) * lx + Math.cos(yaw) * lz };
      const pad = (design.pads || []).find(p => [p.x, p.z, p.width, p.depth, p.height].every(Number.isFinite) && distanceToRect(e, p) <= FLAT_EDGE);
      if (pad) return pad.height;
      const near = (design.paths || []).flatMap(path => path.points || []).filter(q => [q.x, q.z, q.height].every(Number.isFinite)).map(q => ({ q, d: Math.hypot(q.x - e.x, q.z - e.z) })).filter(c => c.d <= 3).sort((u, v) => u.d - v.d)[0];
      return near ? near.q.height : null;
    });
    if (heights[0] !== null && heights[1] !== null) out.push({ id: b.id, a: heights[0], b: heights[1] });
  }
  return out;
}
