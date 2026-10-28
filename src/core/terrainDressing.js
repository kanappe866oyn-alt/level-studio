import { getModelDefault } from './modelCatalog.js';
import ASSETS from '../assets.json' with { type: 'json' };
import { boxesOverlap, footprintContains, getBounds, getCollisionParts, surfaceTop } from './spatialGeometry.js';

// Local landscape dressing for AI-designed terrain. Gemini designs the relief,
// roads, pads and requested objects; this pass adds the background groves,
// undergrowth and rocks that the model would otherwise have to spend output
// tokens on. It is deterministic: the same terrain always gets the same result.
const TERRAIN_ID = '__generated_terrain';
const prefix = 'dress_';
const TREES = [1, 2, 3, 4, 5, 6, 8, 11, 12, 9, 10];
// Green-leaved models; 6 and 8 have red and 11 pink foliage, kept for single accents and never for a wood.
const GREEN_TREES = [1, 2, 3, 4, 5, 12, 9, 10];
const PLANTS = [1, 2, 5, 6, 3, 4];
const GROUND_RULES = { grass: { trees: 1, plants: 1, rocks: 1 }, rock: { trees: 0.15, plants: 0.3, rocks: 2 },
  paving: { trees: 0.1, plants: 0.2, rocks: 0.2 }, setts: { trees: 0.1, plants: 0.2, rocks: 0.2 }, slate: { trees: 0.1, plants: 0.2, rocks: 0.5 } };

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// An explicit count for a role in the request means the user owns that number.
function countedRoles(brief) {
  return new Set((brief?.requirements || []).filter(r => r.kind === 'count').flatMap(r => [r.role, r.targetRole]).filter(Boolean));
}

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

export function dressGeneratedTerrain({ objects, brief, compilation, mode, normalize, density = 1 }) {
  const terrain = objects.find(o => o.id === TERRAIN_ID && o.terrainProfile?.surfaceGrid);
  if (mode !== 'free' || !terrain || !compilation?.source || objects.some(o => o.id.startsWith(prefix))) return { objects, dressing: null };
  const rules = GROUND_RULES[terrain.terrainProfile.surfaceMaterial] || GROUND_RULES.grass;
  const counted = countedRoles(brief);
  const [width, , depth] = terrain.size, area = width * depth;
  const grid = terrain.terrainProfile.surfaceGrid;
  const seed = Math.round(grid.heights.reduce((s, h, i) => s + h * (i % 97 + 1), 0) * 100000) ^ Math.round(width * 31 + depth * 17);
  const random = rng(seed), phase = [random() * 6.28, random() * 6.28, random() * 6.28];

  const roads = compilation.source.paths.flatMap(p => p.points.slice(1).map((b, i) => ({ a: p.points[i], b, width: p.width })));
  const pads = compilation.source.pads;
  // Solid things the dressing must not grow into: everything but the floors and the generated terrain itself
  // (a rock wall drawn as another landform is solid too).
  const blockers = objects.filter(o => o.type !== 'spline' && !ASSETS.SEMANTIC_PREFABS[o.role]?.floorLike && o.role !== 'ground' && (o.role !== 'landform' || o.id !== TERRAIN_ID)).flatMap(getCollisionParts);
  const spots = objects.filter(o => ['spawn', 'goal', 'checkpoint', 'exit'].includes(o.role));
  // The way on and off a bridge, a stair or a platform stays open: nothing is grown within 3 m of one, so the dressing
  // never closes the route the walking check found.
  const accessZones = objects.filter(o => ['bridge', 'climb', 'platform'].includes(o.role) && o.type !== 'spline').map(o => { const b = getBounds(o); return { minX: b.minX - 3, maxX: b.maxX + 3, minZ: b.minZ - 3, maxZ: b.maxZ + 3 }; });

  // Water is walkable-unsafe, so it is not a collision part, but nothing may be grown into it either. A river is tested
  // against its own winding course: the box around a diagonal river covers most of the map and would refuse every tree.
  const waters = objects.filter(o => o.role === 'water' && o.type !== 'spline' && Array.isArray(o.pos) && Array.isArray(o.size));
  const inWater = (object, margin) => { const b = getBounds(object), points = [];
    for (const u of [0, 0.5, 1]) for (const v of [0, 0.5, 1]) points.push([b.minX - margin + (b.maxX - b.minX + 2 * margin) * u, b.minZ - margin + (b.maxZ - b.minZ + 2 * margin) * v]);
    return waters.some(w => points.some(([x, z]) => footprintContains(w, x, z))); };

  const half = [terrain.size[0] / 2, terrain.size[2] / 2], centre = [terrain.pos[0], terrain.pos[2]];
  const slopeAt = (x, z, d = 0.8) => {
    const ys = [[d, 0], [-d, 0], [0, d], [0, -d]].map(([dx, dz]) => surfaceTop(terrain, x + dx, z + dz));
    if (ys.some(y => y === null)) return null;
    return Math.max(Math.abs(ys[0] - ys[1]), Math.abs(ys[2] - ys[3])) / (2 * d);
  };
  // The editor's overlap check compares real (yaw-aware) boxes, so a placed
  // object must clear every existing box, not just a rounded footprint.
  const clear = (object, radius, extra) => {
    const [x, , z] = object.pos;
    if (Math.abs(x - centre[0]) > half[0] - radius - 1 || Math.abs(z - centre[1]) > half[1] - radius - 1) return false;
    if (roads.some(r => distanceToSegment(x, z, r.a, r.b) < r.width / 2 + radius * 0.8 + extra)) return false;
    if (pads.some(p => Math.abs(x - p.x) < p.width / 2 + radius * 0.8 + extra && Math.abs(z - p.z) < p.depth / 2 + radius * 0.8 + extra)) return false;
    if (spots.some(s => Math.hypot(x - s.pos[0], z - s.pos[2]) < radius + 2.5)) return false;
    if (accessZones.some(a => x + radius > a.minX && x - radius < a.maxX && z + radius > a.minZ && z - radius < a.maxZ)) return false;
    if (inWater(object, 0.6)) return false;
    const inflated = { ...object, size: [object.size[0] + 0.4, object.size[1], object.size[2] + 0.4] };
    return !blockers.some(part => boxesOverlap(inflated, part)) && !accepted.some(o => boxesOverlap(inflated, o));
  };
  // Broad groves rather than an even scatter.
  const grove = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.17 + phase[0]) * Math.cos(z * 0.15 + phase[1]) * 0.7 + 0.15 * Math.sin((x + z) * 0.29 + phase[2]);
  const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  const make = (role, variant, scale, x, z, yaw, sink, tag) => {
    const ref = getModelDefault(role, variant);
    const y = surfaceTop(terrain, x, z);
    if (!ref || y === null) return null;
    const size = ref.size.map(v => v * scale);
    return { id: `${prefix}${role}_${tag}`, name: { tree: '木立の木', plant: '下草', rock: '地形の岩' }[role], role, type: 'box', variant, material: 0, color: null,
      size, pos: [x, y - sink + size[1] / 2, z], rot: [0, yaw, 0], modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale } };
  };

  const stats = { trees: 0, plants: 0, rocks: 0 };
  // A forest, wood or grove in the request (森・林・木々・木立) is a dense wood, not the open meadow's scattered groves.
  const briefText = [...(brief?.designGoals || []).flatMap(g => [g.description, g.evidence]), brief?.spatialStrategy, ...(brief?.requirements || []).map(r => r.evidence)].join(' ');
  const forest = /森|林|木々|木立|樹林|樹海|ジャングル/.test(briefText) && !/森(?:は|を)?(?:不要|なし|無し)|木(?:は|を)?(?:不要|なし|無し)/.test(briefText);
  const budget = {
    // `density` thins the whole dressing evenly when the full one would block a walking route (see generationFidelity).
    trees: counted.has('tree') ? 0 : Math.round(Math.max(3, Math.min(forest ? 160 : 34, area / (forest ? 38 : 150))) * rules.trees),
    plants: counted.has('plant') ? 0 : Math.round(Math.max(6, Math.min(forest ? 120 : 80, area / (forest ? 30 : 45))) * rules.plants),
    rocks: counted.has('rock') ? 0 : Math.round(Math.max(2, Math.min(16, area / 220)) * rules.rocks),
  };
  for (const key of Object.keys(budget)) budget[key] = Math.round(budget[key] * density);
  const groveVariants = [GREEN_TREES[Math.floor(random() * 5)], GREEN_TREES[Math.floor(random() * 5)]];
  const accepted = [];
  const tryPlace = (role, attempts, limit, pick) => {
    for (let i = 0; i < attempts && stats[role + 's'] < limit; i++) {
      const x = centre[0] + (random() * 2 - 1) * half[0], z = centre[1] + (random() * 2 - 1) * half[1];
      const spec = pick(x, z); if (!spec) continue;
      const object = make(role, spec.variant, spec.scale, x, z, random() * 6.283, spec.sink, accepted.length);
      if (!object) continue;
      const box = getBounds(object), radius = Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2;
      const slope = slopeAt(x, z, Math.min(1.2, radius * 0.4)); if (slope === null || slope > spec.maxSlope || slope < (spec.minSlope || 0)) continue;
      if (!clear(object, radius, spec.extra)) continue;
      accepted.push(object); stats[role + 's']++;
    }
  };

  tryPlace('tree', budget.trees * 60, budget.trees, (x, z) => {
    // Woods where the grove field is high, open meadow elsewhere, with a few lone trees.
    if (random() > Math.max(forest ? smoothstep(0.15, 0.5, grove(x, z)) : smoothstep(0.42, 0.72, grove(x, z)), forest ? 0.3 : 0.06)) return null;
    const scale = 0.55 + random() * 0.4, accents = forest ? GREEN_TREES : TREES, variant = random() < 0.8 ? groveVariants[random() < 0.5 ? 0 : 1] : accents[Math.floor(random() * accents.length)];
    return { variant, scale, maxSlope: 0.45, sink: 0.05, extra: 0.8 };
  });
  const trees = accepted.filter(o => o.role === 'tree').map(o => o.pos);
  tryPlace('plant', budget.plants * 40, budget.plants, (x, z) => {
    const near = trees.some(p => Math.hypot(x - p[0], z - p[2]) < 6);
    if (!near && random() > 0.35 * grove(x, z)) return null;
    const variant = PLANTS[Math.floor(random() * PLANTS.length)], scale = 0.7 + random() * 0.6;
    return { variant, scale, maxSlope: 0.6, sink: 0.04, extra: 0.2 };
  });
  // The editor only treats a prop as grounded within 6cm of the surface, so
  // rocks stay on gentle ground and small enough not to hang over a slope.
  tryPlace('rock', budget.rocks * 50, budget.rocks, () => {
    const big = random() < 0.2, variant = big ? 3 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
    const scale = big ? 0.3 + random() * 0.15 : 0.45 + random() * 0.3;
    return { variant, scale, minSlope: 0.04, maxSlope: 0.3, sink: 0.05, extra: 0.4 };
  });

  if (!accepted.length) return { objects, dressing: null };
  const known = new Set(objects.map(o => o.id));
  const additions = normalize ? normalize([...objects, ...accepted]).filter(o => !known.has(o.id)) : accepted;
  return { objects: [...objects, ...additions], dressing: { version: 1, seed, ...stats, ...(forest ? { forest: true } : {}), scope: '指示で個数を指定していない木・下草・岩を、傾斜・道・平場・建物・出入口を避けて自動配置' } };
}
