import { getBounds, getCollisionParts, isWalkable } from './spatialGeometry.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';
import { joinMountainFoot } from './mountainFootJoin.js';

const prefix = 'sp_rock_mountain_';
export const isRockMountain = o => o.id.startsWith(prefix) && !o.customModelUrl && o.role === 'landform' &&
  o.terrainProfile?.surfaceMaterial === 'rock' && o.terrainProfile?.seed === 431 && !!o.terrainProfile?.surfaceGrid;
const overlaps = (a, b, gap = 0.7) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;

// Closed, filled terrain: the ridge and its broad foot share the same rendered,
// exported and walking mesh. No stretched model or invisible mountain collider.
export function createRockMountain(id, x, z, width, depth, bottom, summit, mirror = 1, stratified = false, tapered = false, broad = false) {
  const columns = stratified ? 25 : 13, rows = columns, heights = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const u = (i / (columns - 1) * 2 - 1) * mirror, v = j / (rows - 1) * 2 - 1;
    const rim = Math.max(Math.abs(u), Math.abs(v));
    const dome = (x, z, rx, rz, power) => Math.max(0, 1 - (x / rx) ** 2 - (z / rz) ** 2) ** power;
    const peaks = Math.max(dome(u + 1 / 6, v, 0.78, 0.82, 0.4),
      0.82 * dome(u - 1 / 3, v - 1 / 6, 0.68, 0.65, 0.45),
      0.66 * dome(u + 1 / 3, v + 1 / 3, 0.7, 0.6, 0.4));
    const strata = (stratified ? 0.015 : 0.035) * Math.sin(i * 2.4 + j * 1.3) * Math.sin(Math.PI * Math.min(1, peaks));
    let height = peaks ** 0.7 + strata;
    if (tapered) {
      // Three unequal ridges taper into a broad lower slope. Unlike a powered
      // dome, the upper half occupies little of the footprint: no flat pillar.
      const ridge = (x, z, rx, rz) => Math.max(0, 1 - Math.hypot(x / rx, z / rz));
      const mass = Math.max(ridge(u + 0.22, v + 0.08, 0.84, 0.92),
        0.75 * ridge(u - 0.28, v - 0.22, 0.72, 0.78),
        0.53 * ridge(u + 0.38, v - 0.38, 0.62, 0.64));
      const ledge = 0.018 * Math.sin(mass * 38 + u * 3) * Math.sin(Math.PI * mass);
      height = mass ** (broad ? 0.72 : 0.88) + ledge + strata * 0.35;
    }
    if (stratified) {
      const splitA = 0.13 * Math.exp(-(((u * 0.88 + v * 0.25 - 0.08) / 0.055) ** 2));
      const splitB = 0.075 * Math.exp(-(((v - u * 0.3 + 0.30) / 0.065) ** 2));
      height = Math.min(height, 0.95 + u * 0.18 - v * 0.1) - (splitA + splitB) * (broad ? 0.3 : 1) * Math.min(1, peaks * 2);
    }
    heights.push(rim >= 0.999 ? 0.01 : Math.max(0.01, Math.min(1, height)));
  }
  const peak = Math.max(...heights);
  return { id, name: '集落を囲む岩山', role: 'landform', type: 'box', variant: 1, material: 0,
    pos: [x, (bottom + summit) / 2, z], size: [width, summit - bottom, depth], rot: [0, 0, 0],
    color: '#929b96', color2: '#737d76',
    terrainProfile: { seed: 431, relief: 0, edgeRoughness: 0.08, surfaceMaterial: 'rock', sideMaterial: 'rock',
      rockMass: true, ...(stratified ? { rockStrata: true } : {}), surfaceMapping: 'world', surfaceGrid: { columns, rows, heights: heights.map(h => h / peak) } } };
}

export function placeTerrainRockMountains(stage, ownsGarden) {
  const original = stage.objects.filter(o => !isRockMountain(o) && !ownsGarden(o));
  const terrain = original.find(o => o.id === 'sp_terrain_surround' && o.terrainProfile?.surfaceGrid);
  if (!terrain) return stage;
  const bounds = getBounds(terrain), safety = original.find(o => o.id === 'sp_ground');
  const bottom = safety ? safety.pos[1] - safety.size[1] / 2 : terrain.pos[1] - terrain.size[1] / 2;
  const roofs = original.filter(o => o.role === 'building').map(o => o.pos[1] + o.size[1] / 2);
  const highestRoof = Math.max(8, ...roofs), summit = Math.min(bottom + 48, highestRoof + 8);
  const occupied = original.filter(o => !['ground', 'landform', 'pit'].includes(o.role) || isWalkable(o) && !['sp_ground', terrain.id].includes(o.id)).map(getBounds);
  const blockers = original.flatMap(getCollisionParts), rays = [];
  for (const line of stage.plan.requirements.sightlines) {
    const from = stage.areas.find(a => a.id === line.from), to = stage.areas.find(a => a.id === line.to);
    for (const a of spatialEyeSamples(from)) for (const b of spatialEyeSamples(to)) if (!blockers.some(o => segmentHitsBox(a, b, o))) rays.push([a, b]);
  }
  const additions = [], checks = [];
  // Rear corners frame the settlement without enclosing its foreground.
  for (const [index, [sx, sz]] of [[-1, -1], [1, -1], [-1, 1]].entries()) {
    if (additions.length >= 2) break;
    const id = `${prefix}${index}`;
    if (original.some(o => o.id === id)) continue;
    for (const offset of [0, 2, 4, 6, 8]) {
      const x = (sx < 0 ? bounds.minX : bounds.maxX) + sx * offset;
      const z = (sz < 0 ? bounds.minZ : bounds.maxZ) + sz * offset;
      const rule = stage.design_rationale.spatial_design.variation.version;
      // Extend outward; the inner limits next to buildings stay unchanged.
      let mountain = createRockMountain(id, x + (rule >= 34 ? sx * 8 : 0), z + (rule >= 34 ? sz * 7 : 0),
        rule >= 34 ? 48 : 32, rule >= 34 ? 42 : 28, bottom, summit - index * 1.5, sx, rule >= 31, rule >= 33, rule >= 34);
      const b = getBounds(mountain);
      if (occupied.some(other => overlaps(b, other)) || additions.some(other => overlaps(b, getBounds(other)))) continue;
      let foot;
      if (stage.design_rationale.spatial_design.variation.version >= 32) {
        const joined = joinMountainFoot(mountain, terrain);
        mountain = joined.object; foot = joined.report;
        if (foot.afterMaxDeficit > 0.35) continue;
      }
      if (rays.some(([a, b]) => segmentHitsBox(a, b, mountain))) continue;
      // At least a 3m shared strip with the existing apron; avoid detached islands.
      const sharedX = Math.min(b.maxX, bounds.maxX) - Math.max(b.minX, bounds.minX);
      const sharedZ = Math.min(b.maxZ, bounds.maxZ) - Math.max(b.minZ, bounds.minZ);
      if (sharedX < 3 || sharedZ < 3) continue;
      additions.push(mountain); checks.push({ id, summit: mountain.pos[1] + mountain.size[1] / 2, highestRoof, sharedX, sharedZ, ...(foot ? { foot } : {}) }); break;
    }
  }
  const rationale = structuredClone(stage.design_rationale);
  const joinedFeet = stage.design_rationale.spatial_design.variation.version >= 32;
  const tapered = stage.design_rationale.spatial_design.variation.version >= 33;
  rationale.spatial_design.rock_mountains = { version: stage.design_rationale.spatial_design.variation.version >= 34 ? 4 : tapered ? 3 : joinedFeet ? 2 : 1, mountains: additions.length, checks, preservedEyePairs: rays.length,
    scope: tapered ? '大小3本の尾根で山頂を絞り、下部に広がる山腹を生成。既存の地形へ裾を接続し、床・建物・指定視線を保護。' : joinedFeet ? '岩山の裾を既存の地形へ接続。実際の地形外周を0.25m以内の間隔で調べ、元の裾が低い接続部で残る高さ差0.35m以下を採用。地形本体・床・建物と指定視線を保護。' : '家の屋根を超える岩山を外周の最大2か所へ。閉じた岩地形の頂点を描画・通行・出力で共有。既存歩行面・建物と指定視線を保護。' };
  return { ...stage, objects: [...original, ...additions], design_rationale: rationale };
}
