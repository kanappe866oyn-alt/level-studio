import { getModelDefault } from './modelCatalog.js';
import { getBounds, getCollisionParts, isWalkable, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';

const prefix = 'sp_terrain_model_';
export const isTerrainPlacedModel = object => object.id.startsWith(prefix) && !!object.modelGrounding;
const overlaps = (a, b, gap) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;

export function terrainModelFit(object, terrain, reserved) {
  const inset = object.modelGrounding.inset, centre = surfaceTop(terrain, object.pos[0], object.pos[2]);
  if (centre === null) return { passed: false, reason: 'support' };
  const bounds = getBounds(object);
  if (reserved.some(o => overlaps(bounds, getBounds(o), WALKING.radius + 0.35))) return { passed: false, reason: 'clearance' };
  const samples = [];
  // Canopies need free space, but only the root zone needs soil support.
  // The full native bounds above still reserve collision and sight clearance.
  const rootWidth = object.role === 'tree' ? 0.35 : object.role === 'plant' ? 0.45 : object.size[0];
  const rootDepth = object.role === 'tree' ? 0.35 : object.role === 'plant' ? 0.45 : object.size[2];
  for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const [wx, wz] = worldXZ(object, x * Math.min(rootWidth, object.size[0]), z * Math.min(rootDepth, object.size[2]));
    const y = surfaceTop(terrain, wx, wz);
    if (y === null || Math.abs(y - centre) > inset - 0.03) return { passed: false, reason: 'slope' };
    samples.push(y);
  }
  return { passed: true, samples: samples.length, supportMin: Math.min(...samples), supportMax: Math.max(...samples), centre,
    supportFootprint: [Math.min(rootWidth, object.size[0]), Math.min(rootDepth, object.size[2])] };
}

// Decoration only adds solids outside all original walking footprints. Keep
// every originally clear authored eye pair, not just a passing ratio.
export function placeTerrainModels(stage) {
  const original = stage.objects.filter(o => !isTerrainPlacedModel(o));
  const terrain = original.find(o => o.id === 'sp_terrain_surround' && o.terrainProfile?.surfaceGrid);
  if (!terrain) throw new Error('モデルを配置できる周囲の地形がありません。');
  const reserved = original.filter(o => isWalkable(o) && !['sp_ground', terrain.id].includes(o.id));
  const blockers = original.flatMap(getCollisionParts);
  const clearRays = [];
  for (const s of stage.plan.requirements.sightlines) {
    const a = stage.areas.find(a => a.id === s.from), b = stage.areas.find(a => a.id === s.to);
    for (const from of spatialEyeSamples(a)) for (const to of spatialEyeSamples(b)) {
      if (!blockers.some(o => segmentHitsBox(from, to, o))) clearRays.push([from, to]);
    }
  }
  const accepted = [], checks = [], rejected = { support: 0, clearance: 0, slope: 0, spacing: 0, sight: 0 };
  const anchors = [...stage.areas].sort((a, b) => (b.kind === 'high') - (a.kind === 'high') || a.id.localeCompare(b.id));
  const occupied = original.filter(o => !['ground', 'pit', 'landform'].includes(o.role) && !isWalkable(o));
  let cliffs = 0;
  for (const vegetation of [false, true]) {
    let groupCount = 0;
    for (const [index, a] of anchors.filter(a => vegetation || a.enclosure === 'open').entries()) {
      for (let slot = 0; slot < (vegetation ? 2 : 3) && groupCount < (vegetation ? 14 : 16); slot++) {
        const id = `${prefix}${vegetation ? 'green_' : ''}${a.id}_${slot}`;
        if (original.some(o => o.id === id)) continue;
        const role = vegetation ? slot === 0 ? 'tree' : 'plant' : slot === 0 && cliffs < 4 ? 'cliff' : 'rock';
        const variant = vegetation ? role === 'tree' ? index % 2 ? 3 : 1 : 1 + index % 3 : role === 'cliff' ? 1 : 1 + (index + slot) % 4;
        const ref = getModelDefault(role, variant);
        if (!ref) continue;
        const scale = vegetation ? role === 'tree' ? 0.95 : 0.8 : role === 'cliff' ? 0.2 + (index % 2) * 0.035 : variant <= 2 ? 0.8 + (index % 3) * 0.08 : 0.48 + (index % 3) * 0.06;
        const size = ref.size.map(v => v * scale), inset = vegetation ? role === 'tree' ? 0.22 : 0.12 : Math.min(0.9, size[1] * 0.3);
        let placed = false;
        for (const distance of vegetation ? [0.8, 1.5, 2.2, 3, 4, 5.5, 7.2] : [0.8, 3, 5.5, 7.2]) {
          for (let side = 0; side < 8; side++) {
            const angle = (side + index % 3 + slot * 2) * Math.PI / 4;
            const x = a.x + Math.cos(angle) * (a.width / 2 + Math.max(size[0], size[2]) / 2 + distance);
            const z = a.z + Math.sin(angle) * (a.depth / 2 + Math.max(size[0], size[2]) / 2 + distance);
            const y = surfaceTop(terrain, x, z);
            if (y === null) { rejected.support++; continue; }
            const candidate = { id, name: `${a.name}の脇の${{ cliff: '岩壁', rock: '岩群', tree: '樹木', plant: '植栽' }[role]}`,
              role, type: 'box', variant, material: 0, color: null, pos: [x, y - inset + size[1] / 2, z], size, rot: [0, angle * 0.37, 0],
              modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: terrain.id, inset } };
            const fit = terrainModelFit(candidate, terrain, reserved);
            if (!fit.passed) { rejected[fit.reason]++; continue; }
            if ([...occupied, ...accepted].some(o => overlaps(getBounds(candidate), getBounds(o), 0.25))) { rejected.spacing++; continue; }
            if (clearRays.some(([from, to]) => segmentHitsBox(from, to, candidate))) { rejected.sight++; continue; }
            accepted.push(candidate); checks.push({ id: candidate.id, path: ref.path, scale, ...fit });
            groupCount++;
            if (role === 'cliff') cliffs++;
            placed = true; break;
          }
          if (placed) break;
        }
      }
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.terrain_models = { version: 2, modelCount: accepted.length,
    roleCounts: Object.fromEntries(['cliff', 'rock', 'tree', 'plant'].map(role => [role, accepted.filter(o => o.role === role).length])),
    checks, rejected, clearEyePairsPreserved: clearRays.length,
    scope: '既存の岩・崖・樹木・植栽を等方拡縮。岩は全底面、植物は根元の25点を接地検査。全歩行面・指定視線の保護と当たり判定には樹冠を含むモデル寸法の箱を使用。' };
  return { ...stage, objects: [...original, ...accepted], design_rationale: rationale };
}
