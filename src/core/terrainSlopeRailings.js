import { getCollisionParts } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';
import { CURVE_STEPS } from './terrainCurve.js';

// Replace only open slope boundaries. The new curb, rail and posts remain
// inside the old wall, so the walking width and visible sight lines cannot shrink.
export function finishTerrainSlopeRailings(objects, connections, areas = [], requirements = {}) {
  let result = objects;
  const hiddenRays = (requirements.sightlines || []).filter(s => s.relation === 'hidden').flatMap(s => {
    const a = areas.find(a => a.id === s.from), b = areas.find(a => a.id === s.to);
    return a && b ? spatialEyeSamples(a).flatMap(from => spatialEyeSamples(b).map(to => [from, to])) : [];
  });
  for (const c of connections.filter(c => c.rise && c.enclosure === 'open')) {
    const floor = result.find(o => o.id === c.object_id && o.role === 'landform' && o.terrainProfile?.grade);
    if (!floor) continue;
    const walls = result.filter(o => o.id.startsWith(`${c.object_id}_wall_`) && !o.spatialAppearance?.railing);
    if (!walls.length) continue;
    const replaced = new Map();
    for (const wall of walls) {
      // The original boundary top already follows the high end of this segment.
      const oldTop = wall.pos[1] + wall.size[1] / 2;
      const height = Math.min(wall.size[1], 0.8 + (floor.terrainProfile.stepCount ? 0 : c.rise / (c.curve || c.flare ? CURVE_STEPS : 32)));
      const appearance = { ...wall.spatialAppearance }; delete appearance.edgeTrim;
      const district = appearance.district || 'high';
      replaced.set(wall.id, { ...wall, pos: [wall.pos[0], oldTop - height / 2, wall.pos[2]], size: [wall.size[0], height, wall.size[2]],
        color: TERRAIN_DISTRICTS[district].crown, spatialAppearance: { ...appearance, surface: 'metal', railing: true, railingAxis: 'z' } });
    }
    const candidate = result.map(o => replaced.get(o.id) || o);
    // Only rays that hit a removed wall can change. Preserve every previously
    // blocked sample for hidden conditions, including those below the threshold.
    const affected = hiddenRays.filter(([a, b]) => walls.some(o => segmentHitsBox(a, b, o)));
    const blockers = affected.length ? candidate.flatMap(getCollisionParts) : [];
    if (affected.some(([a, b]) => !blockers.some(o => segmentHitsBox(a, b, o)))) continue;
    result = candidate;
  }
  return result;
}
