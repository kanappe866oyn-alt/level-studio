import { getCollisionParts, isWalkable, boxesOverlap, terrainUpperBound } from './spatialGeometry.js';
import { bridgeMemberHasClearance } from './terrainBridgeStructure.js';
import { spatialEyeSamples, segmentHitsBox } from './spatialSightlines.js';
import { TERRAIN_DISTRICTS } from './terrainMaterials.js';

// Split jambs from the existing wall volume, then bridge them above standing
// height. Keep the opening exactly as wide as it was before dressing it.
export function buildStreetGateways(objects, areas, connections, requirements = {}) {
  const result = [...objects], solids = objects.flatMap(getCollisionParts);
  const floors = objects.filter(o => isWalkable(o) && !['sp_ground', 'sp_terrain_surround'].includes(o.id)).flatMap(getCollisionParts);
  const rays = [];
  for (const s of requirements.sightlines || []) {
    const a = areas.find(a => a.id === s.from), b = areas.find(a => a.id === s.to);
    for (const p of spatialEyeSamples(a)) for (const q of spatialEyeSamples(b)) if (!solids.some(o => segmentHitsBox(p, q, o))) rays.push([p, q]);
  }
  for (const area of areas.filter(a => a.enclosure === 'walled')) for (const side of ['north', 'south', 'west', 'east']) {
    const normal = ['north', 'south'].includes(side) ? 'z' : 'x', along = normal === 'x' ? 2 : 0;
    const sign = ['north', 'west'].includes(side) ? -1 : 1;
    const links = connections.filter(c => (c.from === area.id || c.to === area.id) && c.axis === normal &&
      Math.sign(areas.find(a => a.id === (c.from === area.id ? c.to : c.from))[normal] - area[normal]) === sign);
    if (links.length !== 1) continue;
    const walls = [0, 1].map(i => result.find(o => o.id === `sp_wall_${area.id}_${side}_${i}`));
    if (walls.some(o => !o || o.size[along] < 0.7 || o.spatialAppearance?.railing)) continue;
    const root = `sp_gate_${area.id}_${side}`, palette = TERRAIN_DISTRICTS.lane;
    const appearance = { version: 1, style: 'harbor', surface: 'concrete', district: 'lane', category: 'portal', moduleId: 'street_gateway', areaId: area.id };
    const width = 0.4;
    const posts = walls.map((wall, i) => {
      const pos = [...wall.pos], size = [...wall.size];
      pos[along] += (i === 0 ? 1 : -1) * (wall.size[along] / 2 - width / 2); size[along] = width;
      return { ...wall, id: `${root}_post_${i}`, name: `${area.name}の入口柱`, pos, size, color: palette.crown, spatialAppearance: { ...appearance } };
    });
    const size = [...posts[0].size];
    size[along] = Math.abs(posts[1].pos[along] - posts[0].pos[along]) + width; size[1] = 0.25;
    const pos = posts[0].pos.map((v, i) => (v + posts[1].pos[i]) / 2);
    pos[1] = area.y + 2.8 + size[1] / 2;
    const header = { ...posts[0], id: `${root}_header`, name: `${area.name}の門の梁`, pos, size };
    const headerBottom = header.pos[1] - header.size[1] / 2;
    if (!bridgeMemberHasClearance(header, floors) || solids.some(o => {
      if (o.terrainProfile && terrainUpperBound(o) <= headerBottom + 1e-5) return false;
      return boxesOverlap(header, o);
    }) || rays.some(([p, q]) => segmentHitsBox(p, q, header))) continue;
    if ([...posts, header].some(p => result.some(o => o.id === p.id))) continue;
    walls.forEach((wall, i) => {
      const pos = [...wall.pos], size = [...wall.size];
      pos[along] += (i === 0 ? -1 : 1) * width / 2; size[along] -= width;
      result[result.indexOf(wall)] = { ...wall, pos, size };
    });
    result.push(...posts, header);
  }
  return result;
}
