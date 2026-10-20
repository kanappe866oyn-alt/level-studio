import { getBounds, getCollisionParts, isWalkable, boxesOverlap, worldXZ, WALKING } from './spatialGeometry.js';
import { isSpatialRailing } from './railingParts.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';

const prefix = 'sp_long_screen_';
const owned = o => o.id.startsWith(prefix) && o.spatialAppearance?.moduleId?.startsWith('path_screen_long_');
const volume = o => ({ ...getBounds(o), bottom: o.pos[1] - o.size[1] / 2, top: o.pos[1] + o.size[1] / 2 });
const intersects = (a, b) => a.minX < b.maxX - 1e-5 && a.maxX > b.minX + 1e-5 && a.minZ < b.maxZ - 1e-5 && a.maxZ > b.minZ + 1e-5 && a.bottom < b.top - 1e-5 && a.top > b.bottom + 1e-5;

// Real privacy panels share the existing boundary envelope and anchored posts.
// The normalizer and ground editing already preserve path_screen_ assemblies.
function screenGroup(wall, { maxLength = 6, offset: groupOffset = 0, tag = '', fill = false } = {}) {
  const along = wall.size[0] >= wall.size[2] ? 0 : 2, normal = along === 0 ? 2 : 0;
  const length = Math.min(maxLength, wall.size[along] - 0.5), bottom = wall.pos[1] - wall.size[1] / 2;
  if (length < 0.9 || wall.size[normal] < 0.16) return null;
  const id = `${prefix}${wall.id}${tag ? `_${tag}` : ''}`;
  const part = (suffix, label, height, centre, thickness, offset = 0, width = length) => {
    const size = [...wall.size], pos = [...wall.pos]; size[along] = width; size[normal] = thickness; size[1] = height;
    const [x, z] = worldXZ(wall, along === 0 ? offset + groupOffset : 0, along === 2 ? offset + groupOffset : 0);
    pos[0] = x; pos[2] = z; pos[1] = bottom + centre;
    return { id: `${id}_${suffix}`, name: `${wall.name}の目隠し${label}`, role: 'wall', type: 'box', variant: 1, material: 0,
      pos, size, rot: [...wall.rot], color: suffix === 'panel' ? '#886344' : '#684d39',
      spatialAppearance: { version: 1, style: 'harbor', surface: 'wood', district: wall.spatialAppearance.district,
        category: 'trim', moduleId: `path_screen_long_${wall.id.replaceAll('-', 'n')}${tag ? `_${tag}` : ''}`, areaId: wall.spatialAppearance.areaId } };
  };
  return { id, source: wall.id, areaId: wall.spatialAppearance.areaId, parts: [part('panel', '板', fill ? 2.15 : 1.5, fill ? 1.225 : 1.55, 0.16), part('cap', '上桟', 0.1, 2.35, 0.24),
    part('post_a', '柱', 2.3, 1.15, 0.16, -length / 2 + 0.08, 0.16), part('post_b', '柱', 2.3, 1.15, 0.16, length / 2 - 0.08, 0.16)] };
}

function screenCandidates(wall, enhanced) {
  if (!enhanced) return [screenGroup(wall)].filter(Boolean);
  const options = [{}];
  const span = Math.max(wall.size[0], wall.size[2]) - 0.5;
  // Search along the same curb, including its ends. A central six-metre panel
  // misses rays that pass through the ends of a long upper-gallery boundary.
  for (const length of [6, 8]) {
    if (length === 8 && span <= 6) continue;
    const reach = (span - Math.min(length, span)) / 2;
    if (length === 8) options.push({ maxLength: length, tag: 'wide' });
    if (reach < 0.5) continue;
    for (const side of [-1, 1]) options.push({ maxLength: length, offset: reach * side, tag: `edge_${length}_${side < 0 ? 'a' : 'b'}` });
  }
  return options.flatMap(option => [screenGroup(wall, option), screenGroup(wall, { ...option, fill: true, tag: `${option.tag ? `${option.tag}_` : ''}solid` })]).filter(Boolean);
}

function selectScreens(candidates, rays) {
  let remaining = rays;
  const accepted = [], groups = [];
  for (let step = 0; step < 6; step++) {
    let best;
    for (const group of candidates) {
      if (groups.some(g => g.id === group.id) || group.parts.some(p => accepted.some(o => boxesOverlap(p, o)))) continue;
      const blocked = remaining.filter(r => group.parts.some(p => segmentHitsBox(r.a, r.b, p)));
      if (blocked.length < 2) continue;
      if (!best || blocked.length > best.blocked.length) best = { group, blocked };
    }
    if (!best) break;
    const blocked = new Set(best.blocked);
    remaining = remaining.filter(r => !blocked.has(r));
    accepted.push(...best.group.parts); groups.push({ id: best.group.id, source: best.group.source, objects: best.group.parts.length, blockedLongRays: blocked.size });
  }
  return { remaining, accepted, groups };
}

export function placeTerrainLongSightScreens(stage) {
  const variation = stage.design_rationale.spatial_design.variation;
  const enhanced = variation?.version >= 27 && variation.family === 'cloister';
  const supported = variation?.family === 'terraces' || (variation?.version >= 19 && ['market', 'bridge', 'cloister'].includes(variation.family));
  if (!(variation?.version >= 18) || !supported) return stage;
  const original = stage.objects.filter(o => !owned(o)), solids = original.flatMap(getCollisionParts);
  const byId = new Map(stage.areas.map(a => [a.id, a]));
  const clear = (a, b) => !solids.some(o => segmentHitsBox(a, b, o));
  const required = [];
  for (const s of stage.plan.requirements.sightlines) {
    for (const a of spatialEyeSamples(byId.get(s.from))) for (const b of spatialEyeSamples(byId.get(s.to))) if (clear(a, b)) required.push([a, b]);
  }
  const threshold = 70, rays = [];
  for (let i = 0; i < stage.areas.length; i++) for (let j = i + 1; j < stage.areas.length; j++) {
    for (const a of spatialEyeSamples(stage.areas[i])) for (const b of spatialEyeSamples(stage.areas[j])) {
      const length = Math.hypot(...a.map((v, k) => v - b[k]));
      if (length >= threshold && clear(a, b)) rays.push({ a, b, length });
    }
  }
  const standing = solids.filter(o => isWalkable(o) && !['sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => {
    const b = volume(o); return { ...b, id: o.id, bottom: b.top, top: b.top + WALKING.height };
  });
  const rejected = { identifier: 0, sight: 0, standing: 0, overlap: 0 };
  const candidates = [];
  for (const wall of original.filter(o => isSpatialRailing(o) && o.id.startsWith('sp_wall_'))) {
   for (const group of screenCandidates(wall, enhanced)) {
    if (group.parts.some(p => original.some(o => o.id === p.id))) { rejected.identifier++; continue; }
    if (group.parts.some(p => required.some(([a, b]) => segmentHitsBox(a, b, p)))) { rejected.sight++; continue; }
    // The existing full-width curb already excludes standing on this area's
    // boundary, including bevels cut out of its terrain bounding rectangle.
    // Other decks, stairs and building approaches still reserve headroom.
    const otherFloors = standing.filter(b => b.id !== `sp_area_${group.areaId}` && !b.id.startsWith(`sp_area_${group.areaId}_floor_`));
    if (group.parts.some(p => otherFloors.some(b => intersects(volume(p), b)))) { rejected.standing++; continue; }
    const others = solids.filter(o => o.id !== wall.id && !o.id.startsWith(`${wall.id}_rail_`) && !isWalkable(o));
    if (group.parts.some(p => others.some(o => boxesOverlap(p, o)))) { rejected.overlap++; continue; }
    candidates.push(group);
   }
  }
  const legacy = selectScreens(candidates.filter(g => g.id === `${prefix}${g.source}`), rays);
  const expanded = enhanced ? selectScreens(candidates, rays) : legacy;
  // Adding candidates can change greedy choices for the worse. Compare the
  // complete six-group results, rather than assuming a better first pick wins.
  const useExpanded = enhanced && expanded.remaining.length < legacy.remaining.length;
  const { remaining, accepted, groups } = useExpanded ? expanded : legacy;
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.long_sight_screens = { version: enhanced ? 2 : 1, threshold, groups, addedObjects: accepted.length, rejected,
    ...(enhanced ? { legacyAfterLongRays: legacy.remaining.length, placement: useExpanded ? 'expanded' : 'legacy' } : {}),
    beforeLongRays: rays.length, afterLongRays: remaining.length, requiredClearEyePairsPreserved: required.length,
    scope: `全エリア間の81組の目線から70m以上通るものを測定。既存手すりの幅内に実体の木製目隠しを最大6組追加し、指定目線と歩行面の頭上空間を保持。${enhanced ? '中央と両端、6mと8mの板、下の隙間を抑えた板も比較。' : ''}すべての長射線を遮る保証ではありません。` };
  return { ...stage, objects: [...original, ...accepted], design_rationale: rationale };
}
