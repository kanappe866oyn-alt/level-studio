import { getModelDefault } from './modelCatalog.js';
import { getBounds, getCollisionParts, isWalkable, surfaceTop } from './spatialGeometry.js';
import { terrainModelFit } from './spatialTerrainModels.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';

const PREFIX = 'sp_garden_cluster_';
const overlaps = (a, b, gap = 0.4) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;

// A bounded finishing pass. Existing geometry is retained byte-for-byte;
// native crowns reserve their entire footprint outside all walking surfaces.
export function placeTerrainGardenClusters(stage) {
  const variation = stage.design_rationale?.spatial_design?.variation;
  const compact = variation?.version >= 20 && variation.family !== 'terraces';
  const owned = o => o.id.startsWith(PREFIX) && !o.customModelUrl && !!o.modelDimensions?.path && o.modelGrounding?.surfaceId === 'sp_terrain_surround' &&
    o.modelDimensions?.path === getModelDefault(o.role, o.variant)?.path;
  const original = stage.objects.filter(o => !owned(o));
  const terrain = original.find(o => o.id === 'sp_terrain_surround');
  if (!terrain) return stage;
  const reserved = original.filter(o => isWalkable(o) && !['sp_ground', terrain.id].includes(o.id));
  const occupied = original.filter(o => !['ground', 'landform', 'pit'].includes(o.role));
  const blockers = original.flatMap(getCollisionParts), rays = [];
  for (const line of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === line.from), b = stage.areas.find(a => a.id === line.to);
    for (const from of spatialEyeSamples(a)) for (const to of spatialEyeSamples(b)) {
      if (!blockers.some(o => segmentHitsBox(from, to, o))) rays.push([from, to]);
    }
  }
  const xs = [...new Set(stage.areas.map(a => a.x))].sort((a, b) => a - b);
  const zs = [...new Set(stage.areas.map(a => a.z))].sort((a, b) => a - b);
  const sites = [];
  for (let z = 1; z < zs.length; z++) for (let x = 1; x < xs.length; x++) {
    if (xs[x] - xs[x - 1] >= 16 && zs[z] - zs[z - 1] >= 16) sites.push([(xs[x] + xs[x - 1]) / 2, (zs[z] + zs[z - 1]) / 2]);
  }
  const objects = [], checks = [];
  let groups = 0;
  for (const [site, [cx, cz]] of sites.entries()) {
    if (groups >= 6) break;
    const initialCount = objects.length;
    const placements = [
      ['tree', 1, -2.5, -1.5, compact ? 0.5 : 0.7], ['tree', 3, 2.6, 1.9, compact ? 0.48 : 0.68], ['tree', 1, -0.5, 4.8, compact ? 0.42 : 0.58],
      ['plant', 5, -5, 2, 0.8], ['plant', 5, 4.8, -2.3, 0.7], ['plant', 5, -3.7, -5.1, 0.75],
      ['rock', 1, 0.5, -4.6, 0.48], ['plant', 5, 5.1, 4.8, 0.6], ['rock', 2, -5, 5.3, 0.45],
    ];
    for (const [slot, [role, variant, dx, dz, scale]] of placements.entries()) {
      if (original.some(o => o.id === `${PREFIX}${site}_${slot}`)) continue;
      const ref = getModelDefault(role, variant), size = ref.size.map(v => v * scale);
      const inset = role === 'rock' ? 0.35 : 0.3;
      for (const [ox, oz] of [[0, 0], [-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
        const x = cx + dx + ox, z = cz + dz + oz, y = surfaceTop(terrain, x, z);
        if (y === null) continue;
        const object = { id: `${PREFIX}${site}_${slot}`, name: `谷の庭${site + 1}の${role === 'tree' ? '木立' : role === 'plant' ? '低木' : '岩'}`,
          role, type: 'box', variant, material: 0, color: null, pos: [x, y - inset + size[1] / 2, z], size, rot: [0, (site + slot) * 0.63, 0],
          modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: terrain.id, inset } };
        const fit = terrainModelFit(object, terrain, reserved);
        if (!fit.passed || [...occupied, ...objects].some(o => overlaps(getBounds(object), getBounds(o))) || rays.some(([from, to]) => segmentHitsBox(from, to, object))) continue;
        objects.push(object); checks.push({ id: object.id, site, ...fit });
        break;
      }
    }
    if (objects.length > initialCount) groups++;
  }
  return { ...stage, objects: [...original, ...objects], gardenClusters: { groups, models: objects.length, checks, preservedEyePairs: rays.length } };
}
