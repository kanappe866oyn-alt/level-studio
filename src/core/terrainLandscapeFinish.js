import { getModelDefault } from './modelCatalog.js';
import { getBounds, getCollisionParts, isWalkable, surfaceTop } from './spatialGeometry.js';
import { terrainModelFit } from './spatialTerrainModels.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { isRockMountain } from './terrainRockMountains.js';
import { mountainSettlementClearance } from './mountainSettlementFit.js';

const prefix = 'sp_landscape_detail_';
export const isLandscapeDetail = o => o.id.startsWith(prefix) && !o.customModelUrl && o.modelGrounding?.surfaceId === 'sp_terrain_surround' &&
  !!o.modelDimensions?.path && o.modelDimensions.path === getModelDefault(o.role, o.variant)?.path;
const overlap = (a, b, gap = 0.1) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;

// Replace the visible rectangular rescue plate with a filled, matching rock
// foundation. This changes real geometry, including its outer walking boundary.
// All designed streets and floors above it are retained and checked afterwards.
export function landscapeFoundation(ground, soil) {
  const bottom = ground.pos[1] - ground.size[1] / 2, top = soil.pos[1] - soil.size[1] / 2;
  const grid = soil.terrainProfile.surfaceGrid;
  return { ...ground, name: '地形の輪郭に沿う岩盤', role: 'landform',
    pos: [soil.pos[0], (bottom + top) / 2, soil.pos[2]], size: [soil.size[0], top - bottom, soil.size[2]], rot: [...soil.rot],
    color: '#777e72', color2: '#707568',
    terrainProfile: { seed: soil.terrainProfile.seed, relief: 0, edgeRoughness: soil.terrainProfile.edgeRoughness,
      cliffRelief: 0.42, surfaceMaterial: 'rock', sideMaterial: 'rock', surfaceMapping: 'world',
      surfaceGrid: { columns: grid.columns, rows: grid.rows, heights: Array(grid.columns * grid.rows).fill(1) } } };
}

export function finishTerrainLandscape(stage) {
  if (!(stage.design_rationale?.spatial_design?.variation?.version >= 34)) return stage;
  const original = stage.objects.filter(o => !isLandscapeDetail(o));
  const soil = original.find(o => o.id === 'sp_terrain_surround'), ground = original.find(o => o.id === 'sp_ground');
  if (!soil?.terrainProfile?.surfaceGrid || !ground) return stage;
  const objects = original.map(o => o === ground ? landscapeFoundation(ground, soil) : o.id === 'sp_void'
    ? { ...o, name: '岩盤内部の落下判定', pos: [soil.pos[0], o.pos[1], soil.pos[2]],
      size: [soil.size[0] - 8, o.size[1], soil.size[2] - 8] } : o);
  const floors = original.filter(o => isWalkable(o) && ![soil.id, ground.id].includes(o.id));
  const obstacles = original.filter(o => !['landform', 'ground', 'tree', 'plant', 'pit'].includes(o.role)).map(getBounds);
  const trees = original.filter(o => o.role === 'tree');
  const mountains = stage.design_rationale.spatial_design.variation.version >= 35 ? original.filter(isRockMountain) : [];
  const anchors = original.filter(o => ['tree', 'rock', 'cliff'].includes(o.role) && o.modelGrounding?.surfaceId === soil.id);
  const blockers = objects.flatMap(getCollisionParts), rays = [];
  for (const line of stage.plan.requirements.sightlines) {
    const from = stage.areas.find(a => a.id === line.from), to = stage.areas.find(a => a.id === line.to);
    for (const a of spatialEyeSamples(from)) for (const b of spatialEyeSamples(to)) if (!blockers.some(o => segmentHitsBox(a, b, o))) rays.push([a, b]);
  }
  const details = [], checks = [];
  for (const [index, anchor] of anchors.entries()) {
    if (details.length >= 100) break;
    for (let slot = 0; slot < 5; slot++) {
      if (details.length >= 100) break;
      const angle = index * 2.39996 + slot * 1.25664, radius = 1.9 + slot * 0.42;
      const x = anchor.pos[0] + Math.cos(angle) * radius, z = anchor.pos[2] + Math.sin(angle) * radius;
      const y = surfaceTop(soil, x, z); if (y === null) continue;
      const role = slot === 4 ? 'rock' : 'plant', variant = slot === 4 ? 2 : slot % 2 ? 1 : 5;
      const scale = role === 'rock' ? 0.35 : 0.5 + ((index + slot) % 3) * 0.12;
      const ref = getModelDefault(role, variant), size = ref.size.map(v => v * scale), inset = 0.24;
      const object = { id: `${prefix}${index}_${slot}`, name: role === 'rock' ? '木立の小岩' : '木立の下草', role, type: 'box', variant, material: 0,
        color: null, size, pos: [x, y - inset + size[1] / 2, z], rot: [0, angle, 0],
        modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: soil.id, inset } };
      const fit = terrainModelFit(object, soil, floors), bounds = getBounds(object);
      if (!fit.passed || obstacles.some(b => overlap(bounds, b)) || details.some(o => overlap(bounds, getBounds(o))) ||
        mountains.some(m => !mountainSettlementClearance(m, [object], 0.15).passed) ||
        trees.some(o => Math.hypot(x - o.pos[0], z - o.pos[2]) < 0.9) || rays.some(([a, b]) => segmentHitsBox(a, b, object))) continue;
      // terrainModelFit checks the full base of stones, unlike plant root zones.
      details.push(object); checks.push({ id: object.id, anchor: anchor.id, ...fit });
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.landscape_finish = { version: 1, foundation: 'matched-rock-footprint', details: details.length, checks, preservedEyePairs: rays.length,
    scope: '四角い下板を地形外周に一致する実体の岩盤へ変更。木立・岩の周囲に最大100個の下草と小岩。既存の街路・床・建物を維持し、通行・指定視線を再検査。' };
  return { ...stage, objects: [...objects, ...details], design_rationale: rationale };
}
