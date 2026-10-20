import { getModelDefault } from './modelCatalog.js';
import { getBounds, getCollisionParts, isWalkable, surfaceTop, worldXZ, WALKING } from './spatialGeometry.js';
import { terrainModelFit } from './spatialTerrainModels.js';
import { segmentHitsBox, spatialEyeSamples } from './spatialSightlines.js';

const prefix = 'sp_outer_garden_';
const overlap = (a, b, gap = 0.25) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;

// A rock is sunk below the lowest soil sample, rather than balanced on its centre.
// Reject steep sites where that would bury its summit in the uphill ground.
export function embeddedRockFit(object, terrain, floors) {
  const bounds = getBounds(object);
  if (floors.some(f => overlap(bounds, getBounds(f), WALKING.radius + 0.35))) return { passed: false, reason: 'clearance' };
  const heights = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const [x, z] = worldXZ(object, (i / 6 - 0.5) * object.size[0], (j / 6 - 0.5) * object.size[2]);
    const y = surfaceTop(terrain, x, z);
    if (y === null) return { passed: false, reason: 'support' };
    heights.push(y);
  }
  const supportMin = Math.min(...heights), supportMax = Math.max(...heights);
  const base = supportMin - Math.min(0.65, object.size[1] * 0.16);
  const exposedHeight = base + object.size[1] - supportMax;
  if (exposedHeight < Math.max(0.9, object.size[1] * 0.28)) return { passed: false, reason: 'buried' };
  return { passed: true, samples: 49, supportMin, supportMax, base, exposedHeight };
}

export function placeTerrainRockWoodland(stage, owns) {
  const original = stage.objects.filter(o => !owns(o)).map(o => o.id === 'sp_terrain_surround'
    ? { ...o, color: '#708868', color2: '#6d7974' } : o);
  const terrain = original.find(o => o.id === 'sp_terrain_surround' && o.terrainProfile?.surfaceGrid);
  if (!terrain) return stage;
  const floors = original.filter(o => isWalkable(o) && !['sp_ground', terrain.id].includes(o.id));
  const occupied = original.filter(o => !['ground', 'landform', 'pit'].includes(o.role)).map(getBounds);
  const blockers = original.flatMap(getCollisionParts), rays = [];
  for (const line of stage.plan.requirements.sightlines) {
    const from = stage.areas.find(a => a.id === line.from), to = stage.areas.find(a => a.id === line.to);
    for (const a of spatialEyeSamples(from)) for (const b of spatialEyeSamples(to)) if (!blockers.some(o => segmentHitsBox(a, b, o))) rays.push([a, b]);
  }
  const bounds = getBounds(terrain), sites = [];
  // Search exposed soil as well as the rim. Alternating offsets break up rows.
  for (let z = bounds.minZ + 2.8, row = 0; z < bounds.maxZ - 2.8; z += 3.6, row++) {
    for (let x = bounds.minX + 2.8 + (row % 2) * 1.8; x < bounds.maxX - 2.8; x += 3.6) {
      const y = surfaceTop(terrain, x, z);
      if (y !== null) sites.push({ x, z, y, row });
    }
  }
  // Prefer shoulder sites for rocks and low ground for woodland.
  const additions = [], checks = [], woodlandCentres = [], rockQuadrants = [0, 0, 0, 0];
  const create = (role, variant, scale, x, z, angle, index) => {
    const ref = getModelDefault(role, variant), size = ref.size.map(n => n * scale);
    const y = surfaceTop(terrain, x, z);
    if (y === null) return null;
    return { id: `${prefix}${role}_${index}`, name: role === 'tree' ? '低地の木立' : '斜面の岩塊', role, variant,
      type: 'box', material: 0, color: role === 'rock' ? '#777e70' : null, size, pos: [x, y - 0.3 + size[1] / 2, z], rot: [0, angle, 0],
      modelDimensions: { path: ref.path, size: [...ref.bounds.size], defaultScale: ref.scale }, modelGrounding: { surfaceId: terrain.id, inset: 0.3 } };
  };
  const accept = (object, fit) => {
    if (!fit.passed || original.some(o => o.id === object.id)) return false;
    const b = getBounds(object);
    if (occupied.some(other => overlap(b, other))) return false;
    // Crowns may interleave within a grove. Trunks stay apart; all native bounds
    // remain excluded from authored floors and protected sight rays.
    if (additions.some(other => object.role === 'tree' && other.role === 'tree'
      ? Math.hypot(object.pos[0] - other.pos[0], object.pos[2] - other.pos[2]) < 2.2
      : overlap(b, getBounds(other), 0.05))) return false;
    if (rays.some(([a, b]) => segmentHitsBox(a, b, object))) return false;
    additions.push(object); checks.push({ id: object.id, ...fit }); return true;
  };
  for (const [index, site] of [...sites].sort((a, b) => b.y - a.y).entries()) {
    if (additions.length >= 16) break;
    const quadrant = Number(site.x > (bounds.minX + bounds.maxX) / 2) + 2 * Number(site.z > (bounds.minZ + bounds.maxZ) / 2);
    if (rockQuadrants[quadrant] >= 4) continue;
    const role = index % 3 === 0 ? 'cliff' : 'rock', variant = role === 'cliff' ? 1 : 1 + index % 2;
    const scale = role === 'cliff' ? 0.36 : variant === 1 ? 1.65 : 1.9;
    const rock = create(role, variant, scale, site.x, site.z, (index % 4) * Math.PI / 2, index);
    const fit = embeddedRockFit(rock, terrain, floors);
    if (!fit.passed) continue;
    rock.pos[1] = fit.base + rock.size[1] / 2;
    rock.modelGrounding.inset = site.y - fit.base;
    if (accept(rock, fit)) rockQuadrants[quadrant]++;
  }
  const rocks = additions.length;
  for (const [index, site] of [...sites].sort((a, b) => a.y - b.y).entries()) {
    if (woodlandCentres.length >= 24) break;
    if (woodlandCentres.some(c => Math.hypot(site.x - c.x, site.z - c.z) < 7)) continue;
    let trees = 0;
    for (const [slot, [dx, dz]] of [[0, 0], [2.6, 1.2], [-1.7, 2.7], [0.7, -2.8]].entries()) {
      const tree = create('tree', slot === 3 ? 3 : 4, 0.82 + ((index + slot) % 3) * 0.07, site.x + dx, site.z + dz, index * 0.63 + slot, `${index}_${slot}`);
      if (tree && accept(tree, terrainModelFit(tree, terrain, floors))) trees++;
    }
    if (trees) woodlandCentres.push({ x: site.x, z: site.z, trees });
  }
  const rationale = structuredClone(stage.design_rationale);
  rationale.spatial_design.outer_gardens = { version: 2, groups: woodlandCentres.length, models: additions.length,
    rocks, trees: additions.length - rocks, checks, preservedEyePairs: rays.length,
    scope: '露出斜面を灰緑の岩肌にし大型岩塊、低地に最大24組の木立。岩底面49点の埋め込み、植物の根元25点、全歩行面と既存指定視線の保護。元の地形形状・建物・経路を保持。' };
  return { ...stage, objects: [...original, ...additions], design_rationale: rationale };
}
