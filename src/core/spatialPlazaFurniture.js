import { getModelDefault } from './modelCatalog.js';
import { getBounds, getCollisionParts, isWalkable, surfaceTop, worldXZ, boxesOverlap, WALKING } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';
import { streetMarketGroups, terraceRestGroups } from './streetMarketFurniture.js';

const prefix = 'sp_plaza_';
export const isPlazaFurniture = o => o.id.startsWith(prefix) && (
  o.spatialAppearance?.moduleId?.startsWith('plaza_') || o.modelGrounding?.surfaceId?.startsWith(prefix) || o.role === 'landform' && !!o.terrainProfile);
const intersects = (a, b, gap = 0) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap && a.bottom < b.top + gap && a.top > b.bottom - gap;
const volume = o => ({ ...getBounds(o), bottom: o.pos[1] - o.size[1] / 2, top: o.pos[1] + o.size[1] / 2 });
const box = (id, name, role, pos, size, appearance, color) => ({ id, name, role, type: 'box', variant: 1, material: 0, pos, size, rot: [0, 0, 0], color,
  ...(appearance ? { spatialAppearance: appearance } : {}) });

export function plazaMovementHalfWidth(stage, area) {
  const widths = stage.connections.filter(c => c.from === area.id || c.to === area.id).map(c => c.width + 2 * (c.flare || 0));
  return (Math.max(3, ...widths) + 2 * WALKING.radius + 0.5) / 2;
}

export function plazaFurnitureGroup(area, floor, sx, sz, bench) {
  const root = `${prefix}${area.id}_${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`;
  const district = area.level > 0 ? 'high' : area.kind === 'courtyard' ? 'court' : area.kind === 'entry' ? 'entry' : 'neutral';
  const palette = TERRAIN_DISTRICTS[district], x = area.x + sx * (area.width / 2 - 1.5), z = area.z + sz * (area.depth / 2 - 1.5);
  const y = surfaceTop(floor, x, z) ?? area.y;
  const appearance = surface => ({ version: 1, style: 'harbor', surface, district, category: 'trim', moduleId: root.slice(3), areaId: area.id });
  const soil = { ...box(`${root}_soil`, `${area.name}の植栽枡の土`, 'landform', [x, y + 0.34, z], [0.96, 0.68, 0.96], null, '#687b51'),
    color2: '#806b50', terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0, surfaceMaterial: 'grass' } };
  const parts = [soil];
  for (const side of [-1, 1]) {
    for (const axis of [0, 2]) {
      const pos = [x, y + 0.4, z], size = [1.2, 0.8, 1.2]; pos[axis] += side * 0.54; size[axis] = 0.12;
      parts.push(box(`${root}_rim_${axis}_${side}`, `${area.name}の植栽枡の縁`, 'wall', pos, size, { ...appearance('brick'), edgeTrim: true }, palette.wall));
    }
  }
  const variant = sx === sz ? 1 : 2, ref = getModelDefault('plant', variant), scale = variant === 1 ? 0.65 : 0.55, size = ref.size.map(v => v * scale);
  parts.push({ ...box(`${root}_plant`, `${area.name}の広場内の植栽`, 'plant', [x, y + 0.65 + size[1] / 2, z], size, null, null), variant,
    modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: soil.id, inset: 0.03 } });
  if (bench) {
    const bx = x - sx * 0.8, bz = z + sz * 0.08;
    parts.push(box(`${root}_seat`, `${area.name}のベンチ座面`, 'wall', [bx, y + 0.45, bz], [0.4, 0.12, 1.1], appearance('wood'), '#886344'));
    parts.push(box(`${root}_back`, `${area.name}のベンチ背板`, 'wall', [bx + sx * 0.15, y + 0.75, bz], [0.08, 0.5, 1.1], appearance('wood'), '#886344'));
    for (const side of [-1, 1]) parts.push(box(`${root}_leg_${side}`, `${area.name}のベンチ脚`, 'wall', [bx, y + 0.195, bz + side * 0.38], [0.3, 0.39, 0.12], appearance('concrete'), palette.foot));
  }
  return { id: root, parts, bench };
}

// Large courts need interior landmarks, rather than only tiny corner planting.
// The solid planter stops walking; the back screen breaks a standing eye ray.
export function plazaCoverGroup(area, floor, sx, sz, half) {
  const root = `${prefix}cover_${area.id}_${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`;
  const x = area.x + sx * (half + 2.5), z = area.z + sz * (half + 1.8);
  const y = surfaceTop(floor, x, z) ?? area.y;
  const district = area.level > 0 ? 'high' : 'court', palette = TERRAIN_DISTRICTS[district];
  const appearance = surface => ({ version: 1, style: 'harbor', surface, district, category: 'trim', moduleId: root.slice(3), areaId: area.id });
  const parts = [
    box(`${root}_rim_base`, `${area.name}の植栽付き遮蔽物の基壇`, 'wall', [x, y + 0.57, z], [3, 1.14, 1.8], { ...appearance('brick'), edgeTrim: true }, palette.wall),
    box(`${root}_cap`, `${area.name}の遮蔽物の笠石`, 'wall', [x, y + 1.2, z], [3.2, 0.12, 2], appearance('concrete'), palette.foot),
    { ...box(`${root}_soil`, `${area.name}の遮蔽物の植栽土`, 'landform', [x, y + 1.25, z], [2.75, 0.1, 1.5], null, '#687b51'),
      color2: '#806b50', terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0, surfaceMaterial: 'grass' } },
    box(`${root}_screen`, `${area.name}の視線を遮る木の背板`, 'wall', [x, y + 1.7, z + sz * 0.66], [2.8, 0.88, 0.16], appearance('wood'), '#886344'),
    box(`${root}_screen_cap`, `${area.name}の背板の上桟`, 'wall', [x, y + 2.18, z + sz * 0.66], [3, 0.1, 0.22], appearance('wood'), '#684d39'),
  ];
  for (const side of [-1, 1]) parts.push(box(`${root}_post_${side}`, `${area.name}の背板の柱`, 'wall',
    [x + side * 1.44, y + 1.73, z + sz * 0.66], [0.12, 1.02, 0.2], appearance('wood'), '#684d39'));
  const ref = getModelDefault('plant', 2), size = ref.size.map(v => v * 0.55);
  for (const side of [-1, 1]) parts.push({ ...box(`${root}_plant_${side}`, `${area.name}の遮蔽物の植栽`, 'plant',
    [x + side * 0.7, y + 1.27 + size[1] / 2, z - sz * 0.12], size, null, null), variant: 2,
    modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: `${root}_soil`, inset: 0.03 } });
  return { id: root, parts, bench: false, cover: true };
}

function fitGroupToFloor(group, floor) {
  const heights = [];
  const supported = group.street ? group.parts.filter(p => /_leg_|_rim_/.test(p.id)) : group.parts;
  for (const part of supported) for (const dx of [-0.5, 0, 0.5]) for (const dz of [-0.5, 0, 0.5]) {
    const [x, z] = worldXZ(part, dx * part.size[0], dz * part.size[2]), y = surfaceTop(floor, x, z);
    if (y === null) return false;
    heights.push(y);
  }
  const min = Math.min(...heights), max = Math.max(...heights);
  if (max - min > 0.18) return false;
  // Extend only foundations below the actual paving. Keep the seat and planter
  // top level, instead of leaving legs or the planter rim floating over relief.
  for (const part of group.parts.filter(o => (!group.cover && o.role === 'landform') || /_rim_|_leg_/.test(o.id))) {
    const top = part.pos[1] + part.size[1] / 2, bottom = min - 0.02;
    part.pos[1] = (top + bottom) / 2; part.size[1] = top - bottom;
  }
  group.supportMin = min; group.supportMax = max;
  return true;
}

// Reserve an uninterrupted cross between every
// portal and building branch, standing space at observation samples, and all
// originally clear authored eye pairs. Geometry remains fully collidable.
export function placePlazaFurniture(stage) {
  const original = stage.objects.filter(o => !isPlazaFurniture(o)), solids = original.flatMap(getCollisionParts);
  const clearRays = [], observers = [];
  for (const requirement of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === requirement.from), b = stage.areas.find(a => a.id === requirement.to);
    const from = spatialEyeSamples(a), to = spatialEyeSamples(b);
    observers.push(...from.map(p => [p[0], a.y, p[2]]), ...to.map(p => [p[0], b.y, p[2]]));
    for (const p of from) for (const q of to) if (!solids.some(o => segmentHitsBox(p, q, o))) clearRays.push([p, q]);
  }
  const accepted = [], groups = [], rejected = { identifier: 0, movement: 0, support: 0, overlap: 0, observation: 0, sight: 0 };
  const areas = stage.areas.filter(a => a.enclosure === 'open' && a.kind !== 'passage');
  for (const area of areas) {
    const floor = original.find(o => o.id === `sp_area_${area.id}` && o.role === 'landform');
    if (!floor || floor.terrainProfile?.grade) continue;
    const half = plazaMovementHalfWidth(stage, area);
    const otherStandingVolumes = solids.filter(o => isWalkable(o) && ![floor.id, 'sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => {
      const b = volume(o); return { ...b, bottom: b.top, top: b.top + WALKING.height };
    });
    const corners = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
    const candidates = [];
    const variation = stage.design_rationale.spatial_design.variation;
    if (variation?.version >= 15 && variation.family === 'terraces' ||
        variation?.version >= 22 && ['market', 'bridge', 'cloister'].includes(variation.family)) {
      for (const group of terraceRestGroups(area, floor, half)) candidates.push([group]);
    }
    for (const group of streetMarketGroups(area, floor, half)) candidates.push([group]);
    if (area.kind === 'courtyard' && area.width >= 18 && area.depth >= 18) {
      for (const [sx, sz] of corners) candidates.push([plazaCoverGroup(area, floor, sx, sz, half)]);
    }
    let count = 0;
    for (const [sx, sz] of corners) candidates.push([true, false].map(bench => plazaFurnitureGroup(area, floor, sx, sz, bench)));
    for (const alternatives of candidates) {
      const { cover, street } = alternatives[0];
      if (alternatives[0].rest && groups.filter(g => g.rest && g.areaId === area.id).length >= 2) continue;
      if (!cover && !street && (count >= (area.kind === 'courtyard' ? 2 : 1) || groups.filter(g => !g.cover && !g.street).length >= 8)) continue;
      for (const group of alternatives) {
        const { parts, bench } = group;
        let reason;
        if (parts.some(p => original.some(o => o.id === p.id))) reason = 'identifier';
        else if (parts.some(p => {
          const b = getBounds(p);
          if (street && p.pos[1] - p.size[1] / 2 >= area.y + WALKING.height + 0.3) return false;
          return b.minX < area.x + half - 1e-6 && b.maxX > area.x - half + 1e-6 || b.minZ < area.z + half - 1e-6 && b.maxZ > area.z - half + 1e-6;
        })) reason = 'movement';
        else if (!fitGroupToFloor(group, floor)) reason = 'support';
        else if (parts.some(p => otherStandingVolumes.some(b => intersects(volume(p), b)) || [...solids.filter(o => !isWalkable(o)), ...accepted].some(o => boxesOverlap({ ...p, size: p.size.map((v, i) => v + (i === 1 ? 0 : 0.08)) }, o)))) reason = 'overlap';
        else if (parts.some(p => observers.some(([x, y, z]) => {
          const b = volume(p), gap = WALKING.radius + 0.05;
          const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
          return b.top > y && b.bottom < y + WALKING.height && dx * dx + dz * dz < gap * gap;
        }))) reason = 'observation';
        else if (parts.some(p => clearRays.some(([a, b]) => segmentHitsBox(a, b, p)))) reason = 'sight';
        if (reason) { rejected[reason]++; continue; }
        accepted.push(...parts); groups.push({ id: group.id, areaId: area.id, bench, ...(group.rest ? { rest: true } : {}), ...(cover ? { cover: true } : {}), ...(street ? { street: true } : {}), movementWidth: half * 2, objects: parts.length,
          supportMin: group.supportMin, supportMax: group.supportMax }); if (!cover && !street) count++; break;
      }
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.plaza_furniture = { version: 1, groups, addedObjects: accepted.length, rejected, clearEyePairsPreserved: clearRays.length,
    scope: '広場の隅に植栽枡とベンチ、大きな中庭の内部に植栽付き遮蔽物、細長い市場の両脇に売店を配置。中央の十字動線・入口・観測地点・指定目線を保持し、描画と同じ実体で通行を判定。' };
  return { ...stage, objects: [...original, ...accepted], design_rationale: rationale };
}
