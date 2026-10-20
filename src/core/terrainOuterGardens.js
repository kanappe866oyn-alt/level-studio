import { getModelDefault } from './modelCatalog.js';
import { getBounds, getCollisionParts, isWalkable, surfaceTop } from './spatialGeometry.js';
import { terrainModelFit } from './spatialTerrainModels.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { placeTerrainRockWoodland } from './terrainRockWoodland.js';
import { placeTerrainRockMountains } from './terrainRockMountains.js';

const prefix = 'sp_outer_garden_';
const overlaps = (a, b) => a.minX < b.maxX + 0.4 && a.maxX > b.minX - 0.4 && a.minZ < b.maxZ + 0.4 && a.maxZ > b.minZ - 0.4;
export const isOuterGardenModel = o => o.id.startsWith(prefix) && !o.customModelUrl &&
  o.modelGrounding?.surfaceId === 'sp_terrain_surround' && !!o.modelDimensions?.path && o.modelDimensions.path === getModelDefault(o.role, o.variant)?.path;

// Versioned, bounded clusters on the existing outer apron. Native crowns reserve
// their whole footprint; root samples and every clear authored ray remain safe.
export function placeTerrainOuterGardens(stage) {
  const variation = stage.design_rationale?.spatial_design?.variation;
  if (!(variation?.version >= 28) || !['market', 'terraces', 'bridge', 'cloister'].includes(variation.family)) return stage;
  if (variation.version >= 30) return placeTerrainRockWoodland(placeTerrainRockMountains(stage, isOuterGardenModel), isOuterGardenModel);
  if (variation.version >= 29) return placeTerrainRockWoodland(stage, isOuterGardenModel);
  const original = stage.objects.filter(o => !isOuterGardenModel(o));
  const terrain = original.find(o => o.id === 'sp_terrain_surround' && o.terrainProfile?.surfaceGrid);
  if (!terrain) return stage;
  const reserved = original.filter(o => isWalkable(o) && !['sp_ground', terrain.id].includes(o.id));
  const occupied = original.filter(o => !['ground', 'landform', 'pit'].includes(o.role));
  const occupiedBounds = occupied.map(getBounds), blockers = original.flatMap(getCollisionParts), rays = [];
  for (const line of stage.plan.requirements.sightlines) {
    const from = stage.areas.find(a => a.id === line.from), to = stage.areas.find(a => a.id === line.to);
    for (const a of spatialEyeSamples(from)) for (const b of spatialEyeSamples(to)) if (!blockers.some(o => segmentHitsBox(a, b, o))) rays.push([a, b]);
  }
  const b = getBounds(terrain), inset = 2.5, sites = [];
  for (const i of [3, 1, 5, 2, 4]) {
    const t = i / 6;
    sites.push([b.minX + inset + (b.maxX - b.minX - 2 * inset) * t, b.minZ + inset],
      [b.minX + inset + (b.maxX - b.minX - 2 * inset) * t, b.maxZ - inset],
      [b.minX + inset, b.minZ + inset + (b.maxZ - b.minZ - 2 * inset) * t],
      [b.maxX - inset, b.minZ + inset + (b.maxZ - b.minZ - 2 * inset) * t]);
  }
  const additions = [], checks = [];
  let groups = 0;
  for (const [site, [x, z]] of sites.entries()) {
    if (groups >= 12) break;
    const start = additions.length;
    const parts = [['tree', site % 2 ? 3 : 1, 0, 0, 0.48], ['plant', 5, 3.3, 0.8, 0.7], ['rock', 1, -3.1, 0.7, 0.34]];
    for (const [slot, [role, variant, dx, dz, scale]] of parts.entries()) {
      const id = `${prefix}${site}_${slot}`;
      if (original.some(o => o.id === id)) continue;
      const ref = getModelDefault(role, variant), size = ref.size.map(n => n * scale), inset = role === 'rock' ? 0.32 : 0.24;
      for (const [ox, oz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
        const side = site % 4;
        const px = x + (side < 2 ? dx : side === 2 ? dz : -dz) + ox;
        const pz = z + (side >= 2 ? dx : side === 0 ? dz : -dz) + oz, y = surfaceTop(terrain, px, pz);
        if (y === null) continue;
        const object = { id, name: `外周の庭${site + 1}の${role === 'tree' ? '小さな木立' : role === 'plant' ? '低木' : '庭石'}`,
          role, type: 'box', variant, material: 0, color: null, size, pos: [px, y - inset + size[1] / 2, pz], rot: [0, site * 0.71 + slot * 0.43, 0],
          modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: terrain.id, inset } };
        const fit = terrainModelFit(object, terrain, reserved);
        if (!fit.passed || occupiedBounds.some(b => overlaps(getBounds(object), b)) || rays.some(([a, b]) => segmentHitsBox(a, b, object))) continue;
        additions.push(object); occupiedBounds.push(getBounds(object)); checks.push({ id, site, ...fit }); break;
      }
    }
    if (additions.length > start) groups++;
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.outer_gardens = { version: 1, groups, models: additions.length, checks, preservedEyePairs: rays.length,
    scope: '既存の外周地形に最大12組・36モデル。全歩行面とモデル全体の離隔、根元25点の接地と傾斜、既存の指定視線を確認。地形・建物・経路は保持。' };
  return { ...stage, objects: [...original, ...additions], design_rationale: rationale };
}
