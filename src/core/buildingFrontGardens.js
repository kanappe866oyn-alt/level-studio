import { scaledBuildingEntry } from './buildingKit.js';
import { getModelDefault } from './modelCatalog.js';
import { boxesOverlap, getCollisionParts, isWalkable, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

const moduleId = 'building_front_garden';
export const isBuildingFrontGarden = o => o.id.startsWith('sp_front_garden_') && !o.customModelUrl && (o.spatialAppearance?.moduleId === moduleId || o.role === 'landform' && !!o.terrainProfile || o.role === 'plant' && o.modelGrounding?.surfaceId?.startsWith('sp_front_garden_') && o.modelDimensions?.path === '/plant/2.glb');

// Native entrance measurements keep both the ramp and the through-forecourt
// free. The two independent candidates sit against the solid facade wings.
export function buildingFrontGardenGroups(model, area) {
  const entry = scaledBuildingEntry(model), y = model.pos[1] - model.size[1] / 2;
  const ref = getModelDefault('plant', 2), size = ref.size.map(v => v * 0.43);
  const district = area.level > 0 ? 'high' : 'court', palette = TERRAIN_DISTRICTS[district];
  return [-1, 1].flatMap(side => {
    const x = side * (model.size[0] / 2 - 0.85), z = entry.front + 0.65;
    if (Math.abs(x - entry.ramp.x) - 0.55 < entry.ramp.width / 2 + WALKING.radius + 0.2 ||
        z + 0.46 + WALKING.radius + 0.2 > entry.ramp.near) return [];
    const id = 'sp_front_garden_' + model.id + '_' + (side < 0 ? 'left' : 'right');
    const part = (suffix, name, role, dx, dz, h, dimensions, surface, color) => {
      const [wx, wz] = worldXZ(model, x + dx, z + dz);
      return { id: id + '_' + suffix, name: area.name + '沿いの入口脇の' + name, role, type: 'box', variant: 1, material: 0,
        pos: [wx, y + h, wz], size: dimensions, rot: [...model.rot], color,
        ...(role === 'wall' ? { spatialAppearance: { version: 1, style: 'harbor', surface, district, category: 'trim', moduleId, areaId: area.id } } : {}) };
    };
    const soil = { ...part('soil', '植栽土', 'landform', 0, 0, 0.28, [0.88, 0.56, 0.68], 'concrete', '#687b51'),
      color2: '#806b50', terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0, surfaceMaterial: 'grass' } };
    const parts = [soil];
    for (const s of [-1, 1]) {
      parts.push(part('rim_z_' + s, '植栽枡', 'wall', 0, s * 0.4, 0.325, [1.1, 0.65, 0.12], 'brick', palette.wall));
      parts.push(part('rim_x_' + s, '植栽枡', 'wall', s * 0.49, 0, 0.325, [0.12, 0.65, 0.68], 'brick', palette.wall));
    }
    parts.push({ ...part('plant', '低木', 'plant', 0, 0, 0.54 + size[1] / 2, size, 'concrete', null), variant: 2,
      modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale },
      modelGrounding: { surfaceId: soil.id, inset: 0.02 } });
    return [{ id, modelId: model.id, parts }];
  });
}

export function placeBuildingFrontGardens(stage) {
  const variation = stage.design_rationale.spatial_design.variation;
  if (!(variation?.version >= 23) || !['market', 'terraces', 'bridge', 'cloister'].includes(variation?.family)) return stage;
  const original = stage.objects.filter(o => !isBuildingFrontGarden(o)), solids = original.flatMap(getCollisionParts);
  const rays = [], observers = [];
  for (const requirement of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === requirement.from), b = stage.areas.find(a => a.id === requirement.to);
    const from = spatialEyeSamples(a), to = spatialEyeSamples(b);
    observers.push(...from.map(p => [p[0], a.y, p[2]]), ...to.map(p => [p[0], b.y, p[2]]));
    for (const p of from) for (const q of to) if (!solids.some(o => segmentHitsBox(p, q, o))) rays.push([p, q]);
  }
  const added = [], groups = [], rejected = [];
  for (const model of original.filter(o => o.buildingPlacement && !o.customModelUrl)) {
    const area = stage.areas.find(a => a.id === model.buildingPlacement.from);
    const pad = original.find(o => o.id === 'sp_build_' + model.buildingPlacement.plotId + '_pad');
    if (!area || !pad) continue;
    const y = model.pos[1] - model.size[1] / 2;
    const standing = solids.filter(o => isWalkable(o) && ![pad.id, 'sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => ({
      ...o, pos: [o.pos[0], o.pos[1] + o.size[1] / 2 + WALKING.height / 2, o.pos[2]], size: [o.size[0], WALKING.height, o.size[2]] }));
    const obstacles = solids.filter(o => !isWalkable(o));
    for (const group of buildingFrontGardenGroups(model, area)) {
      const { parts } = group;
      const supported = parts.every(p => [-.5, 0, .5].every(dx => [-.5, 0, .5].every(dz => {
        const [x, z] = worldXZ(p, dx * p.size[0], dz * p.size[2]), top = surfaceTop(pad, x, z);
        return top !== null && Math.abs(top - y) < .015;
      })));
      const reason = parts.some(p => original.some(o => o.id === p.id)) ? 'identifier' : !supported ? 'support' :
        parts.some(p => [...obstacles, ...standing, ...added].some(o => boxesOverlap(p, o))) ? 'overlap' :
        parts.some(p => observers.some(([x, y, z]) => boxesOverlap(p, {pos:[x, y + WALKING.height/2, z], size:[2*WALKING.radius+.1, WALKING.height, 2*WALKING.radius+.1], rot:[0,0,0]}))) ? 'observation' :
        parts.some(p => rays.some(([a, b]) => segmentHitsBox(a, b, p))) ? 'sight' : null;
      if (reason) { rejected.push({ id: group.id, reason }); continue; }
      added.push(...parts); groups.push({ id: group.id, modelId: model.id, objects: parts.length, support: pad.id });
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.building_front_gardens = { version: 1, groups, rejected, addedObjects: added.length, clearEyePairsPreserved: rays.length };
  return { ...stage, objects: [...original, ...added], design_rationale: rationale };
}
