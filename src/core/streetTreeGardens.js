import { getModelDefault } from './modelCatalog.js';
import { boxesOverlap, getBounds, getCollisionParts, isWalkable, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { plazaMovementHalfWidth } from './spatialPlazaFurniture.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

const prefix = 'sp_street_tree_';
export const isStreetTreeGarden = o => o.id.startsWith(prefix) &&
  (o.spatialAppearance?.moduleId?.startsWith('plaza_street_tree_') || o.modelGrounding?.surfaceId?.startsWith(prefix) ||
    o.role === 'landform' && o.terrainProfile?.surfaceMaterial === 'grass');

export function streetTreeGardenGroup(area, floor, sx, sz, scale = 0.46, inward = 0, variant = 2) {
  const root = `${prefix}${area.id}_${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`;
  const alongX = area.width >= area.depth;
  const x = area.x + sx * (area.width / 2 - 2.7 - (alongX ? inward : 0));
  const z = area.z + sz * (area.depth / 2 - 2.7 - (alongX ? 0 : inward));
  const y = surfaceTop(floor, x, z);
  if (y === null) return null;
  const district = area.level > 0 ? 'high' : 'court', palette = TERRAIN_DISTRICTS[district];
  const part = (suffix, name, dx, dz, height, size, surface, color) => ({
    id: `${root}_${suffix}`, name: `${area.name}の街路樹${name}`, role: 'wall', type: 'box', variant: 1, material: 0,
    pos: [x + dx, y + height, z + dz], size, rot: [0, 0, 0], color,
    spatialAppearance: { version: 1, style: 'harbor', surface, district, category: 'trim', areaId: area.id,
      moduleId: `plaza_street_tree_${area.id}_${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}` },
  });
  const soil = { id: `${root}_soil`, name: `${area.name}の街路樹の土`, role: 'landform', type: 'box', variant: 1, material: 0,
    pos: [x, y + 0.24, z], size: [2.16, 0.48, 2.16], rot: [0, 0, 0], color: '#73845d', color2: '#806b50',
    terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0, surfaceMaterial: 'grass' } };
  const parts = [soil];
  for (const axis of [0, 2]) for (const sign of [-1, 1]) {
    const size = [2.4, 0.54, 2.4]; size[axis] = 0.12;
    parts.push(part(`rim_${axis}_${sign}`, 'の石枠', axis === 0 ? sign * 1.14 : 0, axis === 2 ? sign * 1.14 : 0,
      0.27, size, 'brick', palette.wall));
  }
  const ref = getModelDefault('tree', variant), size = ref.size.map(n => n * scale), inset = 0.04;
  parts.push({ id: `${root}_tree`, name: `${area.name}の街路樹`, role: 'tree', type: 'box', variant, material: 0,
    pos: [x, y + 0.48 - inset + size[1] / 2, z], size, rot: [0, sx < 0 ? Math.PI : 0, 0], color: null,
    modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: soil.id, inset } });
  const seat = alongX ? -sx * 1.45 : -sz * 1.45;
  parts.push(part('seat', 'のベンチ座面', alongX ? seat : 0, alongX ? 0 : seat, 0.45,
    alongX ? [0.42, 0.12, 2.2] : [2.2, 0.12, 0.42], 'wood', '#886344'));
  parts.push(part('back', 'のベンチ背板', alongX ? seat + sx * 0.18 : 0, alongX ? 0 : seat + sz * 0.18, 0.73,
    alongX ? [0.08, 0.48, 2.2] : [2.2, 0.48, 0.08], 'wood', '#886344'));
  for (const sign of [-1, 1]) parts.push(part(`leg_${sign}`, 'のベンチ脚', alongX ? seat : sign * 0.75, alongX ? sign * 0.75 : seat, 0.195,
    alongX ? [0.32, 0.39, 0.16] : [0.16, 0.39, 0.32], 'concrete', palette.foot));
  return { id: root, areaId: area.id, soil, parts, scale };
}

function fitGroup(group, floor) {
  const heights = [];
  for (const part of group.parts.filter(o => o.role !== 'tree')) {
    for (const dx of [-0.5, 0, 0.5]) for (const dz of [-0.5, 0, 0.5]) {
      const [x, z] = worldXZ(part, dx * part.size[0], dz * part.size[2]), y = surfaceTop(floor, x, z);
      if (y === null) return false;
      heights.push(y);
    }
  }
  const min = Math.min(...heights), max = Math.max(...heights);
  if (max - min > 0.12) return false;
  for (const part of group.parts.filter(o => o.role === 'landform' || /_rim_|_leg_/.test(o.id))) {
    const top = part.pos[1] + part.size[1] / 2, bottom = min - 0.02;
    part.pos[1] = (top + bottom) / 2; part.size[1] = top - bottom;
  }
  group.supportMin = min; group.supportMax = max;
  return true;
}

// Finish only after the buildings and outer landscape have been accepted. A
// garden is atomic: reject the entire assembly if its crown, seat or base fails.
export function placeStreetTreeGardens(stage) {
  const design = stage.design_rationale.spatial_design;
  if (!(design.variation?.version >= 36) || design.street_tree_gardens) return stage;
  const original = stage.objects, solids = original.flatMap(getCollisionParts), rays = [], observers = [];
  for (const s of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === s.from), b = stage.areas.find(a => a.id === s.to);
    observers.push(...[a, b].flatMap(area => spatialEyeSamples(area).map(p => ({ x: p[0], y: area.y, z: p[2] }))));
    for (const from of spatialEyeSamples(a)) for (const to of spatialEyeSamples(b)) {
      if (!solids.some(o => segmentHitsBox(from, to, o))) rays.push([from, to]);
    }
  }
  const additions = [], groups = [], rejected = { movement: 0, support: 0, overlap: 0, observation: 0, sight: 0, identifier: 0 };
  const areas = stage.areas.filter(a => a.enclosure === 'open' && a.kind !== 'passage' && a.width >= 14 && a.depth >= 14);
  for (const area of areas) {
    const floor = original.find(o => o.id === `sp_area_${area.id}` && o.role === 'landform');
    if (!floor || floor.terrainProfile?.grade) continue;
    const half = plazaMovementHalfWidth(stage, area);
    let count = 0;
    const standing = solids.filter(o => isWalkable(o) && ![floor.id, 'sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => ({
      ...o, pos: [o.pos[0], o.pos[1] + o.size[1] / 2 + WALKING.height / 2, o.pos[2]], size: [o.size[0], WALKING.height, o.size[2]] }));
    const obstacles = solids.filter(o => ![floor.id, 'sp_ground', 'sp_terrain_surround'].includes(o.id));
    for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      if (count >= 2 || groups.length >= 8) break;
      for (const [variant, scale, inward] of [0, 1.6, 2.4].flatMap(inward => [[2, 0.46], [2, 0.4], [4, 0.55], [4, 0.46]].map(([variant, scale]) => [variant, scale, inward]))) {
        const group = streetTreeGardenGroup(area, floor, sx, sz, scale, inward, variant);
        if (!group) continue;
        const { parts } = group;
        let reason;
        if (parts.some(p => original.some(o => o.id === p.id))) reason = 'identifier';
        else if (parts.some(p => { const b = getBounds(p); return b.minX < area.x + half && b.maxX > area.x - half || b.minZ < area.z + half && b.maxZ > area.z - half; })) reason = 'movement';
        else if (!fitGroup(group, floor)) reason = 'support';
        else if (parts.some(p => [...obstacles, ...standing, ...additions].some(o => boxesOverlap(p, o)))) reason = 'overlap';
        else if (parts.some(p => observers.some(a => boxesOverlap(p, { pos: [a.x, a.y + WALKING.height / 2, a.z], size: [0.8, WALKING.height, 0.8], rot: [0, 0, 0] })))) reason = 'observation';
        else if (parts.some(p => rays.some(([a, b]) => segmentHitsBox(a, b, p)))) reason = 'sight';
        if (reason) { rejected[reason]++; continue; }
        additions.push(...parts); count++;
        groups.push({ id: group.id, areaId: group.areaId, variant, scale, inward, movementWidth: half * 2, supportMin: group.supportMin, supportMax: group.supportMax, objects: parts.length });
        break;
      }
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.street_tree_gardens = { version: 1, groups, addedObjects: additions.length, rejected,
    preservedEyePairs: rays.length, scope: '広い広場の端に樹木・植栽枡・ベンチを一体配置。中央動線、既存の建物・上段床と頭上空間、観測地点と指定視線を保護。' };
  return { ...stage, objects: [...original, ...additions], design_rationale: rationale };
}
