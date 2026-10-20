import { getBounds, worldXZ } from './spatialGeometry.js';
import { bridgeMemberHasClearance, articulatedPierParts } from './terrainBridgeStructure.js';
import { segmentHitsBox } from './spatialSightlines.js';
import { terrainBoxOverlap } from './terrainBoxOverlap.js';

// A complete frame supports a suspended plaza; never retain isolated pieces.
// Try corners within a wider upper floor first, then an exterior frame with
// cross-beams under the floor when the lower room has the same footprint.
export function terrainAreaStructure(deck, floors, solids = [], clearRays = [], acceptFrame = () => true, { sharedSupportJoints = false } = {}) {
  const top = deck.pos[1] - deck.size[1] / 2, base = -3, beamHeight = 0.3;
  if (top < 2.2) return [];
  const areaId = deck.id.slice('sp_area_'.length);
  const box = (name, x, y, z, size) => {
    const [wx, wz] = worldXZ(deck, x, z);
    return { id: `${deck.id}_support_area_${name}`, name: '上段広場の支持構造', role: 'wall', type: 'box', variant: 1, material: 0,
      pos: [wx, y, wz], size, rot: deck.rot || [0, 0, 0], color: '#647a76',
      spatialAppearance: { version: 1, style: 'harbor', surface: 'concrete', district: 'high', category: 'support', moduleId: 'bridge_structure', areaId } };
  };
  const safe = member => {
    if (!bridgeMemberHasClearance(member, floors)) return false;
    const a = getBounds(member);
    if (solids.some(o => {
      if (o.id === deck.id) return false;
      // A beam may meet another overhead beam as one continuous frame. Keep
      // piers, walking decks, walls and all lower standing volumes protected.
      if (sharedSupportJoints && o.spatialAppearance?.moduleId === 'bridge_structure' && o.spatialAppearance?.category === 'support' &&
          o.size[1] <= 0.34 && /_support_(?:long_|cross_|area_(?:edge_[xz]_|cross_[xz]$))/.test(o.id)) {
        const pier = member.id.includes('_pier_'), memberTop = member.pos[1] + member.size[1] / 2;
        if (!pier || o.pos[1] - o.size[1] / 2 >= memberTop - 0.05) return false;
      }
      const b = getBounds(o);
      return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1e-5 &&
        Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 1e-5 &&
        Math.min(member.pos[1] + member.size[1] / 2, o.pos[1] + o.size[1] / 2) - Math.max(member.pos[1] - member.size[1] / 2, o.pos[1] - o.size[1] / 2) > 1e-5 && terrainBoxOverlap(member, o);
    })) return false;
    return !clearRays.some(([a, b]) => segmentHitsBox(a, b, member));
  };
  const frames = [[0.55, 0.55], [-0.9, -0.9]];
  // A rectangular deck can need posts outside its narrow sides while pulling
  // the long-side beams away from an adjoining stair. Keep legacy frames first.
  for (const inner of [0.55, 1.1, 1.8, 2.55]) for (const outer of [-1.6, -2.2]) frames.push([inner, outer], [outer, inner]);
  if (sharedSupportJoints && Math.max(...[deck.size[0], deck.size[2]]) / Math.min(deck.size[0], deck.size[2]) >= 2) {
    for (const inner of [0.55, 1.1, 1.8, 2.55]) for (const outer of [-2.9, -3.6]) frames.push([inner, outer], [outer, inner]);
  }
  for (const [insetX, insetZ] of frames) {
    const x = deck.size[0] / 2 - insetX, z = deck.size[2] / 2 - insetZ, candidates = [];
    if (x <= 1 || z <= 1) continue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) candidates.push(box(`pier_${sx}_${sz}`, sx * x, (base + top - beamHeight) / 2, sz * z, [0.7, top - beamHeight - base, 0.7]));
    for (const side of [-1, 1]) {
      candidates.push(box(`edge_x_${side}`, 0, top - beamHeight / 2, side * z, [2 * x + 0.7, beamHeight, 0.3]));
      candidates.push(box(`edge_z_${side}`, side * x, top - beamHeight / 2, 0, [0.3, beamHeight, 2 * z + 0.7]));
    }
    candidates.push(box('cross_x', 0, top - beamHeight / 2, 0, [2 * x + 0.7, beamHeight, 0.3]));
    candidates.push(box('cross_z', 0, top - beamHeight / 2, 0, [0.3, beamHeight, 2 * z + 0.7]));
    if (candidates.every(safe)) {
      const frame = candidates.flatMap(o => o.id.includes('_pier_') ? articulatedPierParts(o).map(p => ({ ...p, spatialAppearance: { ...p.spatialAppearance, areaId } })) : [o]);
      if (acceptFrame(frame)) return frame;
    }
  }
  return [];
}
