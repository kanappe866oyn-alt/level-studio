import { getCollisionParts } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { isSpatialRailing } from './railingParts.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

// Keep elevated paths open, but give developed plaza edges a stone plinth.
// The solid wall occupies the existing boundary envelope. Preserve every
// previously clear authored eye ray, not just the pass/fail percentage.
export function finishTerrainBoundaryStyles(objects, areas = [], buildings = [], requirements = {}) {
  const eligibleAreas = areas.filter(a => a.enclosure === 'open');
  const candidates = objects.filter(o => isSpatialRailing(o) && eligibleAreas.some(a => {
    if (!o.id.startsWith(`sp_wall_${a.id}_`)) return false;
    if (a.kind === 'courtyard' && a.width >= 18 && a.depth >= 18) return true;
    return buildings.some(b => b.from === a.id && o.id.startsWith(`sp_wall_${a.id}_${b.side}_`));
  }));
  if (!candidates.length) return objects;
  const solids = objects.flatMap(getCollisionParts), clearRays = [];
  for (const requirement of requirements.sightlines || []) {
    const a = areas.find(a => a.id === requirement.from), b = areas.find(a => a.id === requirement.to);
    if (!a || !b) continue;
    for (const from of spatialEyeSamples(a)) for (const to of spatialEyeSamples(b)) {
      if (!solids.some(o => segmentHitsBox(from, to, o))) clearRays.push([from, to]);
    }
  }
  const replacements = new Map();
  for (const object of candidates) {
    const { railing: _railing, railingAxis: _axis, ...appearance } = object.spatialAppearance;
    const candidate = { ...object, color: TERRAIN_DISTRICTS[appearance.district].wall,
      spatialAppearance: { ...appearance, surface: 'brick', edgeTrim: true, moduleId: 'stone_boundary' } };
    if (clearRays.some(([a, b]) => segmentHitsBox(a, b, candidate))) continue;
    replacements.set(object.id, candidate);
  }
  return replacements.size ? objects.map(o => replacements.get(o.id) || o) : objects;
}
