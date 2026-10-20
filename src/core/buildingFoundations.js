import { scaledBuildingEntry } from './buildingKit.js';
import { boxesOverlap, getCollisionParts, isWalkable, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

export const isBuildingFoundation = o => o.id.includes('_footing_') && o.spatialAppearance?.category === 'foundation';

// Follow the registered solid facade rather than the full GLB bounds: the front
// bounds also contain the native entrance ramp and sometimes an overhead canopy.
export function buildingFoundationParts(model, area) {
  const entry = scaledBuildingEntry(model), half = model.size[0] / 2, back = -model.size[2] / 2;
  const bottom = model.pos[1] - model.size[1] / 2, front = entry.front, thickness = 0.24;
  const gap = entry.ramp.width / 2 + WALKING.radius + 0.15;
  const district = area.level > 0 ? 'high' : area.enclosure === 'walled' ? 'lane' : area.kind === 'entry' ? 'entry' : area.kind === 'courtyard' ? 'court' : 'neutral';
  const parts = [], root = model.id.replace(/_model$/, '');
  const add = (suffix, x, z, width, depth) => {
    if (width < 0.1 || depth < 0.1) return;
    const [wx, wz] = worldXZ(model, x, z);
    parts.push({ id: `${root}_footing_${suffix}`, name: `${area.name}沿いの建物の基礎`, role: 'wall', type: 'box', variant: 1, material: 0,
      pos: [wx, bottom + 0.14, wz], size: [width, 0.32, depth], rot: [...model.rot], color: TERRAIN_DISTRICTS[district].foot,
      spatialAppearance: { version: 1, style: 'harbor', surface: 'brick', district, category: 'foundation', areaId: area.id,
        moduleId: `footing_${model.buildingPlacement.plotId}`, edgeTrim: true } });
  };
  add('back', 0, back, model.size[0] + thickness, thickness);
  for (const side of [-1, 1]) add(`side_${side}`, side * half, (back + front) / 2, thickness, front - back);
  const left = entry.ramp.x - gap, right = entry.ramp.x + gap;
  add('front_left', (-half + left) / 2, front, left + half, thickness);
  add('front_right', (right + half) / 2, front, half - right, thickness);
  return parts;
}

export function placeBuildingFoundations(stage) {
  const original = stage.objects.filter(o => !isBuildingFoundation(o)), solids = original.flatMap(getCollisionParts);
  const clearRays = [];
  for (const s of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === s.from), b = stage.areas.find(a => a.id === s.to);
    for (const p of spatialEyeSamples(a)) for (const q of spatialEyeSamples(b)) {
      if (!solids.some(o => segmentHitsBox(p, q, o))) clearRays.push([p, q]);
    }
  }
  const added = [], groups = [], rejected = [];
  for (const model of original.filter(o => o.buildingPlacement && !o.customModelUrl)) {
    const area = stage.areas.find(a => a.id === model.buildingPlacement.from), root = `sp_build_${model.buildingPlacement.plotId}`;
    const pad = original.find(o => o.id === `${root}_pad`);
    if (!area || !pad) continue;
    const parts = buildingFoundationParts(model, area), y = model.pos[1] - model.size[1] / 2;
    const otherSolids = solids.filter(o => !o.id.startsWith(`${model.id}_`) && !isWalkable(o));
    const standing = solids.filter(o => isWalkable(o) && ![pad.id, 'sp_ground', 'sp_terrain_surround'].includes(o.id)).map(o => ({
      ...o, pos: [o.pos[0], o.pos[1] + o.size[1] / 2 + WALKING.height / 2, o.pos[2]], size: [o.size[0], WALKING.height, o.size[2]] }));
    const supported = parts.every(p => [-0.5, 0, 0.5].every(dx => [-0.5, 0, 0.5].every(dz => {
      const [x, z] = worldXZ(p, dx * p.size[0], dz * p.size[2]), top = surfaceTop(pad, x, z);
      return top !== null && Math.abs(top - y) < 0.015;
    })));
    const reason = parts.some(p => original.some(o => o.id === p.id)) ? 'identifier' : !supported ? 'support' :
      parts.some(p => [...otherSolids, ...standing, ...added].some(o => boxesOverlap(p, o))) ? 'overlap' :
      parts.some(p => clearRays.some(([a, b]) => segmentHitsBox(a, b, p))) ? 'sight' : null;
    if (reason) { rejected.push({ id: model.id, reason }); continue; }
    added.push(...parts); groups.push({ id: model.id, parts: parts.length, entryClearWidth: scaledBuildingEntry(model).ramp.width + 2 * WALKING.radius + 0.3 });
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.building_foundations = { version: 1, groups, rejected, addedObjects: added.length, clearEyePairsPreserved: clearRays.length };
  return { ...stage, objects: [...original, ...added], design_rationale: rationale };
}
