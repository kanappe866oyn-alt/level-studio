import { getBounds, getCollisionParts, isWalkable, worldXZ, WALKING } from './spatialGeometry.js';
import { buildTerrainSurround } from './spatialTerrainSurround.js';
import { terrainCornerCut, bevelSegments } from './terrainContours.js';
import { applyTerrainMaterials } from './terrainMaterials.js';
import { curveOffset } from './terrainCurve.js';
import { getStairLayout } from './assemblySizing.js';
import { bridgeStructureParts, articulatedPierParts } from './terrainBridgeStructure.js';
import { buildStreetGateways } from './streetGateways.js';
import { terrainAreaStructure } from './terrainAreaStructure.js';
import { segmentHitsBox, spatialEyeSamples, inspectSpatialSightlines } from './spatialSightlines.js';
import { finishTerrainSlopeRailings } from './terrainSlopeRailings.js';
import { terrainPortalWidth } from './terrainJoins.js';
import { finishTerrainBoundaryStyles } from './terrainBoundaryStyles.js';

// Shape the soil from the designed floors, never from unrelated random hills.
// Upper decks retain their empty volume wherever a lower path needs headroom.
export function buildSpatialTerrain(objects, connections, areas = [], openRailings = false, requirements = {}, structureOptions = {}) {
  const floors = objects.filter(isWalkable).flatMap(getCollisionParts);
  const bottom = -3;
  const overlaps = (a, b) => a.minX < b.maxX - 0.01 && a.maxX > b.minX + 0.01 && a.minZ < b.maxZ - 0.01 && a.maxZ > b.minZ + 0.01;
  const canFill = (object, top) => !floors.some(other => {
    if (other.id === object.id) return false;
    const y = other.pos[1] + other.size[1] / 2;
    return y < top - 0.1 && y + WALKING.height > bottom && overlaps(getBounds(object), getBounds(other));
  });
  const soil = (object, top, grade = 0, relief = 0) => ({
    ...object, role: 'landform', variant: 1, material: 0,
    pos: [object.pos[0], (top + bottom) / 2, object.pos[2]],
    size: [object.size[0], top - bottom, object.size[2]],
    color: '#a8b39b', color2: '#82786b',
    terrainProfile: { seed: [...object.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 65536, 17), relief, edgeRoughness: 0, ...(grade ? { grade } : {}) },
  });
  const supports = [];
  const strip = link => ({ offset: link.curve ? (link.low === link.from ? 1 : -1) * link.curve : 0, width: link.width, ...(link.flare ? { flare: link.flare } : {}) });
  const converted = objects.map(object => {
    if (!object.id.startsWith('sp_area_') && !connections.some(c => c.object_id === object.id)) return object;
    const link = connections.find(c => c.object_id === object.id);
    const top = object.pos[1] + object.size[1] / 2;
    if (link?.traversal === 'ramp') {
      if (!canFill(object, top)) throw new Error(`${link.from}:${link.to}: 坂の土台が下の通路を塞ぎます。坂と下の通路を離してください。`);
      const result = soil(object, top, link.rise);
      if (link.curve || link.flare) result.terrainProfile.curve = strip(link);
      return result;
    }
    if (object.role === 'climb') {
      if (link && (link.curve || link.flare || canFill(object, top))) {
        if (!canFill(object, top)) throw new Error(`${link.from}:${link.to}: 曲がる階段の土台が下の通路を塞ぎます。`);
        const result = soil(object, top, link.rise);
        // A zero-offset strip uses exactly the same treads as curved stairs.
        // Keep the old open assembly when filling would close a lower route.
        result.terrainProfile.curve = strip(link);
        result.terrainProfile.stepCount = getStairLayout([link.width, link.rise, link.length]).count;
        return result;
      }
      const low = object.pos[1] - object.size[1] / 2;
      if (canFill(object, low)) supports.push(soil({ ...object, id: `${object.id}_soil`, name: `${object.name}の地盤` }, low));
      return object;
    }
    if (link?.curve || link?.flare) {
      const result = canFill(object, top) ? soil(object, top) : { ...object, role: 'landform', terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0 } };
      result.terrainProfile.curve = strip(link);
      return result;
    }
    if (!canFill(object, top)) {
      const area = areas.find(a => object.id === `sp_area_${a.id}`);
      return object.id.startsWith('sp_area_') ? { ...object, role: 'landform', terrainProfile: { seed: 0, relief: 0, edgeRoughness: 0,
        ...(area ? { portalWidth: terrainPortalWidth(area, connections) } : {}) } } : object;
    }
    const areaPart = areas.find(a => a.footprint === 'inset-corners' &&
      [ `sp_area_${a.id}`, `sp_area_${a.id}_floor_north`, `sp_area_${a.id}_floor_south` ].includes(object.id));
    // The three pieces of a recessed court must share a flat seam. Independent
    // relief seeds would otherwise introduce lips where the pieces meet.
    const result = soil(object, top, 0, object.id.startsWith('sp_area_') && !areaPart ? 0.6 : 0);
    const area = areas.find(a => object.id === `sp_area_${a.id}`);
    if (area) {
      if (area.footprint !== 'inset-corners') result.terrainProfile.cornerCut = terrainCornerCut(area);
      result.terrainProfile.portalWidth = terrainPortalWidth(area, connections);
    }
    result.terrainProfile.cliffRelief = 0.35;
    return result;
  });
  // Move only boundaries whose floor actually became soil. Upper decks above
  // circulation retain their original slab and rectangular boundary together.
  const bevels = [];
  for (const a of areas) {
    const cut = converted.find(o => o.id === `sp_area_${a.id}`)?.terrainProfile?.cornerCut;
    if (!cut) continue;
    for (const side of ['north', 'south', 'west', 'east']) {
      const along = ['north', 'south'].includes(side) ? 0 : 2, centre = along === 0 ? a.x : a.z;
      const half = (along === 0 ? a.width : a.depth) / 2 - cut + 0.125;
      for (const wall of converted.filter(o => o.id.startsWith(`sp_wall_${a.id}_${side}_`))) {
        const low = Math.max(wall.pos[along] - wall.size[along] / 2, centre - half);
        const high = Math.min(wall.pos[along] + wall.size[along] / 2, centre + half);
        const pos = [...wall.pos], size = [...wall.size];
        pos[along] = (low + high) / 2; size[along] = high - low;
        converted[converted.indexOf(wall)] = { ...wall, pos, size };
      }
    }
    bevelSegments(a.width, a.depth, cut).forEach(([p, q], i) => {
      const height = a.enclosure === 'open' ? 0.8 : 2.8;
      bevels.push({ id: `sp_wall_${a.id}_bevel_${i}`, name: `${a.name}の斜めの境界`, role: 'wall', type: 'box', variant: 1, material: 0, color: '#80909c',
        pos: [a.x + (p[0] + q[0]) / 2, a.y + height / 2, a.z + (p[1] + q[1]) / 2],
        size: [0.25, height, Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.25], rot: [0, Math.atan2(q[0] - p[0], q[1] - p[1]), 0] });
    });
  }
  const piers = [], beams = [];
  for (const c of connections.filter(c => !c.rise)) {
    const deck = converted.find(o => o.id === c.object_id && (o.role === 'bridge' || o.terrainProfile?.curve && o.size[1] < 0.5));
    if (!deck || deck.pos[1] < 2) continue;
    beams.push(...bridgeStructureParts(deck, c, floors));
    const top = deck.pos[1] - deck.size[1] / 2;
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const along = end * (deck.size[2] / 2 - 1.5), shift = c.curve ? curveOffset(c.curve, along / deck.size[2] + 0.5) : 0;
      const [x, z] = worldXZ(deck, shift + side * (c.width / 2 - 0.45), along);
      const pier = { id: `sp_terrain_pier_${c.object_id}_${end}_${side}`, name: '高架下の通行を避けた橋脚', type: 'box', role: 'wall',
        variant: 1, material: 0, color: '#9b896e', pos: [x, (bottom + top) / 2, z], size: [0.7, top - bottom, 0.8], rot: deck.rot };
      const b = getBounds(pier);
      // Reserve the full standing volume of every lower floor, not just its centre line.
      const blocked = floors.some(f => {
        const y = f.pos[1] + f.size[1] / 2, bounds = getBounds(f);
        return y < top && y + WALKING.height > bottom && overlaps(b, { minX: bounds.minX - WALKING.radius, maxX: bounds.maxX + WALKING.radius, minZ: bounds.minZ - WALKING.radius, maxZ: bounds.maxZ + WALKING.radius });
      });
      if (!blocked) piers.push(...articulatedPierParts(pier));
    }
  }
  const suspended = converted.filter(o => o.id.startsWith('sp_area_') && o.terrainProfile && o.size[1] < 0.5 && o.pos[1] > 2);
  const areaFrames = [];
  if (suspended.length) {
    const solids = [...converted, ...supports, ...bevels, ...piers, ...beams].flatMap(getCollisionParts);
    const clearRays = [];
    for (const s of requirements.sightlines || []) {
      const a = areas.find(a => a.id === s.from), b = areas.find(a => a.id === s.to);
      if (!a || !b) continue;
      for (const from of spatialEyeSamples(a)) for (const to of spatialEyeSamples(b)) if (!solids.some(o => segmentHitsBox(from, to, o))) clearRays.push([from, to]);
    }
    for (const deck of suspended) {
      let frame = terrainAreaStructure(deck, floors, [...solids, ...areaFrames], clearRays, undefined, structureOptions);
      // During initial construction, try preserving every ray first. If that
      // cannot support the new deck, accept only a complete physical frame that
      // still meets every authored visible/hidden condition. Later finishing
      // continues to preserve the built stage's exact sight samples.
      if (!frame.length && requirements.sightlines?.length) frame = terrainAreaStructure(deck, floors, [...solids, ...areaFrames], [],
        candidate => inspectSpatialSightlines([...solids, ...areaFrames, ...candidate], areas, requirements.sightlines).every(s => s.passed), structureOptions);
      if (!frame.length) throw new Error(`${deck.name}: 下の通路を避けて上段広場の支柱と梁を置けません。上下の広場の幅や位置を調整してください。`);
      areaFrames.push(...frame);
    }
  }
  const terrain = [...converted, ...supports, ...bevels, ...piers, ...beams, ...areaFrames];
  const surround = buildTerrainSurround(terrain);
  const painted = applyTerrainMaterials(surround ? [...terrain, surround] : terrain, areas, connections, openRailings);
  const bounded = openRailings ? finishTerrainSlopeRailings(painted, connections, areas, requirements) : painted;
  const boundaries = finishTerrainBoundaryStyles(bounded, areas, objects.filter(o => o.buildingPlacement).map(o => o.buildingPlacement), requirements);
  return buildStreetGateways(boundaries, areas, connections, requirements);
}
